import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { monDrive, violations, mails } from './gas-mock.mjs';
const CLE = 'une-phrase-secrete-tres-longue-pour-le-test';
const { ctx, props } = monDrive(); props.CLE_APPLI = CLE; ctx.installer();
const post = o => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(o) } }).texte);
const codeDe = m => /Code : (\d{6})/.exec(m.corps)[1];
// ---- serveur
console.log('S1 ping sans clé :', JSON.stringify(post({ action: 'ping' })));
const d1 = post({ action: 'inviteDemande', nom: 'Ahmed <b>' });
console.log('S2 demande :', JSON.stringify(d1), '| code renvoyé ?', JSON.stringify(d1).match(/\d{6}/) ? 'OUI (faille)' : 'non');
console.log('S2 mail →', mails[0].a, '|', mails[0].sujet, '|', mails[0].corps.split('\n')[0]);
const bon = codeDe(mails[0]); const faux = bon === '000000' ? '111111' : '000000';
console.log('S3 faux code :', post({ action: 'inviteValider', demande: d1.demande, code: faux }).erreur);
const v = post({ action: 'inviteValider', demande: d1.demande, code: bon });
console.log('S3 bon code : ok', v.ok, '| jeton', v.jeton && v.jeton.length, 'car. | durée', Math.round((v.fin - Date.now()) / 36e5 * 10) / 10, 'h');
console.log('S3 code réutilisé :', post({ action: 'inviteValider', demande: d1.demande, code: bon }).erreur);
const J = v.jeton;
for (const [a, x] of [['ping', {}], ['exports', {}], ['lire', { doc: 'liste-achat' }], ['lire', { doc: 'autre' }], ['factures', {}], ['aTraiter', {}], ['cacheLire', { ids: [] }], ['inviteArreter', {}], ['traiter', { id: 'x' }]])
  { const r = post({ action: a, jeton: J, ...x }); console.log(`S4 invité ${a}${x.doc ? ' ' + x.doc : ''} →`, r.ok, r.invite || ''); }
console.log('S4 propriétés en clair ?', JSON.stringify(props).includes(J) || JSON.stringify(props).includes(bon) ? 'OUI (faille)' : 'non (empreintes)');
// 5 essais
const d2 = post({ action: 'inviteDemande', nom: 'Test' }); let r;
for (let i = 0; i < 5; i++) r = post({ action: 'inviteValider', demande: d2.demande, code: '999999' === codeDe(mails[1]) ? '888888' : '999999' });
console.log('S5 5 faux codes :', r.erreur, '| puis le bon :', post({ action: 'inviteValider', demande: d2.demande, code: codeDe(mails[1]) }).erreur);
for (let i = 0; i < 4; i++) r = post({ action: 'inviteDemande', nom: 'x' });
console.log('S6 6e demande dans l\'heure :', r.erreur, '| mails envoyés :', mails.length);
// expiration côté serveur
const ss = JSON.parse(props.INVITE_SESSIONS); for (const k in ss) ss[k].fin = Date.now() - 1; props.INVITE_SESSIONS = JSON.stringify(ss);
console.log('S7 jeton après 6 h :', JSON.stringify(post({ action: 'ping', jeton: J })));
props.INVITE_JOURNAL = '[]';
// ---- appli
const URL_EXEC = 'https://script.google.com/macros/s/AKfycbTEST_abc-123/exec';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
async function appareil() {
  const c = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8766' });
  const appels = []; c.appels = appels;
  await c.route('https://script.google.com/**', async rt => { const corps = rt.request().postData(); appels.push(JSON.parse(corps)); const res = ctx.doPost({ postData: { contents: corps } }); await rt.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: res.texte }); });
  const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); return p;
}
const A = await appareil();
await A.goto('http://localhost:8766/v2/'); await A.waitForSelector('.tuile');
await A.click('[data-action="reglages"]'); await A.fill('#drv-url', URL_EXEC); await A.fill('#drv-cle', CLE); await A.click('[data-action="relier"]');
await A.waitForSelector('[data-action="invite-lien"]');
await A.click('[data-action="invite-lien"]'); await A.waitForSelector('[data-msg-invite] .note');
const lien = await A.evaluate(() => navigator.clipboard.readText());
console.log('A1 lien :', lien.replace(/#invite=.*/, '#invite=…'), '| contient la clé ?', lien.includes(CLE) || decodeURIComponent(lien).includes(CLE) ? 'OUI (faille)' : 'non');
await A.screenshot({ path: '/home/claude/rendu/inv-0-reglages.png' });
const G = await appareil();
await G.clock.install();
await G.goto(lien); await G.waitForSelector('[data-action="invite-ouvrir"]');
console.log('G1 adresse après ouverture :', G.url(), '| accueil :', (await G.textContent('.scr__corps')).replace(/\s+/g, ' ').trim().slice(0, 80));
await G.screenshot({ path: '/home/claude/rendu/inv-1-accueil.png' });
await G.click('[data-action="invite-ouvrir"]'); await G.click('[data-action="invite-demander"]'); await G.waitForSelector('.bandeau--erreur');
console.log('G2 sans prénom :', (await G.textContent('.bandeau--erreur')).trim());
await G.fill('#inv-nom', 'Ahmed'); await G.screenshot({ path: '/home/claude/rendu/inv-2-prenom.png' });
const n0 = mails.length; await G.click('[data-action="invite-demander"]'); await G.waitForSelector('#inv-code');
console.log('G3 mail reçu par', mails[n0].a, ':', mails[n0].corps.split('\n')[0]);
await G.screenshot({ path: '/home/claude/rendu/inv-3-code.png' });
await G.fill('#inv-code', '000001'); await G.click('[data-action="invite-valider"]'); await G.waitForSelector('.bandeau--erreur');
console.log('G4 faux code :', (await G.textContent('.bandeau--erreur')).trim());
await G.fill('#inv-code', codeDe(mails[n0])); await G.click('[data-action="invite-valider"]');
await G.waitForSelector('.invite-bandeau', { timeout: 90000 });
console.log('G5 accueil invité :', (await G.textContent('.invite-bandeau')).trim(), '|', await G.$$eval('.tuile b', e => e.map(x => x.textContent)), '| réglages visibles ?', !!(await G.$('[data-action="reglages"]')), '| Magasin/Achat ?', !!(await G.$('[data-action="mode"]')));
console.log('G5 données :', (await G.textContent('.scr__corps .note')).replace(/\s+/g, ' ').slice(0, 90));
console.log('G5 la clé est-elle partie du téléphone invité ?', G.context().appels.some(x => x.cle) ? 'OUI (faille)' : 'non', '| actions appelées :', [...new Set(G.context().appels.map(x => x.action))].join(', '));
await G.screenshot({ path: '/home/claude/rendu/inv-4-session.png' });
await G.click('[data-action="etiquettes"]'); await G.waitForSelector('#etiq-q');
await G.click('[data-action="etiq-scanner"]'); await G.waitForSelector('.scan-continu'); await G.click('.scan-plein [data-t="taper"]');
for (const code of ['3700671750040', '5449000051981']) { await G.fill('.feuille-saisie input', code); await G.click('.feuille-saisie button'); await G.waitForTimeout(400); }
await G.click('[data-t="fini"]'); await G.waitForSelector('[data-planche]'); await G.waitForTimeout(500);
console.log('G6 planche invité :', await G.$$eval('[data-action="etiq-modifier"] .ligne__titre', e => e.map(x => x.textContent)));
await G.screenshot({ path: '/home/claude/rendu/inv-5-planche.png' });
await G.click('[data-action="etiq-pdf"]'); await G.waitForSelector('[data-action="etiq-enregistrer"]', { timeout: 60000 });
const [dl] = await Promise.all([G.waitForEvent('download'), G.click('[data-action="etiq-enregistrer"]')]);
console.log('G6 PDF imprimable :', dl.suggestedFilename());
await G.click('[data-action="accueil"]'); await G.waitForSelector('.invite-bandeau');
console.log('G6 accueil :', (await G.textContent('.tuile span')).trim());
// tentative hors étiquettes
await G.evaluate(() => { const b = document.createElement('button'); b.dataset.action = 'reglages'; b.id = 'pirate'; document.querySelector('#app .scr').appendChild(b); });
await G.click('#pirate'); await G.waitForTimeout(300); console.log('G6 action Réglages forcée → reste sur :', (await G.textContent('.titre-1')).trim());
// 6 h plus tard
await G.clock.fastForward('06:00:30'); await G.waitForSelector('text=Session terminée', { timeout: 10000 });
const reste = await G.evaluate(() => new Promise(r => { const q = indexedDB.open('corbeille-v2'); q.onsuccess = () => { const t = q.result.transaction('kv').objectStore('kv').count(); t.onsuccess = () => r(t.result); }; }));
console.log('G7 après 6 h :', (await G.textContent('.titre-1')).trim(), '| éléments restant dans la base :', reste);
await G.screenshot({ path: '/home/claude/rendu/inv-6-fin.png' });
await G.reload(); await G.waitForSelector('.scr'); console.log('G8 après relance :', (await G.textContent('.scr__corps')).replace(/\s+/g, ' ').trim().slice(0, 70));
// coupure par le responsable
const H = await appareil(); await H.goto(lien); await H.click('[data-action="invite-ouvrir"]'); await H.fill('#inv-nom', 'Sami'); const n1 = mails.length;
await H.click('[data-action="invite-demander"]'); await H.waitForSelector('#inv-code'); await H.fill('#inv-code', codeDe(mails[n1])); await H.click('[data-action="invite-valider"]'); await H.waitForSelector('.invite-bandeau', { timeout: 90000 });
await A.click('[data-action="invite-arreter"]'); await A.waitForFunction(() => /arrêtée/.test(document.querySelector('[data-msg-invite]').textContent));
console.log('H1 responsable :', (await A.textContent('[data-msg-invite]')).trim());
await H.evaluate(() => document.dispatchEvent(new Event('online'))); await H.evaluate(() => window.dispatchEvent(new Event('online'))); await H.waitForSelector('text=Session terminée', { timeout: 20000 });
console.log('H2 invité coupé → écran :', (await H.textContent('.titre-1')).trim());
console.log('violations lecture seule :', JSON.stringify(violations), '| erreurs :', JSON.stringify([...A.errs, ...G.errs, ...H.errs]));
await b.close();
