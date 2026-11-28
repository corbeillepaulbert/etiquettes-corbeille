import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const out = '/home/claude/rendu/etiq';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const c = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8766/v2/'); await p.waitForSelector('.tuile');
await p.click('#app [data-action="donnees"]'); await p.waitForSelector('[data-fichiers]', { state: 'attached' });
await p.setInputFiles('[data-fichiers]', ['/home/claude/data/produits.xlsx', '/home/claude/data/ventes.xlsx']);
await p.waitForSelector('.toast', { state: 'attached', timeout: 90000 });
await p.click('#app [data-action="accueil"]'); await p.screenshot({ path: out + '-1-accueil.png' });
// Magasin : plus de caméra d'office
await p.click('[data-mode="magasin"]'); await p.waitForTimeout(300);
console.log('Magasin ouvre la caméra ?', !!(await p.$('.scan-plein')), '|', (await p.textContent('.scr__corps')).trim().slice(0, 60));
await p.click('#app [data-action="accueil"]');
// Étiquettes
await p.click('[data-action="etiquettes"]'); await p.waitForSelector('#etiq-q');
console.log('Étiquettes ouvre la caméra ?', !!(await p.$('.scan-plein')));
await p.screenshot({ path: out + '-2-vide.png' });
await p.fill('#etiq-q', 'pois chiches'); await p.waitForSelector('[data-action="etiq-ajouter"]');
console.log('résultats :', await p.$$eval('[data-res] .ligne__titre', e => e.slice(0, 3).map(x => x.textContent)));
await p.click('[data-action="etiq-ajouter"] >> nth=0'); await p.waitForTimeout(200);
// scan en continu (saisie), avec un doublon, un F&L et un inconnu
await p.click('[data-action="etiq-scanner"]'); await p.waitForSelector('.scan-continu');
await p.click('.scan-plein [data-t="taper"]');
for (const code of ['3700671750040', '3700671750040', '7622210449283', '3580281510070', '1234567890128', '5449000051981']) {
  await p.fill('.feuille-saisie input', code); await p.click('.feuille-saisie button'); await p.waitForTimeout(code === '3700671750040' ? 2600 : 150);
}
console.log('scan continu :', await p.$$eval('.scan-continu__ligne', e => e.map(x => x.textContent)));
await p.screenshot({ path: out + '-3-scan.png' });
await p.click('[data-t="fini"]'); await p.waitForSelector('[data-action="etiq-pdf"]'); await p.waitForTimeout(600);
await p.screenshot({ path: out + '-4-planche.png', fullPage: false });
// modifier le nom et le modèle
await p.click('[data-action="etiq-modifier"] >> nth=0'); await p.fill('[data-nom]', 'POIS CHICHES BARCO 1KG'); await p.click('[data-modele="top"]');
await p.screenshot({ path: out + '-5-modifier.png' });
await p.click('[data-ok]'); await p.waitForTimeout(400);
console.log('lignes :', await p.$$eval('[data-action="etiq-modifier"] .ligne__titre', e => e.map(x => x.textContent)), await p.$$eval('[data-action="etiq-modifier"] .ligne__detail', e => e.map(x => x.textContent)));
// PDF
const t0 = Date.now(); await p.click('[data-action="etiq-pdf"]'); await p.waitForSelector('[data-action="etiq-enregistrer"]', { timeout: 60000 });
console.log('PDF en', Date.now() - t0, 'ms :', await p.textContent('.carte .note'));
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action="etiq-enregistrer"]')]);
await dl.saveAs('/home/claude/rendu/etiq-test.pdf'); console.log('fichier :', dl.suggestedFilename());
await p.screenshot({ path: out + '-6-pdf.png' });
// vider puis annuler
await p.click('[data-action="etiq-vider"]'); await p.click('.toast .btn'); await p.waitForTimeout(300);
console.log('après Annuler :', await p.$$eval('[data-action="etiq-modifier"]', e => e.length), 'étiquettes ; historique :', await p.$$eval('[data-action="etiq-reprendre"]', e => e.length));
console.log('erreurs', JSON.stringify(errs));
await b.close();
