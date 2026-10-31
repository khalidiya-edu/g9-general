(async function(){
  const $ = id => document.getElementById(id), say = (h, p) => { if (h) $('h').textContent = h; if (p !== undefined) $('p').textContent = p; };
  const fail = (h, p, extra) => { $('c').classList.add('e'); say(h, p); if (extra) extra(); };
  const b64 = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('sec:' + new URL('./', location.href).pathname, 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const get = db => new Promise(res => { const q = db.transaction('k').objectStore('k').get('key'); q.onsuccess = () => res(q.result); q.onerror = () => res(null); });
  const put = (db, v) => new Promise((res, rej) => { const t = db.transaction('k', 'readwrite'); t.objectStore('k').put(v, 'key'); t.oncomplete = res; t.onerror = () => rej(t.error); });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const timeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what || 'timeout')), ms))]);
  const flag = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} return null; };
  const inApp = /FBAN|FBAV|Instagram|Snapchat|MicroMessenger|TikTok|Line\/|; wv\)|WhatsApp|Telegram/i.test(navigator.userAgent);
  const copyBtn = () => { const b = document.createElement('button'); b.textContent = 'نسخ الرابط لفتحه في المتصفح'; b.style.cssText = 'margin-top:14px;font:inherit;padding:12px 18px;border-radius:12px;border:0;background:#D4B16A;color:#0E1A2B;font-weight:700;cursor:pointer';
    b.onclick = async () => { try { await navigator.clipboard.writeText(location.href); b.textContent = 'تم النسخ — افتح Chrome أو Safari والصقه'; } catch (e) { prompt('انسخ الرابط:', location.href); } }; $('c').appendChild(b); };
  try {
    if (!('serviceWorker' in navigator) || !window.crypto || !crypto.subtle || !window.indexedDB)
      return fail(inApp ? 'افتح الرابط في المتصفح' : 'المتصفح لا يدعم هذه المنصة', inApp ? 'هذا المتصفح الداخلي (واتساب أو سناب أو غيرهما) لا يشغّل المنصة. انسخ الرابط وافتحه في Chrome أو Safari.' : 'استخدم Chrome أو Edge أو Safari حديثًا، وبعنوان https.', copyBtn);
    let db; try { db = await timeout(idb(), 6000, 'idb'); } catch (e) { return fail('التخزين في المتصفح معطّل', 'أغلق وضع التصفح الخاص (Private/Incognito) أو اسمح بتخزين بيانات الموقع ثم أعد المحاولة.', copyBtn); }
    const m = location.hash.match(/k=([A-Za-z0-9_-]{20,})/);
    if (m){ await put(db, b64(m[1])); try { localStorage.setItem('sec.k', m[1]); } catch (e) {} try { const c = await caches.open('sk-key'); await c.put('k', new Response(m[1])); } catch (e) {} history.replaceState(null, '', location.pathname); }
    else if (!(await get(db))) return fail('الرابط غير مكتمل', 'امسح الباركود من جديد أو استخدم الرابط الكامل الذي أعطاك إياه معلمك.');
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}     // ask the browser not to evict the student's saved progress
    say('جاري تجهيز المنصة…', 'يستغرق هذا ثوانيَ في أول مرة فقط.');
    const reg = await timeout(navigator.serviceWorker.register('sw.js', {updateViaCache: 'none'}), 15000, 'reg');
    await timeout(navigator.serviceWorker.ready, 20000, 'ready');
    if (reg.active) reg.active.postMessage('reload-key');
    if (!navigator.serviceWorker.controller) await Promise.race([new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', r, {once: true})), sleep(3000)]);
    if (!navigator.serviceWorker.controller){                         // first visit: the page was loaded before the worker took over -> one clean reload, never a loop
      const n = +(flag('bt') || 0); if (n < 2){ flag('bt', String(n + 1)); return location.reload(); }
      return fail('تعذّر تجهيز المنصة', 'أغلق الصفحة وافتح الرابط من جديد، أو جرّب متصفحًا آخر.', copyBtn);
    }
    say('جاري التحقق من الاتصال…', '');
    let r; try { r = await timeout(fetch('index.html', {cache: 'no-store'}), 45000, 'slow'); } catch (e) { return fail('الاتصال ضعيف', 'لم تصل الملفات في الوقت المناسب. تأكد من الإنترنت ثم أعد فتح الرابط.', () => { const b = document.createElement('button'); b.textContent = 'إعادة المحاولة'; b.style.cssText = 'margin-top:14px;font:inherit;padding:12px 18px;border-radius:12px;border:0;background:#D4B16A;color:#0E1A2B;font-weight:700'; b.onclick = () => location.reload(); $('c').appendChild(b); }); }
    if (r.status === 403) return fail('المفتاح غير صحيح', 'استخدم الرابط الحديث من معلمك، أو امسح الباركود من جديد؛ ربما تغيّر.');
    const t = r.ok ? await r.text() : '';
    if (!/<html/i.test(t) || /go\.html/.test(t.slice(0, 400))){ const n = +(flag('bt') || 0); if (n < 2){ flag('bt', String(n + 1)); return location.reload(); } return fail('تعذّر فتح المنصة', 'أعد المحاولة بعد لحظات.'); }
    flag('bt', null); location.replace('./');
  } catch (e) { fail('حدث خطأ', String(e && e.message || e), copyBtn); }
})();
