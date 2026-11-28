import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const f = process.argv[2];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage(); await p.goto('http://localhost:8766/v2/'); await p.waitForSelector('.tuile');
const r = await p.evaluate(async b64 => {
  const L = await import('/v2/js/moteur/lecture.js'), F = await import('/v2/js/moteur/facture.js');
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const t = await L.texteDeFichier(new File([bytes], 'f.pdf', { type: 'application/pdf' }));
  F.configurer({ P: {}, MAP: { four: {} }, CASC: [], REFMAP: {}, REGDES: {}, SETF: {} });
  const r = F.parseInvoice(t, null);
  return { texte: t.split('\n').filter(l => /\d{8,13}/.test(l)).slice(0, 40), sup: r.sup, lignes: r.lines.map(x => `${x.des} | pu=${x.pu} | mt=${x.mt}`) };
}, fs.readFileSync(f).toString('base64'));
console.log(JSON.stringify(r, null, 1)); await b.close();
