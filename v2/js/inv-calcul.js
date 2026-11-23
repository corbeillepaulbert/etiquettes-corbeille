// Lot 7 : règles de l'inventaire connecté, sans écran (testables seules). Voir la fiche « Lot 7 — Inventaire connecté ».
// Chaque comptage est une ligne { id, e, q, z, t, qui, rem?, ann? } : on n'écrase jamais rien.
//  - rem = id d'une ligne que celle-ci corrige (l'ancienne reste dans l'historique, barrée) ;
//  - ann = id d'une ligne annulée (« Annuler » dans les 6 secondes) ;
//  - e = FIN (« 0000 ») : la sous-zone z est finie pour cette personne.
export const FIN = '0000';

/** Lignes encore valables : ni annulées, ni remplacées par une correction. */
export function lignesActives(toutes) {
  const morte = new Set();
  for (const l of toutes) { if (l.ann) morte.add(l.ann); if (l.rem) morte.add(l.rem); }
  return toutes.filter(l => !morte.has(l.id) && !l.ann && l.e !== FIN);
}

/** Par sous-zone et par produit : une personne = la somme de ses lignes ; plusieurs personnes = recomptage.
 *  Recomptage égal = confirmé ; différent = écart, la quantité retenue est celle du dernier recompté en attendant que quelqu'un tranche. */
export function parZone(toutes) {
  const Z = {};
  for (const l of lignesActives(toutes)) {
    const k = l.z + '|' + l.e;
    const x = Z[k] || (Z[k] = { z: l.z, e: l.e, parQui: {}, der: {} });
    x.parQui[l.qui] = (x.parQui[l.qui] || 0) + l.q;
    if (!x.der[l.qui] || l.t > x.der[l.qui]) x.der[l.qui] = l.t;
  }
  return Object.values(Z).map(x => {
    const qui = Object.keys(x.parQui), vals = qui.map(p => x.parQui[p]);
    const dernier = qui.sort((a, b) => x.der[b].localeCompare(x.der[a]))[0];
    const egal = vals.every(v => v === vals[0]);
    return { z: x.z, e: x.e, q: x.parQui[dernier], parQui: x.parQui, recompte: qui.length > 1, ecart: qui.length > 1 && !egal };
  });
}

/** Total par produit : les sous-zones différentes s'additionnent. */
export function totaux(toutes) {
  const T = {};
  for (const r of parZone(toutes)) T[r.e] = (T[r.e] || 0) + r.q;
  return T;
}

/** Avancement d'une sous-zone : produits comptés, personnes, finie (une personne a touché « J'ai fini »). */
export function avancement(toutes, zones) {
  const A = Object.fromEntries(zones.map(z => [z.id, { produits: new Set(), qui: new Set(), finie: '' }]));
  const actives = lignesActives(toutes), annulees = new Set(toutes.filter(l => l.ann).map(l => l.ann));
  for (const l of actives) { const a = A[l.z]; if (a) { a.produits.add(l.e); a.qui.add(l.qui); } }
  for (const l of toutes) if (l.e === FIN && !annulees.has(l.id) && A[l.z]) A[l.z].finie = l.qui;
  return A;
}

/** Zones par défaut (décision du 23/11) : Magasin et Réserve, avec leurs sous-zones. */
export const ZONES_DEFAUT = [
  ['magasin', 'Magasin', ''], ['frigo-boissons', 'Frigo boissons', 'magasin'], ['frigo-frais', 'Frigo frais', 'magasin'], ['congelo', 'Congélo', 'magasin'],
  ['mur-1', 'Mur 1', 'magasin'], ['mur-2', 'Mur 2', 'magasin'], ['mur-3', 'Mur 3', 'magasin'],
  ['reserve', 'Réserve', ''], ['reserve-haut', 'Réserve du haut', 'reserve'], ['reserve-bas', 'Réserve du bas', 'reserve'], ['chambre-froide', 'Chambre froide', 'reserve']
].map(([id, nom, parent]) => ({ id, nom, parent }));

/** Ce qui est compté : ni fruits et légumes, ni pain, ni produits pesés (codes internes en 2…). */
export const aCompter = o => !!o && !/FRUIT|LEG|BOULANG|PAIN/i.test(`${o.dep || ''}`) && !/^2\d{12}$/.test(o.e);

export const nouvelId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
