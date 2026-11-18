// Ce que la lecture d'une facture a donné (fournisseur, montant, nombre de produits), pour l'afficher dans « À traiter » sans rouvrir le PDF.
// Le cache vit dans le Drive (APPLI V2/FACTURES_CACHE, écrit par le script) ; une copie reste sur l'appareil pour l'affichage hors ligne.
import { lire, ecrire } from './donnees.js';
import { fichierFacture, lireCache, ecrireCache } from './drive.js';
import { pdfRead } from './moteur/lecture.js';
import { statsDeTexte, auxLectures } from './facture.js';

let L = {};                   // { [idFacture]: { fournisseur, montant, nb } }
const essayes = new Set();    // lectures tentées pendant cette ouverture de l'appli (pas de nouvelle tentative en boucle)
let enCours = false;
export const lecture = id => L[id] || null;
export async function chargerLectures() { L = await lire('lecturesFactures', {}); }
const garder = () => ecrire('lecturesFactures', L);

/** Une lecture faite dans « Travailler une facture » : on la garde ici et dans le cache du Drive. */
export async function noter(id, d) {
  L[id] = d; await garder(); essayes.add(id);
  try { await ecrireCache(id, d); } catch (x) { console.error('[V2/ATraiter] cache non écrit :', x.message); }
}
auxLectures((id, d) => { noter(id, d); });

/** Demande au Drive le cache des factures affichées. Les montants arrivent dès que le cache répond. */
export async function chargerCache(elements) {
  const ids = elements.filter(x => x.etat === 'nouveau' || x.etat === 'traite').map(x => x.id).slice(0, 150);
  if (!ids.length) return false;
  const c = await lireCache(ids);
  let change = false;
  for (const [id, v] of Object.entries(c)) if (JSON.stringify(L[id]) !== JSON.stringify(v)) { L[id] = v; change = true; }
  if (change) await garder();
  console.log(`[V2/ATraiter] cache : ${Object.keys(c).length} lecture(s) sur ${ids.length}`);
  return change;
}

/** Première lecture des factures qui n'ont pas encore de cache : PDF avec texte seulement (une photo ou un scan se lit à l'ouverture). */
export async function lirePremieres(elements, { max = 4, quandFini = () => { }, encore = () => true } = {}) {
  if (enCours) return; enCours = true;
  try {
    const a = elements.filter(x => x.etat === 'nouveau' && !L[x.id] && !essayes.has(x.id) && /\.pdf$/i.test(x.nom)).slice(0, max);
    for (const x of a) {
      if (!encore()) break;
      essayes.add(x.id);
      try {
        const f = await fichierFacture(x.id);
        const { text, imgs } = await pdfRead(f);
        if (imgs.length) continue; // page sans texte : on ne lance pas la lecture optique en fond
        const s = statsDeTexte(text); if (!s) continue;
        L[x.id] = s; await garder();
        try { await ecrireCache(x.id, s); } catch (e) { }
        quandFini();
      } catch (e) { console.error('[V2/ATraiter] lecture en fond impossible :', e.message); }
    }
  } finally { enCours = false; }
}
