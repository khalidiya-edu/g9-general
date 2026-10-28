/* Decrypting service worker. The host only ever holds ciphertext (enc/<sha256(path)>.bin = IV(12) + AES-GCM). The key comes from the student's link
   (#k=…, never sent to the server), is stored in this browser's IndexedDB by go.html, and every same-origin GET is answered here, decrypted. */
const BUILD = 'v1', CACHE = 'enc-' + BUILD, BASE = new URL(self.registration.scope).pathname;
const BYPASS = /^(go\.html|sw\.js|boot\.js|404\.html|enc\/)/;
const MIME = {html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', mp3: 'audio/mpeg', mp4: 'video/mp4', pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', doc: 'application/msword', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
let KEY = null, last = {url: '', buf: null, tag: ''};
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('sec', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function loadKey(){
  if (KEY) return KEY; const db = await idb(), raw = await new Promise(res => { const q = db.transaction('k').objectStore('k').get('key'); q.onsuccess = () => res(q.result); q.onerror = () => res(null); });
  if (!raw) return null; KEY = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']); return KEY;
}
async function hashPath(p){ const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p)); return [...new Uint8Array(d)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(''); }
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== CACHE && k.startsWith('enc-')) await caches.delete(k); await self.clients.claim(); })()));
self.addEventListener('message', e => { if (e.data === 'reload-key'){ KEY = null; } });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return; const u = new URL(req.url); if (u.origin !== location.origin || !u.pathname.startsWith(BASE)) return;
  let p; try { p = decodeURIComponent(u.pathname.slice(BASE.length)); } catch (x) { return; } if (!p || p.endsWith('/')) p += 'index.html'; if (BYPASS.test(p)) return;
  e.respondWith(serve(req, p));
});
async function plain(p){
  const key = await loadKey(); if (!key) return null; const url = BASE + 'enc/' + await hashPath(p) + '.bin';
  const cache = await caches.open(CACHE); let r = null;
  try { r = await fetch(url, {cache: 'no-cache'}); if (r.ok) cache.put(url, r.clone()); else if (r.status === 404) { r = null; await cache.delete(url); return 404; } else r = null; } catch (x) { r = null; }
  if (!r) r = await cache.match(url);                      // offline: what the student opened before
  if (!r) return 404;
  const tag = r.headers.get('etag') || r.headers.get('last-modified') || '';
  if (tag && last.url === url && last.tag === tag) return last.buf;
  const b = await r.arrayBuffer(); let out;
  try { out = await crypto.subtle.decrypt({name: 'AES-GCM', iv: b.slice(0, 12)}, key, b.slice(12)); } catch (x) { return 403; }
  if (out.byteLength > 2e6) last = {url, buf: out, tag};
  return out;
}
async function serve(req, p){
  const buf = await plain(p);
  if (buf === null) return fetch(req);                       // no key yet: the plain page of the host (go.html explains)
  if (buf === 404) return new Response('Not found', {status: 404});
  if (buf === 403) return new Response('Wrong key', {status: 403});
  const ext = (p.split('.').pop() || '').toLowerCase(), type = MIME[ext] || 'application/octet-stream', size = buf.byteLength, h = {'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store'};
  const rg = req.headers.get('Range');
  if (rg){ const m = rg.match(/bytes=(\d*)-(\d*)/); if (m){ let a = m[1] === '' ? size - +m[2] : +m[1], b = m[1] !== '' && m[2] !== '' ? +m[2] : size - 1; b = Math.min(b, size - 1);
    if (a > b || a >= size) return new Response(null, {status: 416, headers: {'Content-Range': 'bytes */' + size}});
    return new Response(buf.slice(a, b + 1), {status: 206, headers: Object.assign(h, {'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': String(b - a + 1)})}); } }
  return new Response(buf, {status: 200, headers: Object.assign(h, {'Content-Length': String(size)})});
}
