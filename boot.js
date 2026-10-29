(async function(){
  const $ = id => document.getElementById(id), fail = (h, p) => { $('c').classList.add('e'); $('h').textContent = h; $('p').textContent = p; };
  const b64 = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('sec:' + new URL('./', location.href).pathname, 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const get = db => new Promise(res => { const q = db.transaction('k').objectStore('k').get('key'); q.onsuccess = () => res(q.result); q.onerror = () => res(null); });
  const put = (db, v) => new Promise((res, rej) => { const t = db.transaction('k', 'readwrite'); t.objectStore('k').put(v, 'key'); t.oncomplete = res; t.onerror = () => rej(t.error); });
  try {
    if (!('serviceWorker' in navigator) || !window.crypto || !crypto.subtle) return fail('المتصفح لا يدعم هذه المنصة', 'افتح الرابط في Chrome أو Edge أو Safari حديث، وعبر https.');
    const db = await idb(), m = location.hash.match(/k=([A-Za-z0-9_-]{20,})/);
    if (m){ await put(db, b64(m[1])); history.replaceState(null, '', location.pathname); }
    else if (!(await get(db))) return fail('الرابط غير مكتمل', 'استخدم الرابط الكامل الذي أعطاك إياه معلمك (أو امسح رمز QR من جديد).');
    const reg = await navigator.serviceWorker.register('sw.js', {updateViaCache: 'none'}); try { reg.update(); } catch (e) {} await navigator.serviceWorker.ready;
    if (reg.active) reg.active.postMessage('reload-key');
    if (!navigator.serviceWorker.controller) await new Promise(r => { navigator.serviceWorker.addEventListener('controllerchange', r, {once: true}); setTimeout(r, 2500); });
    const r = await fetch('index.html', {cache: 'no-store'}), t = r.ok ? await r.text() : '';
    if (r.status === 403) return fail('المفتاح غير صحيح', 'استخدم الرابط الحديث من معلمك؛ ربما تغيّر.');
    if (!/<html/i.test(t) || /go\.html/.test(t.slice(0, 400))) { if (!navigator.serviceWorker.controller) return location.reload(); return fail('تعذّر فتح المنصة', 'أعد المحاولة بعد لحظات.'); }
    location.replace('./');
  } catch (e) { fail('حدث خطأ', String(e && e.message || e)); }
})();
