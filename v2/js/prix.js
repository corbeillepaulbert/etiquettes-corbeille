// Lot 11 : propositions de changement de prix. Deux listes :
// 1. après une facture, les hausses de prix d'achat, avec le prix de vente suggéré (règle de la V1 : suggPv) ;
// 2. sur tout le catalogue, les produits sous 25 % de marge, classés par manque à gagner sur un an de ventes.
// « Prendre » ajoute le prix aux modifications en attente (un seul fichier d'import, écran Fichiers) et l'étiquette à la planche.
// Les prix de départ sont ceux de StorePOS ; rien n'est inventé.
import { etat, joursVentes } from './donnees.js';
import { barreMode, joli } from './ecrans.js';
import { icone } from './icones.js';
import { euros } from './calcul.js';
import * as F from './moteur/facture.js';
import { modifsEnAttente, proposerPrix } from './facture.js';
import { ajouterEtiquettes, retirerEtiquettes } from './etiquettes.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = x => `${Math.round(x * 100)} %`;
// Fruits et légumes (prix au kilo, colis), pain et articles « divers » de caisse : hors de cette liste.
const horsListe = o => /FRUIT|LEG|BOULANG|^DIVERS/i.test(String(o.dep || '').trim());

export function propositions() {
  const P = etat.produits, MOD = modifsEnAttente(), jours = joursVentes();
  const hausses = [], marges = [], verifier = [];
  for (const [e, m] of Object.entries(MOD)) {
    const o = P[e]; if (!o || m.pa == null || m.prix != null || !(o.pa0 > 0) || m.pa <= o.pa0 * 1.005) continue;
    const g = F.suggPv(o, m.pa); if (!g || g.keep) continue;
    hausses.push({ e, o, pa: m.pa, pa0: o.pa0, pv: g.pv, m2: g.m, src: m.src || '' });
  }
  const pris = new Set(hausses.map(x => x.e));
  for (const o of Object.values(P)) {
    if (pris.has(o.e) || (MOD[o.e] && MOD[o.e].prix != null) || !(o.pa0 > 0) || !(o.prix > 0) || horsListe(o)) continue;
    const t = F.tvaOf(o), m = 1 - o.pa0 / (o.prix / t); if (m >= 0.25) continue;
    const an = (o.q || 0) * 365 / jours;
    if (m < -0.5) { verifier.push({ e: o.e, o, m }); continue; } // prix d'achat d'un colis, sans doute : on ne propose rien
    const g = F.suggPv(o, o.pa0); if (!g || g.keep || !(g.pv > o.prix)) continue;
    marges.push({ e: o.e, o, pv: g.pv, m, m2: g.m, an, manque: (g.pv - o.prix) / t * an });
  }
  marges.sort((a, b) => b.manque - a.manque || a.m - b.m);
  return { hausses, marges, verifier };
}
export const nbPrixARevoir = () => { const r = propositions(); return r.hausses.length + r.marges.length; };

let voirTout = false;
export function ecranPrix(nav, message = '') {
  const { hausses, marges, verifier } = propositions(), MOD = modifsEnAttente();
  const enAttente = Object.values(MOD).filter(m => m.prix != null).length;
  const vue = voirTout ? marges : marges.slice(0, 25);
  const carteH = x => `<div class="carte" style="display:grid;gap:8px">
    <div class="titre-3">${esc(joli(x.o.lib))}</div>
    <div class="note">Achat ${euros(x.pa0)} → <b>${euros(x.pa)}</b> (+${pct(x.pa / x.pa0 - 1)})${x.src ? ` · ${esc(x.src)}` : ''}</div>
    <div class="note">Vente ${euros(x.o.prix)} : la marge tomberait à ${pct(1 - x.pa / (x.o.prix / F.tvaOf(x.o)))}</div>
    <button class="btn btn--principal" data-action="prix-prendre" data-e="${esc(x.e)}" data-pv="${x.pv}">Prendre ${euros(x.pv)} (marge ${pct(x.m2)})</button></div>`;
  const carteM = x => `<div class="carte" style="display:grid;gap:8px">
    <div class="titre-3">${esc(joli(x.o.lib))}</div>
    <div class="note">Vente ${euros(x.o.prix)}, achat ${euros(x.o.pa0)} : marge ${pct(x.m)}</div>
    <div class="note">${x.an >= 1 ? `Il en part ${Math.round(x.an)} par an : environ <b>${euros(Math.round(x.manque))}</b> de marge en plus avec le prix proposé` : 'Pas vendu sur la période'}</div>
    <button class="btn btn--secondaire" data-action="prix-prendre" data-e="${esc(x.e)}" data-pv="${x.pv}">Prendre ${euros(x.pv)} (marge ${pct(x.m2)})</button></div>`;
  nav.afficher(`<div class="scr cb">${barreMode('magasin', 'Prix', true)}
  <div class="scr__corps">
    <h1 class="titre-1">Prix à revoir</h1>
    ${message ? `<div class="bandeau bandeau--alerte">${icone('info', 'cb-ico cb-ico--24')}<span>${esc(message)}</span></div>` : ''}
    <div class="note">Le prix proposé suit la règle de l'appli actuelle : 25 % de marge au moins, hausse plafonnée à 25 %, arrondi aux 10 centimes. Tu choisis ligne par ligne.</div>
    <h2 class="titre-3">Après les factures (${hausses.length})</h2>
    ${hausses.map(carteH).join('') || '<div class="note">Aucune hausse de prix d\'achat en attente.</div>'}
    <h2 class="titre-3">Marge sous 25 % (${marges.length})</h2>
    ${marges.length ? '<div class="note">Les plus gros manques à gagner d\'abord, calculés sur les ventes de l\'export.</div>' : ''}
    ${vue.map(carteM).join('') || '<div class="note">Aucun produit sous 25 % de marge.</div>'}
    ${marges.length > vue.length ? `<button class="btn btn--secondaire" data-action="prix-tout">Voir les ${marges.length - vue.length} autres</button>` : ''}
    ${verifier.length ? `<details class="note"><summary style="min-height:48px;display:flex;align-items:center">${verifier.length} produit(s) à vérifier : prix d'achat plus haut que la vente</summary>
      <div>Souvent le prix d'un colis enregistré à la place de l'unité. Rien n'est proposé : corrige la fiche dans StorePOS.</div>
      ${verifier.slice(0, 20).map(x => `<div>${esc(joli(x.o.lib))} · vente ${euros(x.o.prix)}, achat ${euros(x.o.pa0)}</div>`).join('')}</details>` : ''}
  </div>
  <div class="scr__bas">
    <button class="btn btn--principal btn--achat" data-action="fac-fichiers">${icone('import')}Fichier d'import${enAttente ? ` (${enAttente} prix)` : ''}</button>
    <button class="btn btn--discret" data-action="accueil">Retour</button></div></div>`, 'prix');
}

export async function actionPrix(a, b, nav) {
  if (a === 'prix') { voirTout = false; ecranPrix(nav); return true; }
  if (a === 'prix-tout') { voirTout = true; ecranPrix(nav); return true; }
  if (a === 'prix-prendre') {
    const e = b.dataset.e, pv = +b.dataset.pv, o = etat.produits[e]; if (!o || !(pv > 0)) return true;
    const defaire = await proposerPrix(e, pv, 'Proposition de prix');
    const etq = await ajouterEtiquettes([e]);
    ecranPrix(nav);
    nav.toast(`${joli(o.lib)} : ${euros(pv)} pris${etq.length ? ', étiquette ajoutée' : ''}`, async () => { await defaire(); await retirerEtiquettes(etq); ecranPrix(nav); });
    return true;
  }
  return false;
}
