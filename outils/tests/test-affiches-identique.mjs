import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const produits = [
  { e: '2000000000017', lib: 'TOMATE GRAPPE', prix: 2.99, dep: 'FRUITS ET LEGUMES', q: 300 },
  { e: '2000000000024', lib: 'BANANE', prix: 1.99, dep: 'FRUITS ET LEGUMES', q: 400 },
  { e: '2000000000031', lib: 'SAC OIGNON JAUNE 5KG', prix: 4.5, dep: 'FRUITS ET LEGUMES', q: 90 },
  { e: '2000000000048', lib: 'CORIANDRE BOTTE', prix: 0.8, dep: 'FRUITS ET LEGUMES', q: 500 },
  { e: '2000000000055', lib: 'MANGUE PEROU', prix: null, dep: 'FRUITS ET LEGUMES', q: 50 },
  { e: '3700000000012', lib: 'CLEMENTINE ESPAGNE', prix: 3.49, dep: 'FRUITS ET LEGUMES', q: 210 },
];
const SETF = { '2000000000017': { ori: 'MA' }, '2000000000048': { nom: 'Coriandre fraîche' } };
const empreinte = `async (pages) => { const out = []; for (const p of pages) { const d = p.c.getContext('2d').getImageData(0, 0, p.c.width, p.c.height).data; const h = await crypto.subtle.digest('SHA-256', d); out.push([p.c.width, p.c.height, [...new Uint8Array(h)].slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join('')]); } return out; }`;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p1 = await b.newPage(); await p1.goto('http://localhost:8766/index.html'); await p1.waitForTimeout(1500);
await p1.addScriptTag({ content: 'window.SETF_SET=(k,v)=>{SETF[k]=v}' });
const p2 = await b.newPage(); await p2.goto('http://localhost:8766/v2/'); await p2.waitForSelector('.tuile');
let tout = true;
for (const fmt of ['land', 'list', 'a6', 'caisse']) {
  const v1 = await p1.evaluate(async ({ produits, SETF, empreinte, fmt }) => {
    for (const o of produits) P[o.e] = { ...o }; for (const k in SETF) SETF_SET(k, SETF[k]);
    await document.fonts.load('900 40px InterE'); await document.fonts.load('700 20px InterE');
    const pages = await pagesFL(produits.map(o => P[o.e]), fmt); return (eval(empreinte))(pages);
  }, { produits, SETF, empreinte, fmt });
  const v2 = await p2.evaluate(async ({ produits, SETF, empreinte, fmt }) => {
    const m = await import('/v2/js/moteur/affiches.js'); m.configurer({ SETF, HIST: {} });
    await document.fonts.load('900 40px InterE'); await document.fonts.load('700 20px InterE');
    const pages = await m.pagesFL(produits.map(o => ({ ...o })), fmt); return (eval(empreinte))(pages);
  }, { produits, SETF, empreinte, fmt });
  const ok = JSON.stringify(v1) === JSON.stringify(v2); tout = tout && ok;
  console.log(fmt.padEnd(7), ok ? 'IDENTIQUE' : 'DIFFÉRENT', JSON.stringify(v2).slice(0, 90));
}
console.log(tout ? 'TOUS IDENTIQUES au pixel près' : 'ÉCART');
await b.close();
