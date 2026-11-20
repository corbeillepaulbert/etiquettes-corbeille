// Lot 5 : produits inconnus. Chaque code inconnu scanné (Magasin, Achat, Étiquettes, Affiches, mode caisse) entre dans une file
// partagée entre les appareils (document Drive « produits-inconnus »). Le responsable les identifie (OpenFoodFacts, go-upc),
// crée les fiches et fabrique le fichier d'import StorePOS (mode 3, création seulement) avec la règle de la V1.
import { etat, lire, ecrire, trouver } from './donnees.js';
import { appel, estRelie, estInvite } from './drive.js';
import { barreMode, joli } from './ecrans.js';
import { icone } from './icones.js';
import { euros } from './calcul.js';
import * as IMP from './moteur/import.js';
import { chk } from './moteur/etiquettes.js';
import { ajouterEtiquettes } from './etiquettes.js';
import { telecharger } from './livrer.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DOC = 'produits-inconnus';
const MAX_EVTS = 40;
// I : { [code]: { evts: [{t, qui, src}], off: {nom, marque, qte, image, nonAlim} | null, ignore: date|null } }
let I = {}, SUPP = {}, NEWF = {}, DERNIER = null, appareil = '';
export async function chargerInconnus() { I = await lire('inconnus', {}); SUPP = await lire('inconnusSupp', {}); NEWF = await lire('fichesACreer', {}); appareil = await lire('nomAppareil', ''); }
const garder = () => Promise.all([ecrire('inconnus', I), ecrire('inconnusSupp', SUPP), ecrire('fichesACreer', NEWF), ecrire('inconnusAEnvoyer', true)]);
export const aIdentifier = () => Object.entries(I).filter(([c, x]) => !x.ignore && !NEWF[c] && !etat.produits[c]);
const codeValide = c => /^\d{8,14}$/.test(c);
const interne = c => /^2[0-9]{12}$/.test(c) && /^200000000/.test(c); // pesée ou code interne F&L : autre procédure

/** Un code inconnu vient d'être scanné. Rien n'est fait pour un invité. */
export async function noterInconnu(code, src, qui = '') {
  code = String(code || '').trim();
  if (estInvite() || !codeValide(code) || trouver(code)) return;
  const x = I[code] || { evts: [], off: null, ignore: null };
  x.evts.push({ t: new Date().toISOString(), qui: qui || appareil || '', src }); x.evts = x.evts.slice(-MAX_EVTS); x.ignore = null;
  I[code] = x; await garder();
  console.log(`[V2/Inconnus] ${code} noté (${src}) · ${x.evts.length} passage(s)`);
  if (quandChange) quandChange();
}
let quandChange = null; export function siInconnuChange(fn) { quandChange = fn; }

/** Fusion entre appareils : union des passages ; une fiche créée ou un code ignoré l'emporte. */
export function fusion(a, b) {
  const out = {};
  for (const src of [a, b]) for (const [c, x] of Object.entries(src || {})) {
    const y = out[c] || { evts: [], off: null, ignore: null };
    const vus = new Set(y.evts.map(e => e.t + e.qui));
    for (const e of x.evts || []) if (!vus.has(e.t + e.qui)) { y.evts.push(e); vus.add(e.t + e.qui); }
    y.evts.sort((p, q) => p.t.localeCompare(q.t)); y.evts = y.evts.slice(-MAX_EVTS);
    y.off = y.off || x.off || null; y.ignore = y.ignore || x.ignore || null; out[c] = y;
  }
  return out;
}
export async function synchroniserInconnus() {
  if (!estRelie() || estInvite()) return;
  for (let essai = 0; essai < 3; essai++) {
    const d = await appel('lire', { doc: DOC }); if (!d.ok) throw new Error('refusé');
    const f = fusion(I, d.valeur && d.valeur.inconnus);
    for (const c of Object.keys(f)) if (etat.produits[c]) delete f[c]; // déjà créé en caisse : sort de la file
    I = f; await ecrire('inconnus', I);
    if (JSON.stringify(d.valeur && d.valeur.inconnus) === JSON.stringify(I)) { await ecrire('inconnusAEnvoyer', false); return; }
    const w = await appel('ecrire', { doc: DOC, valeur: { inconnus: I }, version: d.version });
    if (w.ok) { await ecrire('inconnusAEnvoyer', false); return; }
    if (!w.conflit) throw new Error('refusé');
  }
}

/** OpenFoodFacts (base libre, appelée depuis le téléphone). Le résultat est gardé avec le code. */
export async function chercherOFF(code) {
  const x = I[code]; if (x && x.off) return x.off;
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name_fr,product_name,brands,quantity,image_front_small_url,categories_tags`, { headers: { Accept: 'application/json' } });
  if (!r.ok && r.status !== 404) throw new Error('OpenFoodFacts ne répond pas');
  const j = await r.json().catch(() => ({}));
  const p = j && j.status === 1 ? j.product : null;
  const off = p ? { nom: p.product_name_fr || p.product_name || '', marque: String(p.brands || '').split(',')[0].trim(), qte: p.quantity || '', image: p.image_front_small_url || '', trouve: true }
    : { trouve: false };
  if (x) { x.off = off; await garder(); }
  return off;
}

/** Désignation proposée, au format des fiches de caisse : majuscules, marque puis quantité. */
function designation(off) {
  if (!off || !off.trouve) return '';
  return [off.nom, off.marque && !String(off.nom).toUpperCase().includes(off.marque.toUpperCase()) ? off.marque : '', off.qte]
    .filter(Boolean).join(' ').toUpperCase().normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 60);
}
const jourHeure = t => new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function ecranInconnus(nav, message = '') {
  const L = aIdentifier().sort((a, b) => b[1].evts.length - a[1].evts.length || (b[1].evts.at(-1)?.t || '').localeCompare(a[1].evts.at(-1)?.t || ''));
  const prets = Object.entries(NEWF);
  const carte = ([c, x]) => {
    const n = x.evts.length, der = x.evts.at(-1) || {}, o = x.off;
    return `<div class="carte inc-carte"><div class="inc-l1"><div><div class="titre-3" style="overflow-wrap:anywhere">${o && o.trouve && o.nom ? esc(o.nom) : 'Produit à identifier'}</div>
        <div class="note">${esc(c)}${o && o.marque ? ` · ${esc(o.marque)}` : ''}${o && o.qte ? ` · ${esc(o.qte)}` : ''}</div></div>
        ${o && o.image ? `<img src="${esc(o.image)}" alt="" class="inc-img">` : ''}</div>
      <div class="note">${n} passage${n > 1 ? 's' : ''} · dernier le ${esc(jourHeure(der.t))}${der.qui ? ` · ${esc(der.qui)}` : ''}${n > 3 ? ' · <b style="color:var(--erreur)">à traiter vite</b>' : ''}</div>
      ${interne(c) ? '<div class="bandeau bandeau--alerte"><span>Code interne ou pesée : fiche fruit et légume, pas ce circuit.</span></div>' : ''}
      ${!o ? `<button class="btn btn--secondaire" data-action="inc-off" data-c="${esc(c)}">Chercher dans OpenFoodFacts</button>` : o.trouve ? '' : '<div class="note">Absent d\'OpenFoodFacts.</div>'}
      <div class="duo"><button class="btn btn--principal" data-action="inc-fiche" data-c="${esc(c)}">Créer la fiche</button><a class="btn btn--secondaire" href="https://go-upc.com/search?q=${esc(c)}" target="_blank" rel="noopener">go-upc</a></div>
      <button class="at-lien at-lien--gris" data-action="inc-ignorer" data-c="${esc(c)}">Ignorer ce code</button></div>`;
  };
  nav.afficher(`<div class="scr cb">${barreMode('magasin', 'Produits inconnus', true)}
  <div class="scr__corps">
    <h1 class="titre-1">Produits inconnus</h1>
    <div class="note">Les codes scannés qui ne sont pas en caisse, sur tous les appareils. Les plus fréquents en haut.</div>
    ${message ? `<div class="bandeau bandeau--alerte">${icone('info', 'cb-ico cb-ico--24')}<span>${message}</span></div>` : ''}
    ${prets.length ? `<div class="carte" style="display:grid;gap:10px;box-shadow:inset 0 0 0 2px var(--corbeille)"><div class="titre-2">${prets.length} fiche${prets.length > 1 ? 's' : ''} prête${prets.length > 1 ? 's' : ''} à créer</div>
      ${prets.map(([e, f]) => `<div class="ligne" style="box-shadow:none;padding:0;min-height:56px"><div class="ligne__txt"><div class="ligne__titre">${esc(f.lib)}</div><div class="ligne__detail">${euros(f.prix)} · ${esc(f.dep)}${f.pa ? ` · achat ${euros(f.pa)}` : ' · achat inconnu'}</div></div><button class="btn btn--discret" data-action="inc-retirer" data-c="${esc(e)}">Retirer</button></div>`).join('')}
      <button class="btn btn--principal" data-action="inc-import">Créer le fichier d'import StorePOS</button></div>` : ''}
    ${DERNIER ? `<div class="carte" style="display:grid;gap:10px"><div class="titre-3">${esc(DERNIER.nom)}</div><div class="note">${DERNIER.n} fiche(s). Back Office → Produits → Importer des produits. Teste d'abord sur 1 ligne, puis TPV → Transfert des modifications. Les étiquettes sont sur la planche.</div><button class="btn btn--secondaire" data-action="inc-enregistrer">Enregistrer le fichier</button></div>` : ''}
    ${L.length ? L.map(carte).join('') : `<div class="carte"><div class="titre-2">Aucun produit inconnu.</div><div class="note" style="margin-top:8px">Quand un code scanné n'est pas en caisse, il arrive ici tout seul.</div></div>`}
  </div>
  <div class="scr__bas"><button class="btn btn--secondaire" data-action="inc-sync">${icone('import')}Rafraîchir</button></div></div>`, 'inconnus');
}

function feuilleFiche(nav, code) {
  const x = I[code] || {}, o = x.off;
  const deps = IMP.DEPARTEMENTS();
  const depDefaut = deps.includes('EPICERIE TAUX REDUIT') ? 'EPICERIE TAUX REDUIT' : deps[0];
  const d = document.createElement('div'); d.className = 'toast-zone cb'; d.style.cssText = 'top:auto;bottom:0;left:0;right:0';
  d.innerHTML = `<div class="feuille-saisie" style="position:relative;max-height:90vh;overflow:auto">
    <div class="titre-3">Nouvelle fiche · ${esc(code)}</div>
    ${/^\d+$/.test(code) && (code.length === 13 || code.length === 8) && !chk(code) ? '<div class="bandeau bandeau--alerte"><span>Clé du code-barres fausse : vérifie le code.</span></div>' : ''}
    <label class="fort">Désignation en caisse</label><input class="champ" data-k="lib" value="${esc(designation(o))}" maxlength="60" style="font-size:18px;text-transform:uppercase" placeholder="NOM MARQUE 500G">
    <label class="fort">Département</label><select class="champ" data-k="dep" style="font-size:18px">${deps.map(k => `<option${k === depDefaut ? ' selected' : ''}>${esc(k)}</option>`).join('')}</select>
    <div class="note">Non alimentaire : DIVERS 20 %. La TVA suit le département.</div>
    <label class="fort">Prix de vente TTC</label><input class="champ" data-k="prix" inputmode="decimal" placeholder="ex. 2,50" style="font-size:20px">
    <label class="fort">Prix d'achat HT (facture)</label><input class="champ" data-k="pa" inputmode="decimal" placeholder="vide si pas de facture" style="font-size:18px">
    <div class="note">Jamais de prix d'achat sans facture : laisse vide, la fiche sera signalée.</div>
    <label class="fort">Fournisseur (facultatif)</label><input class="champ" data-k="four" style="font-size:18px" placeholder="ex. METRO">
    <div data-err></div>
    <button class="btn btn--principal" data-ok>Ajouter aux fiches à créer</button>
    <button class="btn btn--secondaire" data-fermer>Fermer</button></div>`;
  document.body.appendChild(d);
  d.querySelector('[data-fermer]').onclick = () => d.remove();
  d.querySelector('[data-ok]').onclick = async () => {
    const v = k => d.querySelector(`[data-k="${k}"]`).value.trim();
    const n = t => { const x = parseFloat(String(t).replace(',', '.')); return isFinite(x) && x > 0 ? Math.round(x * 100) / 100 : null; };
    const lib = v('lib').toUpperCase(), prix = n(v('prix')), pa = n(v('pa'));
    const err = !lib ? 'Écris la désignation.' : prix == null ? 'Écris le prix de vente (aucun prix n\'est inventé).' : '';
    if (err) { d.querySelector('[data-err]').innerHTML = `<div class="bandeau bandeau--erreur"><span>${err}</span></div>`; return; }
    NEWF[code] = { kind: 'epi', lib, dep: v('dep'), fam: 'CREATION CAISSE', ray: '', four: v('four').toUpperCase(), reff: '', pa, prix, date: new Date().toISOString().slice(0, 10) };
    await garder(); d.remove(); ecranInconnus(nav);
    nav.toast('Ajouté aux fiches à créer', async () => { delete NEWF[code]; await garder(); ecranInconnus(nav); });
  };
}

function lireV1(cle, defaut) { try { const v = localStorage.getItem(cle); return v ? JSON.parse(v) : defaut; } catch (e) { return defaut; } }

export async function actionInconnus(a, b, nav) {
  if (a !== 'inconnus' && !a.startsWith('inc-')) return false;
  if (a === 'inconnus') { ecranInconnus(nav); synchroniserInconnus().then(() => ecranInconnus(nav)).catch(() => { }); return true; }
  if (a === 'inc-sync') { b.disabled = true; try { await synchroniserInconnus(); ecranInconnus(nav); } catch (x) { ecranInconnus(nav, `Drive : ${esc(x.message)}.`); } return true; }
  if (a === 'inc-off') {
    b.disabled = true; b.textContent = 'Recherche…';
    try { const off = await chercherOFF(b.dataset.c); ecranInconnus(nav); nav.toast(off.trouve ? 'Trouvé dans OpenFoodFacts' : 'Absent d\'OpenFoodFacts : essaie go-upc'); }
    catch (x) { ecranInconnus(nav, navigator.onLine ? esc(x.message) : 'Pas de réseau : réessaie plus tard.'); }
    return true;
  }
  if (a === 'inc-fiche') { feuilleFiche(nav, b.dataset.c); return true; }
  if (a === 'inc-ignorer') {
    const c = b.dataset.c, avant = I[c].ignore; I[c].ignore = new Date().toISOString(); await garder(); ecranInconnus(nav);
    nav.toast('Code ignoré', async () => { I[c].ignore = avant; await garder(); ecranInconnus(nav); }); return true;
  }
  if (a === 'inc-retirer') {
    const c = b.dataset.c, f = NEWF[c]; delete NEWF[c]; await garder(); ecranInconnus(nav);
    nav.toast('Fiche retirée', async () => { NEWF[c] = f; await garder(); ecranInconnus(nav); }); return true;
  }
  if (a === 'inc-import') {
    const MAP = IMP.codes(lireV1('cpb_map', {}));
    const { rows, blk } = IMP.creationRows(NEWF, MAP);
    if (blk.length) { ecranInconnus(nav, blk.map(x => `${esc(x.lib)} : ${esc(x.why.join(', '))}`).join('<br>') + (blk.some(x => x.why.some(w => /famille/.test(w))) ? '<br>Les codes de famille viennent de l\'appli actuelle (Réglages → Codes StorePOS).' : '')); return true; }
    if (!rows.length) return true;
    const d = new Date(), z = n => String(n).padStart(2, '0'), nom = `IMPORT-PRODUITS-INCONNUS-${String(d.getFullYear()).slice(2)}${z(d.getMonth() + 1)}${z(d.getDate())}.xlsx`;
    DERNIER = { nom, n: rows.length, blob: IMP.xlsx('IMPORT PRODUITS', [IMP.HEAD, ...rows]) };
    const avant = { NEWF: { ...NEWF } }, crees = Object.keys(NEWF);
    // comme la V1 : la fiche existe sur l'appareil dès le fichier créé (scan, étiquettes) ; elle sera remplacée par l'export StorePOS suivant
    for (const [e, f] of Object.entries(NEWF)) etat.produits[e] = { e, lib: f.lib, prix: f.prix, dep: f.dep, fam: f.fam, four: f.four, pa0: f.pa, q: null, neuf: 1 };
    await ecrire('produits', etat.produits);
    const etq = await ajouterEtiquettes(crees);
    NEWF = {}; await garder(); telecharger(new File([DERNIER.blob], nom, { type: DERNIER.blob.type }));
    ecranInconnus(nav);
    nav.toast(`Fichier créé · ${etq.length} étiquette(s) sur la planche`, async () => { NEWF = avant.NEWF; for (const e of crees) delete etat.produits[e]; await ecrire('produits', etat.produits); DERNIER = null; await garder(); ecranInconnus(nav); });
    return true;
  }
  if (a === 'inc-enregistrer') { if (DERNIER) telecharger(new File([DERNIER.blob], DERNIER.nom, { type: DERNIER.blob.type })); return true; }
  return false;
}
