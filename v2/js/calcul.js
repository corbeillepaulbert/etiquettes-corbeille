// Quantité proposée et sa justification. Règle volontairement simple et lisible :
// quantité = ventes par semaine × nombre de semaines jusqu'au prochain achat, arrondie au-dessus.
// Le stock n'entre pas dans le calcul tant que l'inventaire n'est pas fait (décision du 17/11/2026).

export const REGLAGES_DEFAUT = { semaines: 1, seuilTop: 365 };

const estFrais = p => /frais|cr[eè]merie|laiti|yaourt|lait/i.test(`${p.dep || ''} ${p.ray || ''}`);

function texteRythme(semaines) {
  return semaines === 1 ? 'chaque semaine' : `toutes les ${semaines} semaines`;
}

function texteVente(parSemaine) {
  if (parSemaine < 1) return "moins d'un par semaine";
  return `${Math.round(parSemaine)} par semaine`;
}

function textePeriode(jours) {
  if (jours >= 330) return "sur l'année";
  const mois = Math.round(jours / 30);
  return mois <= 1 ? 'sur un mois' : `sur ${mois} mois`;
}

export function calculAchat(p, meta = {}, reglages = REGLAGES_DEFAUT) {
  const jours = meta.jours || 365;
  const semaines = reglages.semaines || 1;
  const vendus = typeof p.q === 'number' ? p.q : null;
  const raisons = [];
  if (vendus === null || vendus <= 0) {
    return {
      qte: 0, unite: 'unité', faible: true, top: false,
      raisons: [{ icone: 'courbe', html: `Aucune vente <b>${textePeriode(jours)}</b>` }],
      alerte: "Pas vendu sur la période : à toi de voir.",
      fiabilite: 'Calcul sur les ventes seules : le stock n\'est pas encore compté.'
    };
  }
  const parSemaine = vendus / jours * 7;
  const qte = Math.max(1, Math.ceil(parSemaine * semaines - 0.25));
  raisons.push({ icone: 'courbe', html: `Il en part <b>${texteVente(parSemaine)}</b> ${textePeriode(jours)}` });
  raisons.push({ icone: 'agenda', html: `Tu achètes <b>${texteRythme(semaines)}</b>` });
  if (estFrais(p)) raisons.push({ icone: 'frais', html: `<b>Produit frais</b> : pas plus d'avance que ça` });
  return {
    qte, unite: qte > 1 ? 'unités' : 'unité',
    parSemaine, parMois: vendus / jours * 30,
    faible: parSemaine < 1,
    top: vendus / jours * 365 >= (reglages.seuilTop || 365),
    raisons,
    alerte: parSemaine < 1 ? "Il en part moins d'un par semaine : à toi de voir." : null,
    fiabilite: 'Calcul sur les ventes seules : le stock n\'est pas encore compté.'
  };
}

export function euros(x) {
  if (typeof x !== 'number' || !isFinite(x)) return 'Prix à définir';
  return x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export function marge(p) {
  // Marge sur le prix de vente HT, si le prix d'achat est connu. Rien n'est inventé.
  if (typeof p.pa0 !== 'number' || typeof p.prix !== 'number' || !p.prix) return null;
  const tva = typeof p.tva === 'number' ? p.tva : 5.5;
  const ht = p.prix / (1 + tva / 100);
  return Math.round((ht - p.pa0) / ht * 100);
}
