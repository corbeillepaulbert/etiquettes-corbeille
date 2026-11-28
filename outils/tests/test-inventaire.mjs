import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { monDrive, violations } from './gas-mock.mjs';
const CLE = 'une-phrase-secrete-tres-longue-pour-le-test';
const { ctx, props } = monDrive(); props.CLE_APPLI = CLE; ctx.installer();
const post = o => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(o) } }).texte);
const out = '/home/claude/rendu/inv';
// ---- serveur seul
console.log('S1 ping :', JSON.stringify(post({ action: 'ping', cle: CLE })));
console.log('S2 code sans inventaire :', JSON.stringify(post({ action: 'invCode', cle: CLE })));
console.log('S3 entrer sans code :', JSON.stringify(post({ action: 'invEntrer', code: '123456', prenom: 'X' })));
console.log('S4 invLire sans clé :', JSON.stringify(post({ action: 'invLire' })));
const URL_EXEC = 'https://script.google.com/macros/s/AKfycbTEST_abc-123/exec';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errs = [];
async function tel(nom) {
  const c = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await c.route('https://script.google.com/**', async r => { const res = ctx.doPost({ postData: { contents: r.request().postData() } }); await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: res.texte }); });
  await c.route('https://world.openfoodfacts.org/**', r => r.abort());
  const p = await c.newPage(); p.on('pageerror', e => errs.push(nom + ' : ' + e.message)); return { c, p };
}
// ---- gérant
const G = await tel('gérant'), g = G.p;
await g.goto('http://localhost:8766/v2/'); await g.waitForSelector('.tuile');
await g.click('[data-action="reglages"]'); await g.fill('#drv-url', URL_EXEC); await g.fill('#drv-cle', CLE); await g.click('[data-action="relier"]'); await g.waitForSelector('[data-action="delier"]'); await g.click('[data-action="fin-reglages"]');
await g.waitForFunction(() => /produits/.test(document.body.textContent) && !/Aucun produit/.test(document.body.textContent), null, { timeout: 120000 });
await g.click('[data-mode="inventaire"]'); await g.waitForSelector('[data-ecran="inv-preparer"]');
console.log('G1 préparer :', (await g.textContent('.scr__corps')).replace(/\s+/g, ' ').slice(0, 260));
await g.fill('[data-nouvelle="magasin"]', 'Vitrine'); await g.click('[data-action="inv-z-ajouter"][data-parent="magasin"]');
await g.click('[data-action="inv-z-retirer"][data-z="congelo"]'); await g.waitForTimeout(200);
console.log('G2 zones :', await g.evaluate(() => [...document.querySelectorAll('.ligne__titre')].map(x => x.textContent).join(', ')));
await g.screenshot({ path: out + '-1-preparer.png', fullPage: true });
await g.click('[data-action="inv-ouvrir"]'); await g.waitForSelector('[data-ecran="inv-gerant"]', { timeout: 30000 });
await g.click('[data-action="inv-code"]'); await g.waitForSelector('.inv-code');
const code = (await g.textContent('.inv-code')).replace(/\D/g, '');
console.log('G3 code du jour :', code.length, 'chiffres | produits envoyés :', post({ action: 'invProduits', cle: CLE }).produits.length, '| un prix dedans ?', JSON.stringify(post({ action: 'invProduits', cle: CLE }).produits.slice(0, 3)));
await g.screenshot({ path: out + '-2-suivi.png', fullPage: true });
const lien = await g.evaluate(() => import('/v2/js/drive.js').then(m => m.lienInventaire()));
console.log('G4 lien :', lien.replace(/inventaire=.*/, 'inventaire=…'), '| clé dans le lien ?', lien.includes(CLE));
// ---- inventoristes
async function entrer(nom, c = code) {
  const T = await tel(nom), p = T.p;
  await p.goto(lien.replace('https://corbeillepaulbert.github.io/etiquettes-corbeille', 'http://localhost:8766'));
  await p.waitForSelector('[data-ecran="inv-entrer"]');
  await p.fill('#inv-prenom', nom); await p.fill('#inv-code', c); await p.click('[data-action="inv-entrer"]');
  await p.waitForTimeout(1500); return T;
}
const X = await entrer('Ali', code === '000000' ? '111111' : '000000');
console.log('I1 mauvais code :', (await X.p.textContent('.bandeau')).trim());
await X.c.close();
const A = await entrer('Ali'), a = A.p; await a.waitForSelector('[data-ecran="inv-zones"]', { timeout: 20000 }); await a.waitForTimeout(1500);
console.log('I2 Ali zones :', (await a.textContent('.scr__corps')).replace(/\s+/g, ' ').slice(0, 200));
await a.screenshot({ path: out + '-3-zones.png', fullPage: true });
const compter = async (p, e, q, suite = false) => {
  await p.click('[data-action="inv-scanner"]'); await p.click('.scan-plein [data-t="taper"]'); await p.fill('.feuille-saisie input', e); await p.click('.feuille-saisie button');
  await p.waitForSelector('.inv-pave'); for (const ch of String(q)) await p.click(`[data-action="inv-touche"][data-v="${ch}"]`);
  await p.click('[data-action="inv-valider"]:not([data-suite])'); await p.waitForTimeout(300);
};
await a.click('[data-action="inv-zone"][data-z="frigo-boissons"]'); await a.waitForSelector('[data-ecran="inv-compter"]');
await compter(a, '5449000000996', 24);
await a.click('[data-action="inv-scanner"]'); await a.click('.scan-plein [data-t="taper"]'); await a.fill('.feuille-saisie input', '3268630336501'); await a.click('.feuille-saisie button'); await a.waitForSelector('.inv-pave');
for (const ch of '350') await a.click(`[data-action="inv-touche"][data-v="${ch}"]`);
await a.screenshot({ path: out + '-4-pave.png' });
await a.click('[data-action="inv-valider"]:not([data-suite])'); console.log('I3 au-dessus de 200 :', (await a.textContent('.bandeau--alerte')).trim());
await a.click('[data-action="inv-valider"]:not([data-suite])'); await a.waitForTimeout(300);
console.log('I3 Ali derniers :', await a.$$eval('.ligne .ligne__titre', e => e.map(x => x.textContent)), '| toast :', (await a.textContent('.toast')).trim());
await a.click('.toast button'); await a.waitForTimeout(300);
console.log('I4 après Annuler :', await a.$$eval('.ligne', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim())));
await a.waitForTimeout(11000); // paquet envoyé
const S = await entrer('Sami'), s = S.p; await s.waitForSelector('[data-ecran="inv-zones"]', { timeout: 20000 }); await s.waitForTimeout(1500);
await s.click('[data-action="inv-zone"][data-z="frigo-boissons"]');
await s.click('[data-action="inv-scanner"]'); await s.click('.scan-plein [data-t="taper"]'); await s.fill('.feuille-saisie input', '5449000000996'); await s.click('.feuille-saisie button'); await s.waitForSelector('.inv-pave');
console.log('I5 Sami voit :', (await s.textContent('.bandeau')).trim());
for (const ch of '16') await s.click(`[data-action="inv-touche"][data-v="${ch}"]`); await s.click('[data-action="inv-valider"]:not([data-suite])'); await s.waitForTimeout(300);
await S.c.setOffline(true);
await s.click('[data-action="inv-zones"]'); await s.click('[data-action="inv-zone"][data-z="reserve-haut"]');
await compter(s, '5449000000996', 30);
await s.waitForTimeout(500); console.log('I6 hors ligne :', (await s.textContent('.bandeau')).trim());
await S.c.setOffline(false); await s.evaluate(() => window.dispatchEvent(new Event('online'))); await s.waitForTimeout(12000);
console.log('I6 reconnecté :', await s.evaluate(() => import('/v2/js/comptage.js').then(m => m.enAttente())), 'en attente');
// Ali corrige le 24 en 18, puis finit
await a.click('[data-action="inv-corriger"] >> nth=0'); await a.waitForSelector('.inv-pave');
await a.click('[data-action="inv-touche"][data-v="<"]'); await a.click('[data-action="inv-touche"][data-v="<"]'); for (const ch of '18') await a.click(`[data-action="inv-touche"][data-v="${ch}"]`);
await a.click('[data-action="inv-valider"]:not([data-suite])'); await a.waitForTimeout(300);
await a.click('[data-action="inv-finie"]'); await a.waitForTimeout(11500);
// action interdite
await a.evaluate(() => { const x = document.createElement('button'); x.dataset.action = 'reglages'; x.id = 'piege'; document.getElementById('app').appendChild(x); });
await a.click('#piege'); await a.waitForTimeout(300); console.log('I7 Réglages forcés → écran :', await a.evaluate(() => document.querySelector('[data-ecran]')?.dataset.ecran));
// gérant : suivi
await g.click('[data-action="accueil"] >> nth=-1'); await g.click('[data-mode="inventaire"]'); await g.waitForTimeout(3000);
console.log('G5 suivi :', (await g.textContent('.scr__corps')).replace(/\s+/g, ' ').slice(0, 520));
await g.screenshot({ path: out + '-5-suivi.png', fullPage: true });
const tot = await g.evaluate(() => Promise.all([import('/v2/js/comptage.js'), import('/v2/js/inv-calcul.js')]).then(([c, k]) => ({ t: k.totaux(c.toutesLignes()), z: k.parZone(c.toutesLignes()).map(r => `${r.z} ${r.e} ${r.q}${r.ecart ? ' ÉCART ' + JSON.stringify(r.parQui) : r.recompte ? ' confirmé' : ''}`) })));
console.log('G6 calcul :', JSON.stringify(tot));
// fermeture
await g.click('[data-action="inv-fermer"]'); await g.click('[data-action="inv-fermer"]'); await g.waitForTimeout(1500);
console.log('G7 fermé :', (await g.textContent('.bandeau')).trim());
await a.waitForTimeout(12000);
console.log('I8 Ali après fermeture :', (await a.textContent('h1')).trim(), '| base :', await a.evaluate(() => new Promise(r => { const q = indexedDB.open('corbeille-v2'); q.onsuccess = () => { const t = q.result.transaction('kv').objectStore('kv').count(); t.onsuccess = () => r(t.result); }; })));
console.log('fichiers APPLI V2 :', ctx.DriveApp.getFoldersByName('APPLI ETIQUETTES CORBEILLE').next().getFoldersByName('APPLI V2').next()._f.map(f => f.getName()).filter(n => /inv/.test(n)));
console.log('violations :', violations, '| erreurs :', errs);
await b.close();
