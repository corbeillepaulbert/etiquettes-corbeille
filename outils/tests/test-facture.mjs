import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { monDrive, violations, fichier } from './gas-mock.mjs';
import fs from 'node:fs';
const CLE = 'une-phrase-secrete-tres-longue-pour-le-test';
const { ctx, props, metro, factures } = monDrive();
props.CLE_APPLI = CLE; ctx.installer();
const pdf = fs.readFileSync('/tmp/fac-metro.pdf');
metro._f.push(fichier('2026-11-14_METRO_FACTURE_0-0-052-0054-000001.pdf', pdf, { cree: new Date(Date.now() - 864e5), ro: true }));
// fournisseurs absents de StorePOS : doivent être masqués
const energie = ctx.DriveApp.getFolderById(factures.getId()); // racine
const autre = fichier('2026-11-15_TOTALENERGIES_FACTURE_9.pdf', Buffer.from('%PDF'), { ro: true });
const autre2 = fichier('2026-11-13_ANTHROPIC_FACTURE_Receipt-1.pdf', Buffer.from('%PDF'), { ro: true });
factures._f.push(autre, autre2);
for (let i = 0; i < 300; i++) metro._f.push(fichier(`2025-0${1 + i % 9}-1${i % 9}_METRO_FACTURE_old${i}.pdf`, Buffer.from('%PDF'), { ro: true }));
for (const d of ['2026-11-10', '2026-10-20', '2026-09-30']) metro._f.push(fichier(`${d}_METRO_FACTURE_r${d}.pdf`, Buffer.from('%PDF'), { ro: true }));
metro._f.push(fichier('2026-11-12_PROMOCASH_FACTURE_p1.pdf', Buffer.from('%PDF'), { ro: true }));
let taille = 0;
const URL_EXEC = 'https://script.google.com/macros/s/AKfycbTEST_abc-123/exec';
const out = '/home/claude/rendu/fac';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const c = await b.newContext({ acceptDownloads: true, viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await c.route('https://script.google.com/**', async r => {
  const res = ctx.doPost({ postData: { contents: r.request().postData() } }); if (/"factures"/.test(r.request().postData())) taille = JSON.parse(res.texte).factures.length;
  await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: res.texte });
});
await c.addInitScript(() => { if (!localStorage.getItem('cpb_map')) localStorage.setItem('cpb_map', JSON.stringify({ fam: { 'CREATION CAISSE': 9999, 'CREMERIE': 12, 'LIQUIDES': 20 }, sfam: { 'LAIT, BOISSONS LACTÉES & ASSIM': 40 }, grp: {}, ray: { 'LINEAIRE VITRINE': 4, 'FRIGO BOISSON': 3 }, four: { METRO: 3 } })); });
const p = await c.newPage(); const errs = [], logs = [];
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); }); p.on('console', m => { if (/À traiter/.test(m.text())) logs.push(m.text()); });
await p.goto('http://localhost:8766/v2/'); await p.waitForSelector('.tuile');
await p.click('[data-action="reglages"]'); await p.fill('#drv-url', URL_EXEC); await p.fill('#drv-cle', CLE); await p.click('[data-action="relier"]');
await p.waitForSelector('[data-action="delier"]'); await p.click('[data-action="fin-reglages"]');
await p.waitForFunction(() => /produits/.test(document.body.textContent) && /Drive vérifié/.test(document.body.textContent), null, { timeout: 90000 });
await p.waitForTimeout(1500);
// 1 — À traiter filtré
await p.evaluate(() => 0);
ctx.rafraichir && 0;
await p.click('[data-action="accueil"]').catch(() => { });
console.log('Inventaire sur l\'accueil ?', !!(await p.$('[data-mode="inventaire"]')), '| tuiles :', await p.$$eval('.tuile b', e => e.map(x => x.textContent)));
// forcer un passage pour que les fichiers du mock arrivent dans À traiter
await ctx.passage15min();
await p.reload(); await p.waitForSelector('.tuile'); await p.waitForTimeout(2500);
await p.screenshot({ path: out + '-1-accueil.png' });
console.log('compteur accueil :', await p.$$eval('.compteur', e => e.map(x => x.textContent)));
await p.click('[data-action="a-traiter"]'); await p.waitForTimeout(500);
console.log('À traiter :', await p.$$eval('.ligne__titre', e => e.map(x => x.textContent)), '|', (await p.$$eval('details summary', e => e.map(x => x.textContent))));
await p.screenshot({ path: out + '-2-atraiter.png' });
console.log('journal :', logs.slice(-2));
// 3 — recherche
await p.click('[data-action="accueil"]'); await p.click('[data-mode="achat"]'); await p.waitForSelector('#rech');
await p.fill('#rech', 'pois chi'); await p.waitForSelector('#rech-res .ligne');
console.log('recherche :', await p.$$eval('#rech-res .ligne__titre', e => e.slice(0, 5).map(x => x.textContent)));
await p.screenshot({ path: out + '-3-recherche.png' });
await p.click('#rech-res .ligne >> nth=0'); await p.waitForTimeout(400);
console.log('fiche ouverte :', (await p.textContent('.scr__corps')).trim().slice(0, 50).replace(/\s+/g, ' '));
await p.screenshot({ path: out + '-3b-fiche.png' });
// 4 — facture
await p.click('[data-action="accueil"]'); await p.click('[data-action="factures"]'); await p.waitForSelector('[data-action="fac-drive"]');
await p.screenshot({ path: out + '-4-entree.png' });
await p.click('[data-action="fac-drive"]'); await p.waitForSelector('[data-action="fac-ouvrir"]', { timeout: 30000 });
console.log('lignes envoyées par le script :', taille, '| écran :', await p.$$eval('.scr__corps h2, [data-action="fac-ouvrir"] .ligne__titre', e => e.map(x => x.textContent)));
await p.screenshot({ path: out + '-5-liste.png' });
await p.click('[data-action="fac-ouvrir"]:has-text("0-0-052")'); await p.waitForTimeout(15000); console.log('ÉCRAN :', (await p.textContent('#app')).replace(/\s+/g,' ').slice(0,300), errs);
await p.waitForSelector('.fac-ligne', { timeout: 60000 });
await p.screenshot({ path: out + '-6-facture.png' });
console.log('entête :', (await p.$$eval('.scr__corps > .note, .scr__corps > h1, .pastilles', e => e.map(x => x.textContent.trim()))).join(' || '));
console.log('lignes :', await p.$$eval('.fac-ligne', e => e.map(x => x.querySelector('.fac-t').textContent.slice(0, 30) + ' → ' + (x.querySelector('.fac-prod')?.textContent || 'NON TROUVÉ').slice(0, 30) + ' | ' + [...x.querySelectorAll('.fac-cell')].map(c => c.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)).slice(2, 5).join(' / '))));
// modifier PV, prendre le suggéré
await p.fill('#pv1', '2,5'); await p.dispatchEvent('#pv1', 'change'); await p.waitForTimeout(300);
const prendre = await p.$('[data-action="fac-prendre"]'); if (prendre) { await prendre.click(); await p.waitForTimeout(300); }
await p.click('[data-action="fac-filtre"][data-f="verifier"]'); await p.waitForTimeout(300);
console.log('à vérifier :', await p.$$eval('.fac-ligne', e => e.length));
await p.screenshot({ path: out + '-7-verifier.png' });
await p.click('[data-action="fac-filtre"][data-f="toutes"]');
await p.screenshot({ path: out + '-8-toutes.png', fullPage: false });
// changer produit sur la ligne non trouvée
const chg = await p.$$('[data-action="fac-changer"]'); await chg[chg.length - 1].click(); await p.fill('#fac-q', 'tropico'); await p.waitForSelector('#fac-res .ligne');
await p.screenshot({ path: out + '-9-choix.png' }); await p.click('#fac-res .ligne >> nth=0'); await p.waitForSelector('.fac-ligne');
// rechargement : la facture en cours revient
await p.reload(); await p.waitForSelector('.tuile'); await p.click('[data-action="factures"]');
console.log('reprendre proposé ?', !!(await p.$('[data-action="fac-reprendre"]')));
// ---- écriture : valider, fichiers à injecter
await p.click('[data-action="fac-reprendre"]'); await p.waitForSelector('.fac-ligne');
console.log('quantités lues :', await p.$$eval('[data-champ="q"]', e => e.map(x => x.value)), '| cases stock cochées :', await p.$$eval('[data-cb="stk"]', e => e.map(x => x.checked)));
await p.fill('#q5', '0'); 
await p.click('[data-action="fac-valider"]'); await p.waitForSelector('text=Facture validée'); await p.waitForTimeout(500);
console.log('validée :', (await p.textContent('.carte')).replace(/\s+/g, ' '));
await p.screenshot({ path: out + '-10-validee.png' });
await p.click('[data-action="fac-fichiers"]'); await p.waitForSelector('[data-action="fac-creer-import"]');
await p.screenshot({ path: out + '-11-fichiers.png', fullPage: true });
console.log('écran fichiers :', (await p.textContent('.scr__corps')).replace(/\s+/g, ' ').slice(0, 700));
await p.evaluate(() => { navigator.canShare = () => false; });
const dl1 = Promise.all([p.waitForEvent('download'), p.click('[data-action="fac-creer-import"]').then(() => p.waitForSelector('[data-action="fac-partager"]')).then(() => p.click('[data-action="fac-partager"]'))]);
const [d1] = await dl1; await d1.saveAs('/tmp/import.xlsx'); console.log('import :', d1.suggestedFilename());
await p.waitForTimeout(6500);
const [d2] = await Promise.all([p.waitForEvent('download'), p.click('[data-action="fac-creer-stock"]').then(() => p.waitForSelector('[data-action="fac-partager"]')).then(() => p.click('[data-action="fac-partager"]'))]);
await d2.saveAs('/tmp/stock.xlsx'); console.log('stock :', d2.suggestedFilename());
await p.screenshot({ path: out + '-12-apres.png', fullPage: true });
await p.click('[data-action="fac-accueil"]'); await p.click('[data-action="accueil"]'); await p.click('[data-action="etiquettes"]'); await p.waitForTimeout(500);
console.log('planche :', await p.$$eval('[data-action="etiq-modifier"] .ligne__titre', e => e.map(x => x.textContent)));
console.log('violations Drive :', violations.length, '| erreurs page :', errs);
await b.close();
