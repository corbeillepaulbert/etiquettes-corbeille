// Lot 2c : travailler une facture. Lecture des lignes, comparaison avec StorePOS, prix de vente.
// Tout reste sur l'appareil : rien n'est écrit dans StorePOS ni dans le Drive (l'écriture vient au lot suivant).
// Les règles (lecture Agrifresh, rapprochement, marge, prix de vente suggéré) sont celles de la V1, dans moteur/facture.js.
import { etat, lire, ecrire } from './donnees.js';
import { estRelie, facturesDrive, fichierFacture, marquerTraite } from './drive.js';
import { livrer } from './livrer.js';
import { ajouterEtiquettes, retirerEtiquettes } from './etiquettes.js';
import * as IMP from './moteur/import.js';
import { fournisseursCaisse, fournisseurDe } from './fournisseurs.js';
import { chercher } from './recherche.js';
import { icone } from './icones.js';
import { barreMode, joli } from './ecrans.js';
import * as F from './moteur/facture.js';
import { texteDeFichier } from './moteur/lecture.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const eur = n => n == null ? '–' : F.fmt(n) + ' €';
const virg = n => n == null ? '' : String(n).replace('.', ',');
const nombre = v => { const n = parseFloat(String(v ?? '').replace(',', '.').replace(/[^\d.\-]/g, '')); return isNaN(n) ? null : n; };

let FAC = null;          // { sup, date, nom, source, lignes }
let filtre = 'toutes';
export const facturePresente = () => !!FAC;

// V1 lit ses règles dans localStorage (lecture seule ici) : correspondances apprises et réglages F&L.
function lireV1(cle, defaut) { try { const v = localStorage.getItem(cle); return v ? JSON.parse(v) : defaut; } catch (e) { return defaut; } }
function preparerMoteur() {
  const map = lireV1('cpb_map', {});
  F.configurer({ P: etat.produits, MAP: { four: map.four || {} }, CASC: lireV1('cpb_casc', []), REFMAP: lireV1('cpb_refmap', {}), REGDES: lireV1('cpb_regdes', {}), SETF: lireV1('cpb_fl', {}) });
}

// Modifications en attente d'être injectées dans StorePOS : prix (MOD), entrées de stock (ENT), fichiers déjà créés (FAITS).
let MOD = {}, ENT = [], FAITS = [];
// Factures « En cours » (3 au plus, ouvertes depuis À traiter) : ENCOURS ne garde que l'identité ; chaque facture a sa copie « fac:<id> ».
const MAX_EN_COURS = 3;
let ENCOURS = {};
export const idsEnCours = () => Object.entries(ENCOURS).map(([id, v]) => ({ id, ...v }));
export const estEnCours = id => !!ENCOURS[id];
let surLecture = null; export function auxLectures(fn) { surLecture = fn; }
const jourLong = iso => iso ? new Date(iso + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : 'cette facture';
async function sauverEnCours() { await ecrire('facturesEnCours', ENCOURS); }
/** Note la facture comme « en cours ». Au-delà de 3, la plus ancienne repasse en attente. Renvoie son message pour le toast. */
async function mettreEnCours(id, dateFacture) {
  ENCOURS[id] = { ouvert: new Date().toISOString(), date: dateFacture || '' };
  let message = '';
  const autres = Object.entries(ENCOURS).filter(([k]) => k !== id).sort((a, b) => a[1].ouvert.localeCompare(b[1].ouvert));
  while (Object.keys(ENCOURS).length > MAX_EN_COURS && autres.length) {
    const [vieux, v] = autres.shift(); delete ENCOURS[vieux]; await ecrire('fac:' + vieux, null);
    message = `Celle du ${jourLong(v.date)} a été remise en attente`;
  }
  await sauverEnCours(); return message;
}
/** Sort une facture de « En cours » (validée, marquée traitée…). Renvoie ce qu'il faut pour la remettre (Annuler). */
export async function retirerEnCours(id) { const v = ENCOURS[id]; if (!v) return null; delete ENCOURS[id]; await sauverEnCours(); return v; }
export async function restaurerEnCours(id, v) { if (v) { ENCOURS[id] = v; await sauverEnCours(); } }
/** Rouvre une facture « en cours » sans relire le PDF. */
export async function reprendreEnCours(id, nav) {
  const f = await lire('fac:' + id, null); if (!f) return false;
  FAC = f; await garder(); preparerMoteur(); nav.afficher(ecranFacture(), 'facture'); return true;
}
/** Fournisseur, nombre de produits et somme des lignes lues dans le texte d'une facture (mêmes règles de lecture que « Travailler une facture »). */
export function statsDeTexte(texte) {
  preparerMoteur();
  const r = F.parseInvoice(texte, null);
  if (!r.lines.length) return null;
  const montant = r.lines.reduce((t, x) => t + (typeof x.mt === 'number' && isFinite(x.mt) ? x.mt : 0), 0);
  return { fournisseur: r.sup || '', montant: Math.round(montant * 100) / 100, nb: r.lines.length };
}

export async function chargerFacture() { ENCOURS = await lire('facturesEnCours', {}); FAC = await lire('factureEnCours', null); MOD = await lire('modifs', {}); ENT = await lire('entrees', []); FAITS = await lire('importsFaits', []); }
const garder = async () => { await ecrire('factureEnCours', FAC); if (FAC && FAC.driveId && ENCOURS[FAC.driveId]) await ecrire('fac:' + FAC.driveId, FAC); };
const garderTout = async () => { await ecrire('modifs', MOD); await ecrire('entrees', ENT); await ecrire('importsFaits', FAITS); };
export const enAttente = () => Object.keys(MOD).length + ENT.length;
const aujourdhui = () => new Date().toISOString().slice(0, 10);

// ---------- stock : règles de la routine mensuelle ----------
/** Quantité reçue = montant ÷ prix unitaire quand c'est un entier (même contrôle que la V1 pour lire une ligne). Sinon on ne devine pas. */
export function qteLue(x) { if (!(x.pu > 0) || x.mt == null) return null; const q = x.mt / x.pu; return Math.abs(q - Math.round(q)) < 0.02 && Math.round(q) >= 1 ? Math.round(q) : null; }
/** Produits qui n'entrent jamais en stock par ce circuit : flux tendu (fruits et légumes, pain, œufs) et codes internes. */
export function exclusStock(o) {
  if (F.isFL(o)) return 'fruits et légumes : flux tendu';
  if (/BOULANGERIE/i.test(o.dep || '')) return 'pain : flux tendu';
  if (/OEUF/.test(F.key(o.lib))) return 'œufs : flux tendu';
  if (/^2000000/.test(o.e)) return 'code interne';
  return '';
}
/** Quantités à revérifier avant d'entrer en stock : à confirmer ligne par ligne. */
export function controlesStock(x, o) {
  const w = [];
  if (x.q > 300) w.push('quantité > 300 : à confirmer');
  if (x.mt > 500) w.push('montant > 500 € HT : à confirmer');
  if (o?.q != null && x.q > 2 * o.q && x.q - o.q > 24) w.push(`achat suspect : ${x.q} reçus pour ${Math.round(o.q)} vendus sur la période`);
  return w;
}
const stockOk = x => { const o = etat.produits[x.e]; return !!o && !exclusStock(o) && !!x.act?.stk && x.q > 0 && (!controlesStock(x, o).length || !!x.ok); };
/** Cases cochées au départ : mêmes réglages que la V1 pour l'étiquette et le prix d'achat ; stock coché si la quantité est sûre. */
function defauts(x) {
  const o = etat.produits[x.e]; x.act = x.act || {};
  x.q = qteLue(x);
  x.act.stk = !!o && !exclusStock(o) && x.q != null && !controlesStock(x, o).length;
}

// ---------- calculs d'une ligne ----------
export function ecartPA(o, x) {
  if (!o || x.pu == null || !(o.pa0 > 0)) return null;
  const d = (x.pu - o.pa0) / o.pa0;
  return { d, sens: Math.abs(d) < 0.01 ? 'stable' : d > 0 ? 'hausse' : 'baisse' };
}
const margePct = (o, pa, pv) => (o && pa != null && pv != null && pv > 0) ? Math.round((1 - pa / (pv / F.tvaOf(o))) * 100) : null;

// ---------- écrans ----------
const barre = (t = '') => barreMode('achat', t, true);

export function ecranFactureAccueil({ relie, enCours, message = '' }) {
  return `<div class="scr cb">${barre('Facture')}
  <div class="scr__corps"><h1 class="titre-1">Travailler une facture</h1>
    ${message ? `<div class="bandeau bandeau--alerte">${icone('info', 'cb-ico cb-ico--24')}<span>${esc(message)}</span></div>` : ''}
    ${enCours ? `<button class="ligne" data-action="fac-reprendre" style="border:0;font:inherit;text-align:left;width:100%"><div class="ligne__ico">${icone('facture')}</div><div class="ligne__txt"><div class="ligne__titre">Reprendre : ${esc(enCours.sup)}</div><div class="ligne__detail">Facture du ${esc(enCours.date.split('-').reverse().join('/'))} · ${enCours.lignes.length} lignes</div></div></button>` : ''}
    ${enAttente() ? `<button class="btn btn--secondaire" data-action="fac-fichiers">Fichiers à injecter (${enAttente()})</button>` : ''}
    <label class="btn btn--principal btn--achat" style="cursor:pointer">${icone('scan')}Prendre en photo<input type="file" id="fac-photo" accept="image/*" capture="environment" hidden></label>
    <button class="btn btn--secondaire" data-action="fac-drive" ${relie ? '' : 'disabled'}>${icone('facture')}Choisir dans le Drive</button>
    <button class="btn btn--secondaire" data-action="fac-fournisseurs" ${relie ? '' : 'disabled'}>${icone('achat')}Choisir un fournisseur</button>
    ${relie ? '' : `<div class="note">Pour le Drive, relie d'abord l'appli dans Réglages.</div>`}
    <label class="lien" style="cursor:pointer;min-height:48px;display:flex;align-items:center">Ou un PDF de cet appareil<input type="file" id="fac-pdf" accept="application/pdf" hidden></label>
    <div class="note">Photo : la page à plat, en pleine lumière, toute la page dans le cadre. Le PDF reçu par mail est plus fiable.</div>
  </div><div class="scr__bas"><button class="btn btn--discret" data-action="accueil">Retour</button></div></div>`;
}

export function ecranListeFactures({ titre, factures, message = '' }) {
  const L = fournisseursCaisse();
  const jour = d => d ? d.split('-').reverse().slice(0, 2).join('/') : '';
  const ligne = (f, four) => `<button class="ligne" data-action="fac-ouvrir" data-id="${esc(f.id)}" data-date="${esc(f.date || '')}" style="border:0;font:inherit;text-align:left;width:100%"><div class="ligne__ico">${icone('facture')}</div><div class="ligne__txt"><div class="ligne__titre">${esc(jour(f.date))} · ${esc(four || f.nom)}</div><div class="ligne__detail">${esc(f.nom.replace(/^\d{4}-\d{2}-\d{2}_/, '').slice(0, 56))}</div></div></button>`;
  // groupes par fournisseur (déjà triés du plus récent au plus ancien) ; ceux à une seule facture vont ensemble à la suite
  const groupes = new Map();
  for (const f of factures) { const four = fournisseurDe(f, L) || 'Autre'; if (!groupes.has(four)) groupes.set(four, []); groupes.get(four).push(f); }
  const multi = [...groupes].filter(([, v]) => v.length > 1), seuls = [...groupes].filter(([, v]) => v.length === 1).flatMap(([k, v]) => v.map(f => [k, f])).sort((a, b) => b[1].date.localeCompare(a[1].date));
  const corps = (multi.map(([k, v]) => `<h2 class="titre-3">${esc(k)} · ${v.length} factures</h2>${v.map(f => ligne(f, k)).join('')}`).join('') +
    (seuls.length ? `${multi.length ? '<h2 class="titre-3">Une seule facture</h2>' : ''}${seuls.map(([k, f]) => ligne(f, k)).join('')}` : ''));
  return `<div class="scr cb">${barre('Facture')}
  <div class="scr__corps"><h1 class="titre-1">${esc(titre)}</h1>
    <div class="note">${factures.length} facture(s) des 90 derniers jours, la plus récente en haut.</div>
    ${message ? `<div class="bandeau bandeau--alerte">${icone('info', 'cb-ico cb-ico--24')}<span>${esc(message)}</span></div>` : ''}
    ${corps || `<div class="carte"><div class="titre-2">Aucune facture sur 90 jours.</div></div>`}
  </div><div class="scr__bas"><button class="btn btn--discret" data-action="fac-accueil">Retour</button></div></div>`;
}

export function ecranFournisseurs() {
  const L = fournisseursCaisse().slice(0, 30);
  return `<div class="scr cb">${barre('Facture')}
  <div class="scr__corps"><h1 class="titre-1">Quel fournisseur ?</h1>
    <div class="note">Ceux qui ont des produits dans StorePOS.</div>
    ${L.map(f => `<button class="ligne" data-action="fac-four" data-nom="${esc(f.nom)}" style="border:0;font:inherit;text-align:left;width:100%"><div class="ligne__txt"><div class="ligne__titre">${esc(f.nom)}</div><div class="ligne__detail">${f.produits} produits</div></div></button>`).join('') || '<div class="carte"><div class="titre-2">Charge d\'abord les produits.</div></div>'}
  </div><div class="scr__bas"><button class="btn btn--discret" data-action="fac-accueil">Retour</button></div></div>`;
}

export function ecranLecture(texte, pct = null) {
  return `<div class="scr cb">${barre('Facture')}<div class="scr__corps"><h1 class="titre-1">Je lis la facture…</h1>
  <div class="carte"><div class="titre-2" data-pct>${pct == null ? '' : pct + ' %'}</div><div class="note" style="margin-top:8px">${esc(texte)}</div></div></div></div>`;
}

function statut(x) {
  const o = etat.produits[x.e];
  if (!o) return { t: 'Non trouvé en caisse', c: 'alerte' };
  if (x.how === 'proche') return { t: 'À vérifier : nom proche', c: 'alerte' };
  if (x.how === 'refdiff') return { t: 'À vérifier : réf. connue, nom différent', c: 'alerte' };
  return null;
}
const aVerifier = x => !etat.produits[x.e] || !!statut(x) || F.controles(x, FAC.sup).length > 0;

function blocActions(x, o) {
  const ex = exclusStock(o), w = controlesStock(x, o);
  const cb = (k, t, v) => `<label class="fac-case"><input type="checkbox" data-cb="${k}" ${v ? 'checked' : ''}>${t}</label>`;
  return `<div class="fac-actions">
    ${F.isFL(o) ? '' : cb('lab', 'Imprimer l\'étiquette', x.act.lab)}
    ${cb('pa', 'Mettre à jour l\'achat', x.act.pa)}
    ${ex ? `<div class="note">Pas d'entrée de stock : ${esc(ex)}.</div>` : `${cb('stk', 'Entrer en stock', x.act.stk)}
      <div class="fac-qte"><label class="fac-l" for="q${FAC.lignes.indexOf(x)}">Quantité reçue</label><input id="q${FAC.lignes.indexOf(x)}" class="champ fac-champ" data-champ="q" inputmode="numeric" value="${x.q ?? ''}" placeholder="à saisir" aria-label="Quantité reçue"></div>
      ${x.act.stk && x.q == null ? '<div class="note">Saisis la quantité : je ne la devine pas.</div>' : ''}
      ${x.act.stk && w.length ? w.map(t => `<div class="bandeau bandeau--alerte">${icone('alerte', 'cb-ico cb-ico--24')}<span>${esc(t)}</span></div>`).join('') + cb('ok', 'Je confirme cette quantité', x.ok) : ''}`}
  </div>`;
}

function carteLigne(x, i) {
  const o = etat.produits[x.e], st = statut(x), ec = ecartPA(o, x), g = F.suggPv(o, x.pu), w = F.controles(x, FAC.sup);
  const pvRef = x.pv != null ? x.pv : o?.prix;
  const m = margePct(o, x.pu, pvRef);
  const sens = ec ? { hausse: ['↑ Hausse', 'alerte'], baisse: ['↓ Baisse', 'ok'], stable: ['= Stable', 'ok'] }[ec.sens] : null;
  const cell = (l, v, extra = '') => `<div class="fac-cell ${extra}"><div class="fac-l">${l}</div><div class="fac-v">${v}</div></div>`;
  return `<div class="carte fac-ligne" data-i="${i}">
    <div class="fac-t">${x.ref ? `<span class="note">${esc(x.ref)}</span> ` : ''}<b>${esc(x.des)}</b>${x.mt != null ? `<span class="note"> · ${eur(x.mt)}</span>` : ''}</div>
    ${o ? `<div class="fac-prod">→ ${esc(joli(o.lib))} <span class="note">${esc(o.e)}</span></div>` : ''}
    ${st ? `<div class="pastilles"><span class="pastille pastille--${st.c}">${st.t}</span></div>` : ''}
    ${x.note ? `<div class="note">${esc(x.note)}</div>` : ''}
    <div class="fac-grille">
      ${cell('Achat dans StorePOS', o?.pa0 > 0 ? eur(o.pa0) : '–')}
      <div class="fac-cell fac-cell--saisie"><label class="fac-l" for="pa${i}">Achat sur la facture</label><input id="pa${i}" class="champ fac-champ" data-champ="pa" inputmode="decimal" value="${virg(x.pu)}" aria-label="Prix d'achat de la facture"></div>
      ${cell('Écart', ec ? `<span class="pastille pastille--${sens[1]}">${sens[0]} ${ec.d > 0 ? '+' : ''}${(ec.d * 100).toFixed(ec.sens === 'stable' ? 1 : 0).replace('.', ',')} %</span>` : '<span class="note">pas de comparaison</span>')}
      ${cell('Vente actuelle', o ? (o.prix != null ? eur(o.prix) : 'Prix à définir') : '–')}
      ${cell('Vente suggérée', g ? `${eur(g.pv)}<div class="fac-s">${g.keep ? 'on garde' : 'marge ' + Math.round(g.m * 100) + ' %'}</div>${!g.keep ? `<button class="btn btn--secondaire fac-btn" data-action="fac-prendre" data-i="${i}">Prendre ${eur(g.pv)}</button>` : ''}` : '–')}
      <div class="fac-cell fac-cell--saisie"><label class="fac-l" for="pv${i}">Ma vente (TTC)</label><input id="pv${i}" class="champ fac-champ" data-champ="pv" inputmode="decimal" placeholder="${o?.prix != null ? virg(o.prix) : 'à définir'}" value="${virg(x.pv)}" aria-label="Nouveau prix de vente"></div>
    </div>
    ${m != null ? `<div class="note">Marge avec ce prix : ${m} %</div>` : ''}
    ${w.map(t => `<div class="bandeau bandeau--alerte">${icone('alerte', 'cb-ico cb-ico--24')}<span>${esc(t)}</span></div>`).join('')}
    ${o ? blocActions(x, o) : ''}
    <button class="btn btn--discret" data-action="fac-changer" data-i="${i}">${o ? 'Ce n\'est pas ce produit' : 'Choisir le produit'}</button>
  </div>`;
}

export function ecranFacture() {
  const L = FAC.lignes, trouvees = L.filter(x => etat.produits[x.e]).length;
  const hausses = L.filter(x => ecartPA(etat.produits[x.e], x)?.sens === 'hausse').length;
  const baisses = L.filter(x => ecartPA(etat.produits[x.e], x)?.sens === 'baisse').length;
  const verif = L.filter(aVerifier).length;
  const vues = filtre === 'verifier' ? L.map((x, i) => [x, i]).filter(([x]) => aVerifier(x)) : L.map((x, i) => [x, i]);
  return `<div class="scr cb">${barre('Facture')}
  <div class="scr__corps"><h1 class="titre-1">${esc(FAC.sup)}</h1>
    <div class="note">Facture du ${esc(FAC.date.split('-').reverse().join('/'))} · ${L.length} lignes lues · ${trouvees} trouvées en caisse</div>
    <div class="pastilles"><span class="pastille pastille--alerte">${hausses} hausse(s)</span><span class="pastille pastille--ok">${baisses} baisse(s)</span><span class="pastille ${verif ? 'pastille--alerte' : 'pastille--ok'}">${verif} à vérifier</span></div>
    <div class="duo"><button class="btn ${filtre === 'toutes' ? 'btn--principal btn--achat' : 'btn--secondaire'}" data-action="fac-filtre" data-f="toutes">Toutes</button><button class="btn ${filtre === 'verifier' ? 'btn--principal btn--achat' : 'btn--secondaire'}" data-action="fac-filtre" data-f="verifier">À vérifier</button></div>
    <div class="note">Vérifie chaque ligne : une photo peut se tromper sur un chiffre. Rien ne part dans StorePOS : à la fin, je prépare les fichiers que tu injectes toi-même.</div>
    ${vues.map(([x, i]) => carteLigne(x, i)).join('') || '<div class="carte"><div class="titre-2">Rien à vérifier.</div></div>'}
  </div><div class="scr__bas"><button class="btn btn--principal btn--achat" data-action="fac-valider">Valider la facture</button><button class="btn btn--discret" data-action="fac-fin">Garder pour plus tard</button></div></div>`;
}

function ecranChoix(i, q = '') {
  const x = FAC.lignes[i];
  return `<div class="scr cb">${barre('Facture')}<div class="scr__corps"><h1 class="titre-1">Quel produit ?</h1>
  <div class="note">${esc(x.des)}</div>
  <input id="fac-q" class="champ" type="search" autocomplete="off" placeholder="Chercher par son nom" data-i="${i}" value="${esc(q)}">
  <div id="fac-res"></div></div><div class="scr__bas"><button class="btn btn--discret" data-action="fac-retour">Retour à la facture</button></div></div>`;
}

function ecranValidee(r) {
  return `<div class="scr cb">${barre('Facture')}<div class="scr__corps"><h1 class="titre-1">Facture validée</h1>
  <div class="carte" style="display:grid;gap:8px"><div class="titre-2">${esc(FAC.sup)} · ${esc(FAC.date.split('-').reverse().join('/'))}</div>
    <div>${r.prix} prix de vente · ${r.pa} prix d'achat · ${r.stk} entrée(s) de stock · ${r.etq} étiquette(s)</div>
    <div class="note">Rien n'est parti dans StorePOS. Les fichiers à injecter t'attendent.</div></div></div>
  <div class="scr__bas"><button class="btn btn--principal btn--achat" data-action="fac-fichiers">Fichiers à injecter (${enAttente()})</button>
  ${r.etq ? '<button class="btn btn--secondaire" data-action="etiquettes">Voir la planche d\'étiquettes</button>' : ''}
  <button class="btn btn--discret" data-action="accueil">Retour à l'accueil</button></div></div>`;
}

const cartesCodes = () => IMP.codes(lireV1('cpb_map', {}));
function ecranFichiers(message = '', pret = null) {
  const { rows, blk } = IMP.importRows(MOD, etat.produits, cartesCodes());
  const parFact = {};
  for (const y of ENT) (parFact[y.fact] = parFact[y.fact] || { sup: y.sup, date: y.date, l: [] }).l.push(y);
  const lignePrix = r => { const e = r[0], o = etat.produits[e], m = MOD[e] || {};
    return `<div class="ligne"><div class="ligne__txt"><div class="ligne__titre">${esc(joli(r[3]))}</div><div class="ligne__detail">${m.prix != null ? `Vente ${eur(o?.prix)} → <b>${eur(m.prix)}</b> ` : ''}${m.pa != null ? `Achat ${eur(o?.pa0)} → <b>${eur(m.pa)}</b>` : ''}</div></div><button class="btn btn--discret" data-action="fac-retirer-mod" data-e="${esc(e)}">Retirer</button></div>`; };
  return `<div class="scr cb">${barre('Fichiers')}<div class="scr__corps"><h1 class="titre-1">À injecter dans StorePOS</h1>
    ${message ? `<div class="bandeau bandeau--alerte">${icone('info', 'cb-ico cb-ico--24')}<span>${esc(message)}</span></div>` : ''}
    ${pret ? `<div class="carte" style="display:grid;gap:8px"><div class="titre-2">Fichier prêt</div><div>${esc(pret.nom)} · ${pret.n} ligne(s)</div><div class="note">${esc(pret.consigne)}</div><button class="btn btn--principal btn--achat" data-action="fac-partager">Partager ou enregistrer</button></div>` : ''}
    <h2 class="titre-3">Prix (${rows.length})</h2>
    ${rows.map(lignePrix).join('') || '<div class="note">Aucune modification de prix en attente.</div>'}
    ${blk.length ? `<div class="bandeau bandeau--alerte">${icone('alerte', 'cb-ico cb-ico--24')}<span>${blk.length} ligne(s) bloquée(s), jamais devinées. Les codes famille, rayon et groupe se règlent dans l'appli actuelle (Réglages → Codes StorePOS).</span></div>` + blk.map(b => `<div class="carte" style="display:grid;gap:8px"><div class="titre-2">${esc(joli(b.lib))}</div><div>${esc(b.why.join(' ; '))}</div>${b.needPa ? `<div class="fac-qte"><label class="fac-l" for="bp${esc(b.e)}">Prix d'achat HT</label><input id="bp${esc(b.e)}" class="champ fac-champ" data-pa-bloque="${esc(b.e)}" inputmode="decimal" placeholder="en €"></div>` : ''}<button class="btn btn--discret" data-action="fac-retirer-mod" data-e="${esc(b.e)}">Retirer</button></div>`).join('') : ''}
    <button class="btn btn--principal btn--achat" data-action="fac-creer-import" ${rows.length ? '' : 'disabled'}>Créer le fichier d'import</button>
    <h2 class="titre-3">Entrées de stock (${ENT.length})</h2>
    <div class="note">Le stock n'est pas fiable avant l'inventaire : ces entrées s'ajoutent, elles ne remplacent rien.</div>
    ${Object.entries(parFact).map(([f, g]) => `<div class="carte" style="display:grid;gap:4px"><div class="titre-2">${esc(g.sup)} · ${esc(g.date.split('-').reverse().join('/'))}</div>${g.l.map(y => `<div class="ligne" style="box-shadow:none;padding:0"><div class="ligne__txt"><div class="ligne__titre">${y.qte} × ${esc(joli(y.lib))}</div></div><button class="btn btn--discret" data-action="fac-retirer-ent" data-e="${esc(y.e)}" data-f="${esc(f)}">Retirer</button></div>`).join('')}</div>`).join('') || '<div class="note">Aucune entrée de stock en attente.</div>'}
    <button class="btn btn--principal btn--achat" data-action="fac-creer-stock" ${ENT.length ? '' : 'disabled'}>Créer le fichier d'entrée de stock</button>
    ${FAITS.length ? `<h2 class="titre-3">Déjà créés</h2>${FAITS.slice(-6).reverse().map(f => `<div class="note">${esc(f.nom)} · ${f.n} ligne(s) · ${new Date(f.date).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>`).join('')}` : ''}
  </div><div class="scr__bas"><button class="btn btn--discret" data-action="fac-accueil">Retour</button></div></div>`;
}

let DERNIER = null; // dernier fichier créé, pour le partager
async function partagerFichier() {
  if (!DERNIER) return;
  await livrer(new File([DERNIER.blob], DERNIER.nom, { type: DERNIER.blob.type }));
}
const stampFichier = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return { aammjj: `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}`, st: `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}` }; };

// ---------- actions ----------
/** Retourne true si l'action est de ce lot. `nav` : { afficher, toast }. */
export async function actionFacture(a, b, nav) {
  if (!a.startsWith('fac-') && a !== 'factures') return false;
  const rendre = () => nav.afficher(ecranFacture(), 'facture');
  const accueil = (message = '') => nav.afficher(ecranFactureAccueil({ relie: estRelie(), enCours: FAC, message }), 'facture-accueil');
  if (a === 'factures' || a === 'fac-accueil') { accueil(); return true; }
  if (a === 'fac-reprendre') { preparerMoteur(); rendre(); return true; }
  if (a === 'fac-retour') { rendre(); return true; }
  if (a === 'fac-filtre') { filtre = b.dataset.f; rendre(); return true; }
  if (a === 'fac-fournisseurs') { nav.afficher(ecranFournisseurs(), 'facture-four'); return true; }
  if (a === 'fac-drive' || a === 'fac-four') {
    const nom = a === 'fac-four' ? b.dataset.nom : '';
    nav.afficher(ecranLecture(nom ? `Factures ${nom} dans le Drive…` : 'Dernières factures dans le Drive…'), 'facture-lecture');
    try {
      let liste = await facturesDrive(nom ? nom.split(/[\s,.-]+/)[0] : '');
      if (!nom) { const L = fournisseursCaisse(); if (L.length) liste = liste.filter(f => fournisseurDe(f, L)); }
      nav.afficher(ecranListeFactures({ titre: nom || 'Dernières factures', factures: liste }), 'facture-liste');
    } catch (x) { accueil(`Impossible de lire le Drive : ${x.message}.`); }
    return true;
  }
  if (a === 'fac-ouvrir') {
    nav.afficher(ecranLecture('Je télécharge la facture…'), 'facture-lecture');
    try { const f = await fichierFacture(b.dataset.id); await lireEtMontrer(f, nav, 'drive', b.dataset.id, b.dataset.date || ''); }
    catch (x) { accueil(`Lecture impossible : ${x.message}.`); }
    return true;
  }
  if (a === 'fac-prendre') {
    const x = FAC.lignes[+b.dataset.i], g = F.suggPv(etat.produits[x.e], x.pu);
    if (g) { const avant = x.pv; x.pv = g.pv; await garder(); rendre(); nav.toast(`Vente ${eur(g.pv)} prise`, async () => { x.pv = avant; await garder(); rendre(); }); }
    return true;
  }
  if (a === 'fac-changer') {
    nav.afficher(ecranChoix(+b.dataset.i), 'facture-choix'); setTimeout(() => document.getElementById('fac-q')?.focus(), 50);
    return true;
  }
  if (a === 'fac-choisir') {
    const x = FAC.lignes[+b.dataset.i], o = etat.produits[b.dataset.e];
    if (o) { x.e = o.e; x.how = 'manuel'; x.fl = F.isFL(o) && FAC.sup === 'AGRIFRESH'; if (x.fl) x.ill = F.autoIll(o.lib); F.repricer(x, FAC.sup); x.act = x.act || {}; x.act.lab = true; if (FAC.sup === 'AGRIFRESH' && x.fl) x.act.pa = true; defauts(x); x.ok = false; await garder(); }
    rendre(); return true;
  }
  if (a === 'fac-valider') {
    if (!FAC) return true;
    const avant = JSON.stringify({ MOD, ENT }), etqAjoutees = [], vus = new Set(), r = { prix: 0, pa: 0, stk: 0, etq: 0 };
    for (const x of FAC.lignes) {
      const o = etat.produits[x.e]; if (!o) continue;
      const m = MOD[o.e] || {};
      if (x.pv != null && Math.abs(x.pv - (o.prix ?? -1)) >= 0.005) { m.prix = Math.round(x.pv * 100) / 100; r.prix++; }
      if (x.act?.pa && x.pu != null) { m.pa = x.pu; m.src = `${FAC.sup} ${FAC.date}`; r.pa++; }
      if (m.prix != null || m.pa != null) { m.date = aujourdhui(); MOD[o.e] = m; }
      if (x.act?.lab && !F.isFL(o)) etqAjoutees.push(o.e);
      if (stockOk(x)) { if (!vus.has(o.e)) { ENT = ENT.filter(y => !(y.e === o.e && y.fact === FAC.nom)); vus.add(o.e); } const y = ENT.find(z => z.e === o.e && z.fact === FAC.nom); if (y) y.qte += x.q; else { ENT.push({ e: o.e, qte: x.q, sup: FAC.sup, date: FAC.date, fact: FAC.nom, lib: o.lib }); r.stk++; } }
    }
    const ajoutees = await ajouterEtiquettes([...new Set(etqAjoutees)]); r.etq = ajoutees.length;
    FAC.valide = new Date().toISOString(); await garder(); await garderTout();
    const metaEc = FAC.driveId ? await retirerEnCours(FAC.driveId) : null;
    if (FAC.driveId) { try { await marquerTraite(FAC.driveId, true, ''); nav.sync && nav.sync(); } catch (x) { } }
    nav.afficher(ecranValidee(r), 'facture-validee');
    nav.toast('Facture validée', async () => {
      const v = JSON.parse(avant); MOD = v.MOD; ENT = v.ENT; FAC.valide = null; await retirerEtiquettes(ajoutees); await garder(); await garderTout();
      if (FAC.driveId) { await restaurerEnCours(FAC.driveId, metaEc); try { await marquerTraite(FAC.driveId, false); nav.sync && nav.sync(); } catch (x) { } }
      rendre();
    });
    return true;
  }
  if (a === 'fac-fichiers') { nav.afficher(ecranFichiers(), 'facture-fichiers'); return true; }
  if (a === 'fac-partager') { await partagerFichier(); return true; }
  if (a === 'fac-retirer-mod') {
    const e = b.dataset.e, avant = MOD[e]; delete MOD[e]; await garderTout(); nav.afficher(ecranFichiers(), 'facture-fichiers');
    nav.toast('Modification retirée', async () => { if (avant) MOD[e] = avant; await garderTout(); nav.afficher(ecranFichiers(), 'facture-fichiers'); });
    return true;
  }
  if (a === 'fac-retirer-ent') {
    const avant = ENT.slice(); ENT = ENT.filter(y => !(y.e === b.dataset.e && y.fact === b.dataset.f)); await garderTout(); nav.afficher(ecranFichiers(), 'facture-fichiers');
    nav.toast('Entrée retirée', async () => { ENT = avant; await garderTout(); nav.afficher(ecranFichiers(), 'facture-fichiers'); });
    return true;
  }
  if (a === 'fac-creer-import') {
    const { rows } = IMP.importRows(MOD, etat.produits, cartesCodes());
    if (!rows.length) { nav.afficher(ecranFichiers('Rien à importer.'), 'facture-fichiers'); return true; }
    const avantMod = JSON.stringify(MOD), avantProd = rows.map(r => [r[0], etat.produits[r[0]] && { prix: etat.produits[r[0]].prix, pa0: etat.produits[r[0]].pa0 }]);
    const { st } = stampFichier(), nom = `IMPORT-APPLI-${st}.xlsx`, blob = IMP.xlsx('IMPORT APPLI', [IMP.HEAD, ...rows]);
    DERNIER = { nom, blob };
    // comme la V1 : une fois le fichier créé, les prix sont considérés comme envoyés
    for (const r of rows) { const e = r[0], o = etat.produits[e], m = MOD[e]; if (o && m) { etat.produits[e] = { ...o, ...(m.prix != null ? { prix: m.prix } : {}), ...(m.pa != null ? { pa0: m.pa } : {}) }; } delete MOD[e]; }
    FAITS.push({ nom, n: rows.length, date: new Date().toISOString(), type: 'import' });
    await ecrire('produits', etat.produits); await garderTout();
    nav.afficher(ecranFichiers('', { nom, n: rows.length, consigne: "Back Office → Gestion → Produits → Importer des produits, avec ce fichier. Teste d'abord sur 1 ligne, puis TPV → Transfert des modifications." }), 'facture-fichiers');
    nav.toast('Fichier d\'import créé', async () => {
      MOD = JSON.parse(avantMod); for (const [e, p] of avantProd) if (p) etat.produits[e] = { ...etat.produits[e], ...p };
      FAITS.pop(); DERNIER = null; await ecrire('produits', etat.produits); await garderTout(); nav.afficher(ecranFichiers(), 'facture-fichiers');
    });
    return true;
  }
  if (a === 'fac-creer-stock') {
    if (!ENT.length) return true;
    const par = new Map(); for (const y of ENT) par.set(y.e, (par.get(y.e) || 0) + y.qte);   // zéro doublon d'EAN par fichier
    const lignes = [...par.entries()].map(([e, q]) => [String(e), q]);
    const sups = [...new Set(ENT.map(y => F.SN(y.sup)))], { aammjj } = stampFichier();
    const nom = `ENTREE-STOCK-${sups.length === 1 ? sups[0] : 'FOURNISSEURS'}-${aammjj}.xlsx`, blob = IMP.xlsx('ENTREE STOCK', lignes);
    DERNIER = { nom, blob }; const avant = ENT.slice(); ENT = [];
    FAITS.push({ nom, n: lignes.length, date: new Date().toISOString(), type: 'stock' }); await garderTout();
    nav.afficher(ecranFichiers('', { nom, n: lignes.length, consigne: "Stock → Entrées et sorties → Nouveau : date de la facture, raison « Réception » + fournisseur, import Excel (A = code-barres, B = quantité). Vérifie le nombre de lignes. Ne clôture qu'après ton accord : le stock ne bouge qu'à la clôture." }), 'facture-fichiers');
    nav.toast('Fichier d\'entrée de stock créé', async () => { ENT = avant; FAITS.pop(); DERNIER = null; await garderTout(); nav.afficher(ecranFichiers(), 'facture-fichiers'); });
    return true;
  }
  if (a === 'fac-fin') { FAC.fini = true; await garder(); nav.toast('Modifications gardées sur cet appareil'); document.querySelector('[data-action="accueil"]')?.click(); return true; }
  return false;
}

async function lireEtMontrer(file, nav, source, driveId = '', dateFacture = '') {
  preparerMoteur();
  nav.afficher(ecranLecture('Lecture du texte de la facture…'), 'facture-lecture');
  const maj = p => { const z = document.querySelector('[data-pct]'); if (z) z.textContent = p + ' %'; };
  const texte = await texteDeFichier(file, maj);
  const r = F.parseInvoice(texte, null);
  if (!r.lines.length) throw new Error('aucune ligne reconnue (essaie le PDF, ou une photo plus nette)');
  FAC = { sup: r.sup, date: r.date, nom: file.name, source, driveId, lignes: r.lines, lue: new Date().toISOString() };
  FAC.lignes.forEach(defauts);
  filtre = 'toutes';
  let remise = '';
  if (driveId) { remise = await mettreEnCours(driveId, dateFacture); if (surLecture) surLecture(driveId, { fournisseur: r.sup || '', montant: Math.round(r.lines.reduce((t, x) => t + (typeof x.mt === 'number' && isFinite(x.mt) ? x.mt : 0), 0) * 100) / 100, nb: r.lines.length }); }
  await garder();
  nav.afficher(ecranFacture(), 'facture');
  if (remise) nav.toast(remise);
}

/** Champs de saisie et photo : branchés une fois sur l'appli. */
export function brancherFacture(app, nav) {
  app.addEventListener('change', async e => {
    const t = e.target;
    if (t.id === 'fac-photo' || t.id === 'fac-pdf') {
      const f = t.files[0]; if (!f) return;
      try { await lireEtMontrer(f, nav, t.id === 'fac-photo' ? 'photo' : 'pdf'); }
      catch (x) { nav.afficher(ecranFactureAccueil({ relie: estRelie(), enCours: FAC, message: `Lecture impossible : ${x.message}.` }), 'facture-accueil'); }
      return;
    }
    if (t.dataset.paBloque) { const v = nombre(t.value); if (v > 0) { MOD[t.dataset.paBloque] = { ...(MOD[t.dataset.paBloque] || {}), pa: v, date: aujourdhui() }; await garderTout(); nav.afficher(ecranFichiers(), 'facture-fichiers'); } return; }
    if ((t.dataset.cb || t.dataset.champ) && FAC) {
      const carte = t.closest('.fac-ligne'); const x = FAC.lignes[+carte.dataset.i];
      const v = nombre(t.value);
      if (t.dataset.cb) { if (t.dataset.cb === 'ok') x.ok = t.checked; else x.act[t.dataset.cb] = t.checked; }
      else if (t.dataset.champ === 'pa') { x.pu = v; if (x.q == null) x.q = qteLue(x); }
      else if (t.dataset.champ === 'q') { x.q = v != null && v > 0 ? Math.round(v) : null; x.ok = false; if (x.q != null && x.act.stk === false && !exclusStock(etat.produits[x.e] || {})) x.act.stk = true; }
      else x.pv = v;
      await garder();
      const y = window.scrollY, h = document.getElementById('app'); const top = h.scrollTop;
      nav.afficher(ecranFacture(), 'facture'); h.scrollTop = top; window.scrollTo(0, y);
    }
  });
  app.addEventListener('input', e => {
    if (e.target.id !== 'fac-q') return;
    const i = +e.target.dataset.i, q = e.target.value.trim(), z = app.querySelector('#fac-res');
    const r = q.length < 2 ? [] : chercher(q, etat.produits, 30);
    z.innerHTML = r.map(o => `<button class="ligne" data-action="fac-choisir" data-i="${i}" data-e="${esc(o.e)}" style="border:0;font:inherit;text-align:left;width:100%"><div class="ligne__txt"><div class="ligne__titre">${esc(joli(o.lib))}</div><div class="ligne__detail">${o.prix != null ? eur(o.prix) : 'Prix à définir'}${o.four ? ' · ' + esc(o.four) : ''}</div></div></button>`).join('') || (q.length >= 2 ? '<div class="carte"><div class="titre-2">Aucun produit trouvé.</div></div>' : '');
  });
}
