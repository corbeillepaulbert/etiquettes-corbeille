// Lot 9 : étiquettes intelligentes. L'appli retient ce qui a été imprimé (prix, modèle) et, à chaque export produits,
// dit quelles étiquettes du rayon ne sont plus justes : prix changé, nouvelle fiche, passage en (ou hors) Top vente.
// Rien n'est inventé : on compare seulement des prix enregistrés dans StorePOS.
import { etat, lire, ecrire, siImport, joursVentes } from './donnees.js';
import { configurer, modelOf, chk } from './moteur/etiquettes.js';
import { euros } from './calcul.js';

let IMP = {};   // e -> { prix, modele, date } : la dernière étiquette fabriquée
let CHG = {};   // e -> { r: 'prix' | 'nouveau' | 'top' | 'plus-top', avant, apres, date } : vu à un import
let IGN = {};   // e -> signature du motif ignoré
let REG = () => ({ noms: {}, force: {} });

export async function chargerRefaire(reglages) {
  IMP = await lire('etiqImprime', {}); CHG = await lire('etiqChangements', {}); IGN = await lire('etiqIgnores', {});
  if (reglages) REG = reglages;
}
const garder = async () => { await ecrire('etiqImprime', IMP); await ecrire('etiqChangements', CHG); await ecrire('etiqIgnores', IGN); };
const ctx = (jours = joursVentes()) => { const r = REG(); configurer({ noms: r.noms, force: r.force, seuil: etat.reglages.seuilTop || 365, jours }); };
const memePrix = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 0.005);
/** Produit qui a une étiquette épicerie : fiche StorePOS, pas fruit ou légume, code-barres imprimable. */
export const etiquetable = o => !!o && !/FRUIT|LEG/i.test(o.dep || '') && /^\d+$/.test(o.e) && (o.e.length === 13 || o.e.length === 8) && chk(o.e);

/** Après la fabrication d'un PDF : ces étiquettes sont à jour. */
export async function noterImpression(liste) {
  ctx(); const d = new Date().toISOString();
  for (const o of liste) { IMP[o.e] = { prix: o.prix ?? null, modele: modelOf(o), date: d }; delete CHG[o.e]; delete IGN[o.e]; }
  await garder();
}

const top = (o, jours) => (o.q || 0) * 365 / (jours || 365) >= (etat.reglages.seuilTop || 365);
siImport(async ({ type, avant, apres, premier, jours }) => {
  if (premier) return; // premier import : rien à comparer
  const d = new Date().toISOString(), force = REG().force;
  if (type === 'base') {
    for (const [e, o] of Object.entries(apres)) {
      if (!o.base || !etiquetable(o)) continue;
      const a = avant[e];
      if (!a || !a.base) CHG[e] = { r: 'nouveau', apres: o.prix ?? null, date: d };
      else if (!memePrix(a.prix, o.prix) && o.prix != null) CHG[e] = { r: 'prix', avant: a.prix ?? null, apres: o.prix, date: d };
    }
  } else if (type === 'ventes') {
    const j0 = joursVentes();
    for (const [e, o] of Object.entries(apres)) {
      const a = avant[e]; if (!a || !etiquetable(o) || force[e]) continue;
      const t0 = top(a, j0), t1 = top(o, jours);
      if (t0 !== t1) CHG[e] = { r: t1 ? 'top' : 'plus-top', date: d };
    }
  }
  await garder();
});

/** Les étiquettes du rayon qui ne sont plus justes, avec la raison. */
export function aRefaire() {
  ctx();
  const P = etat.produits, out = new Map();
  for (const [e, i] of Object.entries(IMP)) {
    const o = P[e]; if (!etiquetable(o)) continue;
    if (!memePrix(o.prix, i.prix)) out.set(e, { e, o, why: `Imprimée à ${euros(i.prix)}, en caisse ${euros(o.prix)}` });
    else if (modelOf(o) !== i.modele) out.set(e, { e, o, why: modelOf(o) === 'top' ? 'Passe en Top vente' : "N'est plus Top vente" });
  }
  for (const [e, c] of Object.entries(CHG)) {
    if (out.has(e)) continue;
    const o = P[e]; if (!etiquetable(o)) continue;
    if (IMP[e]) continue; // déjà comparé à l'étiquette imprimée ci-dessus
    const why = c.r === 'nouveau' ? 'Nouvelle fiche en caisse'
      : c.r === 'prix' ? `Prix changé en caisse : ${euros(c.avant)} → ${euros(o.prix)}`
        : c.r === 'top' ? 'Passe en Top vente' : "N'est plus Top vente";
    if (c.r === 'prix' && !memePrix(o.prix, c.apres)) continue; // le prix a encore bougé : il apparaîtra au prochain import
    out.set(e, { e, o, why });
  }
  return [...out.values()].filter(x => IGN[x.e] !== x.why);
}

/** « Ignorer » : ce motif ne revient plus pour ce produit (un nouveau motif, si). */
export async function ignorer(e, why) { const avant = IGN[e]; IGN[e] = why; await garder(); return async () => { if (avant === undefined) delete IGN[e]; else IGN[e] = avant; await garder(); }; }
