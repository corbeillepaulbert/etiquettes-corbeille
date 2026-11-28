import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const P = JSON.parse(fs.readFileSync('/tmp/P.json'));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage(); await p.goto('http://localhost:8766/v2/'); await p.waitForSelector('.tuile');
for (const f of process.argv.slice(2)) {
  const r = await p.evaluate(async ({ b64, P }) => {
    const L = await import('/v2/js/moteur/lecture.js'), F = await import('/v2/js/moteur/facture.js'), C = await import('/v2/js/prix-unitaire.js');
    const t = await L.texteDeFichier(new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], 'f.pdf', { type: 'application/pdf' }));
    F.configurer({ P, MAP: { four: {} }, CASC: [], REFMAP: {}, REGDES: {}, SETF: {} });
    const r = F.parseInvoice(t, null); C.corrigerPrix(t, r, P);
    return r.lines.map(x => `${x.des.slice(0, 30).padEnd(30)} e=${x.e || '—'} pu=${x.pu}${x.puLu ? ' (lu ' + x.puLu + ')' : ''} | StorePOS PA=${P[x.e]?.pa0 ?? '—'}${x.note ? ' | ' + x.note : ''}`);
  }, { b64: fs.readFileSync(f).toString('base64'), P });
  console.log('== ' + f); r.forEach(x => console.log(x));
}
await b.close();
