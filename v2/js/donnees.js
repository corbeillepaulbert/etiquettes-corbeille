// Données de la V2, rangées sur l'appareil (IndexedDB « corbeille-v2 »).
// Ce lot est en lecture seule vis-à-vis de StorePOS et de la V1 : rien n'est écrit ailleurs que dans cette base.
import { readXlsx, readCsv, norm, findCol, eanStr, num } from './moteur/xlsx.js';

const BASE = 'corbeille-v2', MAGASIN = 'kv';
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(MAGASIN);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
export async function lire(cle, defaut) {
  const d = await db();
  return new Promise(r => {
    const q = d.transaction(MAGASIN).objectStore(MAGASIN).get(cle);
    q.onsuccess = () => r(q.result === undefined ? defaut : q.result); q.onerror = () => r(defaut);
  });
}
export async function ecrire(cle, valeur) {
  const d = await db();
  return new Promise((r, j) => {
    const t = d.transaction(MAGASIN, 'readwrite'); t.objectStore(MAGASIN).put(valeur, cle);
    t.oncomplete = () => r(); t.onerror = () => j(t.error);
  });
}

/** Fin de session invitée : tout ce que l'appareil a reçu est effacé. */
export async function toutEffacer() {
  const d = await db();
  await new Promise((r, j) => { const t = d.transaction(MAGASIN, 'readwrite'); t.objectStore(MAGASIN).clear(); t.oncomplete = () => r(); t.onerror = () => j(t.error); });
  etat.produits = {}; etat.meta = {}; etat.liste = []; etat.listeSupprimes = {};
}

export const etat = { produits: {}, meta: {}, reglages: { semaines: 1, seuilTop: 365 }, liste: [], listeSupprimes: {} };

export async function charger() {
  etat.produits = await lire('produits', {});
  etat.meta = await lire('meta', {});
  etat.reglages = { ...etat.reglages, ...(await lire('reglages', {})) };
  etat.liste = await lire('liste', []);
  etat.listeSupprimes = await lire('listeSupprimes', {});
  return etat;
}
export const sauverReglages = () => ecrire('reglages', etat.reglages);
export async function sauverListe() {
  await ecrire('liste', etat.liste); await ecrire('listeSupprimes', etat.listeSupprimes); await ecrire('listeAEnvoyer', true);
}

export function trouver(code) {
  const P = etat.produits;
  return P[code] || P[code.padStart(13, '0')] || P[code.replace(/^0+/, '')] || null;
}

// ---------- périodes de ventes (exports Vente PLU datés) ----------
let PERIODES = null;
export async function lirePeriodes() { if (!PERIODES) PERIODES = await lire('periodes', {}); return PERIODES; }
async function rangerPeriode(p) { const P = await lirePeriodes(); P[`${p.du}_${p.au}`] = p; await ecrire('periodes', P); }
const jourMs = d => new Date(d + 'T12:00').getTime();
/** Période rangée qui couvre [du, au] à `tol` jours près à chaque bout, sinon null. */
export async function periodeCouvrant(du, au, tol = 2) {
  const P = await lirePeriodes();
  return Object.values(P).find(p => Math.abs(jourMs(p.du) - jourMs(du)) <= tol * 864e5 && Math.abs(jourMs(p.au) - jourMs(au)) <= tol * 864e5) || null;
}

// Avant chaque import qui remplace les fiches, les modules intéressés (étiquettes à refaire…) voient l'avant et l'après.
const SURIMPORT = [];
export function siImport(fn) { SURIMPORT.push(fn); }

export function joursVentes() { return etat.meta.ventes?.jours || 365; }

// Exports nommés sans dates (« RAMADAN 2024 ») : le module qui connaît ces noms donne la période (ramadan.js).
let NOMMEES = null;
export function siPeriodeNommee(fn) { NOMMEES = fn; }
const nomRamadan = nom => /RAMADAN/i.test(nom);

/** Période d'un fichier de ventes, lue dans son nom (même règle que la V1). */
export function periodeDepuisNom(nom) {
  const m = nom.match(/(\d{2})[_.-](\d{2})[_.-](\d{2,4})[_ .-]+(?:au[_ .-]+)?(\d{2})[_.-](\d{2})[_.-](\d{2,4})/i);
  const Y = y => y.length === 2 ? '20' + y : y;
  if (!m) return { jours: 365, du: '', au: '' };
  const du = `${Y(m[3])}-${m[2]}-${m[1]}`, au = `${Y(m[6])}-${m[5]}-${m[4]}`;
  const d = (new Date(au) - new Date(du)) / 864e5 + 1;
  return { jours: d > 6 && d < 2000 ? Math.round(d) : 365, du, au };
}

/** Importe un export StorePOS (fichier produits ou fichier de ventes). Le type est reconnu tout seul. */
export async function importerFichier(file, origine = {}) {
  const ab = await file.arrayBuffer();
  let rows;
  if (/\.xlsx$/i.test(file.name)) rows = await readXlsx(ab);
  else rows = readCsv(new TextDecoder(/�/.test(new TextDecoder().decode(ab.slice(0, 2000))) ? 'windows-1252' : 'utf-8').decode(ab));
  let hi = rows.findIndex(r => r && r.some(c => /CODEBAR|CODE.?\/.?EAN|^EAN$/i.test(String(c || '').trim())));
  if (hi < 0) hi = 0;
  const h = (rows[hi] || []).map(x => String(x || ''));
  const cE = findCol(h, ['CODEBAR', 'Code / EAN', 'EAN', 'Code barre', 'Code']);
  const cL = findCol(h, ['LIBELLE', 'Désignation', 'Libellé', 'Designation']);
  if (cE < 0 || cL < 0) throw new Error("ce fichier n'a pas de colonne code-barres et libellé : est-ce bien un export StorePOS ?");
  const cQ = findCol(h, ['Qté vendue', 'Qte vendue', 'Quantité vendue']);
  const type = cQ >= 0 ? 'ventes' : 'base';
  const cP = findCol(h, ['PRIX1', 'Prix vente TTC', 'PV TTC', 'Prix TTC']);
  const cD = findCol(h, ['Département', 'Departement']);
  const cR = h.findIndex(x => norm(x) === 'RAYON'), cF = h.findIndex(x => norm(x) === 'FAMILLE');
  const cS = h.findIndex(x => norm(x) === 'SOUSFAMILLE'), cG = h.findIndex(x => norm(x) === 'GROUPE');
  const cA = findCol(h, ["Prix d'achat HT", 'Prix achat']);
  const cT = findCol(h, ['TAUX TVA', 'TVA']);
  const cFo = h.findIndex(x => /^FOURNISSEURACTIF$|^FOURNISSEUR$/.test(norm(x)));
  const cRf = h.findIndex(x => /^REFFOURNISSEUR$/.test(norm(x)));
  const cSt = h.findIndex(x => norm(x) === 'STOCKACTUEL');
  const cCA = type === 'ventes' ? findCol(h, ['Chiffre affaire (TTC)', 'CA TTC']) : -1;
  const cMV = type === 'ventes' ? findCol(h, ['marge valeur']) : -1;
  // Ventes : un fichier d'un an (ou plus) est la référence des fiches ; un fichier plus court (4 semaines, un Ramadan…) est rangé à part comme « période ».
  let per = type === 'ventes' ? periodeDepuisNom(file.name) : null;
  if (per && !per.du && NOMMEES) per = (await NOMMEES(file.name)) || per;
  if (type === 'ventes' && nomRamadan(file.name) && !per.du) throw new Error("pas de Ramadan connu pour cette année dans le nom (ex. RAMADAN 2024)");
  // un export de Ramadan n'est jamais la référence des ventes, même si c'est le premier reçu
  const principal = type === 'base' || ((!per.du || per.jours >= 300 || !etat.meta.ventes) && !nomRamadan(file.name));
  const qm = {}, cam = {}; let caTot = 0, mvTot = 0, mvN = 0;
  const P = { ...etat.produits };
  const vus = new Set();
  let n = 0;
  for (const r of rows.slice(hi + 1)) {
    if (!r) continue;
    const e = eanStr(r[cE]); if (!e) continue;
    const lib = String(r[cL] ?? '').trim(); if (!lib || lib === 'nan') continue;
    const o = P[e] ? { ...P[e] } : { e, lib, prix: null };
    if (type === 'base') {
      o.lib = lib; o.base = 1;
      if (cP >= 0) o.prix = num(r[cP]);
      if (cD >= 0) o.dep = String(r[cD] ?? '').trim();
      if (cR >= 0) o.ray = String(r[cR] ?? '').trim();
      if (cF >= 0) o.fam = String(r[cF] ?? '').trim();
      if (cS >= 0) o.sfam = String(r[cS] ?? '').trim();
      if (cG >= 0) o.grp = String(r[cG] ?? '').trim();
      if (cA >= 0) o.pa0 = num(r[cA]);
      if (cT >= 0) { const t = num(r[cT]); if (t != null) o.tva = t; }
      if (cFo >= 0) o.four = String(r[cFo] ?? '').replace(/^nan$/, '').trim();
      if (cRf >= 0) o.reff = String(r[cRf] ?? '').replace(/^nan$/, '').trim();
      if (cSt >= 0) o.stk = num(r[cSt]);
    } else {
      const q = num(r[cQ]) || 0;
      qm[e] = (qm[e] || 0) + q;
      if (cCA >= 0) { const ca = num(r[cCA]) || 0; cam[e] = Math.round(((cam[e] || 0) + ca) * 100) / 100; caTot += ca; }
      if (cMV >= 0) { const mv = num(r[cMV]); if (mv != null) { mvTot += mv; mvN++; } }
      if (!principal) { vus.add(e); n++; continue; }
      o.q = (vus.has(e) ? (o.q || 0) : 0) + q; vus.add(e);
      if (o.prix == null && cP >= 0) o.prix = num(r[cP]);
      if (!o.dep && cD >= 0) o.dep = String(r[cD] ?? '').trim();
      if (!o.base) o.lib = lib;
    }
    P[e] = o; n++;
  }
  if (per && per.du) await rangerPeriode({ ...per, nom: file.name, q: qm, ...(cCA >= 0 ? { ca: cam, caTot: Math.round(caTot * 100) / 100 } : {}), ...(mvN ? { margeTot: Math.round(mvTot * 100) / 100 } : {}) });
  if (!principal) return { type: 'periode', lignes: n, du: per.du, au: per.au, jours: per.jours };
  if (type === 'ventes') {
    // les produits absents du nouveau fichier n'ont pas vendu sur la période
    for (const e of Object.keys(P)) if (!vus.has(e)) P[e] = { ...P[e], q: 0 };
  }
  for (const f of SURIMPORT) { try { await f({ type, avant: etat.produits, apres: P, premier: !etat.meta[type], jours: type === 'ventes' ? per.jours : undefined }); } catch (x) { console.error('[V2/Import] suite :', x.message); } }
  const meta = { ...etat.meta, [type]: { nom: file.name, lignes: n, v: 3, date: new Date().toISOString(), ...origine, ...(type === 'ventes' ? per : {}) } };
  await ecrire('produits', P); await ecrire('meta', meta);
  etat.produits = P; etat.meta = meta;
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }
  return { type, lignes: n };
}

/** La V1 et la V2 partagent l'adresse du site : ouvertes dans Safari, la V2 peut relire les données de la V1 (lecture seule). */
export function donneesV1Disponibles() {
  try { const v = localStorage.getItem('cpb_products'); return !!(v && v.length > 100); } catch (e) { return false; }
}
export async function reprendreV1() {
  const P1 = JSON.parse(localStorage.getItem('cpb_products') || '{}');
  const M1 = JSON.parse(localStorage.getItem('cpb_meta') || '{}');
  const P = {};
  for (const [e, o] of Object.entries(P1)) {
    P[e] = { e, lib: o.lib, prix: o.prix0 ?? o.prix ?? null, dep: o.dep || '', ray: o.ray || '', fam: o.fam || '', sfam: o.sfam || '', grp: o.grp || '', pa0: o.pa0 ?? null, four: o.four || '', reff: o.reff || '', q: typeof o.q === 'number' ? o.q : null, base: o.fromBase ? 1 : 0 };
  }
  const meta = {
    base: M1.base ? { nom: M1.base.name, lignes: M1.base.n, date: new Date().toISOString(), source: 'V1' } : undefined,
    ventes: M1.ventes ? { nom: M1.ventes.name, lignes: M1.ventes.n, jours: M1.ventes.days || 365, du: M1.ventes.from || '', au: M1.ventes.to || '', date: new Date().toISOString(), source: 'V1' } : undefined
  };
  await ecrire('produits', P); await ecrire('meta', meta);
  etat.produits = P; etat.meta = meta;
  return Object.keys(P).length;
}
