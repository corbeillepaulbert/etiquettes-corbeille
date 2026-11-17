// Fournisseurs « caisse » : ceux qui figurent sur au moins un produit de l'export produits StorePOS.
// Une facture dont le fournisseur n'est pas dans cette liste (énergie, abonnements…) n'a rien à faire dans « À traiter ».
import { etat } from './donnees.js';

const SN = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');

/** Noms des fournisseurs de la caisse, du plus utilisé au moins utilisé. */
export function fournisseursCaisse(produits = etat.produits) {
  const n = new Map();
  for (const o of Object.values(produits)) {
    const f = String(o.four || '').trim();
    if (!f || f === 'nan') continue;
    const k = SN(f);
    if (k.length < 3) continue;
    const v = n.get(k) || { nom: f, k, produits: 0 };
    v.produits++; n.set(k, v);
  }
  return [...n.values()].sort((a, b) => b.produits - a.produits);
}

/** Le fournisseur de caisse d'un fichier du Drive, d'après son nom (« 2026-11-16_GLOBAL FOOD_FACTURE_… ») et son dossier. */
export function fournisseurDe(element, liste = fournisseursCaisse()) {
  const texte = SN(`${element.nom || ''} ${element.dossier || ''}`);
  let meilleur = null;
  for (const f of liste) {
    // « GLOBAL FOOD » dans le nom, ou le premier mot (5 lettres au moins) d'un nom long : « MONDIAL » pour « MONDIAL DISTRIBUTION »
    const mot = SN(String(f.nom).split(/[\s,.-]+/)[0]);
    const ok = texte.includes(f.k) || (mot.length >= 5 && texte.includes(mot));
    if (ok && (!meilleur || f.k.length > meilleur.k.length)) meilleur = f;
  }
  return meilleur ? meilleur.nom : '';
}

/** Sépare les éléments de À traiter : ceux des fournisseurs de la caisse, et les autres (masqués). */
export function filtrer(elements, produits = etat.produits) {
  const liste = fournisseursCaisse(produits);
  if (!liste.length) return { gardes: elements, masques: [], actif: false, journal: '[À traiter] filtre inactif : aucun produit avec fournisseur n\'est chargé' };
  const gardes = [], masques = [];
  for (const x of elements) {
    const f = fournisseurDe(x, liste);
    (f ? gardes : masques).push(f ? { ...x, fournisseur: f } : x);
  }
  const journal = `[À traiter] ${elements.length} élément(s) reçus du Drive · ${liste.length} fournisseur(s) de caisse · ${gardes.length} gardé(s) · ${masques.length} masqué(s)` +
    (masques.length ? ` : ${[...new Set(masques.map(x => x.nom))].slice(0, 8).join(' | ')}` : '');
  return { gardes, masques, actif: true, journal };
}
