/* Decrypting service worker (v2). The host only ever holds ciphertext (enc/<sha256(path)>.bin = IV(12) + AES-GCM of [gzip(text) | raw bytes]).
   The key comes from the student's link (#k=…, never sent to the server) and sits in this browser's IndexedDB (written by go.html).
   Speed + robustness rules (these were the causes of "hangs / empty page / cannot enter"):
   - cache-first: a file already downloaded in this build is NEVER re-requested (before: every file was re-validated over the network on every load);
   - one tiny v.txt (build id) is checked on each page navigation (2.5 s timeout); when it changes the cache is renewed, so old and new files never mix;
   - every network request has a timeout and 2 retries; if nothing is reachable the student gets a clear page, never an endless spinner;
   - text files are gzipped before encryption (about 5x smaller downloads); ciphertext is cached per build, plain bytes only live in memory. */
const BASE = new URL(self.registration.scope).pathname, META = 'enc-meta';
const BYPASS = /^(go\.html|sw\.js|boot\.js|404\.html|v\.txt|enc\/)/;
const ZEXT = new Set(['js', 'css', 'html', 'json', 'svg', 'txt']);
const MIME = {html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', mp3: 'audio/mpeg', mp4: 'video/mp4', pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', doc: 'application/msword', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
let KEY = null, VER = null, last = {url: '', buf: null}, verCheckedAt = 0;
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('sec:' + new URL('./', location.href).pathname, 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function loadKey(){
  if (KEY) return KEY; const db = await idb(); let raw = await new Promise(res => { const q = db.transaction('k').objectStore('k').get('key'); q.onsuccess = () => res(q.result); q.onerror = () => res(null); });
  if (!raw){ try { const r = await (await caches.open('sk-key')).match('k'); if (r){ const s = (await r.text()).replace(/-/g, '+').replace(/_/g, '/'), pad = s + '='.repeat((4 - s.length % 4) % 4); raw = Uint8Array.from(atob(pad), c => c.charCodeAt(0)); try { const w = db.transaction('k', 'readwrite'); w.objectStore('k').put(raw, 'key'); } catch (x) {} } } catch (x) {} }
  if (!raw) return null; KEY = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']); return KEY;
}
async function hashPath(p){ const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p)); return [...new Uint8Array(d)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(''); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function net(url, opt, ms){
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, Object.assign({signal: c.signal}, opt || {})); } finally { clearTimeout(t); }
}
/* the build whose ciphertext sits in the cache; kept in Cache Storage so a restarted worker knows it */
async function curVer(){ if (VER) return VER; try { const m = await caches.open(META), r = await m.match('ver'); VER = r ? await r.text() : ''; } catch (x) { VER = ''; } return VER; }
async function setVer(v){ VER = v; const m = await caches.open(META); await m.put('ver', new Response(v)); }
async function checkVersion(force){
  if (!force && Date.now() - verCheckedAt < 20000) return; verCheckedAt = Date.now();
  let v = null; try { const r = await net(BASE + 'v.txt', {cache: 'no-store'}, 2500); if (r.ok) v = (await r.text()).trim(); } catch (x) {}
  if (!v) return;                                                    // offline / slow: keep working with what is cached
  const cur = await curVer();
  if (v !== cur){ for (const k of await caches.keys()) if (k.startsWith('enc-') && k !== META && k !== 'enc-' + v) await caches.delete(k); last = {url: '', buf: null}; await setVer(v); }
}
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil((async () => { await self.clients.claim(); })()));
self.addEventListener('message', e => { if (e.data === 'reload-key'){ KEY = null; last = {url: '', buf: null}; verCheckedAt = 0; } });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return; const u = new URL(req.url); if (u.origin !== location.origin || !u.pathname.startsWith(BASE)) return;
  let p; try { p = decodeURIComponent(u.pathname.slice(BASE.length)); } catch (x) { return; } if (!p || p.endsWith('/')) p += 'index.html'; if (BYPASS.test(p)) return;
  e.respondWith(serve(req, p));
});
async function gunzip(buf){ const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip')); return await new Response(s).arrayBuffer(); }
async function cipher(p){
  const z = ZEXT.has((p.split('.').pop() || '').toLowerCase()), url = BASE + 'enc/' + await hashPath(p) + (z ? '.z' : '') + '.bin', v = await curVer() || 'x', cache = await caches.open('enc-' + v);
  let r = await cache.match(url); if (r) return {url, b: await r.arrayBuffer()};                    // already downloaded in this build: no network at all
  let err = null;
  for (let i = 0; i < 3; i++){
    try { r = await net(url, {cache: 'no-cache'}, 25000 + i * 15000); if (r.status === 404) return {url, b: 404}; if (r.ok){ const b = await r.arrayBuffer(); cache.put(url, new Response(b.slice(0), {headers: {'Content-Type': 'application/octet-stream'}})).catch(() => {}); return {url, b}; } err = r.status; }
    catch (x) { err = x; }
    await sleep(500 * (i + 1));
  }
  return {url, b: 504};
}
async function plain(p){
  const key = await loadKey(); if (!key) return null;
  const c = await cipher(p); if (typeof c.b === 'number') return c.b;
  if (last.url === c.url && last.buf) return last.buf;
  let out; try { out = await crypto.subtle.decrypt({name: 'AES-GCM', iv: c.b.slice(0, 12)}, key, c.b.slice(12)); } catch (x) { return 403; }
  if (ZEXT.has((p.split('.').pop() || '').toLowerCase())){ try { out = await gunzip(out); } catch (x) { return 500; } }
  if (out.byteLength > 1.5e6) last = {url: c.url, buf: out};
  return out;
}
const page = (t, m, s) => new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Segoe UI,Tahoma,sans-serif;background:#0E1A2B;color:#F4EFE3;text-align:center;padding:48px 20px;direction:rtl"><h1>' + t + '</h1><p>' + m + '</p><p><a style="color:#D4B16A" href="go.html">إعادة المحاولة</a></p>', {status: s, headers: {'Content-Type': 'text/html; charset=utf-8'}});
async function serve(req, p){
  if (req.mode === 'navigate') await checkVersion(true); else await checkVersion(false);
  const buf = await plain(p);
  if (buf === null) return fetch(req);                       // no key yet: the plain page of the host (go.html explains)
  if (typeof buf === 'number'){
    const nav = req.mode === 'navigate';
    if (buf === 404) return nav ? page('الصفحة غير موجودة', 'ارجع إلى الرئيسية.', 404) : new Response('Not found', {status: 404});
    if (buf === 403) return nav ? page('المفتاح غير صحيح', 'استخدم الرابط الحديث الذي أعطاك إياه معلمك، أو امسح الباركود من جديد.', 403) : new Response('Wrong key', {status: 403});
    return nav ? page('تعذّر التحميل', 'الاتصال ضعيف أو منقطع. تأكد من الإنترنت ثم أعد المحاولة؛ ما فتحته سابقًا يعمل دون اتصال.', 504) : new Response('Unavailable', {status: 504});
  }
  const ext = (p.split('.').pop() || '').toLowerCase(), type = MIME[ext] || 'application/octet-stream', size = buf.byteLength, h = {'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store'};
  const rg = req.headers.get('Range');
  if (rg){ const m = rg.match(/bytes=(\d*)-(\d*)/); if (m){ let a = m[1] === '' ? size - +m[2] : +m[1], b = m[1] !== '' && m[2] !== '' ? +m[2] : size - 1; b = Math.min(b, size - 1);
    if (a > b || a >= size) return new Response(null, {status: 416, headers: {'Content-Range': 'bytes */' + size}});
    return new Response(buf.slice(a, b + 1), {status: 206, headers: Object.assign(h, {'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': String(b - a + 1)})}); } }
  return new Response(buf, {status: 200, headers: Object.assign(h, {'Content-Length': String(size)})});
}
