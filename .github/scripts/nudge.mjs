// Hànzì Path reminders. Runs hourly from GitHub Actions (free), because Cloud Functions need the paid Firebase plan.
// Each subscribed user gets ~3 nudges a day at random times between 09:00 and 22:30 in their own time zone,
// and none once they have reached their daily goal.
import admin from 'firebase-admin';

const APP = process.env.APP_URL || 'https://vbreskvar.github.io/hanzi-path/';
const TEST_EMAIL = (process.env.TEST_EMAIL || '').trim();
const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
if (!raw) { console.log('FIREBASE_SERVICE_ACCOUNT secret is not set yet; nothing to do.'); process.exit(0); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
const db = admin.firestore(), fcm = admin.messaging();

const START = 9 * 60, END = 22 * 60 + 30, PER_DAY = 3, GAP = 120;
const now = new Date(), nowMin = Math.floor(now.getTime() / 60000);

function localNow(tz) {
  let p;
  try { p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now); }
  catch { return localNow('Europe/Ljubljana'); }
  const g = t => p.find(x => x.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, min: +g('hour') * 60 + +g('minute') };
}
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
// Three random minutes of the day, at least two hours apart, fixed for each user and date.
function slots(uid, date) {
  let h = hash(uid + date); const out = [];
  for (let i = 0; i < 200 && out.length < PER_DAY; i++) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    const m = START + (h % (END - START));
    if (out.every(x => Math.abs(x - m) >= GAP)) out.push(m);
  }
  return out.sort((a, b) => a - b);
}
function progressInfo(st, date) {
  const cards = st && st.cards || {};
  const due = Object.values(cards).filter(c => Array.isArray(c) && c[1] <= nowMin).length;
  const day = (st && st.log && st.log[date]) || [0, 0, 0, 0, 0];
  const goal = (st && st.set && st.set.goal) || 15;
  let streak = 0; // days in a row before today with practice
  const d = new Date(date + 'T12:00:00Z');
  for (let i = 1; i < 400; i++) { d.setUTCDate(d.getUTCDate() - 1); const k = d.toISOString().slice(0, 10); if ((st && st.log && st.log[k] || [0])[0] > 0 || (st && st.frozen || []).includes(k)) streak++; else break; }
  return { due, answered: day[0] || 0, goal, streak, started: Object.keys(cards).length > 0 };
}
function message(info) {
  const pick = a => a[Math.floor(Math.random() * a.length)];
  if (info.due >= 3) return pick([`2 minutes of Chinese? ${info.due} reviews waiting.`, `${info.due} words are ready for review. Quick round?`, `Your memory is fading on ${info.due} words. 2 minutes fixes it.`]);
  if (info.streak >= 2 && info.answered === 0) return `Keep your ${info.streak}-day streak alive: 2 minutes is enough. 加油！`;
  if (!info.started) return 'Your first Chinese words are waiting. 2 minutes?';
  return pick(['Learn 2 new words in 2 minutes? 加油！', '2 minutes of Chinese? 你好 is waiting.', 'Quick round of tones and words? 来吧！']);
}
async function send(uid, tokens, body, tag) {
  const url = APP + '?quick=1';
  const res = await fcm.sendEachForMulticast({
    tokens,
    data: { title: 'Hànzì Path · 汉字', body, url, tag },
    webpush: { headers: { Urgency: 'high', TTL: '5400' } }
  });
  const dead = [];
  res.responses.forEach((r, i) => { if (!r.success) { const code = r.error && r.error.code || ''; console.log(`  token ${i}: ${code}`); if (/registration-token-not-registered|invalid-registration-token|invalid-argument/.test(code)) dead.push(tokens[i]); } });
  if (dead.length) await db.doc(`push/${uid}`).set({ tokens: admin.firestore.FieldValue.arrayRemove(...dead) }, { merge: true });
  return res.successCount;
}

if (TEST_EMAIL) {
  const user = await admin.auth().getUserByEmail(TEST_EMAIL);
  const p = await db.doc(`push/${user.uid}`).get();
  const tokens = (p.exists && p.data().tokens) || [];
  if (!tokens.length) { console.log(`${TEST_EMAIL} has no devices with reminders turned on.`); process.exit(1); }
  const ok = await send(user.uid, tokens, 'Test reminder: push works! Tap for a 2-minute session.', 'hp-test');
  console.log(`Test sent to ${ok}/${tokens.length} device(s) of ${TEST_EMAIL}.`);
  process.exit(ok ? 0 : 1);
}

const subs = await db.collection('push').where('on', '==', true).get();
let sent = 0;
for (const docSnap of subs.docs) {
  const uid = docSnap.id, p = docSnap.data(), tokens = p.tokens || [];
  if (!tokens.length) continue;
  const { date, min } = localNow(p.tz || 'Europe/Ljubljana');
  const plan = slots(uid, date);
  const done = p.sent && p.sent.date === date ? p.sent.n : 0;
  const reached = plan.filter(m => m <= min).length; // slots whose time has come
  if (reached <= done) continue;
  const slot = plan[reached - 1];
  const mark = () => db.doc(`push/${uid}`).set({ sent: { date, n: reached } }, { merge: true });
  if (min - slot > 90) { await mark(); continue; } // the run was late; skip a stale nudge
  const u = await db.doc(`users/${uid}`).get();
  let st = null; try { st = u.exists ? JSON.parse(u.data().data || 'null') : null; } catch { st = null; }
  const info = progressInfo(st, date);
  if (info.answered >= info.goal) { await mark(); console.log(`${uid}: goal reached today, no nudge`); continue; }
  const ok = await send(uid, tokens, message(info), 'hp-nudge');
  await mark(); sent += ok;
  console.log(`${uid}: nudge ${reached}/${PER_DAY} at ${Math.floor(slot / 60)}:${String(slot % 60).padStart(2, '0')} local, ${ok}/${tokens.length} delivered`);
}
console.log(`Done. ${subs.size} subscribed user(s), ${sent} notification(s) sent.`);
