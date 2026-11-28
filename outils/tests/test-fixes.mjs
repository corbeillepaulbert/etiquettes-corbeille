import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { monDrive, violations, fichier } from './gas-mock.mjs';
import fs from 'node:fs';
const CLE = 'une-phrase-secrete-tres-longue-pour-le-test';
const { ctx, props, metro, factures } = monDrive();
props.CLE_APPLI = CLE; ctx.installer();
const pdf = fs.readFileSync('/tmp/fac-metro.pdf');
const jour = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
// 1488 vieilles factures importées en bloc : dates anciennes dans le nom, mais création ET modification récentes
const stock = [];
for (let i = 0; i < 1488; i++) {
  const nom = i % 10 === 0 ? `METRO_sans_date_${i}.pdf` : `2024-0${1 + i % 9}-1${i % 9}_METRO_FACTURE_old${i}.pdf`;
  const f = fichier(nom, Buffer.from('%PDF'), { cree: new Date(Date.now() - 400 * 864e5), ro: true });
  f._maj = new Date(Date.now() - 2 * 864e5); // modification récente : ne doit PAS faire passer le filtre
  metro._f.push(f);
  stock.push({ id: f.getId(), type: 'facture', nom, dossier: 'METRO', cree: f.getDateCreated().toISOString(), maj: new Date().toISOString(), url: 'u', etat: 'nouveau' });
}
// 3 récentes : une avec date récente dans le nom, une sans date (création récente), une sans date créée il y a 1 an
const r1 = fichier(`${jour(5)}_METRO_FACTURE_0-0-052-0054-000001.pdf`, pdf, { cree: new Date(Date.now() - 5 * 864e5), ro: true });
const r2 = fichier(`${jour(20)}_PROMOCASH_FACTURE_p1.pdf`, Buffer.from('%PDF'), { cree: new Date(Date.now() - 20 * 864e5), ro: true });
const r3 = fichier(`PROMOCASH sans date ancienne.pdf`, Buffer.from('%PDF'), { cree: new Date(Date.now() - 365 * 864e5), ro: true });
r3._maj = new Date();
metro._f.push(r1, r2, r3);
ctx.ecrireJson('a-traiter.json', { derniere: null, elements: stock }); // l'ancien état, avec ses 1488 éléments
const direct = o => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ cle: CLE, ...o }) } }).texte);
const av = direct({ action: 'aTraiter' });
console.log('SERVEUR aTraiter (stock ancien de 1488) →', av.elements.length, 'éléments');
const rf = direct({ action: 'rafraichir' });
console.log('SERVEUR rafraichir →', rf.elements.length, '|', rf.elements.map(x => x.date + ' ' + x.nom.slice(0, 30)));
const fl = direct({ action: 'factures' });
console.log('SERVEUR factures (liste Choisir) →', fl.factures.length, '|', fl.factures.map(x => x.date));
const URL_EXEC = 'https://script.google.com/macros/s/AKfycbTEST_abc-123/exec';
const out = '/home/claude/rendu/fix';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const c = await b.newContext({ acceptDownloads: true, viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await c.route('https://script.google.com/**', async r => {
  const res = ctx.doPost({ postData: { contents: r.request().postData() } });
  await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: res.texte });
});
await c.addInitScript(() => { if (!localStorage.getItem('cpb_map')) localStorage.setItem('cpb_map', JSON.stringify({ fam: { 'CREATION CAISSE': 9999, 'CREMERIE': 12, 'LIQUIDES': 20 }, sfam: {}, grp: {}, ray: {} })); });
const p = await c.newPage(); const errs = [];
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
let ouvertures = 0; c.on('page', () => ouvertures++);
await p.goto('http://localhost:8766/v2/'); await p.waitForSelector('.tuile');
await p.click('[data-action="reglages"]'); await p.fill('#drv-url', URL_EXEC); await p.fill('#drv-cle', CLE); await p.click('[data-action="relier"]');
await p.waitForSelector('[data-action="delier"]'); await p.click('[data-action="fin-reglages"]');
await p.waitForFunction(() => /produits/.test(document.body.textContent) && /Drive vérifié/.test(document.body.textContent), null, { timeout: 90000 });
await p.waitForTimeout(1500);
// ---- FIX 2b / 2a : À traiter
await p.click('[data-action="a-traiter"]'); await p.waitForSelector('[data-action="rafraichir"]'); await p.waitForTimeout(500);
console.log('APPLI À traiter :', await p.$$eval('.ligne__titre', e => e.length), 'lignes |', await p.$$eval('details summary', e => e.map(x => x.textContent)));
await p.screenshot({ path: out + '-1-atraiter.png' });
await p.click('.ligne__txt[data-action="at-voir"]:has-text("0-0-052")');
await p.waitForSelector('#visionneuse canvas', { timeout: 30000 }); await p.waitForTimeout(800);
console.log('aperçu :', await p.$$eval('#visionneuse canvas', e => e.map(x => `${x.width}x${x.height}`)), '| nouvel onglet :', ouvertures, '| url :', p.url());
await p.screenshot({ path: out + '-2-apercu.png' });
await p.click('[data-vz="plus"]'); await p.waitForTimeout(500);
await p.click('[data-vz="fermer"]'); console.log('fermé :', !(await p.$('#visionneuse')));
// ---- FIX 1 : planche par défaut (produits épicerie)
await p.click('[data-action="accueil"]'); await p.click('[data-action="etiquettes"]'); await p.waitForSelector('#etiq-q');
for (const q of ['pois chiches', 'tropico', 'semoule']) {
  await p.fill('#etiq-q', q); const r = await p.waitForSelector('[data-action="etiq-ajouter"]', { timeout: 5000 }).catch(() => null);
  if (r) { await p.click('[data-action="etiq-ajouter"] >> nth=0'); await p.waitForTimeout(200); }
}
await p.waitForSelector('[data-planche]'); await p.waitForTimeout(800);
console.log('vue par défaut : planche =', !!(await p.$('[data-planche]')), '| étiquette seule =', !!(await p.$('[data-apercu]')), '|', await p.textContent('[data-planche-txt]'));
console.log('canvas planche :', await p.$eval('[data-planche]', c => `${c.width}x${c.height} ratio ${(c.height / c.width).toFixed(4)} (A4 = ${(297 / 210).toFixed(4)})`));
await p.screenshot({ path: out + '-3-planche.png' });
await p.click('[data-action="etiq-vue"][data-v="etiquette"]'); await p.waitForSelector('[data-apercu]');
console.log('Voir l\'étiquette → étiquette =', !!(await p.$('[data-apercu]')), '| planche =', !!(await p.$('[data-planche]')));
await p.screenshot({ path: out + '-4-etiquette.png' });
await p.click('[data-action="etiq-vue"][data-v="planche"]'); await p.waitForSelector('[data-planche]');
// ---- FIX 3 : PDF
await p.click('[data-action="etiq-pdf"]'); await p.waitForSelector('[data-action="etiq-partager"]', { timeout: 60000 });
// cas Mac : navigator.share absent
console.log('navigator.share ici :', await p.evaluate(() => typeof navigator.share));
let [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action="etiq-partager"]')]);
console.log('Mac (pas de share) → téléchargement :', dl.suggestedFilename());
// cas iPhone : navigator.share présent avec fichiers
await p.evaluate(() => { window.__partage = null; navigator.canShare = d => !!(d && d.files); navigator.share = async d => { window.__partage = d.files.map(f => f.name + ':' + f.type + ':' + f.size); }; });
const nb = []; p.on('download', d => nb.push(d.suggestedFilename()));
await p.click('[data-action="etiq-partager"]'); await p.waitForTimeout(600);
console.log('iPhone (share) → feuille de partage :', await p.evaluate(() => window.__partage), '| téléchargements en plus :', nb.length);
// partage refusé par le navigateur (erreur autre qu'annulation) → on télécharge quand même
await p.evaluate(() => { navigator.share = async () => { throw new DOMException('refusé', 'NotAllowedError'); }; });
[dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action="etiq-partager"]')]);
console.log('share refusé → téléchargement :', dl.suggestedFilename());
// annulation par la personne : rien de plus
await p.evaluate(() => { navigator.share = async () => { throw new DOMException('annulé', 'AbortError'); }; }); nb.length = 0;
await p.click('[data-action="etiq-partager"]'); await p.waitForTimeout(500); console.log('annulé → téléchargements :', nb.length);
await p.screenshot({ path: out + '-5-pdf.png' });
console.log('violations lecture seule :', JSON.stringify(violations), '| erreurs :', JSON.stringify(errs));
await b.close();
