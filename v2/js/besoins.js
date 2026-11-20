// Exports de ventes dont un calcul a besoin (Conseil d'achat, Ramadan). L'appli dit exactement quoi déposer : quel export, de quelle date à quelle date,
// et sous quel nom (les dates dans le nom permettent de le reconnaître). Rien n'est estimé à la place d'un export manquant.
import { lirePeriodes, periodeCouvrant, importerFichier } from './donnees.js';
import { icone } from './icones.js';
import { estRelie, prendreExports } from './drive.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export const jour = (n, base = new Date()) => { const d = new Date(base); d.setDate(d.getDate() + n); return iso(d); };
export const fr = d => d.split('-').reverse().join('/');
const court = d => { const [y, m, j] = d.split('-'); return `${j}_${m}_${y.slice(2)}`; };
export const nomConseille = (du, au) => `EXPORT_PLU_${court(du)}_${court(au)}.xlsx`;

/** Période récente d'environ `jours` jours, finie il y a 7 jours au plus. */
export async function periodeRecente(jours, tol = 3) {
  const P = await lirePeriodes(), limite = jour(-8);
  return Object.values(P).filter(p => Math.abs(p.jours - jours) <= tol && p.au >= limite).sort((a, b) => b.au.localeCompare(a.au))[0] || null;
}
/** Les deux exports du Conseil d'achat. */
export async function besoinsAchat() {
  const au = jour(-1);
  return [
    { cle: '4s', titre: '4 dernières semaines', du: jour(-28), au, periode: await periodeRecente(28) },
    { cle: '8s', titre: '8 dernières semaines', du: jour(-56), au, periode: await periodeRecente(56) }
  ];
}
/** Un export par Ramadan passé : du premier jour de jeûne à la veille de l'Aïd. */
export async function besoinsRamadan(ramadans) {
  const out = [];
  for (const r of ramadans) { const au = jour(-1, new Date(r.aid + 'T12:00')); out.push({ cle: String(r.annee), titre: `Ramadan ${r.annee}`, du: r.debut, au, periode: await periodeCouvrant(r.debut, au) }); }
  return out;
}

/** Carte « il me manque des exports ». */
export function carteExports(besoins, pourQuoi) {
  const manquants = besoins.filter(b => !b.periode);
  if (!manquants.length) return '';
  const m = manquants[0];
  return `<div class="carte exp-carte">
    <div class="titre-3">Il me manque ${manquants.length} export${manquants.length > 1 ? 's' : ''}</div>
    <div class="note">${esc(pourQuoi)}, dépose l'export <b>Vente PLU du ${fr(m.du)} au ${fr(m.au)}</b> dans EXPORTS STOREPOS.</div>
    <div class="note">Garde les dates dans le nom, par exemple <b style="overflow-wrap:anywhere">${esc(nomConseille(m.du, m.au))}</b> : c'est comme ça que l'appli le reconnaît.</div>
    <div class="exp-liste">${besoins.map(b => `<div class="exp-ligne"><div><b>${esc(b.titre)}</b><div class="note">${fr(b.du)} → ${fr(b.au)}</div></div>${b.periode ? `<span class="exp-ok">${icone('check', 'cb-ico cb-ico--24')}reçu</span>` : '<span class="exp-ko">manquant</span>'}</div>`).join('')}</div>
    ${estRelie() ? '<button class="btn btn--principal" data-action="besoins-drive">Vérifier le Drive</button>' : ''}
    <label class="btn btn--secondaire" style="cursor:pointer">${icone('import', 'cb-ico cb-ico--24')}Choisir le fichier sur cet appareil<input type="file" accept=".xlsx,.csv,.txt" multiple hidden data-besoins-fichiers></label>
  </div>`;
}

/** Branche les boutons de la carte ; `apres` redessine l'écran. */
export function brancherBesoins(apres, toast) {
  const i = document.querySelector('[data-besoins-fichiers]');
  if (i) i.onchange = async e => {
    const msgs = [];
    for (const f of e.target.files) { try { const r = await importerFichier(f); msgs.push(r.type === 'periode' ? `Ventes du ${fr(r.du)} au ${fr(r.au)} reçues` : `${f.name} : pas de dates dans le nom`); } catch (x) { msgs.push(`${f.name} : ${x.message}`); } }
    await apres(); toast(msgs.join(' · '));
  };
}
export async function actionBesoins(a, b, apres, toast) {
  if (a !== 'besoins-drive') return false;
  b.disabled = true; b.textContent = 'Je regarde le Drive…';
  try { const f = await prendreExports(); await apres(); toast(f.length ? `${f.length} fichier(s) lu(s)` : 'Rien de nouveau dans EXPORTS STOREPOS'); }
  catch (x) { await apres(); toast(`Drive : ${x.message}`); }
  return true;
}
