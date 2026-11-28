// Lot 12 : point de la semaine, sur les 7 derniers jours.
// Achats : les factures du Drive datées des 7 jours (montants lus, sans export).
// Ventes : un seul petit export par semaine, Vente PLU des 7 derniers jours, demandé avec ses dates exactes.
// Sans cet export, on montre les meilleures ventes du dernier gros export, avec sa date.
import { etat, lirePeriodes } from './donnees.js';
import { barreMode, joli } from './ecrans.js';
import { icone } from './icones.js';
import { euros } from './calcul.js';
import { jour, fr, carteExports, brancherBesoins, actionBesoins } from './besoins.js';
import { lecture } from './lectures.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ecart = (a, b) => b > 0 ? Math.round((a / b - 1) * 100) : null;

/** La semaine demandée : les 7 jours finis hier. */
export const semaine = () => ({ du: jour(-7), au: jour(-1) });
/** Export de 7 jours (6 à 8) le plus récent, fini il y a 8 jours au plus ; et celui de la semaine d'avant, s'il est là. */
async function periodesSemaine() {
  const P = Object.values(await lirePeriodes()).filter(p => p.jours >= 6 && p.jours <= 8).sort((a, b) => b.au.localeCompare(a.au));
  const cette = P.find(p => p.au >= jour(-8)) || null;
  const avant = cette ? P.find(p => p.au < cette.du && p.au >= jour(-10, new Date(cette.du + 'T12:00'))) || null : null;
  return { cette, avant };
}
const dateDe = x => x.date || String(x.cree || '').slice(0, 10);

/** Les factures des 7 jours (date de la facture), avec le montant lu quand il l'a été. */
export function achats(elements, { du, au }) {
  const L = (elements || []).filter(x => { const d = dateDe(x); return d >= du && d <= au; });
  let total = 0, lus = 0; const parFour = {};
  for (const x of L) {
    const l = lecture(x.id), f = (l && l.fournisseur) || x.fournisseur || 'Autre';
    if (l && l.montant != null) { total += l.montant; lus++; parFour[f] = (parFour[f] || 0) + l.montant; }
  }
  return { n: L.length, lus, total, parFour: Object.entries(parFour).sort((a, b) => b[1] - a[1]) };
}

/** `aFaire` : [[action, texte, nombre]] fourni par l'appli (factures, inconnus, étiquettes, prix). */
export async function ecranHebdo(nav, { elements = [], aFaire = [] } = {}) {
  const s = semaine(), { cette, avant } = await periodesSemaine(), A = achats(elements, cette ? { du: cette.du, au: cette.au } : s);
  const besoin = [{ cle: '7j', titre: '7 derniers jours', du: s.du, au: s.au, periode: cette }];
  const P = etat.produits;
  let ventes = '';
  if (cette) {
    const top = Object.entries(cette.ca || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topQ = top.length ? null : Object.entries(cette.q || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const ev = avant && cette.caTot != null && avant.caTot != null ? ecart(cette.caTot, avant.caTot) : null;
    ventes = `<div class="carte" style="display:grid;gap:10px">
      <div class="note">Ventes du ${fr(cette.du)} au ${fr(cette.au)}</div>
      ${cette.caTot != null ? `<div style="font:800 40px/1 var(--font-titre);font-variant-numeric:tabular-nums">${euros(cette.caTot)}</div>
        <div class="note">${ev != null ? `${ev >= 0 ? '+' : ''}${ev} % par rapport aux 7 jours d'avant (${euros(avant.caTot)})` : 'Pas de semaine précédente pour comparer.'}${cette.margeTot != null ? ` · marge ${euros(cette.margeTot)} (produits avec prix d'achat)` : ''}</div>` : '<div class="note">Cet export n\'a pas de colonne chiffre d\'affaires.</div>'}
      <div class="titre-3">Les meilleures ventes</div>
      ${(top.length ? top : topQ).map(([e, v]) => `<div class="info"><span>${esc(joli(P[e]?.lib || e))}</span><b>${top.length ? euros(v) : Math.round(v) + ' vendus'}</b></div>`).join('')}
    </div>`;
  } else {
    const v = etat.meta.ventes;
    const top = Object.values(P).filter(o => o.q > 0).sort((a, b) => b.q - a.q).slice(0, 5);
    ventes = carteExports(besoin, 'Pour les ventes de la semaine') + (top.length ? `<div class="carte" style="display:grid;gap:8px">
      <div class="titre-3">Meilleures ventes du dernier gros export</div>
      <div class="note">${v ? `${esc(v.nom)}${v.du ? `, du ${fr(v.du)} au ${fr(v.au)}` : ''}` : ''}</div>
      ${top.map(o => `<div class="info"><span>${esc(joli(o.lib))}</span><b>${Math.round(o.q)} vendus</b></div>`).join('')}</div>` : '');
  }
  const faire = aFaire.filter(x => x[2] > 0);
  nav.afficher(`<div class="scr cb" data-ecran="hebdo">${barreMode('magasin', 'Semaine', true)}
  <div class="scr__corps">
    <h1 class="titre-1">Point de la semaine</h1>
    <div class="note" style="margin-top:-12px">Du ${fr(cette ? cette.du : s.du)} au ${fr(cette ? cette.au : s.au)}</div>
    <h2 class="titre-3">Ventes</h2>
    ${ventes}
    <h2 class="titre-3">Achats</h2>
    <div class="carte" style="display:grid;gap:8px">
      ${A.n ? `<div style="font:800 32px/1 var(--font-titre);font-variant-numeric:tabular-nums">${euros(A.total)}</div>
        <div class="note">${A.n} facture${A.n > 1 ? 's' : ''} datée${A.n > 1 ? 's' : ''} des 7 jours${A.lus < A.n ? ` · ${A.n - A.lus} pas encore lue${A.n - A.lus > 1 ? 's' : ''} : montant à venir` : ''}</div>
        ${A.parFour.slice(0, 5).map(([f, m]) => `<div class="info"><span>${esc(f)}</span><b>${euros(m)}</b></div>`).join('')}`
      : '<div class="note">Aucune facture datée de ces 7 jours dans le Drive.</div>'}
    </div>
    <h2 class="titre-3">À faire cette semaine</h2>
    ${faire.length ? faire.map(([a, t, n]) => `<button class="ligne" data-action="${a}" style="border:0;font:inherit;text-align:left;width:100%"><div class="ligne__txt"><div class="ligne__titre">${esc(t)}</div></div><b style="font:700 24px/1 var(--font-titre)">${n}</b>${icone('chevron', 'cb-ico cb-ico--24')}</button>`).join('')
      : '<div class="carte"><div class="titre-2">Rien en retard.</div></div>'}
  </div>
  <div class="scr__bas"><button class="btn btn--principal" data-action="accueil">Retour à l'accueil</button></div></div>`, 'hebdo');
  brancherBesoins(() => ecranHebdo(nav, { elements, aFaire }), nav.toast);
}

export async function actionHebdo(a, b, nav, donnees) {
  if (a === 'hebdo') { await ecranHebdo(nav, donnees()); return true; }
  if (a === 'besoins-drive' && document.querySelector('.scr[data-ecran="hebdo"]')) {
    return actionBesoins(a, b, () => ecranHebdo(nav, donnees()), nav.toast);
  }
  return false;
}
