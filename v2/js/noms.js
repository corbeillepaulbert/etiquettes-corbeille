// Lot 10 : refonte du nom produit. Un nom court et lisible pour l'étiquette (produit, marque, poids),
// proposé depuis le nom en caisse et OpenFoodFacts, validé d'un geste, repris sur toutes les étiquettes.
// Le nom en caisse (StorePOS) ne change pas : seul le nom imprimé change, comme dans la V1.
import { etat, lire, ecrire } from './donnees.js';
import { barreMode, joli } from './ecrans.js';
import { icone } from './icones.js';
import { cleanName, fitName } from './moteur/etiquettes.js';
import { nomImprime, nomPerso, surPlanche, fixerNom } from './etiquettes.js';
import { aRefaire, etiquetable } from './refaire.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let OFF = {}, VUS = {};
export async function chargerNoms() { OFF = await lire('offNoms', {}); VUS = await lire('nomsVus', {}); }
const garder = async () => { await ecrire('offNoms', OFF); await ecrire('nomsVus', VUS); };

// Abréviations courantes des libellés de caisse. La proposition est toujours relue avant d'être prise.
const ABR = { CHOC: 'CHOCOLAT', CHOCO: 'CHOCOLAT', BISC: 'BISCUITS', FROM: 'FROMAGE', SCE: 'SAUCE', HLE: 'HUILE', CONF: 'CONFITURE', BOISS: 'BOISSON', NAT: 'NATURE', ORIG: 'ORIGINAL', FRAMB: 'FRAMBOISE', FRSE: 'FRAISE', ABRIC: 'ABRICOT', VAN: 'VANILLE', CARAM: 'CARAMEL', NOIS: 'NOISETTE', AMAND: 'AMANDE', LEG: 'LÉGUMES', TOM: 'TOMATE', CREM: 'CRÈME', DESS: 'DESSERT', YAO: 'YAOURT', JUS: 'JUS', MENTH: 'MENTHE', CITR: 'CITRON', ORA: 'ORANGE', PCHE: 'PÊCHE', ASS: 'ASSORTIS', GDE: 'GRANDE', PTE: 'PETITE', PT: 'PETIT', GD: 'GRAND', SS: 'SANS', AV: 'AVEC' };
const UNITE = /^(KG|G|GR|CL|ML|L|X|PCS?|LOT)$/;
const abrege = w => !/\d/.test(w) && !UNITE.test(w) && w.length >= 2 && (ABR[w.replace(/\.$/, '')] || /\.$/.test(w) || (w.length <= 4 && !/[AEIOUYÉÈ]/.test(w)));

let C2D = null;
const c2d = () => C2D || (C2D = document.createElement('canvas').getContext('2d'));
/** Taille de la police du nom sur l'étiquette (mêmes réglages que l'impression). */
export const taille = nom => fitName(c2d(), String(nom).toUpperCase(), 497, 138).s;
const lisible = s => s >= 46 ? 'grand' : s >= 34 ? 'moyen' : 'petit';

function depuisCaisse(lib) {
  return cleanName(String(lib).toUpperCase().split(' ').map(w => ABR[w.replace(/\.$/, '')] || w).join(' '));
}
function depuisOFF(off) {
  if (!off || !off.trouve || !off.nom) return '';
  const nom = String(off.nom).toUpperCase(), marque = String(off.marque || '').toUpperCase();
  const avec = [nom, marque && !nom.includes(marque) ? marque : '', off.qte || ''].filter(Boolean).join(' ');
  const sans = [nom, off.qte || ''].filter(Boolean).join(' ');
  const a = cleanName(avec.normalize('NFC')), b = cleanName(sans.normalize('NFC'));
  return taille(a) >= 34 ? a : b;
}
/** La proposition : OpenFoodFacts si le produit y est, sinon le nom en caisse avec les abréviations développées. */
export function proposition(o) {
  const p = depuisOFF(OFF[o.e]) || depuisCaisse(o.lib);
  return p === cleanName(o.lib) ? '' : p;
}

/** Produits dont le nom imprimé mérite d'être revu : sur la planche, à refaire, et les plus vendus. */
export function aRevoir() {
  const P = etat.produits;
  const cand = new Set([...surPlanche(), ...aRefaire().map(x => x.e)]);
  Object.values(P).filter(etiquetable).sort((a, b) => (b.q || 0) - (a.q || 0)).slice(0, 80).forEach(o => cand.add(o.e));
  const out = [];
  for (const e of cand) {
    const o = P[e]; if (!etiquetable(o) || nomPerso(e) !== undefined || VUS[e]) continue;
    const nom = nomImprime(o), s = taille(nom), abr = nom.split(/\s+/).filter(abrege);
    const why = s < 40 ? `Nom trop long : imprimé en ${lisible(s)}` : abr.length ? `Abréviation${abr.length > 1 ? 's' : ''} : ${abr.slice(0, 3).join(', ')}` : '';
    if (why) out.push({ e, o, nom, why });
  }
  return out;
}

async function chercherOFF(e) {
  if (OFF[e]) return OFF[e];
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(e)}.json?fields=product_name_fr,product_name,brands,quantity`, { headers: { Accept: 'application/json' } });
  if (!r.ok && r.status !== 404) throw new Error('OpenFoodFacts ne répond pas');
  const j = await r.json().catch(() => ({})), p = j && j.status === 1 ? j.product : null;
  OFF[e] = p ? { nom: p.product_name_fr || p.product_name || '', marque: String(p.brands || '').split(',')[0].trim(), qte: p.quantity || '', trouve: true } : { trouve: false };
  await garder(); return OFF[e];
}

let enCours = false;
export function ecranNoms(nav, message = '') {
  const L = aRevoir(), vue = L.slice(0, 12);
  const carte = x => {
    const p = proposition(x.o), off = OFF[x.e];
    return `<div class="carte" style="display:grid;gap:10px">
      <div><div class="titre-3" style="overflow-wrap:anywhere">${esc(x.nom)}</div><div class="note">${esc(x.why)} · en caisse : ${esc(x.o.lib)}</div></div>
      <label class="fort" for="nom-${esc(x.e)}">Nom sur l'étiquette</label>
      <input class="champ" id="nom-${esc(x.e)}" data-nom-e="${esc(x.e)}" value="${esc(p || x.nom)}" style="text-transform:uppercase;font-size:20px" autocomplete="off">
      <div class="note">${off && off.trouve ? 'Proposé avec OpenFoodFacts' : off ? "Pas dans OpenFoodFacts : proposé depuis le nom en caisse" : 'Proposé depuis le nom en caisse'}</div>
      <div class="duo"><button class="btn btn--principal" data-action="nom-prendre" data-e="${esc(x.e)}">Prendre ce nom</button>
      <button class="btn btn--secondaire" data-action="nom-garder" data-e="${esc(x.e)}">Garder l'actuel</button></div></div>`;
  };
  nav.afficher(`<div class="scr cb">${barreMode('magasin', 'Étiquettes', true)}
  <div class="scr__corps">
    <h1 class="titre-1">Noms à revoir</h1>
    ${message ? `<div class="bandeau bandeau--alerte">${icone('info', 'cb-ico cb-ico--24')}<span>${esc(message)}</span></div>` : ''}
    <div class="note">Un nom court se lit de loin : produit, marque, poids. Le nom en caisse ne change pas.</div>
    ${vue.length ? vue.map(carte).join('') : '<div class="carte"><div class="titre-2">Tous les noms sont lisibles.</div></div>'}
    ${L.length > vue.length ? `<div class="note">Encore ${L.length - vue.length} après ceux-ci.</div>` : ''}
  </div>
  <div class="scr__bas"><button class="btn btn--principal" data-action="etiquettes">Retour à la planche</button></div></div>`, 'noms');
  // OpenFoodFacts pour les cartes affichées, en fond, puis l'écran se redessine une fois
  const manque = vue.filter(x => !OFF[x.e]).map(x => x.e);
  if (manque.length && navigator.onLine && !enCours) {
    enCours = true;
    (async () => { for (const e of manque) { try { await chercherOFF(e); } catch (x) { break; } } })()
      .finally(() => { enCours = false; if (document.querySelector('[data-nom-e]')) ecranNoms(nav); });
  }
}

export async function actionNoms(a, b, nav) {
  if (a === 'noms') { ecranNoms(nav); return true; }
  if (a === 'nom-prendre') {
    const e = b.dataset.e, v = document.querySelector(`[data-nom-e="${CSS.escape(e)}"]`)?.value || '';
    if (!v.trim()) { ecranNoms(nav, 'Écris un nom, ou touche « Garder l\'actuel ».'); return true; }
    const defaire = await fixerNom(e, v); ecranNoms(nav);
    nav.toast('Nom pris pour toutes les étiquettes', async () => { await defaire(); ecranNoms(nav); });
    return true;
  }
  if (a === 'nom-garder') {
    const e = b.dataset.e; VUS[e] = new Date().toISOString(); await garder(); ecranNoms(nav);
    nav.toast('Nom gardé', async () => { delete VUS[e]; await garder(); ecranNoms(nav); });
    return true;
  }
  return false;
}
export const nbNomsARevoir = () => aRevoir().length;
