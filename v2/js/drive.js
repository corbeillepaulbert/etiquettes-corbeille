// Liaison avec le Drive du magasin, via l'application Web Apps Script (apps-script/Code.gs).
// L'adresse et la clé se saisissent dans Réglages et restent sur l'appareil (IndexedDB) : jamais dans le dépôt.
import { lire, ecrire, etat, importerFichier } from './donnees.js';

let config = null;
export async function chargerConfig() { config = await lire('drive', null); return config; }
export const estInvite = () => !!(config && config.invite && config.jeton);
export const finInvite = () => (estInvite() ? config.fin : 0);
export const nomInvite = () => (estInvite() ? config.nom || '' : '');
export const estRelie = () => !!(config && config.url && (config.cle || (config.jeton && config.fin > Date.now())));
export const estAdmin = () => !!(config && config.url && config.cle);
const URL_EXEC = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
export const urlValide = u => URL_EXEC.test(String(u || ''));
export async function relier(url, cle) {
  const essai = { url: String(url || '').trim(), cle: String(cle || '').trim() };
  if (!urlValide(essai.url)) throw new Error("l'adresse doit être celle de l'application Web, qui finit par /exec");
  if (essai.cle.length < 24) throw new Error('la clé fait au moins 24 caractères');
  const r = await appel('ping', {}, essai);
  if (!r.ok) throw new Error('le Drive refuse cette clé');
  config = essai; await ecrire('drive', config);
  return r;
}
export async function delier() { config = null; await ecrire('drive', null); }

let quandInviteFini = null;
export function siInviteFini(fn) { quandInviteFini = fn; }
const ACTIONS_AT = new Set(['aTraiter', 'rafraichir', 'traiter', 'facture', 'cacheLire', 'cacheEcrire', 'ping']);
export const VERSION_SCRIPT_MIN = 4; // version de Code.gs attendue par cette appli
const RELECTURE = new Set(['ping', 'aTraiter', 'exports', 'fichier', 'facture', 'factures', 'cacheLire', 'lire']);
/** Appel au script ; une lecture qui échoue (réseau, délai) est retentée une fois avant d'abandonner. */
export async function appel(action, donnees = {}, cfg = config) {
  try { return await appel1(action, donnees, cfg); }
  catch (x) {
    if (!RELECTURE.has(action) || !navigator.onLine) throw x;
    console.warn(`[V2/Drive] « ${action} » : nouvel essai (${x.message})`);
    await new Promise(r => setTimeout(r, 1500));
    return appel1(action, donnees, cfg);
  }
}
async function appel1(action, donnees = {}, cfg = config) {
  if (!cfg) throw new Error('pas relié au Drive');
  const log = ACTIONS_AT.has(action);
  if (log) console.log(`[V2/ATraiter] appel « ${action} »`);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 60000);
  try {
    const r = await fetch(cfg.url, {
      method: 'POST', redirect: 'follow', signal: ctl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...donnees, action, ...(cfg.cle ? { cle: cfg.cle } : cfg.jeton ? { jeton: cfg.jeton } : {}) })
    });
    if (!r.ok) throw new Error('le Drive ne répond pas (' + r.status + ')');
    const rep = await r.json();
    if (cfg.jeton && rep && rep.ok === false && rep.invite === 'fini' && quandInviteFini) quandInviteFini();
    if (log) console.log(`[V2/ATraiter] réponse « ${action} » : ok=${rep && rep.ok}${rep && rep.erreur ? ' erreur=' + rep.erreur : ''}`);
    return rep;
  } catch (x) {
    if (log) console.error(`[V2/ATraiter] échec « ${action} » : ${x && x.name === 'AbortError' ? 'délai dépassé' : (x && x.message || x)}`);
    if (x.name === 'AbortError') throw new Error('le Drive met trop de temps à répondre');
    if (x instanceof TypeError) throw new Error('pas de réseau');
    throw x;
  } finally { clearTimeout(t); }
}

// ---------- À traiter ----------
export async function aTraiterEnCache() { return lire('aTraiter', { derniere: null, elements: [] }); }
// Factures marquées « traitée » (ou remises) sur cet appareil et pas encore enregistrées dans le Drive : elles restent comme le gérant les a laissées.
let ATTENTE = null;
async function attente() { if (!ATTENTE) ATTENTE = await lire('marquesEnAttente', {}); return ATTENTE; }
function superposer(elements, A) {
  return elements.map(x => A[x.id] ? { ...x, etat: A[x.id].etat, traiteLe: A[x.id].etat === 'traite' ? A[x.id].t : null, traitePar: A[x.id].par || x.traitePar } : x);
}
async function garder(r) {
  const A = await attente();
  // une marque est confirmée quand le Drive renvoie le même état
  for (const x of r.elements || []) if (A[x.id] && A[x.id].etat === x.etat) delete A[x.id];
  await ecrire('marquesEnAttente', A);
  const v = { derniere: r.derniere, elements: superposer(r.elements || [], A), recu: new Date().toISOString() };
  console.log(`[V2/ATraiter] reçu : ${v.elements.length} élément(s), dernier passage ${v.derniere || 'jamais'}`);
  await ecrire('aTraiter', v); return v;
}
export async function majATraiter() { const r = await appel('aTraiter'); if (!r.ok) throw new Error('refusé'); return garder(r); }
export async function rafraichirMaintenant() { const r = await appel('rafraichir'); if (!r.ok) throw new Error('refusé'); const v = await garder(r); v.occupe = r.occupe; v.ajoutes = r.ajoutes; return v; }
/** Marquer « traitée » : l'écran change tout de suite ; l'envoi au Drive suit, et sera refait plus tard s'il échoue. */
export async function marquerTraite(id, traite, par) {
  const A = await attente();
  A[id] = { etat: traite ? 'traite' : 'nouveau', par: par || '', t: new Date().toISOString() };
  await ecrire('marquesEnAttente', A);
  const local = await aTraiterEnCache();
  const v = { ...local, elements: superposer(local.elements || [], A) };
  await ecrire('aTraiter', v);
  try { const r = await appel('traiter', { id, etat: A[id].etat, par }); if (r.ok) return garder(r); }
  catch (x) { console.error('[V2/ATraiter] marque pas encore envoyée :', x.message); }
  return v;
}
/** Renvoie au Drive les marques restées sur l'appareil. */
export async function envoyerMarques() {
  const A = await attente(); let r = null;
  for (const [id, m] of Object.entries(A)) { try { const x = await appel('traiter', { id, etat: m.etat, par: m.par }); if (x.ok) r = x; } catch (e) { return null; } }
  return r ? garder(r) : null;
}

/** Test de la liaison (Réglages) : le script répond-il, et est-il assez récent ? */
export async function testerScript() {
  try {
    const r = await appel('ping');
    if (!r || !r.ok) return { ok: false, message: 'Le script ne répond pas ou ne connaît pas l\'action ping. Recopie Code.gs et redéploie (Nouvelle version).' };
    const v = Number(r.version) || 0;
    if (v >= VERSION_SCRIPT_MIN && v < 6) return { ok: true, version: v, message: `Le script répond (version ${v}). La version 6 ouvre les factures bien plus vite : recopie Code.gs et redéploie (Nouvelle version).` };
    if (v < VERSION_SCRIPT_MIN) return { ok: false, version: v, message: `Le script répond mais il est ancien (version ${v}, il faut la ${VERSION_SCRIPT_MIN}). Recopie Code.gs et redéploie (Nouvelle version).` };
    return { ok: true, version: v, message: `Le script répond (version ${v}).` };
  } catch (x) {
    return { ok: false, message: 'Le script ne répond pas ou ne connaît pas l\'action ping. Recopie Code.gs et redéploie (Nouvelle version).' + (x && x.message ? ` (${x.message})` : '') };
  }
}

// ---------- cache de lecture des factures (écrit par le script dans APPLI V2/FACTURES_CACHE) ----------
export async function lireCache(ids) {
  const r = await appel('cacheLire', { ids }); if (!r.ok) throw new Error(r.erreur || 'refusé');
  return r.cache || {};
}
export async function ecrireCache(id, { fournisseur, montant, nb }) {
  const r = await appel('cacheEcrire', { id, fournisseur, montant, nb }); return !!(r && r.ok);
}

// ---------- mode invité ----------
// Le lien d'invitation porte l'adresse /exec dans le fragment (#invite=…), jamais la clé : le fragment ne part pas sur le réseau.
const b64 = t => btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deb64 = t => atob(String(t).replace(/-/g, '+').replace(/_/g, '/'));
export function lienInvitation() { return estAdmin() ? `${location.origin}${location.pathname}#invite=${b64(config.url)}` : ''; }
export function urlDuLien(hash = location.hash) {
  const m = /[#&]invite=([\w-]+)/.exec(hash || ''); if (!m) return '';
  try { const u = deb64(m[1]); return urlValide(u) ? u : ''; } catch (x) { return ''; }
}
export async function demanderCode(url, nom) {
  const r = await appel('inviteDemande', { nom }, { url });
  if (!r.ok) throw new Error(r.erreur || 'demande refusée');
  return r; // { demande, minutes }
}
export async function validerCode(url, demande, code) {
  const r = await appel('inviteValider', { demande, code }, { url });
  if (!r.ok) throw new Error(r.erreur || 'code refusé');
  config = { url, jeton: r.jeton, fin: r.fin, nom: r.nom, invite: true };
  await ecrire('drive', config);
  return config;
}
export async function arreterInvites() { const r = await appel('inviteArreter'); if (!r.ok) throw new Error('refusé'); return r.arretees || 0; }

// ---------- exports StorePOS ----------
const typeProbable = nom => /vente|plu/i.test(nom) ? 'ventes' : 'base';
/** Prend dans EXPORTS STOREPOS le dernier fichier produits et le dernier fichier ventes, s'ils sont plus récents que ceux déjà chargés. */
export async function prendreExports({ forcer = false } = {}) {
  const r = await appel('exports'); if (!r.ok) throw new Error('refusé');
  const faits = [];
  // fichier produits : le plus récent
  const base = r.fichiers.find(f => typeProbable(f.nom) === 'base');
  // fichiers de ventes : tous ceux qui portent leurs dates (un an = référence ; 4 semaines, Ramadan… = périodes), du plus ancien au plus récent
  const ventes = r.fichiers.filter(f => typeProbable(f.nom) === 'ventes').reverse();
  const vus = await lire('exportsVus', {});
  for (const f of [base, ...ventes].filter(Boolean)) {
    const t = typeProbable(f.nom), deja = etat.meta[t];
    if (!forcer && vus[f.id] === f.maj) continue;
    if (!forcer && t === 'base' && deja && deja.driveId === f.id && deja.driveMaj === f.maj && deja.v === 3) { vus[f.id] = f.maj; continue; }
    const c = await appel('fichier', { id: f.id }); if (!c.ok) throw new Error('fichier refusé : ' + f.nom);
    const octets = Uint8Array.from(atob(c.base64), ch => ch.charCodeAt(0));
    const res = await importerFichier(new File([octets], c.nom), { driveId: f.id, driveMaj: f.maj });
    vus[f.id] = f.maj; faits.push(res);
  }
  await ecrire('exportsVus', vus);
  return faits;
}

// ---------- liste d'achat partagée ----------
// Chaque ligne porte sa date ; une suppression laisse une trace datée. À la fusion, la date la plus récente gagne.
export function fusionListe(a, b) {
  const lignes = {}, supp = {};
  for (const src of [a, b]) {
    if (!src) continue;
    for (const l of src.lignes || []) if (!lignes[l.e] || l.date > lignes[l.e].date) lignes[l.e] = l;
    for (const [e, d] of Object.entries(src.supprimes || {})) if (!supp[e] || d > supp[e]) supp[e] = d;
  }
  for (const [e, d] of Object.entries(supp)) if (lignes[e] && lignes[e].date <= d) delete lignes[e];
  const limite = new Date(Date.now() - 60 * 864e5).toISOString();
  for (const e of Object.keys(supp)) if (supp[e] < limite) delete supp[e];
  return { lignes: Object.values(lignes).sort((x, y) => x.date.localeCompare(y.date)), supprimes: supp };
}

export async function synchroniserListe() {
  for (let essai = 0; essai < 3; essai++) {
    const distant = await appel('lire', { doc: 'liste-achat' });
    if (!distant.ok) throw new Error('refusé');
    const fusion = fusionListe({ lignes: etat.liste, supprimes: etat.listeSupprimes }, distant.valeur);
    etat.liste = fusion.lignes; etat.listeSupprimes = fusion.supprimes;
    await ecrire('liste', etat.liste); await ecrire('listeSupprimes', etat.listeSupprimes);
    const memeContenu = JSON.stringify(distant.valeur) === JSON.stringify(fusion);
    if (memeContenu) { await ecrire('listeAEnvoyer', false); return { envoye: false }; }
    const w = await appel('ecrire', { doc: 'liste-achat', valeur: fusion, version: distant.version });
    if (w.ok) { await ecrire('listeAEnvoyer', false); return { envoye: true }; }
    if (!w.conflit) throw new Error('refusé');
  }
  throw new Error('trop de changements en même temps, réessaie');
}

// ---------- factures du Drive (lecture seule) ----------
/** Les factures les plus récentes de FACTURES ACHAT, éventuellement celles d'un fournisseur. */
export async function facturesDrive(mot = '', max = 150, jours = 90) {
  const r = await appel('factures', { mot, max, jours }); if (!r.ok) throw new Error(r.erreur || 'refusé (le script du Drive est-il à jour ?)');
  return r.factures;
}
/** Le fichier d'une facture, lu sans rien modifier dans le Drive. */
const FICHIERS = new Map(); // id -> File : « Voir la facture » puis « Traiter » ne téléchargent qu'une fois
export async function fichierFacture(id) {
  if (FICHIERS.has(id)) return FICHIERS.get(id);
  const c = await appel('facture', { id }); if (!c.ok) throw new Error(c.erreur || 'facture refusée');
  const octets = Uint8Array.from(atob(c.base64), ch => ch.charCodeAt(0));
  const f = new File([octets], c.nom, { type: c.type });
  FICHIERS.set(id, f); if (FICHIERS.size > 8) FICHIERS.delete(FICHIERS.keys().next().value);
  return f;
}
