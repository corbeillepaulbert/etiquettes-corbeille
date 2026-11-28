// Ventes NF525 : les tickets de caisse arrivent chaque matin dans le Drive (copie des archives fiscales par le PC du magasin).
// Le script (version 8) les résume par jour et par produit ; l'appli demande les périodes dont elle a besoin
// (365 jours, 4 et 8 semaines, 7 jours, chaque Ramadan) et elles remplacent les exports Vente PLU. L'export produits reste.
// Repli : tant que le script n'est pas en version 8 ou que l'historique n'est pas prêt, les exports continuent de servir.
import { etat, lire, ecrire, rangerPeriodesNF, appliquerVentesNF } from './donnees.js';
import { appel, estAdmin } from './drive.js';
import { calendrier } from './ramadan.js';
import { euros } from './calcul.js';
import { icone } from './icones.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ms = d => new Date(d + 'T12:00').getTime();
const iso = t => { const d = new Date(t); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const decale = (d, n) => iso(ms(d) + n * 864e5);
const compact = d => d.replace(/-/g, '');
const ANOMALIES = new Set(['20221212', '20221220']); // remboursement CB de décembre 2022 : hors comparaisons

let INFO = null, CA = [];
export async function chargerVentes() { INFO = await lire('ventesNF', null); CA = await lire('caJours', []); }
export const infoVentes = () => INFO;

/** Périodes demandées au script, toutes finies au dernier jour complet (`au`). */
export async function periodesVoulues(au) {
  const p = [
    { cle: 'an', du: decale(au, -364), au }, { cle: 'p56', du: decale(au, -55), au }, { cle: 'p28', du: decale(au, -27), au },
    { cle: 'p7', du: decale(au, -6), au }, { cle: 'p7avant', du: decale(au, -13), au: decale(au, -7) }
  ];
  const { passes } = await calendrier();
  for (const r of passes) p.push({ cle: 'R' + r.annee, du: r.debut, au: decale(r.aid, -1) });
  return p;
}

/** Synchronisation (gérant) : au plus toutes les 3 heures, ou dès qu'un jour de plus doit être disponible. */
export async function synchroniserVentes({ forcer = false } = {}) {
  if (!estAdmin() || !navigator.onLine) return false;
  const attendu = decale(iso(Date.now()), -2);
  if (!forcer && INFO && INFO.au >= attendu && Date.now() - INFO.recu < 3 * 3600e3 && !INFO.moisAPreparer) return false;
  const au = INFO && INFO.au ? (INFO.au >= attendu ? INFO.au : attendu) : attendu;
  const r = await appel('ventes', { periodes: await periodesVoulues(au) });
  if (!r || !r.ok || !r.au) { console.info('[V2/Ventes] tickets de caisse indisponibles :', r && r.erreur || 'script sans ventes NF525'); return false; }
  // le dernier jour réel peut être plus ancien qu'attendu (copie du matin pas encore passée) : on redemande sur la bonne date
  let rep = r;
  if (r.au !== au) rep = await appel('ventes', { periodes: await periodesVoulues(r.au) });
  if (!rep || !rep.ok) return false;
  if (Object.keys(rep.periodes || {}).length) await rangerPeriodesNF(rep.periodes);
  if (rep.periodes && rep.periodes.an) await appliquerVentesNF(rep.periodes.an);
  CA = rep.caJours || []; await ecrire('caJours', CA);
  INFO = { au: rep.au, debut: rep.debut, moisPrets: rep.moisPrets, moisAPreparer: rep.moisAPreparer, enAttente: rep.enAttente || [], recu: Date.now() };
  await ecrire('ventesNF', INFO);
  console.info(`[V2/Ventes] tickets à jour au ${rep.au} · ${Object.keys(rep.periodes || {}).length} période(s)${rep.moisAPreparer ? ` · ${rep.moisAPreparer} mois en préparation` : ''}`);
  return true;
}

// ---------- grand affichage de l'accueil ----------
const jourLong = d => new Date(d + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const pct = (a, b) => b > 0 ? Math.round((a / b - 1) * 100) : null;
const signe = n => n == null ? '' : `${n >= 0 ? '+' : ''}${n} %`;
/** Chiffres du dernier jour complet et des 7 derniers jours, comparés au même jour de la semaine il y a un an (364 jours). */
export function chiffres() {
  if (!CA.length) return null;
  const par = Object.fromEntries(CA.map(x => [x[0], x]));
  const der = CA[CA.length - 1], j = der[0], d = `${j.slice(0, 4)}-${j.slice(4, 6)}-${j.slice(6)}`;
  const n1 = par[compact(decale(d, -364))];
  const somme = (fin, n) => { let ca = 0, t = 0, ok = true; for (let i = 0; i < n; i++) { const k = compact(decale(fin, -i)); if (ANOMALIES.has(k)) ok = false; const x = par[k]; if (x) { ca += x[1]; t += x[5]; } } return { ca, t, ok }; };
  const s7 = somme(d, 7), s7n1 = somme(decale(d, -364), 7);
  const encaisse = der[2] + der[3] + der[4];
  return {
    jour: d, ca: der[1], tickets: der[5], panier: der[5] ? der[1] / der[5] : null,
    especes: encaisse > 0 ? Math.round(der[2] / encaisse * 100) : null, carte: encaisse > 0 ? Math.round(der[3] / encaisse * 100) : null,
    n1: n1 && !ANOMALIES.has(n1[0]) ? { ca: n1[1], ecart: pct(der[1], n1[1]) } : null,
    s7: s7.ca, s7n1: s7n1.ok && s7n1.ca > 0 ? { ca: s7n1.ca, ecart: pct(s7.ca, s7n1.ca) } : null
  };
}
export function carteVentes() {
  const c = chiffres(); if (!c) return '';
  return `<button class="carte ventes-carte" data-action="hebdo" style="text-align:left;border:0;font:inherit;width:100%">
    <div class="note">Ventes à jour au ${esc(jourLong(c.jour))}</div>
    <div class="ventes-ca">${euros(c.ca)}${c.n1 && c.n1.ecart != null ? ` <span class="ventes-ecart ${c.n1.ecart >= 0 ? 'ventes-ecart--plus' : 'ventes-ecart--moins'}">${signe(c.n1.ecart)}</span>` : ''}</div>
    <div class="note">${c.n1 ? `Il y a un an, même jour : ${euros(c.n1.ca)} · ` : ''}${c.tickets} client${c.tickets > 1 ? 's' : ''}${c.panier ? ` · panier ${euros(c.panier)}` : ''}${c.especes != null ? ` · espèces ${c.especes} %, carte ${c.carte} %` : ''}</div>
    <div class="note fort">7 derniers jours : ${euros(Math.round(c.s7))}${c.s7n1 ? ` (${signe(c.s7n1.ecart)} sur un an)` : ''}</div>
  </button>`;
}
/** Ligne de l'écran Données. */
export function ligneVentes() {
  if (!INFO) return '';
  return `<div class="note">${icone('check', 'cb-ico cb-ico--24')} Ventes lues chaque matin dans les tickets de caisse, à jour au ${esc(INFO.au.split('-').reverse().join('/'))}.${INFO.moisAPreparer ? ` Historique en préparation : encore ${INFO.moisAPreparer} mois.` : ''} L'export Vente PLU n'est plus nécessaire.</div>`;
}
