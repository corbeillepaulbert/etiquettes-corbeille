import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { monDrive, violations, fichier } from './gas-mock.mjs';
import fs from 'node:fs';
const CLE = 'une-phrase-secrete-tres-longue-pour-le-test';
const { ctx, props } = monDrive(); props.CLE_APPLI = CLE;
const exp = ctx.DriveApp.getFoldersByName('EXPORTS STOREPOS').next();
for (const n of ['EXPORT_PLU_23_03_23_20_04_23.xlsx', 'EXPORT_PLU_11_03_24_09_04_24.xlsx', 'EXPORT_PLU_01_03_25_29_03_25.xlsx', 'EXPORT_PLU_23_10_26_19_11_26.xlsx'])
  exp._f.push(fichier(n, fs.readFileSync('/home/claude/data/' + n), { ro: true }));
ctx.installer();
const URL_EXEC = 'https://script.google.com/macros/s/AKfycbTEST_abc-123/exec', out = '/home/claude/rendu/ram';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
async function page(dateFausse) {
  const c = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await c.route('https://script.google.com/**', async r => { const res = ctx.doPost({ postData: { contents: r.request().postData() } }); await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: res.texte }); });
  const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  if (dateFausse) await p.clock.setFixedTime(new Date(dateFausse));
  await p.goto('http://localhost:8766/v2/'); await p.waitForSelector('.tuile');
  await p.locator('[data-action="reglages"]').scrollIntoViewIfNeeded(); await p.click('[data-action="reglages"]'); await p.fill('#drv-url', URL_EXEC); await p.fill('#drv-cle', CLE); await p.click('[data-action="relier"]'); await p.waitForSelector('[data-action="delier"]'); await p.click('[data-action="fin-reglages"]');
  await p.waitForFunction(() => /produits/.test(document.body.textContent), null, { timeout: 150000 }); await p.waitForTimeout(6000);
  return p;
}
const p = await page();
console.log('0. périodes :', await p.evaluate(() => import('/v2/js/donnees.js').then(async m => Object.keys(await m.lirePeriodes()))));
console.log('1. tuile Ramadan à J-80 ?', !!(await p.$('[data-action="ramadan"].tuile')));
await p.click('[data-mode="achat"]'); await p.click('[data-action="ramadan"]'); await p.waitForSelector('.ram-entete');
console.log('2. entête :', (await p.textContent('.ram-entete')).replace(/\s+/g, ' ').trim());
console.log('2. exports :', await p.$$eval('.exp-ligne', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim())));
console.log('2. demande :', (await p.textContent('.exp-carte .note')).trim());
console.log('3. intro :', (await p.textContent('.scr__corps > .note')).trim().slice(0, 140));
console.log('3. produits :', await p.$$eval('.ram-ligne', e => e.length), await p.$$eval('.ram-ligne', e => e.slice(0, 4).map(x => x.querySelector('.ligne__titre').textContent + ' | ' + x.querySelector('.ligne__detail').textContent + ' | ' + x.querySelector('.ram-histo').textContent + ' | qte ' + x.querySelector('.cons-qte b').textContent)));
console.log('3. date courte :', await p.$$eval('.ram-ligne .cons-dluo', e => e.slice(0, 2).map(x => x.closest('.ram-ligne').querySelector('.ligne__titre').textContent + ' : ' + x.textContent)));
await p.screenshot({ path: out + '-1.png' });
await p.evaluate(() => document.querySelector('.ram-ligne').scrollIntoView()); await p.screenshot({ path: out + '-2.png' });
await p.click('[data-action="ram-tout"]'); await p.waitForTimeout(500); console.log('4.', (await p.textContent('.toast')).trim().slice(0, 70));
console.log('erreurs', JSON.stringify(p.errs));
// à J-25 : tuile sur l'accueil
const q = await page('2027-01-14T10:00:00');
console.log('5. au 14/01/2027 tuile :', await q.$eval('[data-action="ramadan"].tuile', x => x.textContent.replace(/\s+/g, ' ').trim()).catch(() => 'ABSENTE'));
await q.screenshot({ path: out + '-3-accueil.png' });
console.log('violations', JSON.stringify(violations), '| erreurs', JSON.stringify(q.errs));
await b.close();
