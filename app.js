/* Hànzì Path (friends edition): HSK 1 + HSK 2 trainer. Data: data.js (courses), strokes.js (stroke order), cloud.js (Firebase sign-in, sync, leaderboard, push). */
(() => {
'use strict';
const D = window.HSK_DATA, STROKES = window.HSK_STROKES || {};
const LS = 'hanzipath.v1';
// The level decides which course the word lists are built from; switching level reloads the page.
const LEVEL = (() => { try { const s = JSON.parse(localStorage.getItem(LS) || 'null'); return s && s.set && (s.set.level === 'hsk1' || s.set.level === 'hsk2') ? s.set.level : ''; } catch { return ''; } })();
const LESSONS = LEVEL === 'hsk1' ? D.hsk1lessons : D.lessons;
const LEVELNAME = LEVEL === 'hsk1' ? 'HSK 1' : 'HSK 2';
const NLES = LESSONS.length;
const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isHan = c => /\p{Script=Han}/u.test(c);
const rnd = n => Math.floor(Math.random() * n);
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a, n) => shuffle(a).slice(0, n);
const nowM = () => Math.floor(Date.now() / 60000);
const pad2 = n => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ---------- pinyin ---------- */
const TONE_MARKS = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', 'ü': 'ǖǘǚǜ' };
const MARK2 = {};
for (const b in TONE_MARKS) {
  [...TONE_MARKS[b]].forEach((c, i) => { MARK2[c] = [b, i + 1]; });
  [...TONE_MARKS[b].toUpperCase()].forEach((c, i) => { MARK2[c] = [b.toUpperCase(), i + 1]; });
}
const SYL = /(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?[aeiouü]+(?:ng(?![aeiouü])|n(?![aeiouü])|r(?![aeiouü]))?/g;
// Split pinyin into syllables: {b: base letters, t: tone 1-5, raw: original text}
function sylls(py) {
  const res = [];
  const chunks = String(py).normalize('NFC').split(/[\s'’\-.,!?;:，。？！、“”"()…]+/).filter(Boolean);
  for (const ch of chunks) {
    const raw = [...ch]; let base = ''; const tones = [];
    for (const c of raw) { const m = MARK2[c]; if (m) { base += m[0]; tones.push(m[1]); } else { base += c; tones.push(0); } }
    const lower = base.toLowerCase().replace(/v/g, 'ü');
    SYL.lastIndex = 0; let m;
    while ((m = SYL.exec(lower))) {
      const st = m.index, en = st + m[0].length; let t = 0;
      for (let k = st; k < en; k++) if (tones[k]) t = tones[k];
      res.push({ b: m[0], t: t || 5, raw: raw.slice(st, en).join('') });
    }
  }
  return res;
}
function mark(b, t) {
  if (!t || t === 5) return b;
  let i = b.indexOf('a'); if (i < 0) i = b.indexOf('e'); if (i < 0 && b.includes('ou')) i = b.indexOf('o');
  if (i < 0) for (let k = b.length - 1; k >= 0; k--) if ('aeiouü'.includes(b[k])) { i = k; break; }
  if (i < 0) return b;
  return b.slice(0, i) + TONE_MARKS[b[i]][t - 1] + b.slice(i + 1);
}
function pyWithTones(py, tones) {
  const sy = sylls(py); let out = '', pos = 0;
  sy.forEach((s, i) => { const at = py.indexOf(s.raw, pos); if (at < 0) return; out += py.slice(pos, at) + mark(s.b, tones[i]); pos = at + s.raw.length; });
  return (out + py.slice(pos)).toLowerCase();
}
// Pinyin with each syllable wrapped in its tone colour
function pyHTML(py, color = true) {
  const sy = sylls(py); let out = '', pos = 0;
  sy.forEach(s => { const at = py.indexOf(s.raw, pos); if (at < 0) return; out += esc(py.slice(pos, at)) + (color ? `<span class="t${s.t}">${esc(s.raw)}</span>` : esc(s.raw)); pos = at + s.raw.length; });
  return out + esc(py.slice(pos));
}
const TONE_NAME = { 1: 'high flat', 2: 'rising', 3: 'dipping', 4: 'falling', 5: 'neutral' };
function contour(t) {
  const P = { 1: 'M3 4 L17 4', 2: 'M3 12 L17 3', 3: 'M3 8 C7 19 11 19 17 5', 4: 'M3 3 L17 17' };
  return `<span class="contour">${t === 5 ? '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="12" r="2.6" fill="var(--t5)"/></svg>'
    : `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${P[t]}" stroke="var(--t${t})"/></svg>`}</span>`;
}

/* ---------- vocabulary + sentences ---------- */
const WORDS = [], DICT = {}, BYID = {};
function addW(o) { o.id = o.hz + '|' + o.py; if (BYID[o.id]) return; BYID[o.id] = o; if (o.k !== 'extra') WORDS.push(o); if (!DICT[o.hz]) DICT[o.hz] = o; }
LESSONS.forEach(L => L.words.forEach(w => addW({ hz: w[0], py: w[1], en: w[2], pos: w[3] || '', L: L.n, k: 'new' })));
LESSONS.forEach(L => (L.pn || []).forEach(w => addW({ hz: w[0], py: w[1], en: w[2], pos: 'name', L: L.n, k: 'name' })));
// HSK 2 learners review the HSK 1 list; HSK 1 learners meet those words in their lessons
D.hsk1.forEach(w => addW({ hz: w[0], py: w[1], en: w[2], pos: '', L: 0, k: LEVEL === 'hsk1' ? 'extra' : 'hsk1' }));
D.extra.forEach(w => addW({ hz: w[0], py: w[1], en: w[2], pos: '', L: -1, k: 'extra' }));
const QUIZ = WORDS.filter(w => w.k === 'new' || w.k === 'hsk1');
const LESSON = n => LESSONS.find(L => L.n === n);

function segment(zh) {
  const ch = [...zh], toks = []; let i = 0;
  while (i < ch.length) {
    if (!isHan(ch[i])) { toks.push({ w: ch[i], p: true }); i++; continue; }
    let found = null;
    for (let L = Math.min(5, ch.length - i); L > 1; L--) { const w = ch.slice(i, i + L).join(''); if (DICT[w]) { found = w; break; } }
    const w = found || ch[i];
    toks.push({ w, e: DICT[w] }); i += [...w].length;
  }
  return toks;
}
// Per-character pinyin by walking the sentence pinyin (keeps tone sandhi as printed in the book)
function align(zh, py) {
  const sy = sylls(py); let k = 0; const out = [];
  const chars = [...zh];
  chars.forEach((c, i) => {
    if (!isHan(c)) { out.push({ c }); return; }
    const prev = out[out.length - 1];
    if (c === '儿' && prev && prev.b && /r$/.test(prev.b) && prev.b !== 'er') { out.push({ c, p: '', t: prev.t }); return; }
    const s = sy[k++]; out.push(s ? { c, p: s.raw, t: s.t, b: s.b } : { c, p: '', t: 5 });
  });
  return { chars: out, ok: k === sy.length };
}
function charsFor(w) { const e = DICT[w]; if (!e) return [...w].map(c => ({ c, p: '', t: 5 })); return align(w, e.py).chars; }
function rubyHTML(zh, py, mode) {
  mode = mode || ST.set.py;
  const al = align(zh, py), toks = segment(zh); let i = 0, html = '';
  for (const tk of toks) {
    const n = [...tk.w].length; const cs = al.ok ? al.chars.slice(i, i + n) : charsFor(tk.w); i += n;
    if (tk.p) { html += esc(tk.w); continue; }
    const inner = cs.map(c => mode === 'off' ? esc(c.c) : `<ruby class="${mode === 'color' ? 't' + (c.t || 5) : ''}">${esc(c.c)}<rt>${esc(c.p || '')}</rt></ruby>`).join('');
    html += `<span class="tok" data-act="word" data-w="${esc(tk.w)}">${inner}</span>`;
  }
  return html;
}

const SENTS = [];
LESSONS.forEach(L => {
  L.grammar.forEach((g, gi) => { g.key = Array.isArray(g.key) ? g.key.filter(k => typeof k === 'string' && k) : []; g.ex.forEach((e, ei) => SENTS.push({ id: `g${L.n}-${gi}-${ei}`, zh: e[0], py: e[1], en: e[2], L: L.n, gk: `g${L.n}-${gi}`, keys: g.key })); });
  L.texts.forEach((t, ti) => t.lines.forEach((l, li) => SENTS.push({ id: `t${L.n}-${ti}-${li}`, zh: l[1], py: l[2], en: l[3], L: L.n, gk: `t${L.n}`, keys: [] })));
});
const allSents = () => SENTS.concat(ST.sents || []);
const GRAM = [];
LESSONS.forEach(L => L.grammar.forEach((g, gi) => GRAM.push({ k: `g${L.n}-${gi}`, L: L.n, g })));
const gramName = gk => {
  if (gk[0] === 't') return `Lesson ${gk.slice(1)} texts`;
  const g = GRAM.find(x => x.k === gk); return g ? g.g.name : gk;
};
const FUNC = ['要', '想', '会', '能', '可以', '最', '也', '都', '就', '还', '再', '得', '着', '过', '了', '比', '离', '从', '往', '吧', '呢', '吗', '的', '很', '太', '在', '正在', '别', '让', '给', '对', '更', '一起', '已经', '因为', '所以', '但是', '虽然', '一下', '每', '次', '多', '几'];

/* ---------- state ---------- */
const fresh = () => ({
  v: 2, cards: {}, log: {}, conf: {}, sents: [], xp: 0, q: null, badges: {},
  stats: { sessions: 0, perfect: 0, best: 0 }, freezes: 0, frozen: [], fz: { earned: 0, checked: '' },
  set: { level: '', lesson: 0, newPerDay: 8, goal: 15, rate: 0.85, py: 'color', sound: true, vol: 0.7, week: 1000, name: '', group: '', remind: false }, updated: 0, setAt: 0, resetAt: 0, uid: ''
});
function normalize(s) {
  const f = fresh(); s = s && typeof s === 'object' ? s : {};
  const o = (v, d) => v && typeof v === 'object' && !Array.isArray(v) ? v : d;
  return { ...f, ...s, set: { ...f.set, ...o(s.set, {}) }, cards: o(s.cards, {}), log: o(s.log, {}), conf: o(s.conf, {}), sents: Array.isArray(s.sents) ? s.sents : [],
    badges: o(s.badges, {}), stats: { ...f.stats, ...o(s.stats, {}) }, fz: { ...f.fz, ...o(s.fz, {}) }, frozen: Array.isArray(s.frozen) ? s.frozen : [], xp: +s.xp || 0, freezes: +s.freezes || 0 };
}
// Combine two copies of the progress (this device + the account) without losing answers made on either.
function mergeST(a, b) {
  a = normalize(a); b = normalize(b);
  if ((a.resetAt || 0) > (b.updated || 0)) return a; // progress was erased after the other copy was last saved
  if ((b.resetAt || 0) > (a.updated || 0)) return b;
  const m = normalize({});
  const newerSet = (b.setAt || 0) > (a.setAt || 0) ? b : a;
  m.set = { ...newerSet.set }; m.setAt = newerSet.setAt || 0;
  for (const src of [a, b]) for (const [k, c] of Object.entries(src.cards)) {
    const h = m.cards[k]; if (!Array.isArray(c)) continue;
    if (!h || (c[2] + c[3]) > (h[2] + h[3]) || ((c[2] + c[3]) === (h[2] + h[3]) && c[1] > h[1])) m.cards[k] = [...c];
  }
  for (const src of [a, b]) for (const [d, v] of Object.entries(src.log)) { const h = m.log[d] || (m.log[d] = [0, 0, 0, 0, 0]); v.forEach((x, i) => { h[i] = Math.max(h[i] || 0, +x || 0); }); }
  for (const src of [a, b]) for (const [k, v] of Object.entries(src.conf)) m.conf[k] = Math.max(m.conf[k] || 0, +v || 0);
  for (const src of [a, b]) for (const [k, v] of Object.entries(src.badges)) if (!m.badges[k] || v < m.badges[k]) m.badges[k] = v;
  for (const k of Object.keys(m.stats)) m.stats[k] = Math.max(+a.stats[k] || 0, +b.stats[k] || 0);
  const logXP = Object.values(m.log).reduce((s, v) => s + (v[4] || 0), 0);
  m.xp = Math.max(a.xp, b.xp, logXP);
  const ids = new Set(); m.sents = [...a.sents, ...b.sents].filter(s => s && !ids.has(s.id) && ids.add(s.id));
  m.frozen = [...new Set([...a.frozen, ...b.frozen])];
  const newer = (b.updated || 0) > (a.updated || 0) ? b : a;
  m.freezes = newer.freezes; m.fz = { ...newer.fz }; m.pri = newer.pri; m.wo = { ...(a.wo || {}), ...(b.wo || {}) };
  if (a.q && b.q && a.q.d === b.q.d) {
    const q = { ...newer.q, c: { ...a.q.c }, done: [...new Set([...a.q.done, ...b.q.done])], chest: Math.max(a.q.chest || 0, b.q.chest || 0) };
    for (const [k, v] of Object.entries(b.q.c)) q.c[k] = Math.max(q.c[k] || 0, v);
    m.q = q;
  } else m.q = !a.q ? b.q : !b.q ? a.q : (a.q.d > b.q.d ? a.q : b.q);
  m.updated = Math.max(a.updated || 0, b.updated || 0); m.resetAt = Math.max(a.resetAt || 0, b.resetAt || 0); m.uid = a.uid || b.uid;
  return m;
}
let ST;
try { ST = normalize(JSON.parse(localStorage.getItem(LS) || 'null')); } catch { ST = fresh(); }
function saveLocal() { try { localStorage.setItem(LS, JSON.stringify(ST)); } catch { /* storage blocked */ } }
let pushT = null;
function changed() { ST.updated = Date.now(); saveLocal(); clearTimeout(pushT); pushT = setTimeout(push, 2500); }
function setChanged() { ST.setAt = Date.now(); changed(); }
// log per day: [answers, correct, new words, seconds, xp]
function logAdd(i, v) { const k = dayKey(); const a = ST.log[k] || (ST.log[k] = [0, 0, 0, 0, 0]); a[i] = (a[i] || 0) + v; }
const today = () => { const a = ST.log[dayKey()] || []; return [0, 1, 2, 3, 4].map(i => a[i] || 0); };

/* ---------- account + cloud sync (cloud.js: Firebase; this browser keeps a copy in localStorage) ---------- */
let CL = null, USER = null, sync = 'local', writing = false, again = false, unwatch = null, lastBoard = 0;
let cloudGaveUp = false; setTimeout(() => { cloudGaveUp = true; if (!CL && LEVEL && view.tab !== 'session') paintChips(); }, 8000);
const authBusy = () => CL ? !CL.authKnown : !cloudGaveUp;
async function push() {
  if (!CL || !USER) return;
  if (writing) { again = true; return; }
  writing = true;
  try { await CL.saveProgress(ST); sync = 'ok'; } catch (e) { sync = 'err'; }
  writing = false; paintChips();
  if (again) { again = false; push(); }
  if (Date.now() - lastBoard > 60000) postBoard();
}
function reloadIfLevelChanged(before) { if (ST.set.level && ST.set.level !== before) { if (SESS && view.tab === 'session') return; location.reload(); return true; } return false; }
function applyRemote(r) {
  if (!r) return;
  const lv = ST.set.level, before = CL.fp(ST);
  const m = mergeST(ST, r); m.uid = USER.uid;
  const extra = CL.fp(m) !== CL.fp(normalize(r)); // this device had answers the account copy lacks
  ST = m; saveLocal();
  if (extra) { clearTimeout(pushT); pushT = setTimeout(push, 1500); }
  if (reloadIfLevelChanged(lv)) return;
  if (CL.fp(ST) === before) return;
  if (view.tab !== 'session' && view.tab !== 'done' && !document.activeElement?.matches?.('input,textarea,select')) render(); else paintChips();
}
async function onUser(u) {
  if (unwatch) { unwatch(); unwatch = null; }
  const was = USER; USER = u;
  if (!u) {
    sync = 'local';
    if (was && ST.uid) { const keep = { ...ST.set, name: '', group: '', remind: false }; ST = fresh(); ST.set = keep; saveLocal(); } // signed out: don't leave someone's progress on a shared device
    render(); return;
  }
  sync = 'busy'; paintChips();
  try {
    const r = await CL.loadProgress();
    const lv = ST.set.level;
    if (ST.uid && ST.uid !== u.uid) ST = r ? normalize(r) : fresh(); // another account used this device before
    else ST = r ? mergeST(ST, r) : ST;                                // first sign-in keeps the guest progress
    ST.uid = u.uid;
    if (!ST.set.name) ST.set.name = (u.displayName || '').split(' ')[0].slice(0, 20) || 'Learner';
    const pg = pendingGroup(); if (pg && !ST.set.group) { if (await CL.groupExists(pg).catch(() => false)) { ST.set.group = pg; ST.setAt = Date.now(); toast(`Joined group ${pg}`); } }
    saveLocal(); sync = 'ok';
    await CL.saveProgress(ST).catch(() => { sync = 'err'; });
    postBoard();
    if (reloadIfLevelChanged(lv)) return;
    unwatch = CL.watchProgress(applyRemote, () => { sync = 'err'; paintChips(); });
    if (ST.set.remind) CL.refreshPush().catch(() => {});
  } catch { sync = 'err'; }
  if (view.tab !== 'session' && view.tab !== 'done') render(); else paintChips();
}
function weekKey(d = new Date()) { const m = new Date(d); m.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayKey(m); }
function weekXP() { const mon = new Date(weekKey() + 'T00:00:00'); let s = 0; for (let i = 0; i < 7; i++) { const x = new Date(mon); x.setDate(mon.getDate() + i); s += (ST.log[dayKey(x)] || [])[4] || 0; } return s; }
function postBoard() {
  if (!CL || !USER || !ST.set.level) return; lastBoard = Date.now();
  CL.saveBoard({ name: (ST.set.name || 'Learner').slice(0, 30), level: ST.set.level, week: Math.round(weekXP()), wk: weekKey(), xp: Math.round(ST.xp), streak: streak(), words: QUIZ.filter(seen).length, group: ST.set.group || '' }).catch(() => {});
}
function pendingGroup() { try { return (localStorage.getItem('hanzipath.group') || '').toUpperCase(); } catch { return ''; } }
(() => { // ?g=CODE in the share link remembers the group until the friend signs in
  const g = (new URLSearchParams(location.search).get('g') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (g) try { localStorage.setItem('hanzipath.group', g); } catch { /* storage blocked */ }
})();
function attachCloud() {
  if (CL || !window.HPC) return;
  CL = window.HPC; CL.onAuth(u => { onUser(u); });
}
window.addEventListener('hpc-ready', attachCloud); attachCloud();

/* ---------- speech ---------- */
let VOICE = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices();
  VOICE = vs.find(v => /zh[-_]CN/i.test(v.lang) && /natural|online|xiaoxiao|yunxi/i.test(v.name)) || vs.find(v => /zh[-_]CN/i.test(v.lang)) || vs.find(v => /^(zh|cmn)/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = () => { const had = !!VOICE; pickVoice(); if (!had && VOICE && view.tab !== 'session') render(); }; }
function say(text, rate) {
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN'; if (VOICE) u.voice = VOICE; u.rate = rate || ST.set.rate;
    speechSynthesis.speak(u);
  } catch { /* speech unavailable */ }
}
const PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>';
const playBtn = (text, label = 'Play') => `<button class="play" data-act="say" data-t="${esc(text)}" aria-label="${esc(label)}">${PLAY}</button>`;

/* ---------- spaced repetition ---------- */
const IV = [0, 10, 1440, 4320, 10080, 23040, 50400, 115200]; // minutes per level
const skillsOn = () => VOICE ? ['mean', 'form', 'read', 'ear'] : ['mean', 'form', 'read'];
function grade(id, sk, ok, jump = 0) {
  const k = id + '~' + sk; const c = ST.cards[k] ? [...ST.cards[k]] : [0, 0, 0, 0];
  if (ok) { c[0] = Math.min(7, Math.max(c[0] + 1, jump)); c[2]++; } else { c[0] = c[0] >= 4 ? 2 : 1; c[3]++; }
  let iv = ok ? IV[c[0]] : 10; if (iv >= 1440) iv = Math.round(iv * (0.9 + Math.random() * 0.2));
  c[1] = nowM() + iv; ST.cards[k] = c;
}
const lvl = (id, sk) => (ST.cards[id + '~' + sk] || [0])[0];
const seen = w => !!ST.cards[w.id + '~mean'];
const wordLevel = w => { const s = skillsOn(); return s.reduce((a, k) => a + lvl(w.id, k), 0) / s.length; };
const barsOf = w => { const l = wordLevel(w); return l >= 5 ? 3 : l >= 3 ? 2 : l > 0 ? 1 : 0; };
const lvlHTML = w => { const b = barsOf(w); return `<span class="lvl" aria-label="Mastery ${b} of 3">${[1, 2, 3].map(i => `<i class="${i <= b ? 'on' + b : ''}"></i>`).join('')}</span>`; };
function weakness(w) {
  let r = 0, x = 0; skillsOn().forEach(k => { const c = ST.cards[w.id + '~' + k]; if (c) { r += c[2]; x += c[3]; } });
  return x * 2 - r * 0.4 + (7 - wordLevel(w));
}

/* ---------- sound: pentatonic chimes for right answers, a soft wooden knock for wrong ones ---------- */
let ACTX = null, MASTER = null;
function actx() {
  try {
    if (!ACTX) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ACTX = new C(); MASTER = ACTX.createGain(); MASTER.connect(ACTX.destination); }
    if (ACTX.state === 'suspended') ACTX.resume();
    MASTER.gain.value = ST.set.vol;
    return ACTX;
  } catch { return null; }
}
const PENTA = [0, 2, 4, 7, 9]; // gong shang jue zhi yu
const noteHz = i => 523.25 * Math.pow(2, (Math.floor(i / 5) * 12 + PENTA[((i % 5) + 5) % 5]) / 12);
function tone(freq, at, dur, vol, type = 'sine', bright = 0.3) {
  const c = actx(); if (!c) return;
  const t = c.currentTime + at, g = c.createGain(), o = c.createOscillator();
  o.type = type; o.frequency.value = freq; o.connect(g);
  if (bright) { const o2 = c.createOscillator(), g2 = c.createGain(); o2.frequency.value = freq * 2.756; g2.gain.value = bright; o2.connect(g2).connect(g); o2.start(t); o2.stop(t + dur); }
  g.connect(MASTER);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o.stop(t + dur + 0.02);
}
const SFX = {
  ok(combo) { if (!ST.set.sound) return; const b = Math.min(combo, 9); tone(noteHz(b), 0, 0.35, 0.22); tone(noteHz(b + 2), 0.085, 0.55, 0.22); buzz(12); },
  milestone() { if (!ST.set.sound) return; [0, 1, 2, 3, 5].forEach((d, i) => tone(noteHz(5 + d), i * 0.07, 0.6, 0.18)); tone(noteHz(10), 0.4, 1.1, 0.12, 'sine', 0.5); },
  bad() {
    if (!ST.set.sound) return; const c = actx(); if (!c) return;
    [[196, 0], [174.6, 0.11]].forEach(([f, at]) => {
      const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
      o.type = 'triangle'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.8, t + 0.12);
      lp.type = 'lowpass'; lp.frequency.value = 900; o.connect(lp).connect(g).connect(MASTER);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.start(t); o.stop(t + 0.2);
    });
    buzz([20, 40, 20]);
  },
  tap() { if (ST.set.sound) tone(noteHz(7), 0, 0.08, 0.06, 'sine', 0); },
  done() { if (!ST.set.sound) return; [0, 1, 2, 3, 4, 5, 7].forEach((d, i) => tone(noteHz(d), i * 0.075, 0.5, 0.16)); [5, 7, 9].forEach(d => tone(noteHz(d), 0.6, 1.4, 0.1)); },
  gong() { if (!ST.set.sound) return; tone(110, 0, 2.6, 0.25, 'sine', 0.6); tone(164.8, 0.02, 2.2, 0.08); [0, 2, 4, 5, 7, 10].forEach((d, i) => tone(noteHz(d + 3), 0.35 + i * 0.08, 0.7, 0.13)); }
};
function buzz(p) { try { navigator.vibrate && navigator.vibrate(p); } catch { /* no haptics */ } }

/* ---------- rewards: XP, imperial-exam ranks, daily quests, badges, streak freezes ---------- */
const RANKS = [[0, '童生', 'tóngshēng', 'Village scholar'], [300, '秀才', 'xiùcai', 'Licentiate'], [800, '举人', 'jǔrén', 'Provincial graduate'],
  [1600, '贡士', 'gòngshì', 'Metropolitan candidate'], [3000, '进士', 'jìnshì', 'Palace graduate'], [5000, '探花', 'tànhuā', 'Third in the palace exam'],
  [8000, '榜眼', 'bǎngyǎn', 'Second in the palace exam'], [12000, '状元', 'zhuàngyuan', 'Top scholar of the empire'], [18000, '翰林', 'hànlín', 'Hanlin academician'], [26000, '大学士', 'dàxuéshì', 'Grand secretary']];
const rankOf = xp => { let i = 0; while (i + 1 < RANKS.length && xp >= RANKS[i + 1][0]) i++; return i; };
let pendingRank = -1;
function addXP(n) {
  if (!n) return; const before = rankOf(ST.xp); ST.xp += n; logAdd(4, n); if (SESS) SESS.xp = (SESS.xp || 0) + n;
  if (rankOf(ST.xp) > before) pendingRank = rankOf(ST.xp);
}
const QUESTS = {
  right20: { t: 'Answer 20 questions correctly', n: 20, c: 'right', xp: 30 },
  combo10: { t: 'Reach a 10-answer combo', n: 10, c: 'combo', xp: 40 },
  new5: { t: 'Learn 5 new words', n: 5, c: 'newW', xp: 30 },
  tone8: { t: 'Hear 8 tones right', n: 8, c: 'tone', xp: 30 },
  write3: { t: 'Write 3 characters', n: 3, c: 'write', xp: 30 },
  listen5: { t: 'Get 5 listening questions right', n: 5, c: 'listen', xp: 30 },
  gram5: { t: 'Build 5 sentences right', n: 5, c: 'gram', xp: 30 },
  perfect: { t: 'Finish a session with no mistakes', n: 1, c: 'perfect', xp: 50 },
  class3: { t: 'Preview 3 words from the next lesson', n: 3, c: 'preview', xp: 30 }
};
function questDay() {
  const k = dayKey();
  if (!ST.q || ST.q.d !== k) {
    let h = 7; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const pool = Object.keys(QUESTS).filter(id => (VOICE || !['tone8', 'listen5'].includes(id)));
    const ids = []; while (ids.length < 3 && pool.length) { h = (h * 1103515245 + 12345) >>> 0; ids.push(pool.splice(h % pool.length, 1)[0]); }
    ST.q = { d: k, ids, c: {}, done: [], chest: 0 };
  }
  return ST.q;
}
function bump(c, v = 1, isMax = false) {
  const q = questDay(); q.c[c] = isMax ? Math.max(q.c[c] || 0, v) : (q.c[c] || 0) + v;
  q.ids.forEach(id => {
    const Q = QUESTS[id]; if (!Q || q.done.includes(id) || (q.c[Q.c] || 0) < Q.n) return;
    q.done.push(id); addXP(Q.xp); queueCheer({ kind: 'quest', title: 'Quest complete', text: Q.t, xp: Q.xp });
  });
  if (!q.chest && q.ids.length && q.ids.every(id => q.done.includes(id))) { q.chest = 1; addXP(100); queueCheer({ kind: 'chest', title: '宝箱 · Daily chest', text: 'All three quests done today.', xp: 100 }); }
}
const BADGES = [
  ['first', '始', 'First steps', 'Finish a session', () => ST.stats.sessions >= 1],
  ['w25', '廿五', '25 words', 'Start 25 words', () => QUIZ.filter(seen).length >= 25],
  ['w100', '百', '100 words', 'Start 100 words', () => QUIZ.filter(seen).length >= 100],
  ['w300', '三百', '300 words', 'Start 300 words', () => QUIZ.filter(seen).length >= 300],
  ['s3', '三', '3-day streak', 'Practise 3 days in a row', () => streak() >= 3],
  ['s7', '七', 'One week', '7-day streak', () => streak() >= 7],
  ['s30', '月', 'One month', '30-day streak', () => streak() >= 30],
  ['c15', '连', 'On a roll', '15 right in a row', () => ST.stats.best >= 15],
  ['c40', '龙', 'Dragon combo', '40 right in a row', () => ST.stats.best >= 40],
  ['perfect', '全', 'Flawless', 'A session with no mistakes', () => ST.stats.perfect >= 1],
  ['tones', '声', 'Tone ear', '85% tone accuracy over 60 answers', () => { let t = 0, ok = 0; for (const [k, v] of Object.entries(ST.conf)) { t += v; if (k[0] === k[2]) ok += v; } return t >= 60 && ok / t >= 0.85; }],
  ['writer', '笔', 'Calligrapher', 'Write 50 characters', () => Object.entries(ST.cards).filter(([k]) => k.endsWith('~hand')).reduce((a, [, c]) => a + c[2], 0) >= 50],
  ['prep', '课', 'Lesson ready', 'Start every word of your next lesson', () => { const n = Math.min(NLES, covered() + 1); const ws = QUIZ.filter(w => w.L === n && w.k === 'new'); return ws.length && ws.every(seen); }],
  ['course', '毕', 'Course complete', `Start every word of the course`, () => { const ws = QUIZ.filter(w => w.k === 'new'); return ws.length && ws.every(seen); }]
];
function checkBadges() {
  BADGES.forEach(([id, ic, name, how, test]) => {
    if (ST.badges[id]) return; let ok = false; try { ok = test(); } catch { ok = false; }
    if (ok) { ST.badges[id] = dayKey(); addXP(50); queueCheer({ kind: 'badge', title: `Badge: ${name}`, text: how, xp: 50, seal: ic }); }
  });
}
function streakFreeze() {
  const k = dayKey(); if (ST.fz.checked === k) return; ST.fz.checked = k;
  const y = new Date(); y.setDate(y.getDate() - 1); const yk = dayKey(y);
  const y2 = new Date(); y2.setDate(y2.getDate() - 2);
  const active = d => (ST.log[dayKey(d)] || [0])[0] > 0 || ST.frozen.includes(dayKey(d));
  if (!active(y) && active(y2) && ST.freezes > 0) { ST.freezes--; ST.frozen.push(yk); queueCheer({ kind: 'freeze', title: 'Streak saved', text: 'You missed yesterday, so a streak freeze was used. Your streak is safe.' }); changed(); }
}
function earnFreeze() { const s = streak(); if (s >= 7 && s % 7 === 0 && ST.fz.earned !== s && ST.freezes < 2) { ST.fz.earned = s; ST.freezes++; queueCheer({ kind: 'freeze', title: 'Streak freeze earned', text: `${s} days in a row. If you miss a day, the freeze keeps your streak.` }); } }
let CHEERS = [];
function queueCheer(c) { CHEERS.push(c); }
function flushCheers() {
  if (pendingRank >= 0) { const r = RANKS[pendingRank]; pendingRank = -1; CHEERS.unshift({ kind: 'rank', title: 'New rank', text: `${r[1]} ${r[2]} · ${r[3]}`, seal: r[1] }); }
  if (!CHEERS.length) return;
  const c = CHEERS.shift();
  if (c.kind === 'rank' || c.kind === 'chest' || c.kind === 'badge') {
    if (c.kind === 'rank') SFX.gong(); else SFX.milestone();
    confetti();
    const m = document.createElement('div'); m.className = 'modal'; m.setAttribute('role', 'dialog');
    m.innerHTML = `<div class="card stack"><div class="rank" style="justify-content:center"><span class="seal">${esc(c.seal || '宝')}</span></div><h2>${esc(c.title)}</h2><p>${esc(c.text)}</p>${c.xp ? `<p class="mono" style="color:var(--good)">+${c.xp} XP</p>` : ''}<button class="btn primary">Continue</button></div>`;
    document.body.appendChild(m);
    const close = () => { m.remove(); flushCheers(); };
    m.querySelector('button').addEventListener('click', close); m.addEventListener('click', e => { if (e.target === m) close(); });
    m.querySelector('button').focus();
  } else { SFX.milestone(); toast(`${c.title}: ${c.text}${c.xp ? ` +${c.xp} XP` : ''}`); setTimeout(flushCheers, 2500); }
}
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.createElement('canvas'); cv.id = 'confetti'; document.body.appendChild(cv);
  const ctx = cv.getContext('2d'), W = cv.width = innerWidth, H = cv.height = innerHeight;
  const cols = ['--t1', '--t2', '--t3', '--t4', '--accent'].map(cssVar);
  const P = Array.from({ length: 120 }, () => ({ x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 11 - 3, r: Math.random() * 6 + 3, c: cols[rnd(cols.length)], a: Math.random() * 6 }));
  let f = 0;
  (function step() { ctx.clearRect(0, 0, W, H); P.forEach(p => { p.vy += 0.32; p.x += p.vx; p.y += p.vy; p.a += 0.15; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); }); if (++f < 110) requestAnimationFrame(step); else cv.remove(); })();
}
function floatXP(n, el) {
  if (!n || !el) return; const r = el.getBoundingClientRect(); const s = document.createElement('div'); s.className = 'xpfloat'; s.textContent = `+${n} XP`;
  s.style.left = (r.left + r.width / 2 - 24) + 'px'; s.style.top = (r.top - 6) + 'px'; document.body.appendChild(s); setTimeout(() => s.remove(), 1000);
}
function readiness() {
  const cov = covered(), nx = Math.min(NLES, cov + 1);
  const next = QUIZ.filter(w => w.L === nx && w.k === 'new'), cur = QUIZ.filter(w => w.L >= 1 && w.L <= cov && w.k === 'new');
  const pv = next.length ? next.filter(seen).length / next.length : 1;
  const rv = cur.length ? cur.reduce((a, w) => a + Math.min(1, wordLevel(w) / 4), 0) / cur.length : 0;
  return { pct: Math.round((pv * 0.5 + rv * 0.5) * 100), pv: Math.round(pv * 100), rv: Math.round(rv * 100), nx };
}

/* ---------- where you are in the course: set by hand, or follows your progress ---------- */
// Automatic: the furthest lesson where you have started at least 70% of the words (Lesson 1 to begin with)
let AL = { k: -1, v: 1 };
function autoLesson() { const k = Object.keys(ST.cards).length; if (AL.k === k) return AL.v; let n = 1; for (const L of LESSONS) { const ws = QUIZ.filter(w => w.L === L.n && w.k === 'new'); if (ws.length && ws.filter(seen).length / ws.length >= 0.7) n = Math.max(n, L.n); } AL = { k, v: n }; return n; }
const covered = () => clamp(ST.set.lesson || autoLesson(), 1, NLES);
const maxLesson = () => Math.min(NLES, covered() + 1);

/* ---------- exercise factory ---------- */
// words in a sentence that you haven't learned yet (HSK 1 counts as known: you passed it)
function sentUnknown(sent) {
  const out = [], have = new Set();
  segment(sent.zh).forEach(t => {
    if (t.p) return;
    const e = DICT[t.w];
    if (e && e.k === 'new' && !seen(e) && !have.has(e.id)) { have.add(e.id); out.push(e); }
  });
  return out;
}
function notePriority(words) {
  ST.pri = Array.isArray(ST.pri) ? ST.pri : [];
  words.forEach(w => { if (!ST.pri.includes(w.id)) ST.pri.push(w.id); });
  if (ST.pri.length > 80) ST.pri = ST.pri.slice(-80);
}
function exGrammar(gk) {
  const pool = allSents().filter(s => s.gk === gk); if (!pool.length) return null;
  const scored = pool.map(x => ({ x, u: sentUnknown(x) }));
  const best = Math.min(...scored.map(o => o.u.length));
  const pick1 = shuffle(scored.filter(o => o.u.length === best))[0];
  const s = pick1.x;
  const pre = pick1.u.slice(0, 2);
  if (pick1.u.length > 2) notePriority(pick1.u.slice(2));
  const key = (s.keys || []).find(k => s.zh.includes(k));
  const n = segment(s.zh).filter(t => !t.p).length;
  if (key && (Math.random() < 0.4 || n < 3)) return { t: 'fill', s, key, gk, sk: 'use', pre: pre.filter(w => w.hz !== key) };
  if (n >= 3) return { t: 'build', s, gk, sk: 'use', pre };
  return null;
}
const hasSandhiRisk = w => /[一不]/.test(w.hz) || sylls(w.py).some((s, i, a) => s.t === 3 && a[i + 1] && a[i + 1].t === 3);
function exFromCard(key) {
  const i = key.lastIndexOf('~'); const id = key.slice(0, i), sk = key.slice(i + 1);
  if (sk === 'use') return exGrammar(id);
  const w = BYID[id]; if (!w) return null;
  if (sk === 'mean') return { t: 'mean', w, sk };
  if (sk === 'form') return { t: 'form', w, sk };
  if (sk === 'read') return { t: lvl(id, 'read') >= 3 ? 'typepy' : 'pickpy', w, sk };
  if (sk === 'ear') return VOICE ? (lvl(id, 'ear') >= 2 && !hasSandhiRisk(w) && Math.random() < 0.4 ? { t: 'tone', w, sk } : { t: 'listen', w, sk }) : null;
  if (sk === 'hand') return window.HanziWriter ? { t: 'write', w, sk } : null;
  return null;
}
function dueKeys() { const n = nowM(); return Object.entries(ST.cards).filter(([, c]) => c[1] <= n).sort((a, b) => a[1][1] - b[1][1]).map(([k]) => k); }
const dueCount = () => dueKeys().filter(k => exFromCard(k)).length;
function gramKeys(maxL, only) {
  const ks = [...GRAM.map(g => ({ k: g.k, L: g.L })), ...LESSONS.filter(L => L.texts.length).map(L => ({ k: 't' + L.n, L: L.n }))];
  return ks.filter(x => only ? x.L === only : x.L <= maxL);
}
function pickGrammar(n, maxL, only, exclude = new Set()) {
  const now = nowM(), cov = covered();
  const sc = x => { const c = ST.cards[x.k + '~use']; if (!c) return (x.L <= cov ? -2e9 : -1e9) + x.L * 1000 + rnd(500); return c[1] - now - c[3] * 600; };
  return gramKeys(maxL, only).filter(x => !exclude.has(x.k)).sort((a, b) => sc(a) - sc(b)).slice(0, n).map(x => x.k);
}
function confWorst() {
  let worst = null, rate = 0;
  for (let t = 1; t <= 4; t++) {
    let tot = 0, bad = 0; for (let g = 1; g <= 5; g++) { const v = ST.conf[`${t}>${g}`] || 0; tot += v; if (g !== t) bad += v; }
    if (tot >= 3 && bad / tot > rate) { rate = bad / tot; worst = t; }
  }
  return worst;
}
function toneWords(n) {
  const maxL = maxLesson();
  let pool = QUIZ.filter(w => (w.k === 'hsk1' || w.L <= maxL) && !hasSandhiRisk(w));
  const known = pool.filter(seen); if (known.length >= 8) pool = known;
  const wt = confWorst();
  if (wt) { const focus = pool.filter(w => sylls(w.py).some(s => s.t === wt)); if (focus.length >= 4) return [...pick(focus, Math.ceil(n * 0.7)), ...pick(pool, n)].slice(0, n); }
  return pick(pool, n);
}
function assemble(nw, rest) {
  rest = shuffle(rest.filter(Boolean)); const q = [];
  nw.forEach(w => { q.push({ t: 'intro', w }); q.push(...rest.splice(0, 1)); q.push({ t: 'mean', w, sk: 'mean' }); q.push(...rest.splice(0, 1)); });
  const later = shuffle(nw.flatMap(w => [{ t: 'form', w, sk: 'form' }, { t: 'pickpy', w, sk: 'read' }]));
  while (later.length || rest.length) { if (later.length) q.push(later.shift()); if (rest.length) q.push(rest.shift()); if (rest.length && Math.random() < 0.5) q.push(rest.shift()); }
  return q;
}
function newWordsQueue(limit, only) {
  const maxL = maxLesson();
  const pri = Array.isArray(ST.pri) ? ST.pri : [];
  const rank = w => (pri.includes(w.id) ? -100 : 0) + w.L;
  return QUIZ.filter(w => w.k === 'new' && (only ? w.L === only : w.L <= maxL) && !seen(w)).sort((a, b) => rank(a) - rank(b)).slice(0, limit);
}
function practiceMix(words) {
  return words.map(w => {
    const opts = [{ t: 'mean', w, sk: 'mean' }, { t: 'form', w, sk: 'form' }, { t: lvl(w.id, 'read') >= 3 ? 'typepy' : 'pickpy', w, sk: 'read' }];
    if (VOICE) opts.push({ t: 'listen', w, sk: 'ear' });
    return opts[rnd(opts.length)];
  });
}
function build(mode, arg) {
  const goal = ST.set.goal, maxL = maxLesson();
  if (mode === 'daily') {
    const due = dueKeys().map(exFromCard).filter(Boolean);
    const dueTake = due.slice(0, Math.max(6, goal - 5));
    const allow = Math.max(0, ST.set.newPerDay - today()[2]);
    const nw = newWordsQueue(Math.min(allow, dueTake.length > goal - 4 ? 1 : 4));
    const extra = [];
    if (VOICE) QUIZ.filter(w => seen(w) && lvl(w.id, 'mean') >= 2 && !ST.cards[w.id + '~ear']).slice(0, 2).forEach(w => extra.push({ t: 'listen', w, sk: 'ear' }));
    if (window.HanziWriter) { const c = QUIZ.find(w => w.k === 'new' && seen(w) && lvl(w.id, 'form') >= 2 && !ST.cards[w.id + '~hand'] && [...w.hz].length <= 2); if (c) extra.push({ t: 'write', w: c, sk: 'hand' }); }
    pick(QUIZ.filter(w => w.k === 'hsk1' && !seen(w)), 2).forEach(w => extra.push({ t: 'mean', w, sk: 'mean', jump: 3 }));
    const inQ = new Set(dueTake.filter(e => e.gk).map(e => e.gk));
    pickGrammar(2, maxL, 0, inQ).forEach(k => extra.push(exGrammar(k)));
    if (VOICE) toneWords(1).forEach(w => extra.push({ t: 'tone', w, sk: 'ear' }));
    return assemble(nw, [...dueTake, ...extra]);
  }
  if (mode === 'catchup') {
    const nw = QUIZ.filter(w => w.k === 'new' && w.L >= 1 && w.L <= covered() && !seen(w)).sort((a, b) => a.L - b.L).slice(0, 6);
    return assemble(nw, practiceMix(pick(QUIZ.filter(seen), 4)));
  }
  if (mode === 'review') return shuffle(dueKeys().map(exFromCard).filter(Boolean)).slice(0, 25);
  if (mode === 'quick') { // about two minutes: reviews first, topped up with a couple of new words
    const due = dueKeys().map(exFromCard).filter(Boolean).slice(0, 8);
    if (due.length >= 6) return shuffle(due);
    return assemble(newWordsQueue(2), [...due, ...practiceMix(pick(QUIZ.filter(seen), Math.max(0, 6 - due.length)))]);
  }
  if (mode === 'new') { const nw = newWordsQueue(Math.max(4, Math.min(6, ST.set.newPerDay - today()[2]))); return assemble(nw, practiceMix(pick(QUIZ.filter(seen), 4))); }
  if (mode === 'lesson') {
    const ws = QUIZ.filter(w => w.L === arg && w.k === 'new');
    const nw = ws.filter(w => !seen(w)).slice(0, 6);
    const old = practiceMix(pick(ws.filter(seen), 8));
    const gr = pickGrammar(4, NLES, arg).map(exGrammar);
    return assemble(nw, [...old, ...gr]);
  }
  if (mode === 'weak') { const ws = QUIZ.filter(seen).sort((a, b) => weakness(b) - weakness(a)).slice(0, 12); return shuffle(practiceMix(ws)); }
  if (mode === 'grammar') return pickGrammar(10, maxL).map(exGrammar).filter(Boolean);
  if (mode === 'gpoint') return [0, 1, 2, 3, 4].map(() => exGrammar(arg)).filter(Boolean);
  if (mode === 'tones') return toneWords(12).map(w => ({ t: 'tone', w, sk: 'ear' }));
  if (mode === 'write') {
    const pool = QUIZ.filter(w => seen(w) && [...w.hz].length <= 2);
    const ws = (pool.length >= 6 ? pool : QUIZ.filter(w => w.L <= maxL && w.k === 'new' && [...w.hz].length <= 2))
      .sort((a, b) => lvl(a.id, 'hand') - lvl(b.id, 'hand') || rnd(3) - 1).slice(0, 6);
    return ws.map(w => ({ t: 'write', w, sk: 'hand' }));
  }
  if (mode === 'listen') {
    const ws = pick(QUIZ.filter(w => seen(w) || w.k === 'hsk1'), 6).map(w => ({ t: 'listen', w, sk: 'ear' }));
    const ss = pick(allSents().filter(s => s.L <= maxL && segment(s.zh).filter(t => !t.p).length >= 3), 4).map(s => ({ t: 'build', s, gk: s.gk, sk: 'use', audio: true }));
    return shuffle([...ws, ...ss]);
  }
  if (mode === 'shadow') return pick(allSents().filter(s => s.L <= maxL), 8).map(s => ({ t: 'shadow', s }));
  return [];
}

/* ---------- option builders ---------- */
function similarWords(w, n, key) {
  const pool = QUIZ.filter(x => x.id !== w.id && x[key] !== w[key] && x.en !== w.en && x.hz !== w.hz);
  const near = pool.filter(x => Math.abs(x.L - w.L) <= 2 && x.L > 0);
  const len = pool.filter(x => [...x.hz].length === [...w.hz].length);
  const src = shuffle([...pick(near, 6), ...pick(len, 6), ...pick(pool, 6)]);
  const out = [], used = new Set([w[key]]);
  for (const x of src) { if (out.length >= n) break; if (!used.has(x[key])) { used.add(x[key]); out.push(x); } }
  return out;
}
function pyOptions(w) {
  const sy = sylls(w.py), base = sy.map(s => s.t), right = pyWithTones(w.py, base);
  const out = [right], set = new Set(out); let tries = 0;
  while (out.length < 4 && tries++ < 80) {
    const t = [...base]; const n = sy.length === 1 ? 1 : 1 + rnd(Math.min(2, sy.length));
    for (let k = 0; k < n; k++) { const i = rnd(sy.length); let nt; do { nt = 1 + rnd(4); } while (nt === t[i]); t[i] = nt; }
    const s = pyWithTones(w.py, t); if (!set.has(s)) { set.add(s); out.push(s); }
  }
  return { opts: shuffle(out), right };
}
function noteTones(w, got) { // record tone confusions per syllable
  const sy = sylls(w.py), ch = [...w.hz];
  sy.forEach((s, i) => { if (ch.length === sy.length && /[一不]/.test(ch[i])) return; const k = `${s.t}>${got[i] || 5}`; ST.conf[k] = (ST.conf[k] || 0) + 1; });
}
function gradeTyped(input, w) {
  const target = sylls(w.py), letters = target.map(s => s.b).join('');
  const inp = input.normalize('NFC').toLowerCase().replace(/u:/g, 'v');
  let base = ''; const toneAt = [];
  for (const c of inp) {
    const m = MARK2[c];
    if (m) { base += m[0].toLowerCase(); toneAt.push([base.length - 1, m[1]]); }
    else if (/[0-5]/.test(c)) toneAt.push([base.length - 1, +c || 5]);
    else if (/[a-zü]/.test(c)) base += c === 'v' ? 'ü' : c;
  }
  if (base !== letters) return { spell: false };
  const ranges = []; let p = 0; target.forEach(s => { ranges.push([p, p + s.b.length - 1]); p += s.b.length; });
  const got = target.map(() => 0);
  toneAt.forEach(([li, t]) => { const k = ranges.findIndex(r => li >= r[0] && li <= r[1]); if (k >= 0) got[k] = t; });
  const ch = [...w.hz];
  const res = target.map((s, i) => {
    const g = got[i] || 5; let ok = g === s.t;
    if (ch.length === target.length && ch[i] === '一' && [1, 2, 4].includes(g)) ok = true;
    if (ch.length === target.length && ch[i] === '不' && [2, 4].includes(g)) ok = true;
    return { s, want: s.t, got: g, ok };
  });
  return { spell: true, res, got: res.map(r => r.got), ok: res.every(r => r.ok) };
}

/* ---------- views ---------- */
const TABS = [['today', 'Today'], ['lessons', 'Lessons'], ['words', 'Words'], ['tones', 'Tones'], ['friends', 'Friends'], ['progress', 'Progress']];
let view = { tab: (location.hash || '').replace('#', '') || 'today' };
if (![...TABS.map(t => t[0]), 'settings'].includes(view.tab)) view.tab = 'today';
let SESS = null, afterRender = [], popEl = null;

function streak() {
  let n = 0; const d = new Date();
  const on = x => (ST.log[dayKey(x)] || [0])[0] > 0 || ST.frozen.includes(dayKey(x));
  if (!on(d)) d.setDate(d.getDate() - 1);
  while (on(d)) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function chipsHTML() {
  const s = streak();
  const acct = USER ? `<button class="chip ${sync === 'ok' ? 'sync-ok' : 'sync-off'}" data-act="tab" data-tab="settings" title="${sync === 'ok' ? 'Signed in. Progress follows you to every device.' : sync === 'busy' ? 'Syncing…' : 'Sync paused, will retry'}">● ${esc(ST.set.name || 'Me')}</button>`
    : authBusy() ? '' : `<button class="chip sync-off" data-act="signin" title="Sign in to save progress and join the leaderboard">Sign in</button>`;
  return `<span class="chip" title="Days in a row with practice${ST.freezes ? `; ${ST.freezes} streak freeze${ST.freezes > 1 ? 's' : ''} saved` : ''}" style="color:var(--t2)">${s} day${s === 1 ? '' : 's'}</span><span class="chip mono" title="Total XP">${ST.xp} XP</span>${acct}<button class="iconbtn" data-act="tab" data-tab="settings" aria-label="Settings">⚙</button>`;
}
function paintChips() { const el = document.getElementById('chips'); if (el) el.innerHTML = chipsHTML(); }
function topHTML() {
  return `<header class="top"><div class="wrap"><div class="brand"><div class="name"><b>汉字</b><span class="hide-xs">Hànzì Path</span><span class="pill" style="font-size:.72rem">${LEVELNAME}</span></div><div class="chips" id="chips">${chipsHTML()}</div></div>
  <nav class="tabs" aria-label="Sections">${TABS.map(([k, l]) => `<button data-act="tab" data-tab="${k}" aria-current="${view.tab === k}">${l}</button>`).join('')}</nav></div></header>`;
}
function render() {
  closePop();
  afterRender = [];
  if (!LEVEL) { app.innerHTML = welcomeHTML(); return; }
  if (view.tab === 'session') { renderSession(); return; }
  if (view.tab === 'done') { app.innerHTML = doneHTML(); return; }
  streakFreeze(); questDay();
  const body = { today: todayHTML, lessons: lessonsHTML, words: wordsHTML, tones: tonesHTML, friends: friendsHTML, progress: progressHTML, settings: settingsHTML }[view.tab]();
  app.innerHTML = topHTML() + `<main class="wrap stack">${body}</main>`;
  afterRender.forEach(f => f());
  if (CHEERS.length || pendingRank >= 0) setTimeout(flushCheers, 400);
}

/* ---------- first run: choose a level ---------- */
function welcomeHTML() {
  const g = pendingGroup();
  return `<main class="wrap stack" style="padding-top:28px">
  <div class="stack" style="gap:6px;text-align:center"><div class="han" style="font-size:3rem;font-weight:900">汉字</div><h1 style="font-size:1.5rem">Hànzì Path</h1>
  <p class="muted">Learn Chinese a few minutes a day: words, tones, writing and grammar, with reviews timed so you don't forget.</p>
  ${g ? `<p class="pill now" style="align-self:center">You're invited to group <b class="mono">${esc(g)}</b></p>` : ''}</div>
  <section class="card stack"><h2>Which level are you learning?</h2>
  <button class="tile" data-act="level" data-v="hsk1"><span class="ic">一</span><b>HSK 1 · beginner</b><span class="small muted">15 lessons, about 150 words. Start here if you're new to Chinese.</span></button>
  <button class="tile" data-act="level" data-v="hsk2"><span class="ic">二</span><b>HSK 2 · elementary</b><span class="small muted">15 lessons, about 150 new words. HSK 1 words come back as reviews.</span></button>
  <p class="small muted">You can switch any time in Settings. Your progress is kept.</p></section>
  ${USER ? `<p class="small muted" style="text-align:center">Signed in as ${esc(USER.email || USER.displayName || '')}</p>` : `<section class="card stack"><h2>Save your progress</h2><p class="small muted">Sign in with Google to keep your progress on every device, join your friends' leaderboard and get reminders. You can also start without an account.</p>
  <button class="btn" data-act="signin">Sign in with Google</button></section>`}</main>`;
}

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let INSTALL = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); INSTALL = e; });
function installHint() {
  if (isIOS()) return `<ol class="small stack" style="gap:4px;padding-left:20px;margin:0"><li>Open this page in <b>Safari</b> (not inside Instagram, WhatsApp or Messenger).</li><li>Tap the <b>Share</b> button (the square with an arrow pointing up) at the bottom of the screen.</li><li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b> at the top right.</li><li>Open Hànzì Path from the new icon on your home screen. Reminders only work from the icon (iOS 16.4 or newer).</li></ol>`;
  if (/android/i.test(navigator.userAgent)) return `<ol class="small stack" style="gap:4px;padding-left:20px;margin:0"><li>Open this page in <b>Chrome</b>.</li><li>Tap the <b>⋮</b> menu at the top right.</li><li>Tap <b>Add to Home screen</b> (or <b>Install app</b>), then <b>Install</b>.</li><li>Open Hànzì Path from the new icon.</li></ol>${INSTALL ? '<button class="btn" data-act="install">Install now</button>' : ''}`;
  return `<p class="small">Open this link on your phone. iPhone: Safari → Share → <b>Add to Home Screen</b>. Android: Chrome → ⋮ → <b>Install app</b>.</p>${INSTALL ? '<button class="btn" data-act="install">Install on this computer</button>' : ''}`;
}

function todayHTML() {
  const cov = covered(), due = dueCount(), t = today();
  const nw = newWordsQueue(Math.max(0, ST.set.newPerDay - t[2])).length;
  const nwShow = Math.min(nw, 4);
  const nextL = Math.min(NLES, cov + 1), NL = LESSON(nextL);
  const goalPct = clamp(t[0] / ST.set.goal * 100, 0, 100);
  const parts = [];
  if (due) parts.push(`${Math.min(due, ST.set.goal)} review${due === 1 ? '' : 's'}`);
  if (nwShow) parts.push(`${nwShow} new word${nwShow === 1 ? '' : 's'}`);
  parts.push('2 grammar drills'); if (VOICE) parts.push('tone training');
  const weak = QUIZ.filter(seen).sort((a, b) => weakness(b) - weakness(a)).slice(0, 6);
  const r = rankOf(ST.xp), R = RANKS[r], nextR = RANKS[r + 1];
  const rd = readiness();
  const todo = QUIZ.filter(w => w.k === 'new' && w.L >= 1 && w.L <= cov && !seen(w)).length;
  let hideInstall = false; try { hideInstall = localStorage.getItem('hanzipath.noinstall') === '1'; } catch { /* storage blocked */ }
  return `
  <section class="card hero stack" aria-labelledby="h-today">
    <div class="rank"><span class="seal">${R[1]}</span><div style="flex:1;min-width:0;gap:4px" class="stack">
      <div class="row between"><b>${R[1]} ${R[2]} · ${R[3]}</b><span class="small mono">${ST.xp} XP</span></div>
      ${nextR ? `<div class="xpbar"><i style="width:${(ST.xp - R[0]) / (nextR[0] - R[0]) * 100}%"></i></div><span class="small muted">${nextR[0] - ST.xp} XP to ${nextR[1]} ${nextR[2]}</span>` : '<span class="small muted">Highest rank reached</span>'}
    </div></div>
    <h1 id="h-today" style="font-size:1.4rem">${t[0] >= ST.set.goal ? 'Daily goal reached. Keep going or rest.' : 'Your session is ready'}</h1>
    <p class="muted">${parts.join(' · ')}. About ${Math.max(5, Math.round(ST.set.goal * 0.6))} minutes.</p>
    <div class="row between small"><span>Today ${t[0]}/${ST.set.goal} answers · +${t[4]} XP</span><span>${streak()} day streak</span></div>
    <div class="xpbar"><i style="width:${goalPct}%"></i></div>
    <button class="btn primary big" data-act="start" data-mode="daily">Start session</button>
    <button class="btn" style="background:transparent;color:inherit;border:1px solid currentColor" data-act="start" data-mode="quick">Quick 2 minutes</button>
  </section>
  ${!USER && !authBusy() ? `<section class="card stack"><h2>Play with friends</h2><p class="small muted">Sign in to save your progress in the cloud, appear on your group's leaderboard and get reminders on your phone.</p><button class="btn primary" data-act="signin">Sign in with Google</button></section>` : ''}
  ${questsHTML()}
  <section class="card stack">
    <div class="row between"><h2>Your course</h2><span class="pill">${LEVELNAME} · Lesson ${cov}</span></div>
    <div class="row" style="flex-wrap:nowrap;gap:14px"><div class="ring" style="--p:${rd.pct}" aria-label="Lesson readiness ${rd.pct}%"><span>${rd.pct}%</span></div>
    <div style="min-width:0"><p>${cov < NLES ? `Next up: <b>Lesson ${nextL}</b>, <span class="han">${esc(NL.t)}</span> (${esc(NL.te)}).` : 'You have reached the last lesson.'}</p>
    <p class="small muted">${rd.pv}% of Lesson ${rd.nx} words started, ${rd.rv}% strength on Lessons 1–${cov}.</p></div></div>
    ${todo ? `<div class="row between" style="gap:8px"><span class="small"><b>${todo} word${todo === 1 ? '' : 's'}</b> from Lessons 1–${cov} not learned yet.</span><button class="btn" data-act="start" data-mode="catchup">Learn them</button></div>` : ''}
    <div class="row"><button class="btn primary" data-act="start" data-mode="lesson" data-n="${nextL}">Practise Lesson ${nextL}</button><button class="btn" data-act="lesson" data-n="${nextL}">Open lesson</button></div>
  </section>
  <section class="stack"><h2>Practice by skill</h2>
  <div class="grid3">
    ${tile('复', 'Reviews', due ? `${due} due now` : 'Nothing due', 'review', !due)}
    ${tile('新', 'New words', nw ? `${nw} waiting` : 'All caught up', 'new', !nw)}
    ${tile('语', 'Grammar', 'Build sentences', 'grammar')}
    ${tile('声', 'Tones', VOICE ? 'Ear training' : 'Needs a Chinese voice', 'tones', !VOICE)}
    ${tile('写', 'Writing', window.HanziWriter ? 'Stroke order' : 'Offline', 'write', !window.HanziWriter)}
    ${tile('听', 'Listening', VOICE ? 'Words + sentences' : 'Needs a Chinese voice', 'listen', !VOICE)}
  </div></section>
  ${weekHTML()}
  ${weak.length ? `<section class="card stack"><div class="row between"><h2>Weak spots</h2><button class="btn" data-act="start" data-mode="weak">Drill these</button></div>
    <div class="words">${weak.map(wordTile).join('')}</div></section>` : ''}
  ${!isStandalone() && !hideInstall ? `<section class="card stack"><div class="row between"><h2>Put it on your phone</h2><button class="btn ghost" style="padding:4px 10px" data-act="noinstall">Hide</button></div>${installHint()}</section>` : ''}`;
}
function questsHTML() {
  const q = questDay();
  return `<section class="card stack"><div class="row between"><h2>Today's quests</h2><span class="small muted">New quests every day</span></div>
  <div>${q.ids.map(id => { const Q = QUESTS[id]; const v = Math.min(Q.n, q.c[Q.c] || 0), done = q.done.includes(id);
    return `<div class="quest ${done ? 'done' : ''}"><b>${esc(Q.t)}</b><span class="small mono">${done ? '+' + Q.xp + ' XP' : `${v}/${Q.n}`}</span><div class="bar"><i style="width:${v / Q.n * 100}%"></i></div></div>`; }).join('')}</div>
  <div class="chest ${q.chest ? 'open' : ''}"><span class="ic">宝</span><div class="small">${q.chest ? '<b>Chest opened.</b> +100 XP today.' : '<b>Daily chest:</b> finish all three quests for +100 XP.'}</div></div></section>`;
}
function weekHTML() {
  const d = new Date(); const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => { const x = new Date(mon); x.setDate(mon.getDate() + i); return x; });
  const xs = days.map(x => (ST.log[dayKey(x)] || [])[4] || 0), tot = xs.reduce((a, b) => a + b, 0), mx = Math.max(100, ...xs);
  return `<section class="card stack"><div class="row between"><h2>This week</h2><span class="small mono">${tot} / ${ST.set.week} XP</span></div>
  <div class="bar"><i style="width:${clamp(tot / ST.set.week * 100, 0, 100)}%;background:var(--t2)"></i></div>
  <div class="week">${days.map((x, i) => `<div class="${dayKey(x) === dayKey() ? 'today' : ''}" title="${dayKey(x)}: ${xs[i]} XP"><i style="height:${Math.max(3, xs[i] / mx * 56)}px;${x > d ? 'opacity:.3' : ''}"></i><span>${'MTWTFSS'[i]}</span></div>`).join('')}</div></section>`;
}
function tile(ic, t, sub, mode, off) {
  return `<button class="tile" data-act="start" data-mode="${mode}" ${off ? 'disabled style="opacity:.55;cursor:default"' : ''}><span class="ic">${ic}</span><b>${t}</b><span class="small muted">${sub}</span></button>`;
}
function wordStatus(w) {
  if (w.k === 'extra' || w.k === 'name') return null;
  if (!seen(w)) return w.k === 'hsk1' ? ['old', 'HSK 1'] : w.L > 0 && w.L <= covered() ? ['todo', 'to learn'] : ['new', 'later'];
  const l = wordLevel(w); return l >= 3 ? ['known', 'known'] : ['learning', 'learning'];
}
function wordTile(w) {
  const st = wordStatus(w);
  return `<button class="word" data-act="word" data-w="${esc(w.hz)}" data-id="${esc(w.id)}"><span class="row between" style="gap:4px;flex-wrap:nowrap"><span class="hz" style="white-space:nowrap">${esc(w.hz)}</span>${st ? `<span class="wst ${st[0]}" title="${st[0] === 'todo' ? 'In your lessons so far, not practised yet' : ''}">${st[1]}</span>` : ''}</span><span class="py">${pyHTML(w.py)}</span><span class="en">${esc(w.en)}</span>${lvlHTML(w)}</button>`;
}

function lessonsHTML() {
  if (view.n) return lessonDetailHTML(LESSON(view.n));
  const cov = covered();
  return `<h1 style="font-size:1.35rem">${LEVELNAME} · 15 lessons</h1>
  <p class="muted">Lessons follow the HSK Standard Course ${LEVEL === 'hsk1' ? 1 : 2}. You're on Lesson ${cov}; new words come from your lesson and the next one.</p>
  <div class="stack">${LESSONS.map(L => {
    const ws = QUIZ.filter(w => w.L === L.n && w.k === 'new');
    const m = ws.length ? Math.round(ws.reduce((a, w) => a + wordLevel(w), 0) / ws.length / 5 * 100) : 0;
    const st = m >= 80 ? '<span class="pill done">Strong</span>' : L.n === cov + 1 ? '<span class="pill now">Next</span>' : L.n <= cov ? '<span class="pill">Learning</span>' : '<span class="pill">Later</span>';
    return `<button class="lesson ${L.n === cov + 1 ? 'now' : ''}" data-act="lesson" data-n="${L.n}"><span class="num">${L.n}</span>
      <span class="stack" style="gap:4px;min-width:0"><span class="ti">${esc(L.t)}</span><span class="small muted">${esc(L.te)} · ${ws.filter(seen).length}/${ws.length} words learned</span>
      <span class="bar" style="height:5px"><i style="width:${clamp(m, 0, 100)}%;background:var(--good)"></i></span></span>${st}</button>`;
  }).join('')}</div>`;
}
function lessonDetailHTML(L) {
  const sub = view.sub || 'words';
  const ws = WORDS.filter(w => w.L === L.n && (w.k === 'new' || w.k === 'name'));
  let inner = '';
  if (sub === 'words') {
    inner = `<div class="words">${ws.map(wordTile).join('')}</div>`;
  } else if (sub === 'grammar') {
    inner = L.grammar.map((g, gi) => {
      const gk = `g${L.n}-${gi}`, c = ST.cards[gk + '~use'];
      const ai = (ST.sents || []).filter(s => s.gk === gk);
      return `<article class="card stack"><div class="row between"><h2><span class="han">${esc(g.zh)}</span></h2>${c ? `<span class="pill ${c[0] >= 4 ? 'done' : ''}">Level ${c[0]}</span>` : '<span class="pill">Not practised</span>'}</div>
      <p><b>${esc(g.name)}</b></p><p>${esc(g.explain)}</p>
      <div>${g.ex.concat(ai.map(s => [s.zh, s.py, s.en, 1])).map(e => `<div class="line"><span class="spk"></span><div style="min-width:0"><div class="sent">${rubyHTML(e[0], e[1])}</div><div class="en-line">${esc(e[2])}</div></div>${playBtn(e[0])}</div>`).join('')}</div>
      <div class="row"><button class="btn primary" data-act="start" data-mode="gpoint" data-g="${gk}">Practise this pattern</button></div>
      <p class="small muted" id="genmsg-${gk}"></p></article>`;
    }).join('');
  } else {
    inner = L.texts.length ? L.texts.map((t, ti) => `<article class="card"><div class="row between"><h2 class="han" style="font-size:1rem">${esc(t.scene)}</h2><button class="btn ghost" data-act="sayall" data-l="${L.n}" data-ti="${ti}">Play dialogue</button></div>
      ${t.lines.map(l => `<div class="line"><span class="spk">${esc(l[0])}</span><div style="min-width:0"><div class="sent">${rubyHTML(l[1], l[2])}</div>${ST.set.en !== false ? `<div class="en-line">${esc(l[3])}</div>` : ''}</div>${playBtn(l[1])}</div>`).join('')}</article>`).join('')
      : `<p class="card muted">The dialogues for this lesson aren't in the app yet. The grammar tab has example sentences for every pattern in Lesson ${L.n}.</p>`;
  }
  const seg = (k, l) => `<button data-act="sub" data-sub="${k}" aria-pressed="${sub === k}">${l}</button>`;
  const pys = (k, l) => `<button data-act="pymode" data-v="${k}" aria-pressed="${ST.set.py === k}">${l}</button>`;
  return `<div class="row"><button class="btn ghost" data-act="lesson" data-n="0">All lessons</button></div>
  <section class="stack" style="gap:6px"><span class="label">${LEVELNAME} · Lesson ${L.n}</span>
  <h1 class="sent" style="font-size:1.7rem;line-height:2.2">${rubyHTML(L.t, L.tp)}</h1><p class="muted">${esc(L.te)}</p></section>
  <div class="row"><button class="btn primary" data-act="start" data-mode="lesson" data-n="${L.n}">Practise Lesson ${L.n}</button></div>
  <div class="row between"><div class="seg" role="group" aria-label="Lesson section">${seg('words', 'Words')}${seg('grammar', 'Grammar')}${seg('text', 'Dialogues')}</div>
  <div class="seg" role="group" aria-label="Pinyin display">${pys('color', 'Tones')}${pys('plain', 'Pinyin')}${pys('off', 'Hanzi only')}</div></div>
  ${inner}`;
}

function wordsHTML() {
  const f = view.f || 'all';
  const fb = (k, l) => `<button data-act="wf" data-v="${k}" aria-pressed="${f === k}">${l}</button>`;
  const sw = QUIZ.filter(w => w.k !== 'hsk1');
  const cnt = { known: sw.filter(w => seen(w) && wordLevel(w) >= 3).length, learning: sw.filter(w => seen(w) && wordLevel(w) < 3).length, todo: sw.filter(w => !seen(w) && w.L <= covered()).length, later: sw.filter(w => !seen(w) && w.L > covered()).length };
  afterRender.push(paintWords);
  return `<h1 style="font-size:1.35rem">Words</h1>
  <input id="wq" class="field" type="search" placeholder="Search hanzi, pinyin (no tones needed) or English" value="${esc(view.q || '')}" style="width:100%">
  <section class="card stack" style="gap:8px"><div class="row between"><b>Your ${LEVELNAME} words</b><span class="small muted">${sw.length} in the course</span></div>
    <div class="bar" style="height:12px">${[['known', 'var(--good)'], ['learning', 'var(--t4)'], ['todo', 'var(--t2)']].map(([k, c]) => `<i style="width:${cnt[k] / sw.length * 100}%;background:${c}"></i>`).join('')}</div>
    <div class="legend"><span style="--c:var(--good)">${cnt.known} known</span><span style="--c:var(--t4)">${cnt.learning} learning</span><span style="--c:var(--t2)">${cnt.todo} in your lessons, not learned yet</span><span style="--c:var(--soft)">${cnt.later} in later lessons</span></div>
    ${cnt.todo ? `<div class="row"><button class="btn primary" data-act="start" data-mode="catchup">Learn the words I skipped</button></div>` : ''}</section>
  <div class="scrollx"><div class="seg" role="group" aria-label="Filter">${fb('all', 'All')}${fb('notyet', 'Not learned')}${fb('learning', 'Learning')}${fb('known', 'Known')}${fb('weak', 'Weak')}${fb('due', 'Due')}${LEVEL === 'hsk2' ? fb('hsk1', 'HSK 1') : ''}</div></div>
  <div id="wgrid" class="stack"></div>`;
}
const plain = s => sylls(s).map(x => x.b).join('');
function paintWords() {
  const el = document.getElementById('wgrid'); if (!el) return;
  const q = (view.q || '').trim().toLowerCase(), f = view.f || 'all', n = nowM();
  let ws = WORDS.filter(w => w.k !== 'extra');
  if (f === 'hsk2') ws = ws.filter(w => w.k !== 'hsk1');
  if (f === 'hsk1') ws = ws.filter(w => w.k === 'hsk1');
  if (f === 'weak') ws = ws.filter(seen).sort((a, b) => weakness(b) - weakness(a)).slice(0, 30);
  if (f === 'due') ws = ws.filter(w => skillsOn().some(k => { const c = ST.cards[w.id + '~' + k]; return c && c[1] <= n; }));
  if (f === 'notyet') ws = ws.filter(w => w.k === 'new' && !seen(w)).sort((a, b) => a.L - b.L);
  if (f === 'learning') ws = ws.filter(w => seen(w) && wordLevel(w) < 3);
  if (f === 'known') ws = ws.filter(w => seen(w) && wordLevel(w) >= 3);
  if (q) { const qp = q.replace(/[\s0-9]/g, ''); ws = ws.filter(w => w.hz.includes(q) || w.en.toLowerCase().includes(q) || plain(w.py).includes(qp) || w.py.toLowerCase().includes(q)); }
  if (!ws.length) { el.innerHTML = '<p class="muted">No words match.</p>'; return; }
  if (f === 'weak') { el.innerHTML = `<div class="words">${ws.map(wordTile).join('')}</div>`; return; }
  const groups = {}; ws.forEach(w => (groups[w.L] = groups[w.L] || []).push(w));
  el.innerHTML = Object.keys(groups).map(Number).sort((a, b) => (a || 99) - (b || 99)).map(L =>
    `<section class="stack" style="gap:8px"><span class="label">${L ? `Lesson ${L} · ${esc(LESSON(L).t)}` : 'HSK 1 review'}</span><div class="words">${groups[L].map(wordTile).join('')}</div></section>`).join('');
}

function tonesHTML() {
  const ex = { 1: ['妈', 'mā', 'mum'], 2: ['麻', 'má', 'hemp'], 3: ['马', 'mǎ', 'horse'], 4: ['骂', 'mà', 'to scold'], 5: ['吗', 'ma', 'question particle'] };
  const cells = [];
  for (let t = 1; t <= 5; t++) { let tot = 0; for (let g = 1; g <= 5; g++) tot += ST.conf[`${t}>${g}`] || 0; cells.push(tot); }
  const has = cells.some(Boolean);
  const wt = confWorst();
  return `<h1 style="font-size:1.35rem">Tones & pronunciation</h1>
  ${VOICE ? '' : `<p class="card" style="border-color:var(--warn)"><b>No Chinese voice found on this device.</b> Listening and tone drills need one. On Windows: Settings → Time & language → Speech → Add voices → Chinese (Simplified, China). On a phone the voice is usually built in.</p>`}
  <section class="card stack"><h2>The four tones</h2>
  <div class="grid2">${[1, 2, 3, 4, 5].map(t => `<button class="tile" data-act="say" data-t="${ex[t][0]}"><span class="row" style="gap:8px">${contour(t)}<b class="t${t}">${t === 5 ? 'Neutral' : 'Tone ' + t}</b></span>
    <span><span class="han t${t}" style="font-size:1.4rem">${ex[t][0]}</span> <span class="t${t}">${ex[t][1]}</span> <span class="small muted">${ex[t][2]}</span></span><span class="small muted">${TONE_NAME[t]}</span></button>`).join('')}</div>
  <p class="small muted">Colours stay the same everywhere in the app: red = 1st, orange = 2nd, green = 3rd, blue = 4th, grey = neutral.</p></section>
  <div class="grid2">
    <button class="tile" data-act="start" data-mode="tones" ${VOICE ? '' : 'disabled'}><span class="ic">声</span><b>Tone ear training</b><span class="small muted">${wt ? `Focus: tone ${wt}, your weakest` : 'Hear a word, mark each tone'}</span></button>
    <button class="tile" data-act="start" data-mode="shadow" ${VOICE ? '' : 'disabled'}><span class="ic">说</span><b>Shadowing</b><span class="small muted">Listen, repeat aloud, rate yourself</span></button>
  </div>
  <section class="card stack"><h2>Your tone accuracy</h2>
  ${has ? `<div class="scrollx"><table class="matrix"><caption class="small muted" style="caption-side:bottom;padding-top:6px">Rows: the real tone. Columns: what you answered. Off-diagonal numbers are confusions.</caption>
    <tr><th></th>${[1, 2, 3, 4, 5].map(g => `<th class="t${g}">${g === 5 ? '·' : g}</th>`).join('')}<th>Right</th></tr>
    ${[1, 2, 3, 4, 5].map(t => { let tot = 0; for (let g = 1; g <= 5; g++) tot += ST.conf[`${t}>${g}`] || 0; const ok = ST.conf[`${t}>${t}`] || 0;
      return `<tr><th class="t${t}">${t === 5 ? 'neutral' : 'tone ' + t}</th>${[1, 2, 3, 4, 5].map(g => { const v = ST.conf[`${t}>${g}`] || 0; const share = tot ? v / tot : 0;
        return `<td style="background:color-mix(in srgb, ${g === t ? 'var(--good)' : 'var(--bad)'} ${Math.round(share * 55)}%, transparent)">${v || ''}</td>`; }).join('')}<td class="mono">${tot ? Math.round(ok / tot * 100) + '%' : '–'}</td></tr>`; }).join('')}
  </table></div>` : '<p class="muted">Answer a few pinyin or tone questions and your confusion pattern shows up here, so the drills can target it.</p>'}
  </section>
  <section class="card stack"><h2>Tone change rules you will hear</h2>
  <div class="line" style="grid-template-columns:minmax(0,1fr) auto"><div><b>Two 3rd tones in a row:</b> the first becomes 2nd. <span class="han">你好</span> is written nǐ hǎo but said <span class="t2">ní</span> <span class="t3">hǎo</span>.</div>${playBtn('你好')}</div>
  <div class="line" style="grid-template-columns:minmax(0,1fr) auto"><div><b>不 bù before a 4th tone</b> becomes <span class="t2">bú</span>: <span class="han">不是</span> <span class="t2">bú</span> <span class="t4">shì</span>, <span class="han">不热</span> <span class="t2">bú</span> <span class="t4">rè</span>.</div>${playBtn('不是')}</div>
  <div class="line" style="grid-template-columns:minmax(0,1fr) auto"><div><b>一 yī</b> becomes <span class="t2">yí</span> before a 4th tone (<span class="han">一下</span> yíxià) and <span class="t4">yì</span> before tones 1–3 (<span class="han">一起</span> yìqǐ). Counting and dates keep yī.</div>${playBtn('一起')}</div>
  <div class="line" style="grid-template-columns:minmax(0,1fr) auto"><div><b>Half 3rd tone:</b> before tones 1, 2, 4 and neutral, the 3rd tone only dips low and doesn't rise: <span class="han">很忙</span>, <span class="han">眼睛</span>.</div>${playBtn('很忙')}</div>
  </section>`;
}

function progressHTML() {
  const sk = skillsOn(), seenW = QUIZ.filter(seen), mastered = seenW.filter(w => wordLevel(w) >= 5);
  const n = nowM();
  const dueTom = Object.values(ST.cards).filter(c => c[1] <= n + 1440).length;
  const SKN = { mean: 'Meaning (see 汉字 → know it)', form: 'Recognition (English → 汉字)', read: 'Reading (pinyin + tones)', ear: 'Listening', hand: 'Writing (stroke order)', use: 'Grammar (sentence building)' };
  const rows = [...sk, 'hand', 'use'].map(k => {
    let r = 0, x = 0, l = 0, c = 0; for (const [key, v] of Object.entries(ST.cards)) if (key.endsWith('~' + k)) { r += v[2]; x += v[3]; l += v[0]; c++; }
    return { k, acc: r + x ? Math.round(r / (r + x) * 100) : null, lv: c ? l / c : 0, c };
  });
  // heat map, 12 weeks ending this week
  const days = []; const end = new Date(); end.setDate(end.getDate() + (6 - ((end.getDay() + 6) % 7)));
  for (let i = 83; i >= 0; i--) { const d = new Date(end); d.setDate(end.getDate() - i); days.push(d); }
  const maxA = Math.max(10, ...Object.values(ST.log).map(a => a[0]));
  const totals = Object.values(ST.log).reduce((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2], a[3] + v[3]], [0, 0, 0, 0]);
  const weak = seenW.sort((a, b) => weakness(b) - weakness(a)).slice(0, 8);
  const r = rankOf(ST.xp), R = RANKS[r], nextR = RANKS[r + 1];
  const vocabPct = Math.round(QUIZ.filter(w => (w.k === 'new' || w.k === 'hsk1') && wordLevel(w) >= 3).length / QUIZ.filter(w => w.k === 'new' || w.k === 'hsk1').length * 100);
  return `<h1 style="font-size:1.35rem">Progress</h1>
  <section class="card stack"><div class="rank"><span class="seal">${R[1]}</span><div style="flex:1;min-width:0"><b>${R[1]} ${R[2]}</b> <span class="muted small">${R[3]}</span>
    ${nextR ? `<div class="bar" style="margin-top:6px"><i style="width:${(ST.xp - R[0]) / (nextR[0] - R[0]) * 100}%;background:var(--t2)"></i></div><span class="small muted">${ST.xp} XP · ${nextR[0] - ST.xp} to ${nextR[1]} ${nextR[2]}</span>` : `<span class="small muted">${ST.xp} XP</span>`}</div></div>
    <p class="small muted">Ranks follow the old imperial examinations, from 童生 (village scholar) to 状元 (top scholar of the empire) and beyond.</p>
    <div class="scrollx"><div class="row" style="flex-wrap:nowrap;gap:6px">${RANKS.map((x, i) => `<span class="pill ${i <= r ? 'done' : ''}" title="${x[3]} · ${x[0]} XP"><span class="han">${x[1]}</span></span>`).join('')}</div></div></section>
  <section class="card stack"><h2>${LEVELNAME} exam readiness</h2>
    <div class="row" style="flex-wrap:nowrap;gap:14px"><div class="ring" style="--p:${vocabPct}"><span>${vocabPct}%</span></div>
    <div class="small" style="min-width:0"><p>${vocabPct}% of the ${LEVEL === 'hsk1' ? 'HSK 1' : 'HSK 1–2'} words are solid (strength 3+).</p><p class="muted">The HSK ${LEVEL === 'hsk1' ? 1 : 2} exam is listening + reading; aim for 80% here and plenty of listening practice.</p></div></div></section>
  <section class="card stack"><div class="row between"><h2>Badges</h2><span class="small muted">${Object.keys(ST.badges).length}/${BADGES.length}</span></div>
    <div class="badges">${BADGES.map(([id, ic, name, how]) => `<div class="badge ${ST.badges[id] ? 'got' : ''}" title="${esc(how)}"><span class="b">${ic}</span><b class="small">${esc(name)}</b><small>${ST.badges[id] ? 'Earned ' + ST.badges[id] : esc(how)}</small></div>`).join('')}</div></section>
  <div class="grid3">
    <div class="card stat"><b>${seenW.length}</b><span class="small muted">words started of ${QUIZ.length}</span></div>
    <div class="card stat"><b>${mastered.length}</b><span class="small muted">words strong</span></div>
    <div class="card stat"><b>${dueTom}</b><span class="small muted">reviews due within 24 h</span></div>
    <div class="card stat"><b>${streak()}</b><span class="small muted">day streak</span></div>
    <div class="card stat"><b>${totals[0] ? Math.round(totals[1] / totals[0] * 100) + '%' : '–'}</b><span class="small muted">accuracy, all time</span></div>
    <div class="card stat"><b>${Math.round(totals[3] / 60)}</b><span class="small muted">minutes practised</span></div>
  </div>
  <section class="card stack"><h2>Skills</h2>
  ${rows.map(r => `<div class="stack" style="gap:4px"><div class="row between"><span>${SKN[r.k]}</span><span class="small muted mono">${r.c ? `${r.c} items · ${r.acc ?? '–'}% right` : 'not started'}</span></div>
    <div class="bar"><i style="width:${r.lv / 7 * 100}%;background:var(--accent)"></i></div></div>`).join('')}
  <p class="small muted">Bars show average memory strength: a full bar means you'd recall it after about three months.</p></section>
  <section class="card stack"><h2>Last 12 weeks</h2>
  <div class="heat" style="grid-template-rows:repeat(7,auto);grid-auto-flow:column">${days.map(d => { const a = (ST.log[dayKey(d)] || [0])[0]; const p = a ? 20 + Math.round(a / maxA * 80) : 0;
    return `<i title="${dayKey(d)}: ${a} answers" style="${a ? `background:color-mix(in srgb, var(--accent) ${p}%, var(--soft))` : ''}${d > new Date() ? ';opacity:.35' : ''}"></i>`; }).join('')}</div>
  <p class="small muted">Each square is a day; darker means more answers. Columns are weeks, Monday on top.</p></section>
  <section class="card stack"><h2>Lessons</h2>
  ${LESSONS.map(L => { const ws = QUIZ.filter(w => w.L === L.n && w.k === 'new'); const st = ws.filter(seen).length; const m = ws.length ? ws.reduce((a, w) => a + wordLevel(w), 0) / ws.length / 7 * 100 : 0;
    return `<div class="row" style="gap:10px;flex-wrap:nowrap"><span class="mono" style="width:24px">${L.n}</span><div class="bar" style="flex:1"><i style="width:${m}%;background:var(--good)"></i></div><span class="small muted mono" style="width:64px;text-align:right">${st}/${ws.length}</span></div>`; }).join('')}
  </section>
  ${weak.length ? `<section class="card stack"><h2>Needs work</h2><div class="words">${weak.map(wordTile).join('')}</div></section>` : ''}`;
}

function settingsHTML() {
  const auto = autoLesson();
  const pushOK = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const remindTxt = !USER ? 'Sign in first, so the reminders know who you are.'
    : isIOS() && !isStandalone() ? 'On iPhone, reminders only work after you add Hànzì Path to your home screen (see “Put it on your phone” below) and open it from the icon. Needs iOS 16.4 or newer.'
    : !pushOK ? 'This browser cannot receive push notifications. Try Chrome, Edge, Firefox or Safari.'
    : perm === 'denied' ? 'Notifications are blocked for this site. Allow them in your browser or phone settings, then turn reminders on again.'
    : ST.set.remind ? 'On. About 3 short nudges a day at random times between 09:00 and 22:30 (your time zone), and none once you have reached your daily goal.'
    : 'Off. Turn on to get about 3 short nudges a day at random times between 09:00 and 22:30.';
  return `<h1 style="font-size:1.35rem">Settings</h1>
  <section class="card stack"><h2>Account</h2>
  ${USER ? `<p class="small muted">Signed in as <b>${esc(USER.email || USER.displayName || '')}</b>. ${sync === 'ok' ? 'Progress is saved to your account and follows you to your phone and other computers.' : sync === 'busy' ? 'Syncing…' : 'Sync is paused; it retries when you are back online.'}</p>
  <label class="stack" style="gap:6px" for="s-name"><span>Name on the leaderboard</span><input id="s-name" class="field" maxlength="20" value="${esc(ST.set.name)}" autocomplete="nickname"></label>
  <div class="row"><button class="btn ghost" data-act="signout">Sign out</button></div>`
  : `<p class="small muted">${authBusy() ? 'Checking your sign-in…' : 'Not signed in. Progress is saved only in this browser.'}</p><div class="row"><button class="btn primary" data-act="signin">Sign in with Google</button></div>`}</section>
  <section class="card stack"><h2>Level</h2>
  <div class="seg" role="group" aria-label="Level"><button data-act="level" data-v="hsk1" aria-pressed="${LEVEL === 'hsk1'}">HSK 1</button><button data-act="level" data-v="hsk2" aria-pressed="${LEVEL === 'hsk2'}">HSK 2</button></div>
  <p class="small muted">Switching keeps all your progress; words you know from one level count in the other.</p>
  <label class="stack" style="gap:6px" for="s-lesson"><span>Your lesson</span>
  <select id="s-lesson" data-set="lesson"><option value="0" ${!ST.set.lesson ? 'selected' : ''}>Automatic (follows your progress, now Lesson ${auto})</option>
  ${LESSONS.map(L => `<option value="${L.n}" ${ST.set.lesson === L.n ? 'selected' : ''}>Lesson ${L.n} · ${esc(L.t)}</option>`).join('')}</select></label>
  <p class="small muted">New words come from your lesson and the one after it. If you take a class, set the lesson your class is on.</p></section>
  <section class="card stack"><h2>Reminders</h2>
  <p class="small">${remindTxt}</p>
  ${USER && pushOK && perm !== 'denied' && !(isIOS() && !isStandalone()) ? `<div class="row">${ST.set.remind ? '<button class="btn" data-act="remindoff">Turn reminders off</button><button class="btn ghost" data-act="remindtest">Show a sample reminder</button>' : '<button class="btn primary" data-act="remindon">Turn reminders on</button>'}</div>` : ''}
  </section>
  <section class="card stack"><h2>Put it on your phone</h2>${isStandalone() ? '<p class="small muted">Installed. You are using the app from your home screen.</p>' : installHint()}</section>
  <section class="card stack"><h2>Daily plan</h2>
  <label class="stack" style="gap:6px" for="s-new"><span>New words per day</span><select id="s-new" data-set="newPerDay">${[4, 6, 8, 10, 12, 15].map(v => `<option ${ST.set.newPerDay === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
  <label class="stack" style="gap:6px" for="s-goal"><span>Answers per session (daily goal)</span><select id="s-goal" data-set="goal">${[10, 15, 20, 30].map(v => `<option ${ST.set.goal === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label></section>
  <section class="card stack"><h2>Sound</h2>
  <p>${VOICE ? `Voice: <b>${esc(VOICE.name)}</b>` : 'No Chinese voice found on this device. Listening and tone drills are switched off until one is installed. On Windows: Settings → Time & language → Speech → Add voices → Chinese (Simplified, China). Phones usually have one built in.'}</p>
  <label class="stack" style="gap:6px" for="s-rate"><span>Speaking speed: <b id="rate-v">${ST.set.rate.toFixed(2)}×</b></span><input id="s-rate" type="range" min="0.5" max="1.1" step="0.05" value="${ST.set.rate}" data-set="rate"></label>
  <div class="row"><button class="btn" data-act="say" data-t="我每天六点起床。">Test voice</button></div>
  <label class="row" for="s-sound" style="gap:8px"><input id="s-sound" type="checkbox" data-set="sound" ${ST.set.sound ? 'checked' : ''}> <span>Sound effects (chimes for right answers)</span></label>
  <label class="stack" style="gap:6px" for="s-vol"><span>Effects volume</span><input id="s-vol" type="range" min="0.1" max="1" step="0.1" value="${ST.set.vol}" data-set="vol"></label>
  <div class="row"><button class="btn" data-act="sfxtest">Hear the sounds</button></div></section>
  <section class="card stack"><h2>Goals</h2>
  <label class="stack" style="gap:6px" for="s-week"><span>Weekly XP goal</span><select id="s-week" data-set="week">${[500, 1000, 1500, 2000, 3000].map(v => `<option ${ST.set.week === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
  <p class="small muted">A typical 10-minute session earns 150–250 XP.</p></section>
  <section class="card stack"><h2>Your data</h2>
  <p class="small muted">${Object.keys(ST.cards).length} memory items. Your progress is private; friends in your group only see your name, level, XP, streak and number of words.</p>
  <div class="row"><button class="btn ghost" data-act="reset1">Reset all progress</button></div>
  <div id="reset2" hidden class="row"><span class="small">This erases every review and statistic.</span><button class="btn" style="background:var(--bad-soft);color:var(--bad)" data-act="reset">Erase progress</button><button class="btn" data-act="reset0">Keep it</button></div></section>
  <p class="small muted">Words and lessons follow the HSK Standard Course syllabus. Pronunciation uses your device's voice. Stroke order: Hanzi Writer and Make Me a Hanzi.</p>`;
}

/* ---------- friends: group leaderboard ---------- */
let BOARD = null; // { group, rows, err }
function friendsHTML() {
  if (!USER) return `<h1 style="font-size:1.35rem">Friends</h1><section class="card stack"><p>Sign in to see your friends' leaderboard and compete on weekly XP.</p><button class="btn primary" data-act="signin">${authBusy() ? 'Checking sign-in…' : 'Sign in with Google'}</button></section>`;
  const g = ST.set.group;
  if (!g) return `<h1 style="font-size:1.35rem">Friends</h1>
  <section class="card stack"><h2>Join a group</h2><p class="small muted">Got a group code from a friend? Enter it here. Only people with the code see each other.</p>
  <div class="row" style="flex-wrap:nowrap"><input id="g-code" class="field" style="flex:1;min-width:0;text-transform:uppercase" maxlength="12" placeholder="e.g. NIHAO7" value="${esc(pendingGroup())}" autocapitalize="characters" autocomplete="off"><button class="btn primary" data-act="gjoin">Join</button></div></section>
  <section class="card stack"><h2>Start a group</h2><p class="small muted">Create a group and share the link with your friends.</p>
  <button class="btn" data-act="gcreate">Create a new group</button></section>`;
  const mode = view.board || 'week';
  afterRender.push(() => loadBoard(false));
  const link = shareLink();
  return `<div class="row between"><h1 style="font-size:1.35rem">Friends</h1><span class="pill mono">Group ${esc(g)}</span></div>
  <section class="card stack"><div class="row between"><div class="seg" role="group" aria-label="Period"><button data-act="board" data-v="week" aria-pressed="${mode === 'week'}">This week</button><button data-act="board" data-v="all" aria-pressed="${mode === 'all'}">All time</button></div>
  <button class="btn ghost" style="padding:6px 10px" data-act="boardreload">Refresh</button></div>
  <div id="board" class="stack" style="gap:6px">${boardRowsHTML()}</div>
  <p class="small muted">${mode === 'week' ? 'Weekly XP resets every Monday.' : 'Total XP since each friend started.'}</p></section>
  <section class="card stack"><h2>Invite friends</h2><p class="small">Send this link. Friends open it, pick their level, sign in with Google and land in your group:</p>
  <p class="mono small" style="word-break:break-all">${esc(link)}</p>
  <div class="row"><button class="btn primary" data-act="gshare">Share link</button><button class="btn ghost" data-act="gcopy">Copy</button></div>
  <p class="small muted">Group code: <b class="mono">${esc(g)}</b></p></section>
  <div class="row"><button class="btn ghost" data-act="gleave">Leave this group</button></div>`;
}
const shareLink = () => `${location.origin}${location.pathname}?g=${encodeURIComponent(ST.set.group || '')}`;
function boardRowsHTML() {
  if (!BOARD || BOARD.group !== ST.set.group) return '<p class="muted small">Loading the leaderboard…</p>';
  if (BOARD.err) return `<p class="small" style="color:var(--bad)">${esc(BOARD.err)}</p>`;
  const mode = view.board || 'week', wk = weekKey();
  const val = r => mode === 'week' ? (r.wk === wk ? r.week : 0) : r.xp;
  const rows = [...BOARD.rows].sort((a, b) => val(b) - val(a) || b.xp - a.xp);
  if (!rows.length) return '<p class="muted small">Nobody here yet. Practise a little and you will show up.</p>';
  return rows.map((r, i) => { const me = r.id === USER.uid;
    return `<div class="board-row ${me ? 'me' : ''}"><span class="mono rk">${i + 1}</span><span class="stack" style="gap:0;min-width:0;flex:1"><b class="nm">${esc(r.name)}${me ? ' (you)' : ''}</b><span class="small muted">${r.level === 'hsk1' ? 'HSK 1' : 'HSK 2'} · ${r.words} words · ${r.streak} day streak</span></span><b class="mono">${val(r)} XP</b></div>`; }).join('');
}
async function loadBoard(force) {
  const g = ST.set.group; if (!CL || !USER || !g) return;
  if (!force && BOARD && BOARD.group === g && Date.now() - BOARD.at < 30000) return;
  postBoard();
  try { const rows = await CL.loadBoard(g); BOARD = { group: g, rows, at: Date.now() }; }
  catch (e) { BOARD = { group: g, rows: [], at: Date.now(), err: 'Could not load the leaderboard. Check your connection.' }; }
  const el = document.getElementById('board'); if (el) el.innerHTML = boardRowsHTML();
}
/* ---------- session ---------- */
const kindLabel = ex => KIND[ex.t] || '';
const KIND = { intro: 'New word', mean: 'What does it mean?', form: 'Which characters?', pickpy: 'Pick the right tones', typepy: 'Type the pinyin', listen: 'What did you hear?', tone: 'Mark the tones', build: 'Build the sentence', fill: 'Fill the gap', write: 'Write it', shadow: 'Shadow the sentence' };
function startSession(mode, arg) {
  const q = build(mode, arg).filter(Boolean);
  if (!q.length) { toast(mode === 'review' ? 'Nothing is due. Nice.' : 'Nothing to practise here yet.'); return; }
  startQueue(q, mode);
}
function startQueue(q, mode, extra = {}) {
  actx();
  SESS = { q, i: 0, mode, start: Date.now(), ok: 0, n: 0, miss: [], newW: 0, combo: 0, best: 0, xp: 0, ...extra };
  view = { tab: 'session', back: view.tab === 'session' || view.tab === 'done' ? view.back : view };
  render(); window.scrollTo(0, 0);
}
function cur() { return SESS && SESS.q[SESS.i]; }
function renderSession() {
  let ex = cur(); ex.ui = ex.ui || {};
  if (ex.pre && !ex.preDone) {
    ex.preDone = true;
    const ws = ex.pre.filter(w => !seen(w));
    if (ws.length) {
      SESS.q.splice(SESS.i, 0, ...ws.map(w => ({ t: 'intro', w, preFor: true })));
      SESS.q.splice(SESS.i + ws.length + 1, 0, ...ws.map(w => ({ t: 'mean', w, sk: 'mean' })));
      ST.pri = (ST.pri || []).filter(id => !ws.some(w => w.id === id));
      ex = cur(); ex.ui = ex.ui || {};
    }
  }
  const pct = SESS.i / SESS.q.length * 100;
  const body = EX[ex.t].html(ex);
  app.innerHTML = `<main class="wrap stack" style="padding-top:14px">
    <div class="sess-top"><button class="iconbtn" data-act="quit" aria-label="End session">✕</button><div class="bar" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div><span class="combo" id="combo"></span><span class="mono small">${SESS.i + 1}/${SESS.q.length}</span></div>
    <section class="q" id="q"><p class="label kind">${kindLabel(ex) + (ex.retry ? ' · again' : '')}</p>${body}<div id="fb"></div></section></main>
    <div class="foot"><div class="wrap"><button class="btn primary big" id="go" data-act="go">${ex.t === 'intro' ? 'Got it' : EX[ex.t].check ? 'Check' : 'Skip'}</button></div></div>`;
  paintCombo();
  EX[ex.t].mount?.(ex);
  if (ex.ui.done) showFeedback(ex);
}
const MILESTONES = [5, 10, 15, 20, 30, 40, 50, 75, 100];
function answer(ok, extra = {}) {
  const ex = cur(); if (ex.ui.done) return; ex.ui.done = true; ex.ui.ok = ok; Object.assign(ex.ui, extra);
  if (ex.t !== 'intro' && ex.t !== 'shadow' && !ex.ui.ungraded) {
    if (!ex.retry) { SESS.n++; if (ok) SESS.ok++; }
    logAdd(0, 1); if (ok) logAdd(1, 1);
    if (!ex.retry) {
      if (ex.sk === 'use') grade(ex.gk + '', 'use', ok);
      else if (ex.w && ex.sk) grade(ex.w.id, ex.sk, ok, ok ? ex.jump || 0 : 0);
    }
    if (ok) {
      SESS.combo++; SESS.best = Math.max(SESS.best, SESS.combo); ST.stats.best = Math.max(ST.stats.best, SESS.combo);
      const gain = ex.retry ? 2 : 10 + (SESS.combo >= 10 ? 5 : SESS.combo >= 3 ? 2 : 0);
      addXP(gain); ex.ui.xp = gain;
      bump('right'); bump('combo', SESS.combo, true);
      if (ex.t === 'tone') bump('tone', sylls(ex.w.py).length);
      if (ex.t === 'write') bump('write');
      if (ex.t === 'listen') bump('listen');
      if (ex.t === 'build' || ex.t === 'fill') bump('gram');
      if (MILESTONES.includes(SESS.combo)) SFX.milestone(); else SFX.ok(SESS.combo);
    } else {
      SESS.combo = 0; SFX.bad();
      if (!ex.retry) SESS.miss.push(ex);
      if ((ex.tries || 0) < 2) { const again = { ...ex, ui: null, retry: true, tries: (ex.tries || 0) + 1 }; delete again.opts; SESS.q.splice(Math.min(SESS.q.length, SESS.i + 4), 0, again); }
    }
    paintCombo();
    changed();
  }
  showFeedback(ex);
}
function paintCombo() {
  const el = document.getElementById('combo'); if (!el || !SESS) return;
  const c = SESS.combo; el.textContent = c >= 2 ? `${c} in a row` : `${SESS.xp || 0} XP`;
  el.className = 'combo' + (c >= 10 ? ' fire' : c >= 3 ? ' hot' : '');
  if (c >= 2) { void el.offsetWidth; el.classList.add('pop'); }
}
function showFeedback(ex) {
  const fb = document.getElementById('fb'); if (!fb) return;
  const ok = ex.ui.ok;
  let detail = '';
  if (ex.w) detail = `<div class="row" style="gap:12px;flex-wrap:nowrap">${playBtn(ex.w.hz)}<div style="min-width:0"><span class="han" style="font-size:1.6rem;font-weight:600">${esc(ex.w.hz)}</span> <b>${pyHTML(ex.w.py)}</b><div>${esc(ex.w.en)}</div></div></div>`;
  else if (ex.s) detail = `<div class="row" style="gap:12px;flex-wrap:nowrap">${playBtn(ex.s.zh)}<div style="min-width:0"><div class="sent" style="font-size:1.25rem">${rubyHTML(ex.s.zh, ex.s.py, 'color')}</div><div>${esc(ex.s.en)}</div></div></div>`;
  if (ex.t === 'build') detail += `<div class="stack" style="gap:6px">${!ok ? `<div class="small"><b>Correct order:</b></div><div class="tiles" style="justify-content:flex-start;padding:0;min-height:0">${ex.ui.want.map((w, k) => `<span class="tilebtn good" style="cursor:default">${esc(w)}<small>${esc(ex.ui.wantPy[k] || '')}</small></span>`).join('')}</div>` : ''}
    <div class="row"><button class="btn ghost" data-act="explainorder">Why this order?</button><button class="btn ghost" data-act="worules">Word order rules</button></div><div id="wo"></div></div>`;
  const note = ex.ui.note ? `<div class="small">${ex.ui.note}</div>` : '';
  const head = ex.ui.ungraded ? 'Practised' : ok ? (SESS.combo >= 10 ? `太棒了！ ${SESS.combo} in a row` : SESS.combo >= 3 ? `${SESS.combo} in a row` : pickOne(['Correct', 'Right', 'Nice', '对了！ Correct'])) : 'Not quite';
  fb.innerHTML = `<div class="fb ${ok ? 'ok' : 'no'}" role="status"><span class="head">${head}</span>${note}${detail}
</div>`;
  const go = document.getElementById('go'); go.textContent = 'Continue'; go.disabled = false;
  if (ok && ex.ui.xp && !ex.ui.floated) { ex.ui.floated = true; floatXP(ex.ui.xp, go); }
  if (ex.w && ex.t !== 'listen' && ex.t !== 'tone') setTimeout(() => say(ex.w.hz), ok ? 350 : 250);
  go.focus({ preventScroll: true });
  fb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
const pickOne = a => a[rnd(a.length)];
function next() {
  const ex = cur();
  if (EX[ex.t].check && !ex.ui.done) { EX[ex.t].check(ex); return; }
  if (!ex.ui.done && ex.t !== 'intro') { answer(false, { note: 'Skipped. It will come back.' }); return; }
  if (ex.t === 'intro' && !ex.ui.done) { ex.ui.done = true; }
  speechSynthesis?.cancel?.();
  SESS.i++;
  if (SESS.i >= SESS.q.length) return finish();
  renderSession();
}
function finish() {
  const secs = Math.round((Date.now() - SESS.start) / 1000);
  logAdd(3, Math.min(secs, 3600));
  if (SESS.n) {
    ST.stats.sessions++; addXP(10);
    if (SESS.n >= 5 && SESS.ok === SESS.n) { ST.stats.perfect++; addXP(20); bump('perfect'); }
  }
  earnFreeze(); checkBadges();
  lastBoard = 0; changed(); clearTimeout(pushT); push();
  view = { tab: 'done', back: view.back };
  render(); window.scrollTo(0, 0);
  const acc = SESS.n ? SESS.ok / SESS.n : 0;
  if (SESS.n) { SFX.done(); if (acc >= 0.8) confetti(); }
  setTimeout(flushCheers, 900);
}
function doneHTML() {
  const acc = SESS.n ? Math.round(SESS.ok / SESS.n * 100) : 100;
  const missW = [...new Map(SESS.miss.filter(e => e.w).map(e => [e.w.id, e.w])).values()];
  const missS = [...new Map(SESS.miss.filter(e => e.s).map(e => [e.s.id, e.s])).values()];
  const r = rankOf(ST.xp), nextR = RANKS[r + 1];
  return `<main class="wrap stack"><div class="done-hero"><div class="big">${acc >= 90 ? '太好了' : acc >= 70 ? '很好' : '加油'}</div>
  <p class="muted">${acc >= 90 ? 'Excellent' : acc >= 70 ? 'Good work' : 'Keep going, mistakes are how it sticks'}</p></div>
  <div class="grid3"><div class="card stat"><b>+${SESS.xp || 0}</b><span class="small muted">XP earned</span></div><div class="card stat"><b>${acc}%</b><span class="small muted">first-try accuracy</span></div><div class="card stat"><b>${SESS.best}</b><span class="small muted">best combo</span></div></div>
  <div class="card stack"><div class="rank"><span class="seal">${RANKS[r][1]}</span><div style="flex:1;min-width:0"><b>${RANKS[r][1]} ${RANKS[r][2]}</b> <span class="muted small">${RANKS[r][3]}</span>
  ${nextR ? `<div class="bar" style="margin-top:6px"><i style="width:${(ST.xp - RANKS[r][0]) / (nextR[0] - RANKS[r][0]) * 100}%;background:var(--t2)"></i></div><span class="small muted">${nextR[0] - ST.xp} XP to ${nextR[1]} ${nextR[2]}</span>` : ''}</div></div></div>
  ${questsHTML()}
  ${missW.length ? `<section class="card stack"><h2>Words to watch</h2><div class="words">${missW.map(wordTile).join('')}</div></section>` : ''}
  ${missS.length ? `<section class="card stack"><h2>Sentences to watch</h2>${missS.map(s => `<div class="line" style="grid-template-columns:minmax(0,1fr) auto"><div style="min-width:0"><div class="sent">${rubyHTML(s.zh, s.py)}</div><div class="en-line">${esc(s.en)}</div><div class="small muted">${esc(gramName(s.gk))}</div></div>${playBtn(s.zh)}</div>`).join('')}</section>` : ''}
  <div class="row"><button class="btn primary big" data-act="home">Back to Today</button>${dueCount() ? '<button class="btn big" data-act="start" data-mode="review">More reviews</button>' : ''}</div></main>`;
}

/* exercise types: html(ex) → markup, mount(ex) → wire up, check(ex) for typed answers */
const optBtn = (i, inner, cls = '') => `<button class="opt ${cls}" data-act="opt" data-i="${i}"><span class="k">${i + 1}</span>${inner}</button>`;
function exampleFor(w) { const s = allSents().find(s => s.zh.includes(w.hz) && s.L >= w.L); return s || allSents().find(s => s.zh.includes(w.hz)); }
const EX = {
  intro: {
    html(ex) {
      const w = ex.w, s = exampleFor(w);
      return `<div class="prompt"><div class="writer" id="introW">${[...w.hz].map((_, i) => `<div class="box mini" id="iw${i}" style="width:96px;height:96px"></div>`).join('')}</div>
      <div class="py" style="font-size:1.5rem;font-weight:700">${pyHTML(w.py)}</div><div class="en">${esc(w.en)}</div>
      <div class="row" style="justify-content:center"><span class="pill">${esc(w.pos || 'word')}</span><span class="pill">${w.L ? 'Lesson ' + w.L : 'HSK 1'}</span>${playBtn(w.hz)}</div>
      <div class="contour" aria-label="Tone shapes">${sylls(w.py).map(x => contour(x.t)).join('')}</div></div>
      ${s ? `<div class="card"><span class="label">In a sentence</span><div class="line" style="grid-template-columns:minmax(0,1fr) auto"><div style="min-width:0"><div class="sent">${rubyHTML(s.zh, s.py)}</div><div class="en-line">${esc(s.en)}</div></div>${playBtn(s.zh)}</div></div>` : ''}`;
    },
    mount(ex) {
      if (!ex.ui.counted) { ex.ui.counted = true; SESS.newW++; logAdd(2, 1); addXP(5); bump('newW'); if (ex.w.L === Math.min(NLES, covered() + 1)) bump('preview'); }
      say(ex.w.hz);
      [...ex.w.hz].forEach((c, i) => miniWriter(document.getElementById('iw' + i), c, true));
    }
  },
  mean: {
    html(ex) {
      const w = ex.w; ex.opts = ex.opts || shuffle([w, ...similarWords(w, 3, 'en')]);
      const showPy = lvl(w.id, 'read') < 2;
      return `<div class="prompt"><div class="hz">${esc(w.hz)}</div>${showPy ? `<div class="py" style="font-size:1.2rem;font-weight:600">${pyHTML(w.py)}</div>` : '<button class="btn ghost" data-act="peek" id="peek">Show pinyin</button>'}</div>
      <div class="opts">${ex.opts.map((o, i) => optBtn(i, esc(o.en))).join('')}</div>`;
    },
    pick(ex, i) { markOpts(i, ex.opts[i] === ex.w, ex.opts.indexOf(ex.w)); answer(ex.opts[i] === ex.w); }
  },
  form: {
    html(ex) {
      const w = ex.w; ex.opts = ex.opts || shuffle([w, ...similarWords(w, 3, 'hz')]);
      return `<div class="prompt"><div class="en">${esc(w.en)}</div><span class="pill">${esc(w.pos || 'word')}</span></div>
      <div class="opts">${ex.opts.map((o, i) => optBtn(i, esc(o.hz), 'han')).join('')}</div>`;
    },
    pick(ex, i) { markOpts(i, ex.opts[i] === ex.w, ex.opts.indexOf(ex.w)); answer(ex.opts[i] === ex.w); }
  },
  pickpy: {
    html(ex) {
      const w = ex.w; if (!ex.opts) { const p = pyOptions(w); ex.opts = p.opts; ex.right = p.right; }
      return `<div class="prompt"><div class="hz">${esc(w.hz)}</div><div class="muted">${esc(w.en)}</div></div>
      <div class="opts">${ex.opts.map((o, i) => optBtn(i, pyHTML(o, false))).join('')}</div>`;
    },
    pick(ex, i) {
      const ok = ex.opts[i] === ex.right; markOpts(i, ok, ex.opts.indexOf(ex.right));
      noteTones(ex.w, sylls(ex.opts[i]).map(s => s.t));
      answer(ok, ok ? {} : { note: toneNote(ex.w, sylls(ex.opts[i]).map(s => s.t)) });
    }
  },
  typepy: {
    check: ex => {
      const v = document.getElementById('pyin').value.trim(); if (!v) return;
      const g = gradeTyped(v, ex.w);
      if (!g.spell) { answer(false, { note: `Spelling differs. The answer is <b>${pyHTML(ex.w.py)}</b> (type ü as v, tones as numbers: lv3you2).` }); return; }
      noteTones(ex.w, g.got);
      answer(g.ok, g.ok ? {} : { note: toneNote(ex.w, g.got) });
    },
    html(ex) {
      return `<div class="prompt"><div class="hz">${esc(ex.w.hz)}</div><div class="muted">${esc(ex.w.en)}</div></div>
      <input id="pyin" class="answer-in" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="pinyin with tone numbers, e.g. lv3you2" aria-label="Pinyin">
      <p class="small muted" style="text-align:center">Tone marks work too. Neutral tone: no number or 5.</p>`;
    },
    mount(ex) { const i = document.getElementById('pyin'); if (!ex.ui.done) i.focus(); i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); next(); } }); }
  },
  listen: {
    html(ex) {
      const w = ex.w; ex.opts = ex.opts || shuffle([w, ...similarWords(w, 3, 'hz')]);
      return `<div class="prompt"><button class="play" style="width:84px;height:84px" data-act="say" data-t="${esc(w.hz)}" aria-label="Play again">${PLAY}</button>
      <button class="btn ghost" data-act="slow" data-t="${esc(w.hz)}">Slower</button></div>
      <div class="opts">${ex.opts.map((o, i) => optBtn(i, esc(o.hz), 'han')).join('')}</div>`;
    },
    mount(ex) { if (!ex.ui.done) setTimeout(() => say(ex.w.hz), 250); },
    pick(ex, i) { markOpts(i, ex.opts[i] === ex.w, ex.opts.indexOf(ex.w)); answer(ex.opts[i] === ex.w); }
  },
  tone: {
    check: ex => {
      const sy = sylls(ex.w.py); if (ex.ui.sel?.length !== sy.length || ex.ui.sel.some(v => !v)) { toast('Mark a tone for every syllable'); return; }
      noteTones(ex.w, ex.ui.sel);
      const ok = sy.every((s, i) => s.t === ex.ui.sel[i]);
      answer(ok, ok ? {} : { note: toneNote(ex.w, ex.ui.sel) });
    },
    html(ex) {
      const sy = sylls(ex.w.py); ex.ui.sel = ex.ui.sel || sy.map(() => 0);
      return `<div class="prompt"><button class="play" style="width:72px;height:72px" data-act="say" data-t="${esc(ex.w.hz)}" aria-label="Play again">${PLAY}</button><div class="hz sm">${esc(ex.w.hz)}</div></div>
      <div class="stack">${sy.map((s, i) => `<div class="row" style="justify-content:center"><b class="mono" style="width:64px;text-align:right">${esc(s.b)}</b>
        <div class="seg" role="group" aria-label="Tone for ${esc(s.b)}">${[1, 2, 3, 4, 5].map(t => `<button data-act="tsel" data-s="${i}" data-v="${t}" aria-pressed="${ex.ui.sel[i] === t}" aria-label="Tone ${t === 5 ? 'neutral' : t}">${contour(t)}</button>`).join('')}</div></div>`).join('')}</div>`;
    },
    mount(ex) { if (!ex.ui.done) setTimeout(() => say(ex.w.hz), 250); }
  },
  build: {
    check: ex => {
      if (ex.ui.chosen.length < ex.ui.tiles.length) { toast('Use every tile'); return; }
      const r = buildResult(ex); ex.ui.marks = r.marks;
      if (!r.ok) ex.ui.fix = true;
      answer(r.ok, r.ok ? {} : { note: '<b>Red tiles are out of place.</b> Drag them (or tap to take them out) to fix the sentence, then press “Check my fix”.' });
      paintBuild(ex);
      if (!r.ok) explainOrder(document.querySelector('[data-act="explainorder"]'), true);
    },
    html(ex) {
      if (!ex.ui.tiles) {
        const al = align(ex.s.zh, ex.s.py); let k = 0; const toks = [];
        segment(ex.s.zh).forEach(t => { const n = [...t.w].length; const cs = al.ok ? al.chars.slice(k, k + n) : charsFor(t.w); k += n; if (!t.p) toks.push({ w: t.w, py: cs.map(c => c.p || '').join('') }); });
        ex.ui.want = toks.map(t => t.w); ex.ui.wantPy = toks.map(t => t.py);
        ex.ui.tiles = shuffle(toks); ex.ui.chosen = [];
      }
      return `<div class="prompt">${ex.audio ? `<button class="play" style="width:72px;height:72px" data-act="say" data-t="${esc(ex.s.zh)}" aria-label="Play again">${PLAY}</button><span class="muted small">Arrange what you hear</span>` : `<div class="en">${esc(ex.s.en)}</div>`}<span class="small muted">${esc(gramName(ex.s.gk))} · <button class="btn ghost" style="padding:2px 8px;font-size:.8rem" data-act="worules">Word order rules</button></span></div>
      <div class="tiles target" id="tgt" data-zone="tgt" aria-label="Your sentence"></div>
      <div id="buildfix"></div>
      <div class="tiles" id="bank" data-zone="bank" aria-label="Word tiles"></div>
      <p class="small muted" style="text-align:center">Tap a word to add or remove it. Drag words to change their order.</p>`;
    },
    mount(ex) { paintBuild(ex); if (ex.audio && !ex.ui.done && !ex.ui.chosen.length) setTimeout(() => say(ex.s.zh), 250); }
  },
  fill: {
    html(ex) {
      if (!ex.opts) {
        const len = [...ex.key].length;
        const pool = shuffle(FUNC.concat(GRAM.flatMap(g => g.g.key))).filter(k => k !== ex.key && !ex.s.zh.includes(k));
        const ds = []; for (const k of pool) { if (ds.length >= 3) break; if (!ds.includes(k) && Math.abs([...k].length - len) <= 1) ds.push(k); }
        ex.opts = shuffle([ex.key, ...ds]);
      }
      const gap = esc(ex.s.zh).replace(esc(ex.key), '<span style="display:inline-block;min-width:2.2em;border-bottom:3px solid var(--accent);margin:0 3px">' + (ex.ui.done ? `<span class="${ex.ui.ok ? '' : 'muted'}">${esc(ex.key)}</span>` : '&nbsp;') + '</span>');
      return `<div class="prompt"><div class="hz sm">${gap}</div><div class="muted">${esc(ex.s.en)}</div><span class="small muted">${esc(gramName(ex.s.gk))}</span></div>
      <div class="opts">${ex.opts.map((o, i) => optBtn(i, esc(o), 'han')).join('')}</div>`;
    },
    pick(ex, i) { const ok = ex.opts[i] === ex.key; markOpts(i, ok, ex.opts.indexOf(ex.key)); answer(ok); }
  },
  write: {
    html(ex) {
      return `<div class="prompt"><div class="en">${esc(ex.w.en)}</div><div class="py" style="font-size:1.3rem;font-weight:700">${pyHTML(ex.w.py)}</div>
      <span class="small muted" id="wstat">Character 1 of ${[...ex.w.hz].length}. Draw the strokes in order.</span></div>
      <div class="writer"><div class="box" id="wbox">${gridSVG()}</div></div>
      <div class="row" style="justify-content:center"><button class="btn ghost" data-act="hint">Show me</button></div>`;
    },
    mount(ex) {
      if (ex.ui.done) { const b = document.getElementById('wbox'); b.classList.add('done'); b.insertAdjacentHTML('beforeend', `<div class="han" style="position:absolute;inset:0;display:grid;place-items:center;font-size:7rem">${esc(ex.w.hz)}</div>`); return; }
      ex.ui.ci = 0; ex.ui.mist = 0; ex.ui.strokes = 0; ex.ui.hint = false;
      startWriteChar(ex);
    }
  },
  shadow: {
    html(ex) {
      return `<div class="prompt"><div class="sent" style="font-size:1.6rem">${rubyHTML(ex.s.zh, ex.s.py, 'color')}</div><div class="muted">${esc(ex.s.en)}</div>
      <div class="row" style="justify-content:center"><button class="btn" data-act="say" data-t="${esc(ex.s.zh)}">Play</button><button class="btn" data-act="slow" data-t="${esc(ex.s.zh)}">Slow</button></div></div>
      <p class="small muted" style="text-align:center">Listen, then say it out loud with the same melody. Repeat until it feels natural.</p>
      <div class="opts">${optBtn(0, 'Hard, again later')}${optBtn(1, 'I can say it')}</div>`;
    },
    mount(ex) { if (!ex.ui.done) setTimeout(() => say(ex.s.zh, Math.min(ST.set.rate, 0.75)), 250); },
    pick(ex, i) {
      ex.ui.done = true; ex.ui.ok = true; logAdd(0, 1); logAdd(1, 1); changed();
      if (i === 0) SESS.q.splice(Math.min(SESS.q.length, SESS.i + 3), 0, { ...ex, ui: null });
      next();
    }
  }
};
function markOpts(i, ok, right) {
  document.querySelectorAll('.opt').forEach((b, k) => { b.disabled = true; if (k === right) b.classList.add('ok'); if (k === i && !ok) b.classList.add('no'); });
}
function toneNote(w, got) {
  const sy = sylls(w.py);
  return sy.map((s, i) => s.t === (got[i] || 5) ? `<span class="t${s.t}">${esc(s.raw)}</span>` : `<span class="t${s.t}"><b>${esc(s.raw)}</b></span> (tone ${s.t === 5 ? 'neutral' : s.t}, you chose ${got[i] && got[i] !== 5 ? got[i] : 'neutral'})`).join(' · ');
}
function gridSVG() {
  return `<svg class="grid" viewBox="0 0 100 100" aria-hidden="true"><g stroke="var(--line)" stroke-width=".6" stroke-dasharray="2 2"><line x1="0" y1="0" x2="100" y2="100"/><line x1="100" y1="0" x2="0" y2="100"/><line x1="50" y1="0" x2="50" y2="100"/><line x1="0" y1="50" x2="100" y2="50"/></g></svg>`;
}
const loader = (c, ok, bad) => STROKES[c] ? ok(STROKES[c]) : bad && bad(new Error('no data'));
function miniWriter(el, c, loop) {
  if (!el || !window.HanziWriter) { if (el) el.innerHTML = `<span class="han" style="font-size:4rem;display:grid;place-items:center;height:100%">${esc(c)}</span>`; return; }
  el.insertAdjacentHTML('afterbegin', gridSVG());
  const size = el.clientWidth || 96;
  try {
    const w = HanziWriter.create(el, c, { width: size, height: size, padding: 6, strokeColor: cssVar('--ink'), radicalColor: cssVar('--accent'), outlineColor: cssVar('--soft'), delayBetweenStrokes: 220, strokeAnimationSpeed: 1.4, charDataLoader: loader });
    loop ? w.loopCharacterAnimation() : w.animateCharacter();
  } catch { el.innerHTML = `<span class="han" style="font-size:3rem">${esc(c)}</span>`; }
}
function startWriteChar(ex) {
  const box = document.getElementById('wbox'); if (!box) return;
  const chars = [...ex.w.hz], c = chars[ex.ui.ci];
  box.querySelectorAll(':scope > svg:not(.grid), :scope > div').forEach(n => n.remove());
  const size = box.clientWidth;
  const showOutline = lvl(ex.w.id, 'hand') < 2;
  const w = HanziWriter.create(box, c, {
    width: size, height: size, padding: 14, showCharacter: false, showOutline,
    strokeColor: cssVar('--ink'), outlineColor: cssVar('--soft'), drawingColor: cssVar('--ink'), highlightColor: cssVar('--accent'),
    drawingWidth: 22, showHintAfterMisses: 2, highlightOnComplete: true, charDataLoader: loader
  });
  ex.ui.writer = w;
  const st = document.getElementById('wstat');
  if (st) st.textContent = `Character ${ex.ui.ci + 1} of ${chars.length}${showOutline ? '. Trace the grey outline.' : '. Draw from memory.'}`;
  w.quiz({
    onComplete: sum => {
      ex.ui.mist += sum.totalMistakes; ex.ui.strokes += (STROKES[c]?.strokes.length || 4);
      ex.ui.ci++;
      if (ex.ui.ci < chars.length) setTimeout(() => startWriteChar(ex), 500);
      else { box.classList.add('done'); const ok = !ex.ui.hint && ex.ui.mist <= Math.max(2, Math.round(ex.ui.strokes * 0.25)); answer(ok, { note: `${ex.ui.mist} stroke mistake${ex.ui.mist === 1 ? '' : 's'}${ex.ui.hint ? ', used a hint' : ''}.` }); }
    }
  });
}

/* ---------- sentence builder: drag to reorder, mistake marks, word-order explanations ---------- */
function lcsKeep(got, want) {
  const n = got.length, m = want.length, L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = got[i] === want[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const keep = new Array(n).fill(false); let i = 0, j = 0;
  while (i < n && j < m) { if (got[i] === want[j]) { keep[i] = true; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
  return keep;
}
function buildResult(ex) {
  const got = ex.ui.chosen.map(i => ex.ui.tiles[i].w);
  const ok = got.join('') === ex.ui.want.join('');
  const keep = ok ? got.map(() => true) : lcsKeep(got, ex.ui.want);
  return { ok, marks: keep.map(k => k ? 'ok' : 'no') };
}
function paintBuild(ex) {
  const tgt = document.getElementById('tgt'), bank = document.getElementById('bank'); if (!tgt || !bank) return;
  const hidePy = ST.set.py === 'off', lock = ex.ui.done && !ex.ui.fix;
  const gloss = w => { const e = DICT[w]; if (!e || (seen(e) && wordLevel(e) >= 1)) return ''; return `<small class="gl">${esc(e.en.split(/[;,(]/)[0].trim().slice(0, 16))}</small>`; };
  const tb = (i, pos, cls) => `<button class="tilebtn ${cls}" data-act="${pos >= 0 ? 'untile' : 'tile'}" data-i="${i}" ${pos >= 0 ? `data-pos="${pos}"` : ''} ${lock ? 'disabled' : ''}>${esc(ex.ui.tiles[i].w)}${hidePy ? '' : `<small>${esc(ex.ui.tiles[i].py)}</small>`}${gloss(ex.ui.tiles[i].w)}</button>`;
  tgt.innerHTML = ex.ui.chosen.map((i, p) => tb(i, p, ex.ui.marks ? (ex.ui.marks[p] === 'ok' ? 'good' : 'bad') : '')).join('') || '<span class="muted small" style="align-self:center">Tap or drag words here</span>';
  bank.innerHTML = ex.ui.tiles.map((_, i) => tb(i, -1, ex.ui.chosen.includes(i) ? 'used' : '')).join('');
  const fx = document.getElementById('buildfix');
  if (fx) fx.innerHTML = ex.ui.fix ? `<div class="row" style="justify-content:center"><button class="btn primary" data-act="recheck">Check my fix</button><button class="btn ghost" data-act="showorder">Show the right order</button></div>` : '';
}
function buildChanged(ex) { if (ex.ui.fix) ex.ui.marks = null; paintBuild(ex); }
// pointer-based drag and drop (mouse + touch)
let DRAG = null, SUPPRESS = 0;
function dropAt(x, y) {
  const tgt = document.getElementById('tgt'), bank = document.getElementById('bank');
  const inside = (el, pad) => { if (!el) return false; const r = el.getBoundingClientRect(); return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad; };
  if (inside(tgt, 24)) {
    const tiles = [...tgt.querySelectorAll('.tilebtn:not(.dragging)')];
    let idx = tiles.length;
    for (let k = 0; k < tiles.length; k++) { const r = tiles[k].getBoundingClientRect(); if (y < r.top) { idx = k; break; } if (y <= r.bottom && x < r.left + r.width / 2) { idx = k; break; } }
    return { zone: 'tgt', idx, tiles };
  }
  if (inside(bank, 16)) return { zone: 'bank' };
  return null;
}
function clearDropMarks() { document.querySelectorAll('.drop-before').forEach(e => e.classList.remove('drop-before')); document.querySelectorAll('.tiles.over,.tiles.drop-end').forEach(e => e.classList.remove('over', 'drop-end')); }
app.addEventListener('pointerdown', e => {
  const t = e.target.closest('.tilebtn[data-i]'); if (!t || t.disabled) return;
  const ex = cur(); if (!ex || ex.t !== 'build' || (ex.ui.done && !ex.ui.fix)) return;
  DRAG = { ex, i: +t.dataset.i, x: e.clientX, y: e.clientY, el: t, moved: false };
});
window.addEventListener('pointermove', e => {
  if (!DRAG) return;
  if (!DRAG.moved) {
    if (Math.hypot(e.clientX - DRAG.x, e.clientY - DRAG.y) < 7) return;
    DRAG.moved = true;
    const g = DRAG.el.cloneNode(true); g.classList.add('ghost'); g.style.width = DRAG.el.offsetWidth + 'px';
    document.body.appendChild(g); DRAG.ghost = g; DRAG.el.classList.add('dragging');
  }
  DRAG.ghost.style.transform = `translate(${e.clientX - DRAG.el.offsetWidth / 2}px, ${e.clientY - 30}px)`;
  clearDropMarks();
  const d = dropAt(e.clientX, e.clientY);
  if (d && d.zone === 'tgt') { const tg = document.getElementById('tgt'); tg.classList.add('over'); if (d.idx < d.tiles.length) d.tiles[d.idx].classList.add('drop-before'); else tg.classList.add('drop-end'); }
  if (d && d.zone === 'bank') document.getElementById('bank').classList.add('over');
  e.preventDefault();
}, { passive: false });
function endDrag(e, cancel) {
  if (!DRAG) return; const d = DRAG; DRAG = null; if (!d.moved) return;
  d.ghost.remove(); d.el.classList.remove('dragging'); clearDropMarks(); SUPPRESS = Date.now();
  if (cancel) return;
  const ex = d.ex, drop = dropAt(e.clientX, e.clientY); if (!drop) return;
  const rest = ex.ui.chosen.filter(i => i !== d.i);
  if (drop.zone === 'tgt') { rest.splice(Math.min(drop.idx, rest.length), 0, d.i); ex.ui.chosen = rest; }
  else ex.ui.chosen = rest;
  buildChanged(ex);
}
window.addEventListener('pointerup', e => endDrag(e, false));
window.addEventListener('pointercancel', e => endDrag(e, true));

const ROLE_COL = { Subject: '--t4', Time: '--t2', Place: '--t3', Verb: '--t1', 'Auxiliary verb': '--t1', Object: '--accent', Adverb: '--warn', Complement: '--t3', Modifier: '--t2', 'Question word': '--t4', Particle: '--t5', Conjunction: '--t5', 'Number+Measure': '--t3', Other: '--t5' };
function paintOrder(ex, data) {
  const out = document.getElementById('wo'); if (!out) return;
  if (!data) { out.innerHTML = ''; return; }
  out.innerHTML = `<div class="stack" style="gap:8px"><span class="label">How this sentence is built</span>
    <div class="row" style="gap:6px;align-items:stretch">${(data.parts || []).map(p => `<span class="role" style="--c:var(${ROLE_COL[p.role] || '--t5'})"><b class="han">${esc(p.zh)}</b><small>${esc(p.role || '')}</small>${p.en ? `<small class="muted">${esc(p.en)}</small>` : ''}</span>`).join('')}</div>
    ${data.formula ? `<div class="small mono">${esc(data.formula)}</div>` : ''}
    ${data.mistake ? `<div class="small"><b>Your mistake:</b> ${esc(data.mistake)}</div>` : ''}
    ${data.why ? `<div class="small">${esc(data.why)}</div>` : ''}</div>`;
}
function explainOrder(btn, auto) {
  const ex = cur(); if (!ex || !ex.s) return;
  if (ST.wo && ST.wo[ex.s.id]) { paintOrder(ex, ST.wo[ex.s.id]); return; }
  if (!auto) { showWordOrderRules(); return; }
  const out = document.getElementById('wo');
  if (out) out.innerHTML = '<p class="small">Find the verb first: who, when and where come before it; the object and how well come after it. Helping verbs (要、想、会) and adverbs (也、都、最、不) sit right before the verb.</p>';
}
const WO_RULES = [
  ['The basic order is Subject + Verb + Object, like English.', '我 喝 茶。', 'Wǒ hē chá.', 'I drink tea.'],
  ['Time goes before the verb, never at the end. It can come before or after the subject.', '我 明天 去 北京。/ 明天 我 去 北京。', 'Wǒ míngtiān qù Běijīng.', 'I am going to Beijing tomorrow.'],
  ['Place (在 / 从 + place) also goes before the verb.', '我 在 家 吃饭。', 'Wǒ zài jiā chī fàn.', 'I eat at home.'],
  ['Adverbs (也、都、最、很、不、还、就、再、已经、一起) go right before the verb or adjective.', '我们 也 都 喜欢 踢足球。', 'Wǒmen yě dōu xǐhuan tī zúqiú.', 'We all like football too.'],
  ['Helping verbs (要、想、会、能、可以) go before the main verb.', '我 要 去 旅游。', 'Wǒ yào qù lǚyóu.', 'I want to go travelling.'],
  ['Describers come before what they describe: 的-phrases before the noun, 最/很 before the adjective.', '左边 那个 红色 的 是 我 的。', 'Zuǒbian nàge hóngsè de shì wǒ de.', 'The red one on the left is mine.'],
  ['Several actions are said in the order they happen.', '我 去 北京 旅游。', 'Wǒ qù Běijīng lǚyóu.', 'I go to Beijing (and then) travel.'],
  ['Question words stay where the answer would be; you never move them to the front.', '你 什么时候 去？— 我 九月 去。', 'Nǐ shénme shíhou qù? — Wǒ jiǔyuè qù.', 'When are you going? — I am going in September.'],
  ['Results and degree come after the verb: verb + 得 + how, verb + 一下, verb + 完.', '他 说 得 很 好。', 'Tā shuō de hěn hǎo.', 'He speaks well.'],
  ['Sentence particles (吗、呢、吧、了、啊) go at the very end.', '我们 一起 去 吧！', 'Wǒmen yìqǐ qù ba!', "Let's go together!"]
];
function showWordOrderRules() {
  const m = document.createElement('div'); m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'Chinese word order rules');
  m.innerHTML = `<div class="card stack wide"><div class="row between"><h2>Chinese word order</h2><button class="iconbtn" aria-label="Close">✕</button></div>
    <p class="small"><b>The full pattern:</b> <span class="mono">Subject + Time + Adverb + Helping verb + Place + Verb + Result/Degree + Object + Particle</span></p>
    <ol class="stack" style="gap:10px;padding-left:20px;margin:0">${WO_RULES.map(r => `<li><div>${esc(r[0])}</div><div class="row" style="gap:8px;flex-wrap:nowrap"><span class="han" style="font-size:1.1rem">${esc(r[1])}</span>${playBtn(r[1].split('/')[0].split('—')[0].replace(/\s/g, ''))}</div><div class="small muted">${esc(r[2])} · ${esc(r[3])}</div></li>`).join('')}</ol>
    <p class="small muted">Tip: when a sentence feels wrong, find the verb first. Who, when and where go before it; what (the object) and how well go after it.</p></div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.querySelector('.iconbtn').addEventListener('click', close);
  m.addEventListener('click', e => { if (e.target === m) close(); const b = e.target.closest('[data-act="say"]'); if (b) say(b.dataset.t); });
}

/* ---------- popup ---------- */
function closePop() { if (popEl) { popEl.remove(); popEl = null; } }
function showWord(hz, id) {
  closePop();
  let w = (id && BYID[id]) || DICT[hz];
  const entries = w ? [w] : [...hz].map(c => DICT[c]).filter(Boolean);
  if (!entries.length) return;
  w = entries[0];
  const el = document.createElement('div'); el.className = 'pop stack'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', hz);
  el.style.left = '50%'; el.style.transform = 'translateX(-50%)';
  el.style.bottom = 'calc(16px + env(safe-area-inset-bottom, 0px))'; el.style.width = 'min(340px, calc(100vw - 32px))';
  el.innerHTML = `<div class="row between"><div class="writer" style="justify-content:flex-start">${[...w.hz].map((_, i) => `<div class="box mini" id="pw${i}" style="width:72px;height:72px"></div>`).join('')}</div><button class="iconbtn" data-act="closepop" aria-label="Close">✕</button></div>
    ${entries.map(e => `<div class="stack" style="gap:2px"><div class="row" style="gap:8px">${playBtn(e.hz)}<span class="hz" style="font-size:1.6rem">${esc(e.hz)}</span><b>${pyHTML(e.py)}</b></div>
    <div>${esc(e.en)}</div><div class="small muted">${[e.pos, e.L > 0 ? 'Lesson ' + e.L : e.L === 0 ? 'HSK 1' : ''].filter(Boolean).join(' · ')}</div>
    ${e.k === 'new' || e.k === 'hsk1' ? `<div class="small muted mono">${skillsOn().map(k => `${k} ${lvl(e.id, k)}`).join(' · ')}</div>` : ''}</div>`).join('')}`;
  document.body.appendChild(el); popEl = el;
  [...w.hz].forEach((c, i) => miniWriter(el.querySelector('#pw' + i), c, false));
  say(w.hz);
}

/* ---------- events ---------- */
function toast(t) { const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 2400); }
const GROUP_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const cleanCode = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
async function copyText(t) { try { await navigator.clipboard.writeText(t); toast('Link copied'); } catch { prompt('Copy this link:', t); } }
const ACT = {
  tab: b => { view = { tab: b.dataset.tab }; try { history.replaceState(null, '', '#' + view.tab); } catch { /* sandbox */ } render(); window.scrollTo(0, 0); },
  start: b => { if (b.disabled) return; startSession(b.dataset.mode, b.dataset.n ? +b.dataset.n : b.dataset.g); },
  lesson: b => { const n = +b.dataset.n; view = { tab: 'lessons', n: n || 0, sub: b.dataset.sub || (view.n === n ? view.sub : 'words') }; render(); window.scrollTo(0, 0); },
  sfxtest: () => { SFX.ok(0); setTimeout(() => SFX.ok(4), 500); setTimeout(() => SFX.milestone(), 1100); setTimeout(() => SFX.bad(), 2100); },
  sub: b => { view.sub = b.dataset.sub; render(); },
  pymode: b => { ST.set.py = b.dataset.v; setChanged(); render(); },
  wf: b => { view.f = b.dataset.v; document.querySelectorAll('[data-act="wf"]').forEach(x => x.setAttribute('aria-pressed', x === b)); paintWords(); },
  word: b => showWord(b.dataset.w, b.dataset.id),
  closepop: closePop,
  say: b => say(b.dataset.t),
  slow: b => say(b.dataset.t, 0.55),
  sayall: b => {
    const t = LESSON(+b.dataset.l).texts[+b.dataset.ti]; if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    t.lines.forEach(l => { const u = new SpeechSynthesisUtterance(l[1]); u.lang = 'zh-CN'; if (VOICE) u.voice = VOICE; u.rate = ST.set.rate; speechSynthesis.speak(u); });
  },
  go: () => next(),
  quit: () => { if (SESS && SESS.n) finish(); else { view = view.back || { tab: 'today' }; SESS = null; render(); } },
  home: () => { SESS = null; view = { tab: 'today' }; render(); window.scrollTo(0, 0); },
  opt: b => { const ex = cur(); if (!ex || ex.ui.done || !EX[ex.t].pick) return; const i = +b.dataset.i; ex.ui.given = ex.opts ? (ex.opts[i]?.en || ex.opts[i]?.hz || ex.opts[i]) : b.textContent; EX[ex.t].pick(ex, i); },
  peek: b => { const ex = cur(); b.outerHTML = `<div class="py" style="font-size:1.2rem;font-weight:600">${pyHTML(ex.w.py)}</div>`; },
  tsel: b => { const ex = cur(); if (ex.ui.done) return; ex.ui.sel[+b.dataset.s] = +b.dataset.v; b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); say(ex.w.hz); },
  tile: b => { const ex = cur(); if (ex.ui.done && !ex.ui.fix) return; const i = +b.dataset.i; say(ex.ui.tiles[i].w); if (!ex.ui.chosen.includes(i)) ex.ui.chosen.push(i); buildChanged(ex); },
  untile: b => { const ex = cur(); if (ex.ui.done && !ex.ui.fix) return; const i = +b.dataset.i; say(ex.ui.tiles[i].w); ex.ui.chosen = ex.ui.chosen.filter(x => x !== i); buildChanged(ex); },
  recheck: () => { const ex = cur(); if (!ex || !ex.ui.fix) return; if (ex.ui.chosen.length < ex.ui.tiles.length) { toast('Use every tile'); return; } const r = buildResult(ex); ex.ui.marks = r.marks; if (r.ok) { ex.ui.fix = false; SFX.ok(3); addXP(3); changed(); toast('Fixed. 对了！ +3 XP'); } else SFX.bad(); paintBuild(ex); },
  showorder: () => { const ex = cur(); if (!ex || !ex.ui.fix) return; const used = new Set(); ex.ui.chosen = ex.ui.want.map(w => { const i = ex.ui.tiles.findIndex((t, k) => t.w === w && !used.has(k)); used.add(i); return i; }); ex.ui.marks = ex.ui.chosen.map(() => 'ok'); ex.ui.fix = false; SFX.tap(); paintBuild(ex); },
  worules: () => showWordOrderRules(),
  explainorder: b => explainOrder(b),
  hint: () => { const ex = cur(); if (ex.ui.done || !ex.ui.writer) return; ex.ui.hint = true; const w = ex.ui.writer; w.cancelQuiz(); w.showOutline(); w.animateCharacter({ onComplete: () => { w.hideCharacter(); w.quiz({ onComplete: s => { ex.ui.writer = w; ex.ui.mist += s.totalMistakes; ex.ui.strokes += STROKES[[...ex.w.hz][ex.ui.ci]]?.strokes.length || 4; ex.ui.ci++; if (ex.ui.ci < [...ex.w.hz].length) setTimeout(() => startWriteChar(ex), 500); else { document.getElementById('wbox')?.classList.add('done'); answer(false, { note: 'You used a hint, so it comes back soon.' }); } } }); } }); },
  reset1: () => { document.getElementById('reset2').hidden = false; },
  reset0: () => { document.getElementById('reset2').hidden = true; },
  reset: () => { const keep = ST.set, uid = ST.uid; ST = fresh(); ST.set = keep; ST.uid = uid; ST.resetAt = Date.now() + 1; changed(); clearTimeout(pushT); push(); lastBoard = 0; postBoard(); toast('Progress erased'); render(); },
  /* level, account, install */
  level: async b => {
    const v = b.dataset.v; if (v === LEVEL) return;
    ST.set.level = v; setChanged(); clearTimeout(pushT);
    if (USER) { await push(); }
    location.reload();
  },
  signin: async b => {
    if (!CL) { toast('Still loading, try again in a moment.'); return; }
    if (b) b.disabled = true;
    try { await CL.signIn(); } catch (e) { toast(e && e.message ? `Sign-in failed: ${e.message}` : 'Sign-in failed. Try again.'); }
    if (b) b.disabled = false;
  },
  signout: async () => { if (!CL) return; if (ST.set.remind) await CL.disablePush().catch(() => {}); await CL.signOut(); toast('Signed out'); },
  install: async () => { if (!INSTALL) return; INSTALL.prompt(); try { await INSTALL.userChoice; } catch { /* dismissed */ } INSTALL = null; render(); },
  noinstall: () => { try { localStorage.setItem('hanzipath.noinstall', '1'); } catch { /* storage blocked */ } render(); },
  /* reminders */
  remindon: async b => {
    b.disabled = true;
    try { await CL.enablePush(); ST.set.remind = true; setChanged(); toast('Reminders are on'); }
    catch (e) { toast(e && e.message ? e.message : 'Could not turn on reminders.'); }
    render();
  },
  remindoff: async () => { try { await CL.disablePush(); } catch { /* already off */ } ST.set.remind = false; setChanged(); toast('Reminders are off'); render(); },
  remindtest: () => CL.testNotification(dueCount()).catch(() => toast('Could not show a notification. Check that notifications are allowed.')),
  /* friends */
  board: b => { view.board = b.dataset.v; render(); },
  boardreload: () => { loadBoard(true); },
  gjoin: async b => {
    const code = cleanCode(document.getElementById('g-code')?.value); if (code.length < 4) { toast('Enter the group code (4–12 letters or digits)'); return; }
    b.disabled = true;
    try {
      if (!(await CL.groupExists(code))) { toast(`No group called ${code}. Check the code.`); b.disabled = false; return; }
      ST.set.group = code; setChanged(); try { localStorage.removeItem('hanzipath.group'); } catch { /* storage blocked */ }
      BOARD = null; lastBoard = 0; postBoard(); toast(`Joined group ${code}`); render();
    } catch { toast('Could not join right now. Check your connection.'); b.disabled = false; }
  },
  gcreate: async b => {
    b.disabled = true;
    try {
      let code = '';
      for (let i = 0; i < 5 && !code; i++) { const c = Array.from({ length: 6 }, () => GROUP_ABC[rnd(GROUP_ABC.length)]).join(''); if (!(await CL.groupExists(c))) code = c; }
      await CL.createGroup(code, `${ST.set.name || 'My'}'s group`);
      ST.set.group = code; setChanged(); BOARD = null; lastBoard = 0; postBoard(); toast(`Group ${code} created`); render();
    } catch { toast('Could not create the group. Try again.'); b.disabled = false; }
  },
  gshare: async () => {
    const url = shareLink(), text = `Learn Chinese with me on Hànzì Path. Join my group ${ST.set.group}:`;
    if (navigator.share) { try { await navigator.share({ title: 'Hànzì Path', text, url }); return; } catch { /* cancelled */ } }
    copyText(url);
  },
  gcopy: () => copyText(shareLink()),
  gleave: () => { ST.set.group = ''; setChanged(); BOARD = null; lastBoard = 0; postBoard(); render(); }
};
app.addEventListener('click', e => {
  if (Date.now() - SUPPRESS < 350 && e.target.closest('.tilebtn')) { e.preventDefault(); return; }
  const b = e.target.closest('[data-act]'); if (!b || !app.contains(b) && !popEl?.contains(b)) return;
  const f = ACT[b.dataset.act]; if (f) { e.preventDefault(); f(b, e); }
});
document.addEventListener('click', e => {
  if (!popEl) return;
  const b = e.target.closest('[data-act]');
  if (popEl.contains(e.target)) { if (b && ACT[b.dataset.act]) { e.preventDefault(); ACT[b.dataset.act](b, e); } return; }
  if (!e.target.closest('[data-act="word"]')) closePop();
});
app.addEventListener('input', e => {
  if (e.target.id === 'wq') { view.q = e.target.value; paintWords(); }
  if (e.target.id === 's-rate') { const v = document.getElementById('rate-v'); if (v) v.textContent = (+e.target.value).toFixed(2) + '×'; }
});
app.addEventListener('change', e => {
  if (e.target.id === 's-name') { const v = e.target.value.trim().slice(0, 20); if (v) { ST.set.name = v; setChanged(); lastBoard = 0; postBoard(); paintChips(); toast('Name saved'); } return; }
  const k = e.target.dataset.set; if (!k) return;
  ST.set[k] = e.target.type === 'checkbox' ? e.target.checked : +e.target.value; setChanged();
  if (k === 'rate') say('你好');
  if (k === 'vol' || k === 'sound') SFX.ok(3);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closePop(); return; }
  if (e.target.id === 'g-code' && e.key === 'Enter') { e.preventDefault(); const b = document.querySelector('[data-act="gjoin"]'); if (b) ACT.gjoin(b); return; }
  if (view.tab !== 'session' || !SESS) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const ex = cur();
  if (/^[1-6]$/.test(e.key) && !ex.ui.done && EX[ex.t].pick) { const b = document.querySelector(`.opt[data-i="${+e.key - 1}"]`); if (b) { e.preventDefault(); ACT.opt(b); } }
  else if (e.key === 'Enter') { e.preventDefault(); next(); }
  else if (e.key === ' ' && (ex.w || ex.s)) { e.preventDefault(); say(ex.w ? ex.w.hz : ex.s.zh); }
});

render();
// ?quick=1 (the link in reminders) jumps straight into a two-minute session
if (LEVEL && /[?&]quick=1/.test(location.search)) { try { history.replaceState(null, '', location.pathname); } catch { /* ignore */ } setTimeout(() => startSession('quick'), 300); }
// keep the leaderboard and streak fresh when the app comes back to the foreground
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && LEVEL && view.tab !== 'session' && view.tab !== 'done') { questDay(); render(); } });
})();
