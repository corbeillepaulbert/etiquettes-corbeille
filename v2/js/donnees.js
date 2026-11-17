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

export function joursVentes() { return etat.meta.ventes?.jours || 365; }

/** Période d'un fichier de ventes, lue dans son nom (même règle que la V1). */
function periodeDepuisNom(nom) {
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
  const cA = findCol(h, ["Prix d'achat HT", 'Prix achat']);
  const cT = findCol(h, ['TAUX TVA', 'TVA']);
  const cFo = h.findIndex(x => /^FOURNISSEURACTIF$|^FOURNISSEUR$/.test(norm(x)));
  const cRf = h.findIndex(x => /^REFFOURNISSEUR$/.test(norm(x)));
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
      if (cA >= 0) o.pa0 = num(r[cA]);
      if (cT >= 0) { const t = num(r[cT]); if (t != null) o.tva = t; }
      if (cFo >= 0) o.four = String(r[cFo] ?? '').replace(/^nan$/, '').trim();
      if (cRf >= 0) o.reff = String(r[cRf] ?? '').replace(/^nan$/, '').trim();
    } else {
      const q = num(r[cQ]) || 0;
      o.q = (vus.has(e) ? (o.q || 0) : 0) + q; vus.add(e);
      if (o.prix == null && cP >= 0) o.prix = num(r[cP]);
      if (!o.dep && cD >= 0) o.dep = String(r[cD] ?? '').trim();
      if (!o.base) o.lib = lib;
    }
    P[e] = o; n++;
  }
  if (type === 'ventes') {
    // les produits absents du nouveau fichier n'ont pas vendu sur la période
    for (const e of Object.keys(P)) if (!vus.has(e)) P[e] = { ...P[e], q: 0 };
  }
  const meta = { ...etat.meta, [type]: { nom: file.name, lignes: n, v: 2, date: new Date().toISOString(), ...origine, ...(type === 'ventes' ? periodeDepuisNom(file.name) : {}) } };
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
    P[e] = { e, lib: o.lib, prix: o.prix0 ?? o.prix ?? null, dep: o.dep || '', ray: o.ray || '', fam: o.fam || '', pa0: o.pa0 ?? null, four: o.four || '', reff: o.reff || '', q: typeof o.q === 'number' ? o.q : null, base: o.fromBase ? 1 : 0 };
  }
  const meta = {
    base: M1.base ? { nom: M1.base.name, lignes: M1.base.n, date: new Date().toISOString(), source: 'V1' } : undefined,
    ventes: M1.ventes ? { nom: M1.ventes.name, lignes: M1.ventes.n, jours: M1.ventes.days || 365, du: M1.ventes.from || '', au: M1.ventes.to || '', date: new Date().toISOString(), source: 'V1' } : undefined
  };
  await ecrire('produits', P); await ecrire('meta', meta);
  etat.produits = P; etat.meta = meta;
  return Object.keys(P).length;
}
