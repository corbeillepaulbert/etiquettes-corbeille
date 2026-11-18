// Liaison avec le Drive du magasin, via l'application Web Apps Script (apps-script/Code.gs).
// L'adresse et la clé se saisissent dans Réglages et restent sur l'appareil (IndexedDB) : jamais dans le dépôt.
import { lire, ecrire, etat, importerFichier } from './donnees.js';

let config = null;
export async function chargerConfig() { config = await lire('drive', null); return config; }
export const estRelie = () => !!(config && config.url && config.cle);
export async function relier(url, cle) {
  const essai = { url: String(url || '').trim(), cle: String(cle || '').trim() };
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(essai.url)) throw new Error("l'adresse doit être celle de l'application Web, qui finit par /exec");
  if (essai.cle.length < 24) throw new Error('la clé fait au moins 24 caractères');
  const r = await appel('ping', {}, essai);
  if (!r.ok) throw new Error('le Drive refuse cette clé');
  config = essai; await ecrire('drive', config);
  return r;
}
export async function delier() { config = null; await ecrire('drive', null); }

export async function appel(action, donnees = {}, cfg = config) {
  if (!cfg) throw new Error('pas relié au Drive');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45000);
  try {
    const r = await fetch(cfg.url, {
      method: 'POST', redirect: 'follow', signal: ctl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...donnees, action, cle: cfg.cle })
    });
    if (!r.ok) throw new Error('le Drive ne répond pas (' + r.status + ')');
    return await r.json();
  } catch (x) {
    if (x.name === 'AbortError') throw new Error('le Drive met trop de temps à répondre');
    if (x instanceof TypeError) throw new Error('pas de réseau');
    throw x;
  } finally { clearTimeout(t); }
}

// ---------- À traiter ----------
export async function aTraiterEnCache() { return lire('aTraiter', { derniere: null, elements: [] }); }
async function garder(r) {
  const v = { derniere: r.derniere, elements: r.elements || [], recu: new Date().toISOString() };
  console.info(`[À traiter] Drive : ${v.elements.length} élément(s), dernier passage ${v.derniere || 'jamais'}, reçu ${v.recu}`);
  await ecrire('aTraiter', v); return v;
}
export async function majATraiter() { const r = await appel('aTraiter'); if (!r.ok) throw new Error('refusé'); return garder(r); }
export async function rafraichirMaintenant() { const r = await appel('rafraichir'); if (!r.ok) throw new Error('refusé'); const v = await garder(r); v.occupe = r.occupe; v.ajoutes = r.ajoutes; return v; }
export async function marquerTraite(id, traite, par) {
  const r = await appel('traiter', { id, etat: traite ? 'traite' : 'nouveau', par });
  if (!r.ok) throw new Error('refusé'); return garder(r);
}

// ---------- exports StorePOS ----------
const typeProbable = nom => /vente|plu/i.test(nom) ? 'ventes' : 'base';
/** Prend dans EXPORTS STOREPOS le dernier fichier produits et le dernier fichier ventes, s'ils sont plus récents que ceux déjà chargés. */
export async function prendreExports({ forcer = false } = {}) {
  const r = await appel('exports'); if (!r.ok) throw new Error('refusé');
  const choisis = {};
  for (const f of r.fichiers) { const t = typeProbable(f.nom); if (!choisis[t]) choisis[t] = f; }
  const faits = [];
  for (const t of ['base', 'ventes']) {
    const f = choisis[t]; if (!f) continue;
    const deja = etat.meta[t];
    if (!forcer && deja && deja.driveId === f.id && deja.driveMaj === f.maj && deja.v === 3) continue;
    const c = await appel('fichier', { id: f.id }); if (!c.ok) throw new Error('fichier refusé : ' + f.nom);
    const octets = Uint8Array.from(atob(c.base64), ch => ch.charCodeAt(0));
    const fichier = new File([octets], c.nom);
    const res = await importerFichier(fichier, { driveId: f.id, driveMaj: f.maj });
    faits.push(res);
  }
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
export async function fichierFacture(id) {
  const c = await appel('facture', { id }); if (!c.ok) throw new Error(c.erreur || 'facture refusée');
  const octets = Uint8Array.from(atob(c.base64), ch => ch.charCodeAt(0));
  return new File([octets], c.nom, { type: c.type });
}
