import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const produits = [
  { e: '3760083882180', lib: 'POIS CHICHES GROS BARCO 1KG', prix: 3, dep: 'EPICERIE TAUX REDUIT', q: 199 },
  { e: '3700671750040', lib: 'HUILE TOURNESOL 5L', prix: 9.5, dep: 'EPICERIE TAUX REDUIT', q: 508 },
  { e: '7622210449283', lib: 'PRINCE CHOCOLAT LU PQ 300G', prix: 1.8, dep: 'EPICERIE TAUX REDUIT', q: 595 },
  { e: '5449000051981', lib: 'COCA COLA 1.5L', prix: 2, dep: 'LIQUIDES TAUX REDUIT', q: 911 },
  { e: '6194049100013', lib: 'HARISSA PHARE DU CAP BON - 1/6 - LE PHARE D...', prix: 1, dep: 'EPICERIE TAUX REDUIT', q: 336 },
  { e: '3439495128802', lib: 'HARICOTS ROUGE ROCHAMBEAU', prix: null, dep: 'EPICERIE', q: 541 },
  { e: '2000000001234', lib: 'CODE INTERNE TEST', prix: 12.5, dep: 'EPICERIE', q: 3 },
  { e: '4040328039180', lib: 'AYRAN SUNTAT 1L', prix: 1.99, dep: 'CREMERIE', q: 857 },
];
const empreinte = `async (pages) => { const out = []; for (const p of pages) { const d = p.c.getContext('2d').getImageData(0, 0, p.c.width, p.c.height).data; const h = await crypto.subtle.digest('SHA-256', d); out.push([p.c.width, p.c.height, [...new Uint8Array(h)].slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join('')]); } return out; }`;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
// V1
const p1 = await b.newPage(); await p1.goto('http://localhost:8766/index.html'); await p1.waitForTimeout(1500);
const h1 = await p1.evaluate(async ({ produits, empreinte }) => {
  for (const o of produits) P[o.e] = { ...o }; META.ventes = { days: 365 }; document.querySelector('#seuil').value = 365;
  await document.fonts.load('900 40px InterE'); await document.fonts.load('700 20px InterE');
  const pages = await pagesGondole(produits.map(o => P[o.e]), '');
  return (eval(empreinte))(pages);
}, { produits, empreinte });
// V2
const p2 = await b.newPage(); await p2.goto('http://localhost:8766/v2/'); await p2.waitForSelector('.tuile');
const h2 = await p2.evaluate(async ({ produits, empreinte }) => {
  const m = await import('/v2/js/moteur/etiquettes.js');
  m.configurer({ noms: {}, force: {}, seuil: 365, jours: 365 });
  await document.fonts.load('900 40px InterE'); await document.fonts.load('700 20px InterE');
  const pages = await m.pagesGondole(produits.map(o => ({ ...o })), '');
  return (eval(empreinte))(pages);
}, { produits, empreinte });
console.log('V1', JSON.stringify(h1)); console.log('V2', JSON.stringify(h2));
console.log(JSON.stringify(h1) === JSON.stringify(h2) ? 'IDENTIQUE au pixel près' : 'DIFFÉRENT');
// image de la planche V2 pour contrôle visuel
await p2.evaluate(async ({ produits }) => {
  const m = await import('/v2/js/moteur/etiquettes.js'); const pages = await m.pagesGondole(produits.map(o => ({ ...o })), '');
  const c = pages[0].c; const s = document.createElement('canvas'); s.width = c.width / 3; s.height = c.height / 3; s.getContext('2d').drawImage(c, 0, 0, s.width, s.height);
  window.__img = s.toDataURL('image/png');
}, { produits });
const data = await p2.evaluate(() => window.__img);
(await import('node:fs')).writeFileSync('/home/claude/rendu/planche-v2.png', Buffer.from(data.split(',')[1], 'base64'));
await b.close();
