/* Gesture Player — https://github.com/jackmikejk/Gesture-Player (MIT) */
'use strict';
{
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, '0'); return h ? h + ':' + String(m).padStart(2, '0') + ':' + x : m + ':' + x; };
const fmtRate = r => (+(+r).toFixed(2)) + '×';
const ago = t => { if (!t) return 'Not played yet'; const d = (Date.now() - t) / 1000; if (d < 90) return 'Just now'; if (d < 3600) return Math.round(d / 60) + ' min ago'; if (d < 86400) return Math.round(d / 3600) + ' h ago'; const n = Math.round(d / 86400); return n === 1 ? 'Yesterday' : n + ' days ago'; };
/* ---------- recent errors, kept on this device only, offered when reporting a problem ---------- */
const logErr = msg => { try { const l = JSON.parse(localStorage.getItem('gp4_errs') || '[]'); l.push(new Date().toISOString().slice(0, 16).replace('T', ' ') + '  ' + String(msg).slice(0, 200)); localStorage.setItem('gp4_errs', JSON.stringify(l.slice(-15))); } catch (e) {} };
addEventListener('error', e => logErr((e.message || 'error') + (e.filename ? ' @' + e.filename.split('/').pop() + ':' + e.lineno : '')));
addEventListener('unhandledrejection', e => logErr('promise: ' + (e.reason && (e.reason.message || e.reason))));
const toast = (() => { let t; return msg => { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(t); t = setTimeout(() => el.classList.remove('show'), 900); }; })();

/* ---------- settings ---------- */
const LS = { get(k, d) { try { const x = localStorage.getItem('gp4_' + k); return x === null ? d : JSON.parse(x); } catch (e) { return d; } }, set(k, x) { try { localStorage.setItem('gp4_' + k, JSON.stringify(x)); } catch (e) {} } };
const set = Object.assign({ lock: true, countMode: '5678', speak: true, bubble: true, flip: false, skip: 10, near: 0.16, vol: 0.8, back: false, recAudio: 'mic', teach: true }, LS.get('settings', {}));
const saveSet = () => LS.set('settings', set);
{ const s0 = LS.get('settings', {}); if (s0.countdown === false && !s0.countMode) set.countMode = 'off'; } // keep an old "no countdown" choice

/* ---------- storage: IndexedDB, falls back to memory ---------- */
const mem = { meta: new Map(), blob: new Map() };
let idb = null;
const openDB = () => idb || (idb = new Promise((res, rej) => {
  try { const r = indexedDB.open('gesture-player', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('meta', { keyPath: 'id' }); r.result.createObjectStore('blob'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  } catch (e) { rej(e); }
}));
const tx = async (store, mode, fn) => { const db = await openDB(); return new Promise((res, rej) => { const t = db.transaction(store, mode); const out = fn(t.objectStore(store)); t.oncomplete = () => res(out && out.result); t.onerror = t.onabort = () => rej(t.error); }); };
const DB = {
  async all() { try { return await tx('meta', 'readonly', s => s.getAll()) || []; } catch (e) { return [...mem.meta.values()]; } },
  async put(m) { try { await tx('meta', 'readwrite', s => s.put(m)); } catch (e) { mem.meta.set(m.id, m); } },
  async putBlob(id, b) { try { await tx('blob', 'readwrite', s => s.put(b, id)); return true; } catch (e) { mem.blob.set(id, b); return false; } },
  async getBlob(id) { if (mem.blob.has(id)) return mem.blob.get(id); try { return await tx('blob', 'readonly', s => s.get(id)); } catch (e) { return null; } },
  async del(id) { mem.meta.delete(id); mem.blob.delete(id); try { await tx('meta', 'readwrite', s => s.delete(id)); await tx('blob', 'readwrite', s => s.delete(id)); } catch (e) {} }
};

/* ---------- library ---------- */
let items = [], moreId = null, moreBlob = null, filt = 'all';
const kindOf = m => m.kind || 'video';
const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
async function loadLibrary() { items = await DB.all(); renderLibrary(); }
function sub(m) {
  const bits = [];
  if (m.temp) bits.push('Not saved — too large');
  else bits.push(ago(m.lastPlayed || 0));
  if (m.rate && m.rate !== 1) bits.push(fmtRate(m.rate));
  if (m.loopA != null && m.loopB != null) bits.push('Loop');
  return bits.join(' · ');
}
function card(m) {
  const pct = m.dur ? Math.min(100, (m.pos || 0) / m.dur * 100) : 0;
  const img = m.thumb ? `<img src="${esc(m.thumb)}" alt="" loading="lazy">` : '';
  const k = kindOf(m);
  const ph = k === 'audio' ? `<div class="ph audio" style="--h:${hue(m.name)}"><svg class="i"><use href="#i-note"/></svg></div>` : '<div class="ph"><svg class="i"><use href="#i-film"/></svg></div>';
  const badge = m.type === 'yt' ? '<span class="badge">YouTube</span>' : k === 'rec' ? '<span class="badge rec">● Recording</span>' : k === 'audio' ? '<span class="badge">Music</span>' : '';
  return `<article class="card">
    <button class="open" data-open="${esc(m.id)}" aria-label="Play ${esc(m.name)}"><div class="thumb">${ph}${img}
      ${badge}${m.dur ? `<span class="dur">${fmt(m.dur)}</span>` : ''}
      ${pct > 1 ? `<div class="prog"><i style="width:${pct.toFixed(1)}%"></i></div>` : ''}</div></button>
    <div class="meta"><div><div class="t">${esc(m.name)}</div><div class="s">${esc(sub(m))}</div></div>
      <button class="more" data-more="${esc(m.id)}" aria-label="Options for ${esc(m.name)}"><svg class="i f"><use href="#i-more"/></svg></button></div>
  </article>`;
}
function renderLibrary() {
  const q = $('q').value.trim().toLowerCase();
  const by = (a, b) => (b.lastPlayed || b.added) - (a.lastPlayed || a.added);
  const list = items.filter(m => (!q || m.name.toLowerCase().includes(q)) && (filt === 'all' || kindOf(m) === filt)).sort(by);
  const cont = items.filter(m => m.lastPlayed && m.dur && m.pos > 3 && m.pos < m.dur - 3).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 8);
  $('cont').innerHTML = cont.map(card).join('');
  $('contSec').classList.toggle('hidden', !cont.length || !!q || filt !== 'all');
  $('filt').classList.toggle('hidden', !items.length);
  $('allH').textContent = { all: 'All', video: 'Videos', audio: 'Music', rec: 'Recordings' }[filt];
  $('grid').innerHTML = list.map(card).join('');
  $('allSec').classList.toggle('hidden', !items.length);
  $('empty').classList.toggle('hidden', !!items.length);
  const n = k => items.filter(m => kindOf(m) === k).length, pl = (c, w) => c ? c + ' ' + w + (c === 1 ? '' : 's') : '';
  $('count').textContent = [pl(n('video'), 'video'), pl(n('audio'), 'song'), pl(n('rec'), 'recording')].filter(Boolean).join(' · ');
  if (items.length && !list.length) $('grid').innerHTML = `<p class="s">${q ? 'Nothing matches “' + esc(q) + '”.' : 'Nothing here yet.'}</p>`;
}
$('q').addEventListener('input', renderLibrary);
$('filt').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; filt = b.dataset.f; $('filt').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); renderLibrary(); });
addEventListener('scroll', () => $('nav').classList.toggle('stuck', scrollY > 50), { passive: true });
for (const box of ['cont', 'grid']) $(box).addEventListener('click', e => {
  const o = e.target.closest('[data-open]'), mo = e.target.closest('[data-more]');
  if (mo) return openMore(mo.dataset.more);
  if (o) openItem(o.dataset.open);
});

/* sheets */
let sheetOpen = null;
function openSheet(id) { closeSheet(); sheetOpen = id; $(id).classList.add('show'); }
function closeSheet() { if (sheetOpen) $(sheetOpen).classList.remove('show'); sheetOpen = null; showControls(); }
document.querySelectorAll('.scrim').forEach(s => s.addEventListener('click', e => { if (e.target === s || e.target.closest('[data-close]')) closeSheet(); }));
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

$('addBtn').addEventListener('click', () => openSheet('sAdd'));
$('emptyAdd').addEventListener('click', () => openSheet('sAdd'));
$('addPhotos').addEventListener('click', () => { closeSheet(); $('fileIn').click(); });
$('addFiles').addEventListener('click', () => { closeSheet(); $('fileIn').click(); });
$('addMusic').addEventListener('click', () => { closeSheet(); $('musicIn').click(); });
$('addLink').addEventListener('click', () => { openSheet('sLink'); $('linkMsg').textContent = ''; setTimeout(() => $('linkIn').focus(), 50); });

function makeThumb(blob) {
  return new Promise(res => {
    const url = URL.createObjectURL(blob), vid = document.createElement('video');
    let done = false;
    const fin = t => { if (done) return; done = true; const d = isFinite(vid.duration) ? vid.duration : 0; URL.revokeObjectURL(url); vid.removeAttribute('src'); try { vid.load(); } catch (e) {} res({ thumb: t || '', dur: d }); };
    vid.muted = true; vid.playsInline = true; vid.preload = 'auto';
    vid.onloadedmetadata = () => { if (!vid.videoWidth) return fin(); /* songs have no picture */ try { vid.currentTime = Math.min(1.5, (vid.duration || 2) * 0.1); } catch (e) { fin(); } };
    vid.onseeked = () => { try { const w = 480, h = Math.round(w * vid.videoHeight / vid.videoWidth) || 270, c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(vid, 0, 0, w, h); fin(c.toDataURL('image/jpeg', .72)); } catch (e) { fin(); } };
    vid.onerror = () => fin();
    setTimeout(() => fin(), 9000);
    vid.src = url;
  });
}
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const isAudio = f => /^audio\//.test(f.type) || /\.(mp3|m4a|aac|wav|flac|ogg|opus)$/i.test(f.name);
async function addFiles(e) {
  const files = [...e.target.files]; e.target.value = '';
  if (!files.length) return;
  toast(files.length === 1 ? 'Adding…' : 'Adding ' + files.length + '…');
  let tooBig = 0;
  for (const f of files) {
    const id = newId('f'), { thumb, dur } = await makeThumb(f), audio = isAudio(f);
    const m = { id, type: 'file', kind: audio ? 'audio' : 'video', name: f.name.replace(/\.[^.]+$/, '') || (audio ? 'Song' : 'Video'), added: Date.now(), lastPlayed: 0, dur, pos: 0, rate: 1, mirror: false, loopA: null, loopB: null, thumb: audio ? '' : thumb };
    const ok = await DB.putBlob(id, f);
    if (!ok) { m.temp = true; tooBig++; mem.meta.set(id, m); } else await DB.put(m);
  }
  await loadLibrary();
  toast(tooBig ? 'Added — some only for now' : files.length === 1 ? 'Added' : 'Added ' + files.length);
}
$('fileIn').addEventListener('change', addFiles);
$('musicIn').addEventListener('change', addFiles);
function ytId(u) { const m = u.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/); return m && m[1]; }
$('linkForm').addEventListener('submit', async e => {
  e.preventDefault();
  const u = $('linkIn').value.trim(), msg = $('linkMsg');
  if (!u) return;
  if (/instagram\.com|instagr\.am/i.test(u)) { msg.textContent = 'Instagram links can’t play here. Save the reel to Photos, then add it from Photos.'; return; }
  const yid = ytId(u);
  if (!yid) { msg.textContent = 'That doesn’t look like a YouTube link.'; return; }
  const have = items.find(m => m.type === 'yt' && m.ytId === yid);
  closeSheet(); $('linkIn').value = '';
  if (have) return openItem(have.id);
  const m = { id: newId('y'), type: 'yt', ytId: yid, name: 'YouTube video', added: Date.now(), lastPlayed: 0, dur: 0, pos: 0, rate: 1, mirror: false, loopA: null, loopB: null, thumb: 'https://i.ytimg.com/vi/' + yid + '/hqdefault.jpg' };
  await DB.put(m); await loadLibrary(); openItem(m.id);
});

function openMore(id) {
  const m = items.find(x => x.id === id) || mem.meta.get(id); if (!m) return;
  moreId = id; $('moreTitle').textContent = m.name; $('renIn').value = m.name;
  $('delTxt').textContent = 'Delete from Library'; $('delBtn').dataset.arm = '';
  $('shareGrp').classList.toggle('hidden', m.type !== 'file');
  moreBlob = null; if (m.type === 'file') DB.getBlob(id).then(b => { if (moreId === id) moreBlob = b; }); // ready before the tap, so iOS allows sharing
  openSheet('sMore');
}
async function shareItem() {
  const m = items.find(x => x.id === moreId) || mem.meta.get(moreId), b = moreBlob;
  if (!m || !b) return toast('One moment…');
  const type = b.type || (kindOf(m) === 'audio' ? 'audio/mp4' : 'video/mp4');
  const ext = m.ext || (/webm/.test(type) ? 'webm' : /quicktime/.test(type) ? 'mov' : /mpeg/.test(type) ? 'mp3' : /audio/.test(type) ? 'm4a' : 'mp4');
  const file = new File([b], (m.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Gesture Player') + '.' + ext, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); } catch (e) {} return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
$('shareBtn').addEventListener('click', shareItem);
$('renForm').addEventListener('submit', async e => {
  e.preventDefault(); const m = items.find(x => x.id === moreId); const n = $('renIn').value.trim();
  if (!m || !n) return; m.name = n.slice(0, 120); await DB.put(m); closeSheet(); renderLibrary(); toast('Renamed');
});
$('delBtn').addEventListener('click', async () => {
  const b = $('delBtn');
  if (!b.dataset.arm) { b.dataset.arm = '1'; $('delTxt').textContent = 'Tap again to delete'; return; }
  await DB.del(moreId); closeSheet(); await loadLibrary(); toast('Deleted');
});

/* ---------- settings sheet ---------- */
function bindSettings() {
  const sw = { oLock: 'lock', oSpeak: 'speak', oBubble: 'bubble', oFlip: 'flip', oTeach: 'teach' };
  const ci = $('oCountIn').querySelectorAll('button');
  const paintCI = () => { ci.forEach(b => b.classList.toggle('on', b.dataset.v === set.countMode)); $('oSpeakRow').classList.toggle('hidden', set.countMode === 'off'); };
  ci.forEach(b => b.onclick = () => { set.countMode = b.dataset.v; saveSet(); paintCI(); });
  paintCI();
  $('oBack').checked = !!set.back;
  $('oBack').onchange = async () => { set.back = $('oBack').checked; saveSet(); if (running && !rec) { await restartCam(false); } refreshUI(); };
  const ra = $('oRecAudio').querySelectorAll('button');
  const paintRA = () => { ra.forEach(b => b.classList.toggle('on', b.dataset.v === set.recAudio)); $('recAudioTxt').textContent = set.recAudio === 'song' ? 'The track, recorded clean (videos only on iPhone/iPad)' : 'Your voice, counts and music in the room'; };
  ra.forEach(b => b.onclick = () => { set.recAudio = b.dataset.v; saveSet(); paintRA(); });
  paintRA();
  for (const [id, k] of Object.entries(sw)) { $(id).checked = !!set[k]; $(id).onchange = () => { set[k] = $(id).checked; saveSet(); refreshUI(); }; }
  const segs = $('oSkip').querySelectorAll('button');
  const paintSeg = () => segs.forEach(b => b.classList.toggle('on', +b.dataset.v === +set.skip));
  segs.forEach(b => b.onclick = () => { set.skip = +b.dataset.v; saveSet(); paintSeg(); refreshUI(); });
  paintSeg();
  $('oNear').value = set.near;
  const nt = () => $('nearTxt').textContent = +set.near === 0 ? 'Off — any distance' : Math.round(set.near * 100) + '% of the camera view';
  $('oNear').oninput = () => { set.near = +$('oNear').value; saveSet(); nt(); };
  nt();
}
bindSettings();
for (const b of ['setBtn', 'pSet']) $(b).addEventListener('click', () => openSheet('sSet'));
for (const b of ['helpBtn', 'pHelp']) $(b).addEventListener('click', () => openSheet('sHelp'));
const GEST = [['✌️', 'Peace sign, hold 1 s', 'Wakes the remote for 5 s (when the lock is on)'], ['✋', 'Open palm, hold', 'Play or pause'], ['👉', 'Point to your right', 'Skip forward'], ['👈', 'Point to your left', 'Skip back'], ['☝️', 'Point up', 'Faster'], ['👇', 'Point down', 'Slower'], ['👍', 'Thumb up', 'Volume up'], ['👎', 'Thumb down', 'Volume down'], ['🤟', 'Rock-on sign, hold', 'Loop: start, then end, then off'], ['✊', 'Fist, hold', 'Mute or unmute'], ['🤗', 'Arms crossed, hands on shoulders, hold 1 s', 'Start or stop recording (works from across the room)']];
$('gestList').innerHTML = GEST.map(g => `<div class="e">${g[0]}</div><div><b>${esc(g[1])}</b><small>${esc(g[2])}</small></div>`).join('');

/* ---------- player ---------- */
const vidEl = $('v'), audEl = $('au');
let v = vidEl; // the element playing now: songs use a real audio player (iPhone keeps their time properly)
let cur = null, mode = 'none', yt = null, ytReady = false, ytApi = null, pendingYT = null, curRate = 1, hasPlayed = false, resumeAt = 0, objUrl = null;
let actx = null, gain = null, muted = false, wantPlay = false;
const RATES = [0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const P = {
  ready: () => mode === 'file' ? !!v.currentSrc && v.readyState >= 1 : mode === 'yt' && ytReady,
  paused: () => mode === 'file' ? v.paused : !(yt && yt.getPlayerState && yt.getPlayerState() === 1),
  play: async () => { if (mode === 'file') { ensureAudio(); await v.play(); } else yt.playVideo(); },
  pause: () => { wantPlay = false; return mode === 'file' ? v.pause() : yt.pauseVideo(); },
  time: () => mode === 'file' ? v.currentTime : (yt && yt.getCurrentTime ? yt.getCurrentTime() : 0),
  dur: () => mode === 'file' ? (isFinite(v.duration) ? v.duration : (v.seekable.length && isFinite(v.seekable.end(v.seekable.length - 1)) ? v.seekable.end(v.seekable.length - 1) : (cur && cur.dur) || 0)) : (yt && yt.getDuration ? yt.getDuration() : 0),
  seekTo: t => mode === 'file' ? (v.currentTime = t) : yt.seekTo(t, true),
  rates: () => { if (mode === 'yt' && yt && yt.getAvailablePlaybackRates) { const r = yt.getAvailablePlaybackRates(); if (r && r.length) return r; } return RATES; },
  setRate: r => { if (mode === 'file') { v.playbackRate = r; v.preservesPitch = true; } else if (yt) yt.setPlaybackRate(r); }
};

/* iOS: 'playback' gives full-quality speaker sound (and plays on silent);
   only switch to 'play-and-record' while the mic is recording */
const audioSession = t => { try { if (navigator.audioSession && navigator.audioSession.type !== t) navigator.audioSession.type = t; } catch (e) {} };
audioSession('playback');
function ensureAudio() {
  if (actx) { if (actx.state !== 'running') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    gain = actx.createGain(); gain.connect(actx.destination);
    // only videos go through Web Audio (for volume on iOS); on iPhone/iPad a song routed this way
    // stops reporting its time and sounds thinner, so songs play straight to the speaker
    actx.createMediaElementSource(vidEl).connect(gain);
    applyVol();
  } catch (e) { actx = null; }
}
function applyVol() {
  const g = muted ? 0 : set.vol;
  if (gain) gain.gain.value = g;
  for (const el of [vidEl, audEl]) { try { el.volume = g; } catch (e) {} }
  audEl.muted = muted; // iOS ignores volume on a plain audio element, but mute works
  if (yt && ytReady) { if (g === 0) yt.mute(); else { yt.unMute(); yt.setVolume(Math.round(g * 100)); } }
  $('volIn').value = Math.round(g * 100);
}
function beep(hi, soft) {
  if (!actx) return;
  if (actx.state !== 'running') { try { actx.resume(); } catch (e) {} }
  try {
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = soft ? 'triangle' : 'sine'; o.frequency.value = hi ? 1320 : 880;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(soft ? .35 : .5, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + (soft ? .09 : .18));
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + .2);
  } catch (e) {}
}
/* iPhone/iPad only allow sound and speech after a tap: unlock both on the first tap in the app */
let soundReady = false;
function unlockSound() {
  if (soundReady) return; soundReady = true;
  ensureAudio();
  try { if (window.speechSynthesis && window.SpeechSynthesisUtterance) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch (e) {}
}
document.addEventListener('pointerdown', unlockSound, { capture: true });
document.addEventListener('touchend', unlockSound, { capture: true });

/* full screen: request on open, but the player covers the screen either way */
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
function enterFs() { const el = document.documentElement, r = el.requestFullscreen || el.webkitRequestFullscreen; if (r && !fsEl()) { try { const p = r.call(el); if (p && p.catch) p.catch(() => {}); } catch (e) {} } }
function exitFs() { if (fsEl()) { try { const p = (document.exitFullscreen || document.webkitExitFullscreen).call(document); if (p && p.catch) p.catch(() => {}); } catch (e) {} } }

async function openItem(id) {
  const m = items.find(x => x.id === id) || mem.meta.get(id); if (!m) return;
  ensureAudio(); enterFs();
  cur = m; curRate = m.rate || 1; hasPlayed = false; resumeAt = m.pos && m.dur && m.pos < m.dur - 2 ? m.pos : 0;
  document.body.classList.add('playing');
  $('ptitle').textContent = m.name;
  const audio = kindOf(m) === 'audio';
  $('player').classList.toggle('audio', audio);
  $('npTitle').textContent = m.name; $('npSub').textContent = m.dur ? fmt(m.dur) : '';
  $('npArt').style.setProperty('--h', hue(m.name)); $('np').style.setProperty('--h', hue(m.name));
  $('media').classList.toggle('mirror', !!m.mirror && !audio);
  if (m.type === 'file') {
    const blob = await DB.getBlob(m.id);
    if (!blob) { toast('This video is no longer saved'); return closePlayer(); }
    v = audio ? audEl : vidEl; vidEl.style.display = audio ? 'none' : 'block';
    mode = 'file'; $('ytWrap').style.display = 'none';
    if (objUrl) URL.revokeObjectURL(objUrl);
    objUrl = URL.createObjectURL(blob); v.src = objUrl;
    // unlock this element for later hands-free play (iPad needs one play from a tap)
    unlock();
  } else {
    v = vidEl; vidEl.style.display = 'none';
    mode = 'yt'; $('ytWrap').style.display = 'block';
    openYT(m.ytId, resumeAt);
  }
  m.lastPlayed = Date.now(); DB.put(m);
  if (LS.get('cam', false) && !running) startCam();
  refreshUI(); showControls();
}
function closePlayer() {
  if (rec) stopRec(true);
  savePos();
  if (cdTimer) cancelCountdown();
  if (mode === 'file') { v.pause(); v.removeAttribute('src'); try { v.load(); } catch (e) {} if (objUrl) { URL.revokeObjectURL(objUrl); objUrl = null; } }
  if (mode === 'yt' && yt && ytReady) yt.pauseVideo();
  mode = 'none'; cur = null;
  $('player').classList.remove('audio');
  document.body.classList.remove('playing'); $('speeds').classList.remove('show');
  exitFs(); loadLibrary();
  if (pendingUpdate) applyUpdate(pendingUpdate);
}
for (const el of [vidEl, audEl]) el.addEventListener('loadedmetadata', () => {
  if (el !== v) return;
  const go = () => {
    if (resumeAt) { try { v.currentTime = resumeAt; } catch (e) {} resumeAt = 0; }
    v.playbackRate = curRate; v.preservesPitch = true;
    if (cur && isFinite(v.duration) && Math.abs((cur.dur || 0) - v.duration) > 0.5) { cur.dur = v.duration; DB.put(cur); }
    refreshUI();
  };
  if ((isFinite(v.duration) && v.duration > 0) || !cur || kindOf(cur) !== 'rec') return go();
  // recordings don't state their length up front:
  // jump far ahead once so the browser reads it, then come back
  const onTU = () => { v.removeEventListener('timeupdate', onTU); try { v.currentTime = 0; } catch (e) {} go(); };
  v.addEventListener('timeupdate', onTU);
  try { v.currentTime = 1e101; } catch (e) { v.removeEventListener('timeupdate', onTU); go(); }
});
for (const el of [vidEl, audEl]) {
  for (const ev of ['play', 'pause', 'ended']) el.addEventListener(ev, () => { if (el === v) { refreshUI(); showControls(); } });
  el.addEventListener('durationchange', () => { if (el === v && cur && isFinite(el.duration) && el.duration > 0 && Math.abs((cur.dur || 0) - el.duration) > 0.5) { cur.dur = el.duration; DB.put(cur); } });
}

function loadYTApi() {
  if (ytApi) return ytApi;
  ytApi = new Promise((res, rej) => {
    window.onYouTubeIframeAPIReady = () => res();
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ytApi = null; rej(); };
    document.head.appendChild(s);
    setTimeout(() => { if (!window.YT || !window.YT.Player) { ytApi = null; rej(); } }, 12000);
  });
  return ytApi;
}
async function openYT(id, t) {
  try { await loadYTApi(); } catch (e) { toast('YouTube unavailable here'); return; }
  if (mode !== 'yt') return;
  if (yt && ytReady) { yt.cueVideoById({ videoId: id, startSeconds: t || 0 }); applyVol(); return; }
  if (yt) { pendingYT = { id, t }; return; }
  yt = new YT.Player('yt', {
    videoId: id, playerVars: { playsinline: 1, rel: 0, modestbranding: 1, start: Math.floor(t || 0) },
    events: {
      onReady: () => { ytReady = true; applyVol(); if (pendingYT) { yt.cueVideoById({ videoId: pendingYT.id, startSeconds: pendingYT.t || 0 }); pendingYT = null; } refreshUI(); },
      onStateChange: e => {
        if (e.data === 1) { hasPlayed = true; if (yt.getPlaybackRate() !== curRate) yt.setPlaybackRate(curRate); nameFromYT(); }
        refreshUI(); showControls();
      },
      onError: () => toast('This video can’t play here')
    }
  });
}
function nameFromYT() {
  try { const d = yt.getVideoData(); if (cur && cur.type === 'yt' && d && d.title && cur.name === 'YouTube video') { cur.name = d.title; $('ptitle').textContent = d.title; DB.put(cur); } } catch (e) {}
}
function savePos() {
  if (!cur || !P.ready()) return;
  cur.pos = P.time() || 0; cur.rate = curRate; const d = P.dur(); if (d) cur.dur = d;
  DB.put(cur);
}
setInterval(() => { if (cur) savePos(); }, 3000);
addEventListener('pagehide', savePos);
document.addEventListener('visibilitychange', () => { if (document.hidden) savePos(); });

/* actions */
let cdTimer = null;
function cancelCountdown() { clearInterval(cdTimer); cdTimer = null; $('count3').classList.remove('show'); }
function showNum(n, ms = 1000) { $('count3').innerHTML = `<span style="animation-duration:${ms}ms">${n}</span>`; $('count3').classList.add('show'); }
const WORDS = { 1: 'one', 2: 'two', 3: 'three', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight' };
function sayCount(n, last) {
  // a click on every count, so the beat is always heard; the spoken word comes on top when it can
  beep(last, true);
  if (set.speak && window.speechSynthesis && window.SpeechSynthesisUtterance) {
    try { const u = new SpeechSynthesisUtterance(WORDS[n] || String(n)); u.rate = 1.4; u.pitch = last ? 1.15 : 1; u.volume = 1; speechSynthesis.speak(u); } catch (e) {}
  }
}
/* "5, 6, 7, 8" at the song's tempo (slower when you slow the song down), then play on the 1 */
function countIn(done) {
  const eight = set.countMode === '5678', seq = eight ? [5, 6, 7, 8] : [3, 2, 1];
  const ms = eight ? Math.max(240, 60000 / ((cur && cur.bpm) || 100) / (curRate || 1)) : 1000;
  let i = 0;
  const tick = () => {
    if (i < seq.length) { showNum(seq[i], ms); sayCount(seq[i], i === seq.length - 1); i++; return; }
    cancelCountdown(); if (!eight && !set.speak) beep(true); done();
  };
  tick(); cdTimer = setInterval(tick, ms);
}
async function doPlay() { wantPlay = true; if (mode === 'file') v.muted = false; try { await P.play(); hasPlayed = true; refreshUI(); } catch (e) { wantPlay = false; toast('Tap ▶ once to start'); } }
/* iPad only lets a video play hands-free after one play() from a tap: do a silent one */
function unlock() { if (mode !== 'file' || hasPlayed || !v.paused) return; v.muted = true; const p = v.play(); if (p && p.then) p.then(() => { v.muted = false; if (!wantPlay) v.pause(); }).catch(() => { v.muted = false; }); }
function togglePlay() {
  if (!P.ready()) return toast(mode === 'yt' ? 'Tap the video once to start' : 'Loading…');
  if (cdTimer) { cancelCountdown(); toast('Cancelled'); return; }
  if (P.paused()) {
    if (set.countMode !== 'off' && (mode === 'file' || hasPlayed)) countIn(doPlay);
    else doPlay();
  } else { P.pause(); toast('⏸ Pause'); }
}
const fmtT = s => { s = Math.max(0, s || 0); return Math.floor(s / 60) + ':' + (s % 60).toFixed(1).padStart(4, '0'); };
function nudgeLoop(which, d) {
  if (!cur || cur.loopA == null) return;
  const dur = P.dur() || Infinity;
  if (which === 'a') {
    const max = cur.loopB != null ? cur.loopB - 0.3 : dur;
    cur.loopA = Math.max(0, Math.min(max, +(cur.loopA + d).toFixed(2)));
    if (cur.loopB != null) P.seekTo(cur.loopA);
    toast('Start ' + fmtT(cur.loopA));
  } else {
    if (cur.loopB == null) return;
    cur.loopB = Math.min(dur, Math.max(cur.loopA + 0.3, +(cur.loopB + d).toFixed(2)));
    if (d < 0 || P.time() > cur.loopB) P.seekTo(Math.max(cur.loopA, cur.loopB - 1.5)); // hear the new ending
    toast('End ' + fmtT(cur.loopB));
  }
  DB.put(cur); refreshUI(); showControls();
}
function seekBy(dir) {
  if (!P.ready()) return;
  const d = P.dur(); P.seekTo(Math.max(0, Math.min(d || Infinity, P.time() + set.skip * dir)));
  toast((dir > 0 ? '⏩ +' : '⏪ −') + set.skip + ' s');
}
function setRate(r) { curRate = r; P.setRate(r); refreshUI(); }
function changeRate(dir) {
  if (!P.ready()) return;
  const list = P.rates(); let i = 0;
  list.forEach((r, k) => { if (Math.abs(r - curRate) < Math.abs(list[i] - curRate)) i = k; });
  i = Math.max(0, Math.min(list.length - 1, i + dir)); setRate(list[i]);
  toast((dir > 0 ? '🐇 ' : '🐢 ') + fmtRate(curRate));
}
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function nudgeVol(d) {
  if (isIOS && v === audEl) return toast('🔊 Use the side volume buttons'); muted = false; set.vol = Math.max(0, Math.min(1, Math.round((set.vol + d) * 10) / 10)); saveSet(); applyVol(); toast((d > 0 ? '🔊 ' : '🔉 ') + Math.round(set.vol * 100) + '%'); }
function toggleMute() { muted = !muted; applyVol(); toast(muted ? '🔇 Muted' : '🔊 Sound on'); }
function loopTap(late = 0) {
  if (!cur || !P.ready()) return;
  const t = Math.max(0, P.time() - late * curRate); // a held gesture fires late; step back to when it began
  if (cur.loopA != null && cur.loopB != null) { cur.loopA = cur.loopB = null; toast('Loop off'); }
  else if (cur.loopA != null) {
    if (t <= cur.loopA + 0.5) { cur.loopA = t; toast('Loop start moved'); }
    else { cur.loopB = t; P.seekTo(cur.loopA); toast('🔁 Looping'); }
  } else { cur.loopA = t; toast('Loop start set'); }
  DB.put(cur); refreshUI();
}

$('playBtn').addEventListener('click', () => { ensureAudio(); togglePlay(); unlock(); });
$('rwBtn').addEventListener('click', () => seekBy(-1));
$('ffBtn').addEventListener('click', () => seekBy(+1));
$('loopBtn').addEventListener('click', () => loopTap());
$('loopEdit').addEventListener('click', e => { const b = e.target.closest('[data-n]'); if (!b) return; const [w, d] = b.dataset.n.split(','); nudgeLoop(w, +d); });
$('mirBtn').addEventListener('click', () => { if (!cur) return; cur.mirror = !cur.mirror; $('media').classList.toggle('mirror', cur.mirror); DB.put(cur); refreshUI(); toast(cur.mirror ? 'Mirrored' : 'Normal view'); });
$('rateBtn').addEventListener('click', () => {
  const box = $('speeds');
  if (box.classList.contains('show')) return box.classList.remove('show');
  box.innerHTML = P.rates().map(r => `<button data-r="${r}" class="${Math.abs(r - curRate) < .001 ? 'on' : ''}">${fmtRate(r)}</button>`).join('')
    + (set.countMode === '5678' && cur ? `<div class="tempo"><span>Count-in tempo</span><button data-t="-5" aria-label="Slower tempo">−</button><b id="bpmTxt">${(cur.bpm || 100)}</b><span>BPM</span><button data-t="5" aria-label="Faster tempo">+</button><button data-t="tap" class="tap">Tap</button></div>` : '');
  box.classList.add('show'); showControls();
});
let taps = [];
$('speeds').addEventListener('click', e => {
  const t = e.target.closest('[data-t]');
  if (t && cur) { // tempo: nudge, or tap along to the beat
    if (t.dataset.t === 'tap') {
      const now = performance.now(); taps = taps.filter(x => now - x < 2500); taps.push(now);
      if (taps.length >= 3) { const gaps = taps.slice(1).map((x, k) => x - taps[k]), avg = gaps.reduce((a, b) => a + b, 0) / gaps.length; cur.bpm = Math.round(Math.min(220, Math.max(40, 60000 / avg))); }
      else toast('Keep tapping to the beat');
    } else cur.bpm = Math.min(220, Math.max(40, (cur.bpm || 100) + +t.dataset.t));
    $('bpmTxt').textContent = cur.bpm || 100; DB.put(cur); showControls(); return;
  }
  const b = e.target.closest('[data-r]'); if (!b) return; setRate(+b.dataset.r); $('speeds').classList.remove('show'); showControls();
});
$('volIn').addEventListener('input', () => {
  if (isIOS && v === audEl) { $('volIn').value = Math.round(set.vol * 100); return toast('🔊 Use the side volume buttons'); } muted = false; set.vol = +$('volIn').value / 100; saveSet(); applyVol(); showControls(); });

/* scrubber */
let dragging = false;
$('seek').addEventListener('input', () => { dragging = true; const d = P.dur(); $('tNow').textContent = fmt(+$('seek').value / 1000 * d); $('fill').style.width = ($('seek').value / 10) + '%'; showControls(); });
$('seek').addEventListener('change', () => { const d = P.dur(); if (d) P.seekTo(+$('seek').value / 1000 * d); dragging = false; });

/* back: a tap when paused, press-and-hold when playing */
{
  const b = $('backBtn'); let t = null;
  const cancel = () => { clearTimeout(t); t = null; b.classList.remove('hold'); };
  b.addEventListener('pointerdown', () => { if (!P.ready() || P.paused()) return; b.classList.add('hold'); t = setTimeout(() => { cancel(); closePlayer(); }, 700); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, cancel));
  b.addEventListener('click', () => { if (!P.ready() || P.paused()) closePlayer(); else if (!t) toast('Hold to go back'); });
}

/* touches on the video only bring the controls back; the first tap starts a local video */
$('shield').addEventListener('click', () => {
  $('speeds').classList.remove('show');
  if (mode === 'file' && !hasPlayed && P.ready() && P.paused()) { ensureAudio(); togglePlay(); unlock(); return; }
  if ($('player').classList.contains('ui') && P.ready() && !P.paused()) { $('player').classList.remove('ui'); return; }
  showControls();
});
let hideT = null;
function showControls() {
  $('player').classList.add('ui'); clearTimeout(hideT);
  hideT = setTimeout(() => { if (!P.ready() || P.paused() || sheetOpen || dragging || $('speeds').classList.contains('show')) return; $('player').classList.remove('ui'); }, 3500);
}

/* loop + scrubber tick */
setInterval(() => {
  if (!cur || mode === 'none' || (mode === 'yt' && !ytReady)) return; // show time even before the player reports "ready"
  const t = P.time() || 0, d = P.dur();
  if (P.ready() && cur.loopA != null && cur.loopB != null && t >= cur.loopB) P.seekTo(cur.loopA);
  if (!dragging) { const f = d ? Math.min(1, t / d) : 0; $('seek').value = Math.round(f * 1000); $('fill').style.width = (f * 100) + '%'; }
  $('tNow').textContent = fmt(t); $('tDur').textContent = fmt(d);
  if (kindOf(cur) === 'audio') $('npSub').textContent = fmt(t) + ' / ' + fmt(d);
  const band = $('band');
  band.className = 'band';
  if (d && cur.loopA != null) {
    band.style.left = (cur.loopA / d * 100) + '%';
    if (cur.loopB != null) { band.classList.add('ab'); band.style.width = ((cur.loopB - cur.loopA) / d * 100) + '%'; }
    else band.classList.add('a');
  }
}, 150);

/* ---------- gestures ---------- */
const MAP = {
  palm:   { hold: 500, run: togglePlay },
  loop:   { hold: 600, run: () => loopTap(0.6) },
  fist:   { hold: 700, run: toggleMute },
  right:  { hold: 350, every: 750, run: () => seekBy(+1) },
  left:   { hold: 350, every: 750, run: () => seekBy(-1) },
  faster: { hold: 400, every: 900, run: () => changeRate(+1) },
  slower: { hold: 400, every: 900, run: () => changeRate(-1) },
  up:     { hold: 300, every: 400, run: () => nudgeVol(+0.1) },
  down:   { hold: 300, every: 400, run: () => nudgeVol(-0.1) }
};
const WAKE_HOLD = 900, AWAKE_MS = 5000;
const S = { g: 'away', start: 0, last: 0, fired: false, miss: 0 };
let awakeUntil = 0;
const awake = now => !set.lock || now < awakeUntil;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function classify(cat, lm) {
  const w = lm[0];
  const ext = (tip, pip) => dist(lm[tip], w) > dist(lm[pip], w) * 1.12;
  const curl = (tip, pip) => dist(lm[tip], w) < dist(lm[pip], w) * 1.05;
  if (ext(8, 6) && curl(12, 10) && curl(16, 14) && curl(20, 18)) {
    const vx = lm[8].x - lm[5].x, vy = lm[8].y - lm[5].y;
    if (Math.abs(vx) > Math.abs(vy) * 1.3 && Math.abs(vx) > 0.05) { let toRight = vx < 0; if (set.flip) toRight = !toRight; return toRight ? 'right' : 'left'; }
    if (Math.abs(vy) > Math.abs(vx) * 1.3 && Math.abs(vy) > 0.05) return vy < 0 ? 'faster' : 'slower';
  }
  return ({ Open_Palm: 'palm', Closed_Fist: 'fist', Thumb_Up: 'up', Thumb_Down: 'down', Victory: 'wake', Pointing_Up: 'faster', ILoveYou: 'loop' })[cat] || 'none';
}
function handSize(lm) { let x0 = 1, x1 = 0, y0 = 1, y1 = 0; for (const p of lm) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); } return Math.max(x1 - x0, y1 - y0); }
function step(g, now) {
  if (g !== S.g) {
    if (g === 'away' && S.miss < 4) { S.miss++; return; }
    S.g = g; S.start = now; S.last = 0; S.fired = false; S.miss = 0;
  } else S.miss = 0;
  if (!cur || sheetOpen) return; // gestures only act in the player
  const held = now - S.start;
  if (g === 'wake') { if (set.lock && !S.fired && held >= WAKE_HOLD) { S.fired = true; awakeUntil = now + AWAKE_MS; toast('👂 Listening'); } return; }
  const r = MAP[g]; if (!r || !awake(now) || held < r.hold) return;
  if (r.every) { if (now - S.last >= r.every) { S.last = now; r.run(); awakeUntil = now + AWAKE_MS; } }
  else if (!S.fired) { S.fired = true; r.run(); awakeUntil = now + AWAKE_MS; }
}

function refreshUI(now = performance.now()) {
  const playing = P.ready() && !P.paused();
  $('playIco').setAttribute('href', playing || cdTimer ? '#i-pause' : '#i-play');
  $('playBtn').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  $('rateBtn').textContent = fmtRate(curRate);
  document.querySelectorAll('.skipN').forEach(s => s.textContent = set.skip);
  const audio = !!(cur && kindOf(cur) === 'audio');
  $('mirBtn').classList.toggle('on', !!(cur && cur.mirror));
  $('mirBtn').classList.toggle('hidden', audio);
  $('player').classList.toggle('camon', running);
  $('recBtn').classList.toggle('rec', !!rec);
  $('recBtn').setAttribute('aria-label', rec ? 'Stop recording' : 'Record');
  $('recPill').classList.toggle('show', !!rec);
  $('camBox').classList.toggle('recording', !!rec);
  $('camBox').classList.toggle('back', !!set.back);
  $('camBtn').classList.toggle('on', running);
  const looping = cur && cur.loopA != null && cur.loopB != null, half = cur && cur.loopA != null && cur.loopB == null;
  $('loopBtn').classList.toggle('on', !!looping);
  $('loopTxt').textContent = looping ? 'Loop on' : half ? 'Set end' : 'Loop';
  $('loopEdit').classList.toggle('hidden', !(looping || half));
  $('loopEdit').classList.toggle('half', !!half);
  $('player').classList.toggle('tall', !!(looping || half));
  if (cur && cur.loopA != null) { $('lA').textContent = fmtT(cur.loopA); $('lB').textContent = cur.loopB != null ? fmtT(cur.loopB) : '—'; }
  const pill = $('pill'), on = awake(now);
  pill.classList.toggle('show', running);
  if (camErr) { pill.textContent = camErr; pill.className = 'pill glass show locked'; }
  else if (!set.lock) { pill.textContent = 'Gestures on'; pill.className = 'pill glass' + (running ? ' show' : ''); }
  else if (on) { pill.textContent = '👂 Listening ' + Math.max(1, Math.ceil((awakeUntil - now) / 1000)) + 's'; pill.className = 'pill glass armed' + (running ? ' show' : ''); }
  else { pill.textContent = '🔒 Locked · ✌️ to wake'; pill.className = 'pill glass locked' + (running ? ' show' : ''); }
  $('camBox').classList.toggle('armed', running && on);
  $('camBox').classList.toggle('hide', !set.bubble && !audio && !rec);
  $('shield').style.pointerEvents = mode === 'yt' && !hasPlayed ? 'none' : 'auto';
}

/* ---------- camera + MediaPipe ---------- */
const cam = $('cam'), ov = $('ov'), octx = ov.getContext('2d');
let poser = null, lastPose = 0, crossSince = 0, crossFired = false, uncrossSince = 0;
let recognizer = null, running = false, starting = false, lastT = -1, lastRun = 0, wakeLock = null, camErr = '';
function draw(lm) {
  ov.width = ov.clientWidth * devicePixelRatio; ov.height = ov.clientHeight * devicePixelRatio;
  octx.clearRect(0, 0, ov.width, ov.height);
  if (!lm || !cam.videoWidth) return;
  const vw = cam.videoWidth, vh = cam.videoHeight, s = Math.max(ov.width / vw, ov.height / vh), ox = (ov.width - vw * s) / 2, oy = (ov.height - vh * s) / 2;
  octx.fillStyle = '#30d158';
  for (const p of lm) { octx.beginPath(); octx.arc(ox + p.x * vw * s, oy + p.y * vh * s, 2.5 * devicePixelRatio, 0, 7); octx.fill(); }
}
async function keepAwake() { try { if (!wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) {} }
function flashErr(m) { logErr('shown: ' + m); camErr = m; refreshUI(); $('pill').classList.add('show'); setTimeout(() => { camErr = ''; refreshUI(); }, 5000); }
function openStream(hi) {
  // gestures only need a small picture; recording asks for 1080p (and the mic for room sound)
  const video = { facingMode: set.back ? 'environment' : 'user', width: { ideal: hi ? 1920 : 640 }, height: { ideal: hi ? 1080 : 480 }, frameRate: { ideal: 30 } };
  const audio = hi && set.recAudio === 'mic' ? { echoCancellation: false, noiseSuppression: false, autoGainControl: true } : false;
  return navigator.mediaDevices.getUserMedia({ video, audio });
}
async function restartCam(hi) {
  const old = cam.srcObject; if (old) old.getTracks().forEach(t => t.stop()); // iOS allows one camera stream at a time
  cam.srcObject = await openStream(hi); await cam.play().catch(() => {});
}
async function startCam(hi = false) {
  if (running || starting) return;
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return flashErr('Camera needs your GitHub link');
  starting = true; toast('Starting camera…');
  try {
    cam.srcObject = await openStream(hi); await cam.play();
    if (!recognizer) try {
      const base = new URL('vendor/mediapipe/', location.href).href;
      const vision = await import(base + 'vision_bundle.mjs');
      const files = await vision.FilesetResolver.forVisionTasks(base + 'wasm');
      let model = base + 'gesture_recognizer.task';
      try { const r = await fetch(model, { method: 'HEAD' }); if (!r.ok) throw 0; }
      catch (e) { model = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'; }
      const opts = delegate => ({ baseOptions: { modelAssetPath: model, delegate }, runningMode: 'VIDEO', numHands: 2 });
      try { recognizer = await vision.GestureRecognizer.createFromOptions(files, opts('GPU')); }
      catch (e) { recognizer = await vision.GestureRecognizer.createFromOptions(files, opts('CPU')); }
      // body pose, for the arms-crossed record gesture
      let pm = base + 'pose_landmarker_lite.task';
      try { const r = await fetch(pm, { method: 'HEAD' }); if (!r.ok) throw 0; }
      catch (e) { pm = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'; }
      const popts = delegate => ({ baseOptions: { modelAssetPath: pm, delegate }, runningMode: 'VIDEO', numPoses: 1 });
      try { poser = await vision.PoseLandmarker.createFromOptions(files, popts('GPU')); }
      catch (e) { try { poser = await vision.PoseLandmarker.createFromOptions(files, popts('CPU')); } catch (x) { poser = null; } }
    } catch (e) { recognizer = null; } // the camera (and recording) still work without hand tracking
    running = true; LS.set('cam', true);
    $('camBox').classList.add('live'); keepAwake(); refreshUI(); loop();
    if (recognizer) toast('📷 Camera on'); else flashErr('Hand tracking didn’t load — check your connection');
  } catch (e) {
    stopCam(true);
    flashErr(e && e.name === 'NotAllowedError' ? 'Camera blocked — allow it in Settings' : 'Camera unavailable here');
  } finally { starting = false; }
}
function stopCam(quiet) {
  if (rec) stopRec(true);
  running = false;
  const s = cam.srcObject; if (s) s.getTracks().forEach(t => t.stop());
  cam.srcObject = null; $('camBox').classList.remove('live');
  S.g = 'away'; awakeUntil = 0; draw(null);
  if (!quiet) { LS.set('cam', false); toast('Camera off'); }
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  refreshUI();
}
$('camBtn').addEventListener('click', () => running ? stopCam() : startCam());
function loop() {
  if (!running) return;
  const now = performance.now();
  if (recognizer && now - lastRun > 66 && cam.readyState >= 2 && cam.currentTime !== lastT) {
    lastRun = now; lastT = cam.currentTime;
    try {
      const res = recognizer.recognizeForVideo(cam, now);
      const all = res.landmarks || [], cats = (res.gestures || []).map(g => g && g[0] && g[0].score > 0.6 ? g[0].categoryName : 'None');
      // use the biggest (closest) hand
      let i = 0; all.forEach((h, k) => { if (handSize(h) > handSize(all[i])) i = k; });
      const lm = all[i];
      const g = lm ? (handSize(lm) < +set.near ? 'far' : classify(cats[i] || 'None', lm)) : 'away';
      step(g, now); tutSee(g, now);
      draw(lm);
    } catch (e) {}
    if (poser && now - lastPose > 200) { lastPose = now; try { checkCross(poser.detectForVideo(cam, now), now); } catch (e) {} }
    refreshUI(now);
  }
  requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && running) keepAwake(); });

/* arms crossed, each hand on the opposite shoulder, held 1 s = start/stop recording */
function checkCross(res, now) {
  const p = res && res.landmarks && res.landmarks[0];
  let crossed = false;
  if (p) {
    const ls = p[11], rs = p[12], sw = dist(ls, rs), vis = q => (q.visibility == null ? 1 : q.visibility) > 0.4;
    const lw = [p[15], p[17], p[19]], rw = [p[16], p[18], p[20]]; // wrist and hand points
    const near = (hand, sh) => Math.min(...hand.map(q => dist(q, sh))) < sw * 0.6;
    crossed = sw > 0.04 && vis(ls) && vis(rs) && near(lw, rs) && near(rw, ls);
  }
  if (crossed) {
    uncrossSince = 0;
    if (!crossSince) crossSince = now;
    if (!crossFired && now - crossSince >= 1000 && cur && !sheetOpen && awake(now)) { crossFired = true; awakeUntil = now + AWAKE_MS; toggleRec(); }
  } else {
    crossSince = 0;
    if (!uncrossSince) uncrossSince = now;
    if (now - uncrossSince > 600) crossFired = false; // arms down before it can fire again
  }
}

/* ---------- recording: films you while gestures keep working ---------- */
let rec = null, recChunks = [], recStart = 0, recDest = null, recBusy = false;
const recMime = () => ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) || '';
function toggleRec() { rec ? stopRec() : startRec(); }
async function startRec() {
  if (rec || recBusy) return;
  if (!window.MediaRecorder) return flashErr('Recording isn’t supported on this device');
  recBusy = true; toast('Starting recording…');
  try {
    if (set.recAudio === 'mic') audioSession('play-and-record');
    if (!running) await startCam(true); else await restartCam(true);
    if (!running || !cam.srcObject) throw new Error('no camera');
    const tracks = [...cam.srcObject.getVideoTracks()];
    if (set.recAudio === 'song' && actx && gain && mode === 'file' && v === vidEl) {
      if (!recDest) { recDest = actx.createMediaStreamDestination(); gain.connect(recDest); }
      tracks.push(...recDest.stream.getAudioTracks());
    } else tracks.push(...cam.srcObject.getAudioTracks());
    const mime = recMime(), opts = { videoBitsPerSecond: 10000000, audioBitsPerSecond: 192000 };
    if (mime) opts.mimeType = mime;
    const r = new MediaRecorder(new MediaStream(tracks), opts);
    recChunks = [];
    r.ondataavailable = e => { if (e.data && e.data.size) recChunks.push(e.data); };
    r.onstop = () => saveRec(r);
    r.start(1000); rec = r; recStart = Date.now();
    toast('● Recording'); refreshUI();
    if (set.teach && cur && P.ready() && P.paused() && !cdTimer) togglePlay();
  } catch (e) {
    rec = null; audioSession('playback'); flashErr(e && e.name === 'NotAllowedError' ? 'Allow camera and microphone in Settings' : 'Couldn’t start recording');
    if (running) restartCam(false).catch(() => {});
  } finally { recBusy = false; }
}
function stopRec(quiet) {
  if (!rec) return;
  const r = rec; rec = null;
  try { r.stop(); } catch (e) {}
  if (!quiet && set.teach && cur && P.ready() && !P.paused()) P.pause();
  if (!quiet) toast('■ Saving…');
  refreshUI();
}
async function saveRec(r) {
  const type = r.mimeType || (recChunks[0] && recChunks[0].type) || 'video/mp4';
  const blob = new Blob(recChunks, { type }), secs = (Date.now() - recStart) / 1000; recChunks = [];
  audioSession('playback');
  if (running) restartCam(false).catch(() => {}); // back to the light gesture camera
  if (!blob.size) return toast('Recording was empty');
  const d = new Date(), id = newId('r');
  const name = 'Recording ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const { thumb, dur } = await makeThumb(blob);
  const m = { id, type: 'file', kind: 'rec', name, added: Date.now(), lastPlayed: 0, dur: dur || secs, pos: 0, rate: 1, mirror: false, loopA: null, loopB: null, thumb, ext: /webm/.test(type) ? 'webm' : 'mp4' };
  if (await DB.putBlob(id, blob)) await DB.put(m); else { m.temp = true; mem.meta.set(id, m); }
  items = await DB.all(); if (!cur) renderLibrary();
  toast('✓ Recording saved');
}
$('recBtn').addEventListener('click', () => { ensureAudio(); toggleRec(); });
setInterval(() => { if (rec) $('recTime').textContent = fmt((Date.now() - recStart) / 1000); }, 500);
document.addEventListener('visibilitychange', () => { if (document.hidden && rec) stopRec(true); }); // iOS stops the camera in the background

/* ---------- first-run tutorial ---------- */
const tut = { open: false, step: 0, seen: {}, g: '', since: 0 };
const TCHK = [['wake', '✌️', 'Peace sign'], ['palm', '✋', 'Open palm'], ['point', '👉', 'Point sideways'], ['loop', '🤟', 'Rock-on sign']];
const tSteps = () => document.querySelectorAll('.tstep');
function tutRender() {
  const n = tSteps().length;
  tSteps().forEach(s => s.classList.toggle('on', +s.dataset.s === tut.step));
  $('tutDots').innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i === tut.step ? 'on' : ''}"></i>`).join('');
  $('tutBack').style.visibility = tut.step ? 'visible' : 'hidden';
  $('tutNext').textContent = tut.step === n - 1 ? 'Start' : 'Next';
  $('tutChecks').innerHTML = TCHK.map(([k, e, l]) => `<div class="tchk${tut.seen[k] ? ' ok' : ''}"><span class="e">${e}</span><span>${l}</span></div>`).join('');
  $('tutCamBtn').classList.toggle('hidden', running);
  // the camera picture moves onto the card while you practise
  if (tut.step === 2) { if (cam.parentNode !== $('tutCam')) { $('tutCam').appendChild(cam); cam.play().catch(() => {}); } } // moving a video pauses it
  else if (cam.parentNode !== $('camBox')) { $('camBox').prepend(cam); cam.play().catch(() => {}); }
}
function openTut() { closeSheet(); tut.open = true; tut.step = 0; tut.seen = {}; tut.g = ''; $('tut').classList.remove('hidden'); tutRender(); }
function closeTut() { tut.open = false; $('tut').classList.add('hidden'); if (cam.parentNode !== $('camBox')) { $('camBox').prepend(cam); cam.play().catch(() => {}); } LS.set('tutDone', true); }
$('tutNext').addEventListener('click', () => { if (tut.step >= tSteps().length - 1) return closeTut(); tut.step++; tutRender(); });
$('tutBack').addEventListener('click', () => { if (tut.step) { tut.step--; tutRender(); } });
$('tutSkip').addEventListener('click', closeTut);
$('tutCamBtn').addEventListener('click', async () => { $('tutHint').textContent = 'Starting camera…'; await startCam(); tutRender(); $('tutHint').textContent = running ? 'Stand about an arm’s length away and hold each sign.' : 'The camera didn’t start. You can skip this and try it in the player.'; });
$('helpTut').addEventListener('click', openTut);
function tutSee(g, now) {
  if (!tut.open || tut.step !== 2) return;
  const k = g === 'right' || g === 'left' ? 'point' : g;
  if (k !== tut.g) { tut.g = k; tut.since = now; }
  const all = TCHK.every(c => tut.seen[c[0]]);
  if (!all) $('tutHint').textContent = g === 'far' ? 'Come a little closer to the camera' : g === 'away' ? 'Show your hand to the camera' : 'Hold each sign for a moment';
  const c = TCHK.find(x => x[0] === k);
  if (c && !tut.seen[k] && now - tut.since > 400) {
    tut.seen[k] = true; toast(c[1] + ' Got it'); tutRender();
    if (TCHK.every(x => tut.seen[x[0]])) $('tutHint').textContent = 'Perfect, you’ve got them all!';
  }
}

/* broken thumbnails (e.g. offline) fall back to the placeholder */
document.addEventListener('error', e => { if (e.target && e.target.tagName === 'IMG') e.target.remove(); }, true);

/* ---------- updates: installed apps pick up new versions by themselves ---------- */
const BUILD = '__BUILD__';
/* ---------- report a problem / suggest an idea (GitHub issue forms, pre-filled) ---------- */
function deviceInfo() {
  const ua = navigator.userAgent, ios = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const dev = /iPhone/.test(ua) ? 'iPhone' : ios ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Other';
  const os = (ua.match(/OS (\d+[_.]\d+)/) || ua.match(/Android (\d+(\.\d+)?)/) || [])[1];
  const br = /CriOS|Chrome/.test(ua) && !/Edg/.test(ua) ? 'Chrome' : /Edg/.test(ua) ? 'Edge' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'browser';
  const app = matchMedia('(display-mode: standalone)').matches || navigator.standalone ? 'Home Screen app' : br;
  return dev + (os ? ' ' + os.replace('_', '.') : '') + ', ' + app;
}
function issueUrl(kind) {
  const ver = (BUILD.startsWith('__') ? 'local' : BUILD) + (/\/beta\//.test(location.pathname) ? ' (beta)' : '');
  const q = new URLSearchParams({ template: kind === 'bug' ? 'bug.yml' : 'idea.yml', device: deviceInfo(), version: ver });
  if (kind === 'bug') { let l = []; try { l = JSON.parse(localStorage.getItem('gp4_errs') || '[]'); } catch (e) {} q.set('logs', l.length ? l.join('\n') : 'none'); }
  return 'https://github.com/jackmikejk/Gesture-Player/issues/new?' + q.toString();
}
const setLinks = () => { $('repBug').href = issueUrl('bug'); $('repIdea').href = issueUrl('idea'); };
for (const b of ['setBtn', 'pSet']) $(b).addEventListener('click', setLinks);
setLinks();
$('verTxt').textContent = 'Version ' + (BUILD.startsWith('__') ? 'local' : BUILD) + (/\/beta\//.test(location.pathname) ? ' (beta)' : '');
let pendingUpdate = null;
function applyUpdate(v) { toast('Updating…'); setTimeout(() => location.replace(location.pathname + '?v=' + encodeURIComponent(v)), 400); }
async function checkUpdate() {
  if (BUILD.startsWith('__')) return; // local copy, not a deployed build
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const { v } = await r.json();
    if (!v || v === BUILD) return;
    if (cur) pendingUpdate = v; // wait until you leave the player, never mid-practice
    else applyUpdate(v);
  } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
setInterval(checkUpdate, 10 * 60 * 1000);

/* the test copy at /beta/ says so, so it's never mistaken for the live app */
if (/\/beta\//.test(location.pathname)) { const t = document.createElement('span'); t.className = 'betaTag'; t.textContent = 'Beta'; document.querySelector('h1').append(' ', t); document.title = 'Gesture Player Beta'; }

/* ---------- start ---------- */
applyVol(); refreshUI(); loadLibrary(); checkUpdate();
if (!LS.get('tutDone', false)) openTut();
}
