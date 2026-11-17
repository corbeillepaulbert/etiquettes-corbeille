// Service worker : l'appli et le moteur de lecture restent disponibles sans internet
const V='cpb-v15';
const CORE=['./','index.html','manifest.json','icon-180.png','icon-192.png','icon-512.png','tessdata/fra.traineddata.gz','lib/pdf.min.mjs','lib/pdf.worker.min.mjs'];
const CDN=['https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js','https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js','https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js','https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd-lstm.wasm.js','https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-lstm.wasm.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(async c=>{await c.addAll(CORE);for(const u of CDN){try{await c.add(new Request(u,{mode:'cors'}))}catch(x){}}}).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET')return;
 if(/googleapis\.com|accounts\.google\.com/.test(u.host))return; // Drive et connexion : toujours en direct
 if(u.origin===location.origin&&(e.request.mode==='navigate'||u.pathname.endsWith('index.html'))){e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(V).then(c=>c.put('index.html',cp));return r}).catch(()=>caches.match('index.html')));return}
 e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(n=>{if(n.ok&&(u.origin===location.origin||/jsdelivr/.test(u.host))){const cp=n.clone();caches.open(V).then(c=>c.put(e.request,cp))}return n})))});
