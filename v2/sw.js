// Service worker de la V2. Portée : dossier v2/ uniquement.
// Règle de cohabitation : ne touche JAMAIS aux caches de la V1 (préfixe « cpb- »), seulement aux siens (« cbv2- »).
const V = 'cbv2-16';
const COEUR = ['./', 'index.html', 'manifest.webmanifest', 'css/tokens.css', 'css/composants.css',
  'js/app.js', 'js/comptage.js', 'js/inventaire.js', 'js/inv-calcul.js', 'js/refaire.js', 'js/noms.js', 'js/prix.js', 'js/hebdo.js', 'js/livrer.js', 'js/prix-unitaire.js', 'js/ramadan.js', 'donnees/ramadan.json', 'js/besoins.js', 'js/conseil.js', 'js/inconnus.js', 'js/caisse.js', 'js/affiches.js', 'js/moteur/affiches.js', 'js/invite.js', 'js/atraiter.js', 'js/lectures.js', 'js/visionneuse.js', 'js/drive.js', 'js/facture.js', 'js/fournisseurs.js', 'js/recherche.js', 'js/moteur/facture.js', 'js/moteur/import.js', 'js/moteur/lecture.js', 'js/etiquettes.js', 'js/moteur/etiquettes.js', 'fonts/InterE-900.woff', 'fonts/InterE-700.woff', 'js/ecrans.js', 'js/calcul.js', 'js/icones.js', 'js/donnees.js', 'js/moteur/xlsx.js', 'js/moteur/scan.js',
  'icones/icone-180.png', 'icones/icone-192.png', 'icones/icone-512.png'];
const CDN = ['https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(async c => {
    await c.addAll(COEUR);
    for (const u of CDN) { try { await c.add(new Request(u, { mode: 'cors' })); } catch (x) { } }
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('cbv2-') && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  const local = u.origin === location.origin;
  if (local && !u.pathname.includes('/v2/')) return; // la V1 n'est pas de notre ressort
  // réseau d'abord pour nos fichiers (mises à jour immédiates), cache si hors ligne
  if (local) {
    e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); } return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
    return;
  }
  if (/jsdelivr/.test(u.host)) e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
