import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { monDrive, violations, fichier } from './gas-mock.mjs';
import fs from 'node:fs';
const CLE = 'une-phrase-secrete-tres-longue-pour-le-test';
const { ctx, props, metro, factures } = monDrive(); props.CLE_APPLI = CLE;
metro._f.push(fichier('2026-11-14_ENVOYE PAR MOI_FACTURE_2026-11-15_METRO_FACTURE_0-0-052-0052-041311.pdf', fs.readFileSync('/home/claude/data/factures/metro-2026-08-15.pdf'), { cree: new Date(Date.now() - 4 * 864e5), ro: true }));
factures._f.push(fichier('2026-11-20_AGRIFRESH_BL_Bon_de_livraison___131923.pdf', fs.readFileSync('/home/claude/data/factures/agrifresh-2026-11-20.pdf'), { cree: new Date(Date.now() - 864e5), ro: true }));
ctx.installer();
const URL_EXEC = 'https://script.google.com/macros/s/AKfycbTEST_abc-123/exec', out = '/home/claude/rendu/cor';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const c = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
const appels = []; let casse = false;
await c.route('https://script.google.com/**', async r => { const corps = r.request().postData(); const act = JSON.parse(corps).action; appels.push(act);
  if (casse && act === 'traiter') return r.abort('failed');
  const res = ctx.doPost({ postData: { contents: corps } }); await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: res.texte }); });
const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8766/v2/'); await p.waitForSelector('.tuile');
await p.click('[data-action="reglages"]'); await p.fill('#drv-url', URL_EXEC); await p.fill('#drv-cle', CLE); await p.click('[data-action="relier"]'); await p.waitForSelector('[data-action="delier"]');
await p.click('[data-action="tester-script"]'); await p.waitForSelector('[data-msg-test] .bandeau'); console.log('0.', (await p.textContent('[data-msg-test]')).trim());
await p.click('[data-action="fin-reglages"]');
await p.waitForFunction(() => /produits/.test(document.body.textContent), null, { timeout: 120000 }); await p.waitForTimeout(3000);
console.log('1. accueil tuiles :', await p.$$eval('.tuile b', e => e.map(x => x.textContent)));
await p.screenshot({ path: out + '-1-accueil.png' });
// facture Metro réelle via À traiter
await p.click('[data-action="a-traiter"]'); await p.waitForSelector('.at-carte');
let t0 = Date.now(); await p.click('.at-carte:has-text("15 novembre") [data-action="at-voir"]'); await p.waitForSelector('#visionneuse canvas', { timeout: 30000 });
console.log('2. aperçu en', Date.now() - t0, 'ms ; appels facture :', appels.filter(a => a === 'facture').length);
const w0 = await p.$eval('#visionneuse canvas', x => x.style.width); await p.mouse.move(180, 400); await p.keyboard.down('Control'); await p.mouse.wheel(0, -200); await p.keyboard.up('Control'); await p.waitForTimeout(800);
console.log('2. zoom : largeur', w0, '→', await p.$eval('#visionneuse canvas', x => x.style.width));
await p.click('[data-vz="lire"]'); t0 = Date.now(); await p.waitForSelector('.fac-ligne', { timeout: 60000 });
console.log('3. lecture en', Date.now() - t0, 'ms ; appels facture :', appels.filter(a => a === 'facture').length, '(1 = pas de 2e téléchargement)');
console.log('3. lignes :', await p.$$eval('.fac-ligne', e => e.filter(x => /PRINCE|NECTAR|LABEN/i.test(x.textContent)).map(x => x.textContent.replace(/\s+/g, ' ').slice(0, 170))));
await p.screenshot({ path: out + '-3-facture.png' });
// valider avec un Drive qui ne répond pas sur « traiter »
casse = true; await p.click('[data-action="fac-valider"]'); await p.waitForTimeout(1500);
await p.click('[data-action="accueil"]').catch(() => { }); await p.click('[data-action="a-traiter"]'); await p.waitForSelector('.at-on');
console.log('4. Drive muet : onglets', await p.$$eval('.at-on', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' / ')));
casse = false; await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await p.click('[data-action="rafraichir"]'); await p.waitForTimeout(2500);
const srv = ctx.lireATraiter().elements.filter(x => x.etat === 'traite').length;
console.log('4. après retour du Drive : onglets', await p.$$eval('.at-on', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' / ')), '| traitées côté Drive :', srv);
// affiches depuis Agrifresh
await p.click('[data-action="accueil"]'); await p.click('[data-action="affiches"]'); await p.click('[data-action="af-agrifresh"]'); await p.waitForSelector('[data-action="af-lire"]', { timeout: 30000 });
console.log('5. factures Agrifresh :', await p.$$eval('[data-action="af-lire"] .ligne__titre', e => e.map(x => x.textContent)));
await p.click('[data-action="af-lire"] >> nth=0'); await p.waitForSelector('[data-action="af-modifier"]', { timeout: 60000 });
console.log('5. affiches :', (await p.textContent('.toast')).trim().slice(0, 50), '|', await p.$$eval('[data-action="af-modifier"] .ligne__detail', e => e.slice(0, 5).map(x => x.textContent)), '|', await p.$$eval('.bandeau--alerte span', e => e.map(x => x.textContent.slice(0, 80))));
await p.screenshot({ path: out + '-5-affiches.png' });
// étiquettes : défilement
await p.click('[data-action="accueil"]'); await p.click('[data-action="etiquettes"]');
for (const q of ['pois chiches', 'tropico', 'semoule']) { await p.fill('#etiq-q', q); await p.waitForSelector('[data-action="etiq-ajouter"]'); await p.click('[data-action="etiq-ajouter"] >> nth=0'); await p.waitForTimeout(150); }
await p.click('[data-action="etiq-vue"][data-v="etiquette"]'); await p.waitForSelector('.etiq-nav');
const swipe = async dx => { const bb = await p.$eval('[data-apercu]', x => { const r = x.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await p.evaluate(({ bb, dx }) => { const el = document.querySelector('[data-apercu]'); const T = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: bb.y });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [T(bb.x)], changedTouches: [T(bb.x)], bubbles: true })); el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [T(bb.x + dx)], bubbles: true })); }, { bb, dx }); await p.waitForTimeout(300); };
console.log('6. étiquette :', (await p.textContent('.etiq-nav .note')).trim()); await swipe(-120); console.log('6. après glissé à gauche :', (await p.textContent('.etiq-nav .note')).trim()); await swipe(-120); await swipe(120); console.log('6. puis droite :', (await p.textContent('.etiq-nav .note')).trim());
await p.screenshot({ path: out + '-6-etiquette.png' });
console.log('violations', JSON.stringify(violations), '| erreurs', JSON.stringify(errs));
await b.close();
