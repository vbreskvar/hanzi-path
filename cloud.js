/* Hànzì Path cloud layer: Google sign-in, progress sync, group leaderboard and push reminders (Firebase).
   The web config below is public by design; access is controlled by firestore.rules. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs, serverTimestamp, arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const CONFIG = {
  apiKey: 'AIzaSyAiHmY3cw_e1yHC_CwnqjurJ_TD6mBeunU',
  authDomain: 'hanzi-path-4f9ce.firebaseapp.com',
  projectId: 'hanzi-path-4f9ce',
  storageBucket: 'hanzi-path-4f9ce.firebasestorage.app',
  messagingSenderId: '235208506277',
  appId: '1:235208506277:web:1371b50942e0671c9e864c'
};
const VAPID = 'BHTKT8vUlsLujYmz4KZG6xkQLAEz0Vm4nd3gM7daoasJqXw9DTXKhQ0oBuG-WSx0-p-bsGZeFBIs6dQqRsJIpto';
const MSG = 'https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging.js';

const fb = initializeApp(CONFIG);
const auth = getAuth(fb);
const db = getFirestore(fb);
const listeners = [];
let lastWritten = 0;

// Fingerprint of what a progress copy contains, to tell whether merging added anything.
const fp = s => {
  if (!s) return '';
  let n = 0; for (const c of Object.values(s.cards || {})) n += (c[2] || 0) + (c[3] || 0);
  let a = 0; for (const v of Object.values(s.log || {})) a += v[0] || 0;
  return [Object.keys(s.cards || {}).length, n, a, s.xp || 0, s.setAt || 0, s.resetAt || 0].join(':');
};
const me = () => auth.currentUser;
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Ljubljana'; } catch { return 'Europe/Ljubljana'; } };

const HPC = {
  authKnown: false,
  fp,
  onAuth(cb) { listeners.push(cb); if (HPC.authKnown) cb(me()); },
  async signIn() {
    const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
    try { await signInWithPopup(auth, p); }
    catch (e) {
      const code = e && e.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment' || code === 'auth/web-storage-unsupported') { await signInWithRedirect(auth, p); return; }
      throw new Error(code === 'auth/network-request-failed' ? 'no connection' : code.replace('auth/', '').replace(/-/g, ' ') || 'unknown error');
    }
  },
  signOut: () => signOut(auth),

  /* progress: one JSON string per user (keeps the document small and free of nested arrays) */
  async loadProgress() {
    const s = await getDoc(doc(db, 'users', me().uid));
    if (!s.exists()) return null;
    try { return JSON.parse(s.data().data || 'null'); } catch { return null; }
  },
  async saveProgress(st) {
    const u = me(); if (!u) return;
    lastWritten = st.updated || Date.now();
    await setDoc(doc(db, 'users', u.uid), { data: JSON.stringify(st), updated: lastWritten, level: st.set && st.set.level || '', group: st.set && st.set.group || '', v: 1 });
  },
  watchProgress(cb, onErr) {
    return onSnapshot(doc(db, 'users', me().uid), s => {
      if (!s.exists() || s.metadata.hasPendingWrites) return;
      const d = s.data(); if (d.updated === lastWritten) return; // our own write coming back
      try { cb(JSON.parse(d.data || 'null')); } catch { /* bad copy, ignore */ }
    }, onErr);
  },

  /* leaderboard + groups */
  saveBoard(entry) { const u = me(); if (!u) return Promise.resolve(); return setDoc(doc(db, 'leaderboard', u.uid), { ...entry, ts: serverTimestamp() }); },
  async loadBoard(group) {
    const s = await getDocs(query(collection(db, 'leaderboard'), where('group', '==', group)));
    return s.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async groupExists(code) { return (await getDoc(doc(db, 'groups', code))).exists(); },
  createGroup(code, name) { return setDoc(doc(db, 'groups', code), { name: String(name).slice(0, 40), owner: me().uid, created: serverTimestamp() }); },

  /* push reminders: Firebase Cloud Messaging token stored in push/{uid}; a GitHub Action sends the nudges */
  async messagingToken(ask) {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('This browser cannot receive notifications.');
    if (ask && Notification.permission !== 'granted') { const p = await Notification.requestPermission(); if (p !== 'granted') throw new Error('Notifications were not allowed. You can allow them in your settings.'); }
    if (Notification.permission !== 'granted') throw new Error('Notifications are not allowed.');
    const m = await import(MSG);
    if (!(await m.isSupported())) throw new Error('This browser cannot receive push notifications.');
    const reg = await navigator.serviceWorker.ready;
    const token = await m.getToken(m.getMessaging(fb), { vapidKey: VAPID, serviceWorkerRegistration: reg });
    if (!token) throw new Error('Could not register this device for reminders.');
    return token;
  },
  async enablePush() {
    const token = await HPC.messagingToken(true);
    try { localStorage.setItem('hanzipath.push', token); } catch { /* storage blocked */ }
    await setDoc(doc(db, 'push', me().uid), { tokens: arrayUnion(token), tz: tz(), on: true, ts: serverTimestamp() }, { merge: true });
  },
  async refreshPush() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const token = await HPC.messagingToken(false);
    let old = ''; try { old = localStorage.getItem('hanzipath.push') || ''; localStorage.setItem('hanzipath.push', token); } catch { /* storage blocked */ }
    const ref = doc(db, 'push', me().uid);
    if (old && old !== token) await setDoc(ref, { tokens: arrayRemove(old) }, { merge: true });
    await setDoc(ref, { tokens: arrayUnion(token), tz: tz(), on: true, ts: serverTimestamp() }, { merge: true });
  },
  async disablePush() {
    let token = ''; try { token = localStorage.getItem('hanzipath.push') || ''; localStorage.removeItem('hanzipath.push'); } catch { /* storage blocked */ }
    const u = me();
    if (u) await setDoc(doc(db, 'push', u.uid), token ? { tokens: arrayRemove(token), ts: serverTimestamp() } : { on: false, ts: serverTimestamp() }, { merge: true });
    try { const m = await import(MSG); await m.deleteToken(m.getMessaging(fb)); } catch { /* nothing to delete */ }
  },
  async testNotification(due) {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('Hànzì Path · 汉字', { body: due ? `2 minutes of Chinese? ${due} review${due === 1 ? '' : 's'} waiting.` : '2 minutes of Chinese? Learn a couple of new words.', icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag: 'hp-test', data: { url: './?quick=1' } });
  }
};

getRedirectResult(auth).catch(() => { /* no redirect pending */ });
onAuthStateChanged(auth, u => { HPC.authKnown = true; listeners.forEach(cb => cb(u)); });
window.HPC = HPC;
window.dispatchEvent(new Event('hpc-ready'));
