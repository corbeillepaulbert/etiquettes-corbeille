import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { monDrive, violations } from './gas-mock.mjs';
const CLE = 'une-phrase-secrete-tres-longue-pour-le-test';
const { ctx, props, metro } = monDrive();
props.CLE_APPLI = CLE;
ctx.installer();
const appelDirect = o => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(o) } }).texte);
console.log('mauvaise clé :', JSON.stringify(appelDirect({ action: 'ping', cle: 'faux' })));
const URL_EXEC = 'https://script.google.com/macros/s/AKfycbTEST_abc-123/exec';
const out = '/home/claude/rendu/drive';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
async function appareil(nom) {
  const c = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await c.route('https://script.google.com/**', async r => {
    const res = ctx.doPost({ postData: { contents: r.request().postData() } });
    await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: res.texte });
  });
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.errs = errs;
  await p.goto('http://localhost:8766/v2/'); await p.waitForSelector('.tuile'); return p;
}
const A = await appareil('A');
// relier
await A.click('[data-action="reglages"]');
await A.fill('#drv-cle', 'trop-courte'); await A.fill('#drv-url', URL_EXEC); await A.click('[data-action="relier"]');
await A.waitForSelector('[data-msg-drive] .bandeau'); console.log('clé courte :', await A.textContent('[data-msg-drive]'));
await A.fill('#drv-cle', CLE); await A.fill('#nom-app', 'iPhone du magasin'); await A.click('[data-action="relier"]');
await A.waitForSelector('[data-action="delier"]'); await A.screenshot({ path: out + '-1-reglages.png' });
await A.fill('#nom-app', 'iPhone du magasin'); await A.click('[data-action="fin-reglages"]');
// exports pris tout seuls
await A.waitForFunction(() => /produits/.test(document.body.textContent) && /Drive vérifié/.test(document.body.textContent), null, { timeout: 60000 });
console.log('accueil :', (await A.textContent('.note')).trim());
await A.screenshot({ path: out + '-2-accueil.png' });
// À traiter + nouvelle facture + rafraîchir maintenant
await A.click('[data-action="a-traiter"]'); await A.waitForSelector('[data-action="rafraichir"]');
console.log('à traiter :', await A.$$eval('.ligne__titre', e => e.map(x => x.textContent)));
const f = { getId: () => 'nouvelle', getName: () => 'METRO 2026-11-17.pdf', getDateCreated: () => new Date(), getLastUpdated: () => new Date(), getMimeType: () => 'pdf', getSize: () => 4, getBlob: () => ({}) };
metro._f.push(f);
await A.click('[data-action="rafraichir"]'); await A.waitForSelector('.toast');
console.log('après rafraîchir :', await A.textContent('.toast'), await A.$$eval('.ligne__titre', e => e.map(x => x.textContent)));
await A.screenshot({ path: out + '-3-atraiter.png' });
await A.click('[data-action="traite"] >> nth=0'); await A.waitForSelector('.toast');
console.log('traitée :', await A.textContent('.toast'), '| par :', await A.$$eval('.ligne__detail', e => e.map(x => x.textContent).filter(t => /traitée par/.test(t))));
await A.screenshot({ path: out + '-4-traitee.png' });
// liste partagée entre deux appareils, sans écrasement
async function accueilPuis(p, a) { if (await p.$('#app [data-action="accueil"]')) await p.click('#app [data-action="accueil"]'); await p.click(`[data-action="${a}"]`); }
async function ajouter(p, code) {
  if (await p.$('#app [data-action="accueil"]')) await p.click('#app [data-action="accueil"]'); await p.click('[data-mode="achat"]'); await p.waitForSelector('#rech'); await p.click('.scr__bas [data-action="scanner"]'); await p.waitForSelector('.scan-plein');
  await p.click('.scan-plein [data-t="taper"]'); await p.fill('.feuille-saisie input', code); await p.click('.feuille-saisie button');
  await p.waitForSelector('[data-action="ajouter"]'); await p.click('[data-action="ajouter"]'); await p.waitForTimeout(3800);
}
try { await ajouter(A, '4040328033096'); } catch (x) { await A.screenshot({ path: out + '-debug.png' }); console.log('DEBUG', (await A.textContent('body')).slice(0, 400), A.errs); process.exit(1); }
const B = await appareil('B');
await B.click('[data-action="reglages"]'); await B.fill('#drv-url', URL_EXEC); await B.fill('#drv-cle', CLE); await B.click('[data-action="relier"]'); await B.waitForSelector('[data-action="delier"]');
await B.click('[data-action="fin-reglages"]'); await B.waitForFunction(() => /Drive vérifié/.test(document.body.textContent), null, { timeout: 60000 });
await ajouter(B, '4028900004504');
await ajouter(A, '4040328039180');
await accueilPuis(A, 'liste'); await A.waitForTimeout(4500);
const listeA = await A.$$eval('.ligne__titre', e => e.map(x => x.textContent));
await accueilPuis(B, 'liste'); await B.waitForTimeout(4500);
const listeB = await B.$$eval('.ligne__titre', e => e.map(x => x.textContent));
console.log('liste A :', listeA); console.log('liste B :', listeB);
// suppression sur B, propagée à A
await B.click('[data-action="retirer"] >> nth=0'); await B.waitForTimeout(3800);
await accueilPuis(A, 'liste'); await A.waitForTimeout(4500);
console.log('liste A après retrait sur B :', await A.$$eval('.ligne__titre', e => e.map(x => x.textContent)));
await A.screenshot({ path: out + '-5-liste.png' });
console.log('violations lecture seule :', JSON.stringify(violations));
console.log('erreurs page :', JSON.stringify([...A.errs, ...B.errs]));
console.log('fichiers APPLI V2 :', JSON.stringify(Object.keys(props)));
await b.close();
