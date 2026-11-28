import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { monDrive, violations } from './gas-mock.mjs';
import fs from 'node:fs';
const CLE = 'une-phrase-secrete-tres-longue-pour-le-test';
const { ctx, props } = monDrive(); props.CLE_APPLI = CLE; ctx.installer();
const URL_EXEC = 'https://script.google.com/macros/s/AKfycbTEST_abc-123/exec';
const INCONNU = '3168930010265', INCONNU2 = '5000159407236', CONNU = '3760083882180';
const out = '/home/claude/rendu/inc';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
async function appareil(nom) {
  const c = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  await c.route('https://script.google.com/**', async r => { const res = ctx.doPost({ postData: { contents: r.request().postData() } }); await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: res.texte }); });
  c.off = 0;
  await c.route('https://world.openfoodfacts.org/**', async r => { c.off++; const code = r.request().url().match(/product\/(\d+)/)[1];
    const body = code === INCONNU ? { status: 1, product: { product_name_fr: 'Cristaline eau de source', brands: 'Cristaline', quantity: '1,5 L', image_front_small_url: '' } } : { status: 0 };
    await r.fulfill({ status: code === INCONNU ? 200 : 404, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) }); });
  await c.addInitScript(() => { if (!localStorage.getItem('cpb_map')) localStorage.setItem('cpb_map', JSON.stringify({ fam: { 'CREATION CAISSE': 9999 }, sfam: {}, grp: {}, ray: {} })); });
  const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.goto('http://localhost:8766/v2/'); await p.waitForSelector('.tuile');
  await p.click('[data-action="reglages"]'); await p.fill('#drv-url', URL_EXEC); await p.fill('#drv-cle', CLE); await p.click('[data-action="relier"]');
  await p.waitForSelector('[data-action="delier"]'); await p.fill('#nom-app', nom); await p.click('[data-action="fin-reglages"]');
  await p.waitForFunction(() => /produits/.test(document.body.textContent), null, { timeout: 90000 }); await p.waitForTimeout(1500);
  return p;
}
const taper = async (p, code) => { await p.click('.scan-plein [data-t="taper"]'); await p.fill('.feuille-saisie input', code); await p.click('.feuille-saisie button'); };
const A = await appareil('iPhone gérant');
// scan inconnu en Magasin
await A.click('[data-mode="magasin"]'); await A.click('[data-action="scanner"]'); await A.waitForSelector('.scan-plein'); await taper(A, INCONNU);
await A.waitForSelector('text=Code inconnu', { timeout: 10000 }); await A.waitForTimeout(1600);
console.log('1. écran inconnu :', (await A.textContent('.scr__corps')).replace(/\s+/g, ' ').trim().slice(0, 160));
// scan inconnu dans Étiquettes
await A.click('[data-action="accueil"]'); await A.click('[data-action="etiquettes"]'); await A.click('[data-action="etiq-scanner"]'); await A.waitForSelector('.scan-continu'); await taper(A, INCONNU2); await A.waitForTimeout(400); await A.click('[data-t="fini"]');
await A.click('[data-action="accueil"]'); await A.waitForTimeout(400);
console.log('2. lien accueil :', await A.$$eval('.lien', e => e.map(x => x.textContent)));
await A.click('[data-action="inconnus"]'); await A.waitForSelector('.inc-carte'); await A.waitForTimeout(800);
console.log('3. file :', await A.$$eval('.inc-carte .note', e => e.filter((_, i) => i % 2 === 0).map(x => x.textContent.trim().slice(0, 50))));
await A.click(`[data-action="inc-off"][data-c="${INCONNU}"]`); await A.waitForSelector('.toast');
console.log('4. OpenFoodFacts :', (await A.textContent('.toast')).trim(), '|', (await A.textContent('.inc-carte .titre-3')).trim());
await A.screenshot({ path: out + '-1-file.png' });
await A.click(`[data-action="inc-fiche"][data-c="${INCONNU}"]`); await A.waitForSelector('[data-k="lib"]');
console.log('5. désignation proposée :', await A.inputValue('[data-k="lib"]'), '| département :', await A.inputValue('[data-k="dep"]'));
await A.click('[data-ok]'); console.log('5. sans prix :', (await A.textContent('[data-err]')).trim());
await A.fill('[data-k="prix"]', '0,60'); await A.selectOption('[data-k="dep"]', 'LIQUIDES TAUX REDUIT').catch(async () => console.log('   (LIQUIDES absent)'));
await A.screenshot({ path: out + '-2-fiche.png' }); await A.click('[data-ok]'); await A.waitForSelector('[data-action="inc-import"]');
await A.screenshot({ path: out + '-3-prete.png' });
const [dl] = await Promise.all([A.waitForEvent('download'), A.click('[data-action="inc-import"]')]);
await dl.saveAs('/home/claude/rendu/inc-import.xlsx'); console.log('6. fichier :', dl.suggestedFilename(), '|', (await A.textContent('.toast')).trim().slice(0, 60));
console.log('6. le code est-il maintenant connu ?', await A.evaluate(c => import('/v2/js/donnees.js').then(m => !!m.trouver(c)), INCONNU));
console.log('6. file restante :', await A.$$eval('.inc-carte', e => e.length));
// appareil B : la file arrive par le Drive
const B = await appareil('iPad caisse');
await B.click('[data-action="inconnus"]'); await B.waitForTimeout(2500);
console.log('7. iPad voit :', await B.$$eval('.inc-carte .note', e => e.filter((_, i) => i % 2 === 0).map(x => x.textContent.trim().slice(0, 40))));
// mode caisse sur B
await B.click('[data-action="accueil"]'); await B.click('[data-action="reglages"]');
await B.click('[data-action="caisse-activer"]'); console.log('8. sans PIN responsable :', (await B.textContent('[data-msg-caisse]')).trim());
await B.fill('#cs-nom', 'Ahmed'); await B.fill('#cs-pin', '1234'); await B.click('[data-action="caisse-ajouter"]'); await B.waitForTimeout(300);
await B.fill('#cs-resp', '9999'); await B.click('[data-action="caisse-activer"]'); await B.waitForSelector('[data-action="caisse-scanner"]');
await B.screenshot({ path: out + '-4-caisse.png' });
await B.click('[data-action="caisse-scanner"]'); await B.waitForSelector('.scan-plein'); await taper(B, CONNU); await B.waitForSelector('.caisse-prix', { timeout: 10000 });
console.log('9. connu :', (await B.textContent('.caisse-nom')).trim(), (await B.textContent('.caisse-prix')).trim());
await B.click('[data-action="caisse-scanner"]'); await B.waitForSelector('.scan-plein'); await taper(B, '4006381333931'); await B.waitForSelector('#cs-signe', { timeout: 10000 }); await B.waitForTimeout(500);
await B.screenshot({ path: out + '-5-caisse-inconnu.png' });
await B.fill('#cs-signe', '0000'); await B.click('[data-action="caisse-signaler"]'); await B.waitForTimeout(300); console.log('10. mauvais PIN :', (await B.textContent('.bandeau')).trim());
await B.fill('#cs-signe', '1234'); await B.click('[data-action="caisse-signaler"]'); await B.waitForTimeout(500); console.log('10. bon PIN :', (await B.textContent('.bandeau')).trim());
await B.screenshot({ path: out + '-6-signale.png' });
await B.evaluate(() => { const x = document.createElement('button'); x.dataset.action = 'reglages'; x.id = 'p'; document.querySelector('.scr').appendChild(x); }); await B.click('#p'); await B.waitForTimeout(200);
console.log('11. Réglages forcés en mode caisse → écran :', (await B.textContent('.mode')).trim());
await B.reload(); await B.waitForSelector('.scr'); console.log('11. après relance :', (await B.textContent('.mode')).trim());
await B.click('summary'); await B.fill('#cs-sortie', '1111'); await B.click('[data-action="caisse-quitter"]'); await B.waitForTimeout(200); console.log('12. mauvais PIN responsable :', (await B.textContent('.bandeau')).trim());
await B.click('summary').catch(() => { }); await B.fill('#cs-sortie', '9999'); await B.click('[data-action="caisse-quitter"]'); await B.waitForSelector('.tuile'); console.log('12. sortie → accueil normal');
// A reçoit le signalement de la caisse
await A.click('[data-action="inc-sync"]'); await A.waitForTimeout(1500);
console.log('13. gérant voit :', JSON.stringify(await A.$$eval('.inc-carte', e => e.map(x => x.textContent.replace(/\s+/g, ' ').slice(0, 110)))));
console.log('violations', JSON.stringify(violations), '| erreurs', JSON.stringify([...A.errs, ...B.errs]));
await b.close();
