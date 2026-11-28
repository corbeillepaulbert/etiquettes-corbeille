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
const r1 = fichier(`${jour(1)}_METRO_FACTURE_0-0-052-0054-000001.pdf`, pdf, { cree: new Date(Date.now() - 1 * 864e5), ro: true });
const r2 = fichier(`${jour(9)}_AGRIFRESH_FACTURE_p1.pdf`, pdf, { cree: new Date(Date.now() - 9 * 864e5), ro: true });
const r3 = fichier(`PROMOCASH sans date ancienne.pdf`, Buffer.from('%PDF'), { cree: new Date(Date.now() - 365 * 864e5), ro: true });
r3._maj = new Date();
metro._f.push(r1, r2, r3);
metro._f.filter(f => /^METRO 2026-1/.test(f.getName())).forEach(f => { f._c = pdf; });
ctx.ecrireJson('a-traiter.json', { derniere: null, elements: stock });
// 3 factures de plus (lisibles) pour essayer la limite de 3 « En cours »
const extra = [3, 4, 5].map(n => { const f = fichier(`${jour(n)}_METRO_FACTURE_x${n}.pdf`, pdf, { cree: new Date(Date.now() - n * 864e5), ro: true }); metro._f.push(f); return f; }); // l'ancien état, avec ses 1488 éléments
const direct = o => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ cle: CLE, ...o }) } }).texte);
const av = direct({ action: 'aTraiter' });
console.log('SERVEUR aTraiter (stock ancien de 1488) →', av.elements.length, 'éléments');
const rf = direct({ action: 'rafraichir' });
console.log('SERVEUR rafraichir →', rf.elements.length, '|', rf.elements.map(x => x.date + ' ' + x.nom.slice(0, 30)));
const fl = direct({ action: 'factures' });
console.log('SERVEUR factures (liste Choisir) →', fl.factures.length, '|', fl.factures.map(x => x.date));

console.log('PING :', JSON.stringify(direct({ action: 'ping' })));
const rf0 = direct({ action: 'rafraichir' });
console.log('SERVEUR rafraichir →', rf0.elements.length, 'éléments (1488 anciens purgés) ; dates :', rf0.elements.map(x => x.date).join(' '));
const URL_EXEC = 'https://script.google.com/macros/s/AKfycbTEST_abc-123/exec';
const out = '/home/claude/rendu/lot';
let casse = false; const appels = [];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
async function appareil(w, h = 812) {
  const c = await b.newContext({ acceptDownloads: true, viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 600, hasTouch: w < 600 });
  await c.route('https://script.google.com/**', async r => {
    const corps = r.request().postData(); const act = (JSON.parse(corps).action); appels.push(act);
    if (casse && act === 'aTraiter') return r.fulfill({ status: 500, body: 'boom', headers: { 'Access-Control-Allow-Origin': '*' } });
    const res = ctx.doPost({ postData: { contents: corps } });
    await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: res.texte });
  });
  await c.addInitScript(() => { if (!localStorage.getItem('cpb_map')) localStorage.setItem('cpb_map', JSON.stringify({ fam: { 'CREATION CAISSE': 9999, 'CREMERIE': 12, 'LIQUIDES': 20 }, sfam: {}, grp: {}, ray: {} })); });
  const p = await c.newPage(); p.logs = []; p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (/V2\//.test(m.text())) p.logs.push(m.type() + ' ' + m.text()); else if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) p.errs.push(m.text()); });
  await p.goto('http://localhost:8766/v2/'); await p.waitForSelector('.tuile'); return p;
}
const p = await appareil(375);
// ---- Réglages : relier puis tester le script
await p.click('[data-action="reglages"]'); await p.fill('#drv-url', URL_EXEC); await p.fill('#drv-cle', CLE); await p.click('[data-action="relier"]');
await p.waitForSelector('[data-action="tester-script"]');
await p.click('[data-action="tester-script"]'); await p.waitForSelector('[data-msg-test] .bandeau');
console.log('TEST SCRIPT (ok) :', (await p.textContent('[data-msg-test]')).trim());
await p.screenshot({ path: out + '-0-reglages.png' });
// script ancien : ping qui répond version 2
await p.route('https://script.google.com/**', async r => { if (/"ping"/.test(r.request().postData())) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"ok":true,"version":2}' }); r.fallback(); });
await p.click('[data-action="tester-script"]'); await p.waitForFunction(() => /ancien/.test(document.querySelector('[data-msg-test]').textContent));
console.log('TEST SCRIPT (ancien) :', (await p.textContent('[data-msg-test]')).trim());
await p.unroute('https://script.google.com/**');
await p.click('[data-action="fin-reglages"]');
await p.waitForFunction(() => /produits/.test(document.body.textContent) && /Drive vérifié/.test(document.body.textContent), null, { timeout: 90000 });
// ---- À traiter
await p.click('[data-action="a-traiter"]'); await p.waitForSelector('.at-carte');
console.log('1. onglets :', await p.$$eval('.at-on', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim())));
console.log('1. cartes :', await p.$$eval('.at-carte', e => e.map(c => [c.querySelector('.at-four').textContent, c.querySelector('.at-date').textContent, c.querySelector('.at-badge').textContent, c.className.split(' ')[1], c.querySelector('.at-sous')?.textContent || '', c.querySelector('.at-infos').textContent].join(' | '))));
const txt = await p.textContent('#app'); console.log('nom de fichier visible ?', /\.pdf|FACTURE_|0-0-052/i.test(txt));
await p.screenshot({ path: out + '-1-premier-affichage.png' });
// montants : cache vide → première lecture en fond
await p.waitForFunction(() => [...document.querySelectorAll('.at-mt')].some(x => x.textContent !== '—'), null, { timeout: 60000 });
await p.waitForTimeout(3000);
console.log('2. après lecture en fond :', await p.$$eval('.at-carte', e => e.map(c => c.querySelector('.at-four').textContent + ' ' + c.querySelector('.at-infos').textContent)));
const caches = () => { const d = ctx.dossierCache(); const it = d.getFiles(); const r = []; while (it.hasNext()) { const f = it.next(); r.push(f.getName().slice(0, 8) + ' ' + f.getBlob().getDataAsString()); } return r; };
console.log('2. fichiers FACTURES_CACHE :', caches());
await p.screenshot({ path: out + '-2-montants.png' });
// nouvelle ouverture de l'appli : le montant vient du cache (aucune relecture de PDF)
await p.reload(); await p.waitForSelector('.tuile'); appels.length = 0;
await p.click('[data-action="a-traiter"]'); await p.waitForSelector('.at-carte');
await p.waitForFunction(() => document.querySelectorAll('.at-mt').length && [...document.querySelectorAll('.at-mt')].filter(x => x.textContent !== '—').length >= 2, null, { timeout: 30000 });
await p.waitForTimeout(1500);
console.log('3. rechargement : appels', JSON.stringify(appels), '| « facture » (PDF relus) =', appels.filter(a => a === 'facture').length);
// empreinte : le PDF change → cache refusé
const f1 = extra[0]; const avant = direct({ action: 'cacheLire', ids: [f1.getId()] });
f1._maj = new Date(Date.now() + 1000); direct({ action: 'rafraichir' });
const apres = direct({ action: 'cacheLire', ids: [f1.getId()] });
console.log('3. empreinte : avant', JSON.stringify(Object.keys(avant.cache)), '→ après modification du PDF', JSON.stringify(Object.keys(apres.cache)));
// ---- En cours : 3 maximum
await p.reload(); await p.waitForSelector('.tuile'); await p.click('[data-action="a-traiter"]'); await p.waitForSelector('.at-carte');
const ouvrirEtRevenir = async nth => {
  await p.click(`.at-traiter >> nth=${nth}`); await p.waitForSelector('.fac-ligne', { timeout: 60000 });
  await p.click('[data-action="accueil"]').catch(() => { }); await p.click('[data-action="a-traiter"]'); await p.waitForSelector('.at-carte');
};
const ordre = await p.$$eval('.at-traiter', e => e.length);
for (let i = 0; i < 4; i++) {
  await p.click('.at-traiter >> nth=0'); await p.waitForSelector('.fac-ligne', { timeout: 60000 });
  const toast = await p.$('.toast') ? (await p.textContent('.toast')).trim() : '';
  if (toast) console.log(`4. ouverture n°${i + 1} → toast :`, toast);
  await p.click('[data-action="accueil"]').catch(() => { }); await p.click('[data-action="a-traiter"]'); await p.waitForSelector('.at-carte, .carte');
  console.log(`4. après n°${i + 1} :`, await p.$$eval('.at-on', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' / ')));
}
await p.click('[data-action="at-onglet"][data-o="cours"]'); await p.waitForTimeout(300);
console.log('4. onglet En cours :', await p.$$eval('.at-carte', e => e.map(c => c.querySelector('.at-four').textContent + ' ' + c.querySelector('.at-date').textContent + ' [' + c.querySelector('.at-traiter').textContent + ']')));
await p.screenshot({ path: out + '-4-en-cours.png' });
// Reprendre sans relire le PDF
appels.length = 0; await p.click('.at-traiter >> nth=0'); await p.waitForSelector('.fac-ligne');
console.log('4. Reprendre → appels', JSON.stringify(appels));
// valider → Traitées
await p.click('[data-action="fac-valider"]'); await p.waitForTimeout(800);
await p.click('[data-action="accueil"]').catch(() => { }); await p.click('[data-action="a-traiter"]'); await p.waitForSelector('.at-carte');
console.log('5. après validation :', await p.$$eval('.at-on', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' / ')));
await p.click('[data-action="at-onglet"][data-o="faites"]'); await p.waitForTimeout(300);
console.log('5. Traitées :', await p.$$eval('.at-carte', e => e.map(c => c.className.split(' ')[1] + ' ' + c.querySelector('.at-four').textContent + ' ' + c.querySelector('.at-badge').textContent)), '| bouton Traiter ?', !!(await p.$('.at-carte--fait .at-traiter')));
await p.screenshot({ path: out + '-5-traitees.png' });
// archives : une traitée il y a 40 jours
const etat0 = ctx.lireATraiter(); const v = etat0.elements.find(x => x.id === extra[2].getId()); direct({ action: 'traiter', id: v.id, etat: 'traite', par: 'test' });
const e1 = ctx.lireJson('a-traiter.json', {}); e1.elements.find(x => x.id === v.id).traiteLe = new Date(Date.now() - 40 * 864e5).toISOString(); ctx.ecrireJson('a-traiter.json', e1);
await p.click('[data-action="at-onglet"][data-o="cours"]'); await p.click('[data-action="rafraichir"]'); await p.waitForTimeout(1500);
await p.click('[data-action="at-onglet"][data-o="faites"]');
console.log('5. lien archives :', await p.textContent('[data-o="archives"]').catch(() => 'ABSENT'));
await p.click('[data-o="archives"]'); console.log('5. archives :', await p.$$eval('.at-carte', e => e.length), 'carte(s)');
// ---- Erreur Drive + Réessayer
casse = true; await p.click('[data-action="at-onglet"][data-o="todo"]').catch(() => { }); await p.click('[data-action="rafraichir"]').catch(() => { });
await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); 
await p.waitForTimeout(500);
await p.click('[data-action="a-traiter"]').catch(() => { });
// forcer un appel qui échoue : « Réessayer » n'apparaît qu'en erreur ; on passe par Rafraîchir (action rafraichir non cassée) → on casse aussi rafraichir
await p.close();
const q = await appareil(375); casse = true;
await q.click('[data-action="reglages"]'); await q.fill('#drv-url', URL_EXEC); await q.fill('#drv-cle', CLE); casse = false; await q.click('[data-action="relier"]'); await q.waitForSelector('[data-action="tester-script"]'); await q.click('[data-action="fin-reglages"]');
await q.waitForTimeout(3000); casse = true;
await q.reload(); await q.waitForSelector('.tuile'); await q.waitForTimeout(2500);
await q.click('[data-action="a-traiter"]'); await q.waitForSelector('[data-action="at-reessayer"]', { timeout: 20000 });
console.log('6. erreur :', (await q.textContent('.bandeau--erreur')).trim(), '| bouton Réessayer :', !!(await q.$('[data-action="at-reessayer"]')));
await q.screenshot({ path: out + '-6-erreur.png' });
casse = false; await q.click('[data-action="at-reessayer"]'); await q.waitForSelector('.bandeau--erreur', { state: 'detached', timeout: 15000 }).catch(() => { });
console.log('6. après Réessayer : erreur affichée ?', !!(await q.$('.bandeau--erreur')), '| cartes :', await q.$$eval('.at-carte', e => e.length));
console.log('7. journal :'); q.logs.slice(0, 14).forEach(l => console.log('   ' + l.slice(0, 150)));
// ---- boutons PDF
for (const [w, nom] of [[375, 'iPhone'], [1000, 'Mac']]) {
  const m = q; await m.setViewportSize({ width: w, height: w < 600 ? 812 : 800 });
  await m.click('[data-action="accueil"]').catch(() => { });
  await m.click('[data-action="etiquettes"]'); await m.waitForSelector('#etiq-q');
  if (!(await m.$('[data-action="etiq-pdf"]'))) { await m.fill('#etiq-q', 'pois chiches'); await m.waitForSelector('[data-action="etiq-ajouter"]', { timeout: 20000 }); await m.click('[data-action="etiq-ajouter"] >> nth=0'); await m.waitForSelector('[data-action="etiq-pdf"]'); }
  await m.click('[data-action="etiq-pdf"]'); await m.waitForSelector('[data-action="etiq-enregistrer"]', { timeout: 60000 });
  const boites = await m.$$eval('.btns-pdf .btn', e => e.map(x => { const r = x.getBoundingClientRect(); return { t: x.textContent.trim(), x: Math.round(r.x), y: Math.round(r.y), h: Math.round(r.height) }; }));
  console.log(`8. ${nom} (share=${await m.evaluate(() => typeof navigator.share)}) boutons :`, JSON.stringify(boites));
  const [dl] = await Promise.all([m.waitForEvent('download'), m.click('[data-action="etiq-enregistrer"]')]);
  console.log(`8. ${nom} Enregistrer → téléchargement :`, dl.suggestedFilename());
  await m.screenshot({ path: out + `-8-pdf-${nom}.png` });
}
// Partager : seulement si navigator.share existe
await q.evaluate(() => { navigator.canShare = d => !!d.files; navigator.share = async d => { window.__p = d.files[0].name; }; });
await q.setViewportSize({ width: 375, height: 812 }); await q.reload(); await q.waitForSelector('.tuile');
await q.evaluate(() => { navigator.canShare = d => !!d.files; navigator.share = async d => { window.__p = d.files[0].name; }; });
await q.click('[data-action="etiquettes"]'); await q.waitForSelector('[data-action="etiq-pdf"]'); await q.click('[data-action="etiq-pdf"]'); await q.waitForSelector('[data-action="etiq-partager"]', { timeout: 60000 });
console.log('8. iPhone avec share : boutons empilés ?', JSON.stringify(await q.$$eval('.btns-pdf .btn', e => e.map(x => { const r = x.getBoundingClientRect(); return [x.textContent.trim(), Math.round(r.x), Math.round(r.y), Math.round(r.height)]; }))));
await q.click('[data-action="etiq-partager"]'); await q.waitForTimeout(400); console.log('8. Partager → navigator.share a reçu :', await q.evaluate(() => window.__p));
await q.screenshot({ path: out + '-8-pdf-iPhone-share.png' });
console.log('violations lecture seule :', JSON.stringify(violations));
await b.close();
