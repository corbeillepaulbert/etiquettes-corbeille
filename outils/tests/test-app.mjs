import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const out = '/home/claude/rendu/app';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://localhost:8766/v2/'); await p.waitForSelector('.tuile');
await p.screenshot({ path: out + '-1-accueil-vide.png' });
await p.click('[data-action="donnees"]'); await p.waitForSelector('[data-fichiers]',{state:'attached'});
const t0 = Date.now();
await p.setInputFiles('[data-fichiers]', ['/home/claude/data/produits.xlsx', '/home/claude/data/ventes.xlsx']);
await p.waitForSelector('.toast', { timeout: 90000, state:'attached' });
console.log('import ms', Date.now() - t0, await p.textContent('.toast'));
await p.screenshot({ path: out + '-2-donnees.png' });
await p.click('[data-action="accueil"]');
// mode Achat : douchette (frappe rapide)
await p.click('[data-mode="achat"]'); await p.waitForSelector('.scan-plein');
await p.screenshot({ path: out + '-3-scan.png' });
await p.click('.scan-plein [data-t="taper"]'); await p.fill('.feuille-saisie input', '4040328033096'); await p.click('.feuille-saisie button');
await p.waitForTimeout(150); await p.screenshot({ path: out + '-4-eclair.png' });
await p.waitForSelector('[data-action="ajouter"]');
await p.screenshot({ path: out + '-5-achat.png' });
await p.click('[data-action="plus"]'); console.log('qte', await p.textContent('[data-qte]'));
await p.click('[data-action="ajouter"]'); await p.waitForSelector('.toast'); console.log(await p.textContent('.toast'));
await p.screenshot({ path: out + '-6-ajoute.png' });
// mode Magasin
await p.click('[data-action="accueil"]'); await p.click('[data-mode="magasin"]'); await p.waitForSelector('.scan-plein');
await p.click('.scan-plein [data-t="taper"]'); await p.fill('.feuille-saisie input', '4028900004504'); await p.click('.feuille-saisie button');
await p.waitForSelector('.grand-prix'); await p.screenshot({ path: out + '-7-magasin.png' });
// code inconnu
await p.click('[data-action="scanner"]'); await p.waitForSelector('.scan-plein');
await p.click('.scan-plein [data-t="taper"]'); await p.fill('.feuille-saisie input', '1234567890128'); await p.click('.feuille-saisie button');
await p.waitForSelector('text=Code inconnu >> nth=0'); await p.waitForTimeout(800); await p.screenshot({ path: out + '-8-inconnu.png' });
await p.click('[data-action="accueil"]'); await p.click('[data-action="liste"]'); await p.screenshot({ path: out + '-9-liste.png' });
// rechargement : les données restent
await p.reload(); await p.waitForSelector('.tuile'); console.log('après rechargement :', await p.textContent('.note:last-of-type'));
await p.screenshot({ path: out + '-10-accueil.png' });
console.log('erreurs', JSON.stringify(errs));
await b.close();
