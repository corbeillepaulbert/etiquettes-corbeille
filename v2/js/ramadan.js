// Lot 8 : Mode Ramadan. Le Ramadan avance d'environ 11 jours chaque année : on compare Ramadan à Ramadan (jamais mars à mars),
// grâce à un export Vente PLU par Ramadan passé (données fiables depuis 2023). Prévision = moyenne pondérée des Ramadans passés
// (le plus récent compte le plus) × tendance actuelle du produit (4 dernières semaines contre l'année), bornée par la date limite.
import { etat, lire, ecrire, joursVentes } from './donnees.js';
import { barreMode, joli } from './ecrans.js';
import { icone } from './icones.js';
import { besoinsRamadan, besoinsAchat, carteExports, brancherBesoins, actionBesoins, jour, fr } from './besoins.js';
import { categorie } from './conseil.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DEPUIS = 2023; // données StorePOS fiables
const MOTS = /DATTE|CHORBA|BRICK|LABEN|LBEN|ELBEN|LEBEN|FRIK|ZLABIA|CHEBAKIA|HALWA|HALVA|VERMICELLE|MSEMEN|DIOUL|SEMOULE|POIS CHICHE|ORGEAT|THE VERT|AMANDE|MIEL|FIGUE|ABRICOT SEC|RAISIN SEC/;
let TABLE = null, ajoutes = new Set(), dernier = [];
async function table() {
  if (!TABLE) { try { TABLE = (await (await fetch(new URL('../donnees/ramadan.json', import.meta.url))).json()).ramadans; } catch (e) { TABLE = []; } }
  return TABLE;
}
const ms = d => new Date(d + 'T12:00').getTime();
/** Prochain Ramadan (celui en cours compte), et les Ramadans passés depuis 2023. */
export async function calendrier() {
  const T = await table(), auj = jour(0);
  const prochain = T.find(r => r.aid > auj) || null;
  const passes = T.filter(r => r.annee >= DEPUIS && r.aid <= auj);
  const dans = prochain ? Math.ceil((ms(prochain.debut) - ms(auj)) / 864e5) : null;
  return { prochain, passes, dans };
}
/** Tuile de l'accueil : seulement dans les 30 jours avant le début (et pendant le mois). */
export async function tuileRamadan() {
  const { prochain, dans } = await calendrier();
  if (!prochain || dans > 30) return '';
  const txt = dans > 0 ? `Dans ${dans} jour${dans > 1 ? 's' : ''}` : 'C\'est le Ramadan';
  return `<button class="tuile tuile--ramadan" data-action="ramadan">${icone('agenda')}<div><b>Préparer le Ramadan</b><span>${txt} · ta liste est prête</span></div></button>`;
}

/** Prévision pour un produit. R : [{annee, periode}] (périodes reçues), P4 : 4 dernières semaines (ou null). */
export function prevoir(o, R, P4, duree = 30) {
  const pts = R.map((r, i) => ({ annee: r.annee, q: r.periode.q[o.e] || 0, j: r.periode.jours, w: i + 1 }));
  if (!pts.length) return null;
  const parJourR = pts.reduce((t, p) => t + p.w * p.q / p.j, 0) / pts.reduce((t, p) => t + p.w, 0);
  const an = (o.q || 0) / joursVentes();
  const uplift = an > 0 ? parJourR / an : (parJourR > 0 ? 9 : 0);
  let tendance = 1;
  if (P4 && an > 0) tendance = Math.min(1.5, Math.max(0.7, ((P4.q[o.e] || 0) / P4.jours) / an));
  const dernierR = pts[pts.length - 1];
  const prevu = Math.round(parJourR * duree * tendance);
  const ref = dernierR.q; // ventes réelles du dernier Ramadan reçu (affichées telles quelles)
  return { pts, parJourR, uplift, tendance, prevu, ref, evol: ref > 0 ? Math.round((prevu / ref - 1) * 100) : null };
}

async function ecranRamadan(nav, message = '') {
  const { prochain, passes, dans } = await calendrier();
  const besoins = await besoinsRamadan(passes), b4 = (await besoinsAchat())[0];
  const R = besoins.filter(b => b.periode).map(b => ({ annee: +b.cle, periode: b.periode }));
  const duree = prochain ? Math.round((ms(prochain.aid) - ms(prochain.debut)) / 864e5) : 30;
  const DLUO = await lire('dluo', {});
  let L = [];
  if (R.length) {
    for (const o of Object.values(etat.produits)) {
      const c = categorie(o); if (!c) continue;
      const x = prevoir(o, R, b4.periode, duree); if (!x || x.prevu < 3) continue;
      const mot = MOTS.test(String(o.lib).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
      if (!(x.uplift >= 1.4 || (mot && x.uplift >= 1.1))) continue;
      const dluo = DLUO[o.e] || c.dluo, fois = dluo < duree ? Math.ceil(duree / dluo) : 1;
      L.push({ o, c, x, dluo, fois, qte: fois > 1 ? Math.ceil(x.prevu / fois) : x.prevu });
    }
    L.sort((a, b) => b.x.uplift * Math.sqrt(b.x.prevu) - a.x.uplift * Math.sqrt(a.x.prevu));
  }
  dernier = L;
  const annees = R.map(r => r.annee);
  const ligne = y => { const x = y.x, an = x.pts[x.pts.length - 1].annee; return `<div class="cons-ligne ram-ligne${ajoutes.has(y.o.e) ? ' cons-ligne--ok' : ''}">
      <div class="cons-txt"><div class="ligne__titre">${esc(joli(y.o.lib))}</div>
      <div class="ligne__detail">En ${an}, tu as vendu ${x.ref}. Cette année, prévois <b>${x.prevu}</b>${x.evol != null ? ` (${x.evol >= 0 ? '+' : ''}${x.evol} %)` : ''}.</div>
      <div class="ram-histo">${x.pts.map(p => `<span>${p.annee} : ${p.q}</span>`).join('')}<span>× ${(x.uplift).toFixed(1).replace('.', ',')} pendant le Ramadan</span></div>
      ${y.fois > 1 ? `<div class="cons-dluo">Date limite courte : achète ${y.qte} maintenant, puis encore ${y.fois - 1} fois</div>` : ''}</div>
      <div class="cons-qte"><b>${y.qte}</b>${ajoutes.has(y.o.e) ? `<span class="exp-ok">${icone('check', 'cb-ico cb-ico--24')}</span>` : `<button class="btn btn--achat cons-ajout" data-action="ram-ajouter" data-e="${esc(y.o.e)}" aria-label="Ajouter à ma liste">+</button>`}</div></div>`; };
  const bandeau = prochain ? `<div class="ram-entete"><div class="ram-lune"></div><div><div class="ram-quand">${dans > 0 ? `Dans ${dans} jour${dans > 1 ? 's' : ''}` : 'En ce moment'}</div><div class="titre-2">Ramadan ${prochain.annee}</div><div class="note">Du ${fr(prochain.debut)} à l'Aïd le ${fr(prochain.aid)}${prochain.previsionnel ? ' (dates prévues, à confirmer)' : ''}</div></div></div>` : '';
  nav.afficher(`<div class="scr cb" data-ecran="ramadan">${barreMode('achat', 'Ramadan', true)}<div class="scr__corps">
    <h1 class="titre-1">Préparer le Ramadan</h1>
    ${bandeau}
    ${message ? `<div class="bandeau bandeau--alerte">${icone('info', 'cb-ico cb-ico--24')}<span>${message}</span></div>` : ''}
    ${carteExports([...besoins, { ...b4, titre: 'Tendance : 4 dernières semaines' }], 'Pour comparer Ramadan à Ramadan')}
    ${R.length ? `<div class="note">L'appli a mémorisé tes Ramadans ${annees.length > 1 ? annees.slice(0, -1).join(', ') + ' et ' + annees.at(-1) : annees[0]}. Elle compare Ramadan à Ramadan, ajuste avec la tendance de tes ventes actuelles${b4.periode ? '' : ' (pas encore d\'export récent : tendance non prise en compte)'} et respecte les dates limites.</div>
      <h2 class="titre-2">Produits du Ramadan <span class="note">(${L.length})</span></h2>
      ${L.length ? L.slice(0, 60).map(ligne).join('') : '<div class="carte"><div class="note">Aucun produit ne vend nettement plus pendant le Ramadan dans les exports reçus.</div></div>'}` : ''}
  </div><div class="scr__bas">
    ${L.length ? `<button class="btn btn--principal btn--achat" data-action="ram-tout">Tout ajouter à ma liste (${L.slice(0, 60).filter(y => !ajoutes.has(y.o.e)).length})</button>` : ''}
    <button class="btn btn--discret" data-action="mode" data-mode="achat">Retour</button></div></div>`, 'ramadan');
  brancherBesoins(() => ecranRamadan(nav), nav.toast);
}

const sauverListe = () => Promise.all([ecrire('liste', etat.liste), ecrire('listeSupprimes', etat.listeSupprimes), ecrire('listeAEnvoyer', true)]);
export async function actionRamadan(a, b, nav) {
  if (a === 'besoins-drive' && document.querySelector('.scr[data-ecran="ramadan"]')) return actionBesoins(a, b, () => ecranRamadan(nav), nav.toast);
  if (a !== 'ramadan' && !a.startsWith('ram-')) return false;
  if (a === 'ramadan') { ajoutes = new Set(etat.liste.map(l => l.e)); await ecranRamadan(nav); return true; }
  if (a === 'ram-ajouter' || a === 'ram-tout') {
    const L = a === 'ram-tout' ? dernier.slice(0, 60).filter(y => !ajoutes.has(y.o.e)) : dernier.filter(y => y.o.e === b.dataset.e);
    if (!L.length) return true;
    const avant = etat.liste.slice(), avantA = new Set(ajoutes);
    for (const y of L) {
      const i = etat.liste.findIndex(l => l.e === y.o.e), l = { e: y.o.e, lib: y.o.lib, qte: y.qte, raison: `Ramadan : ${y.x.prevu} prévus sur le mois`, date: new Date().toISOString() };
      if (i >= 0) etat.liste[i] = l; else etat.liste.push(l); delete etat.listeSupprimes[y.o.e]; ajoutes.add(y.o.e);
    }
    await sauverListe(); nav.sync && nav.sync(); await ecranRamadan(nav);
    nav.toast(L.length > 1 ? `${L.length} produits du Ramadan ajoutés à ta liste` : `${L[0].qte} × ${joli(L[0].o.lib)} ajouté`, async () => { etat.liste = avant; ajoutes = avantA; await sauverListe(); ecranRamadan(nav); });
    return true;
  }
  return false;
}
