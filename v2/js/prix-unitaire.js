// Corrections après la lecture d'une facture (moteur repris de la V1, inchangé) : prix d'achat UNITAIRE, comme dans StorePOS.
// Constaté sur de vraies factures Metro :
//  - « PRINCE CHOCOLAT X 12 19,210 1 3 57,63 » : 19,21 € est le prix du lot de 12, pas celui du paquet ;
//  - fruits et légumes : « TOM RDE 6K … 10,140 1 6 60,84 » puis « PRIX AU KG OU AU LITRE: 1,690 » : le prix au kilo est sur la ligne suivante ;
//  - codes de carton à 14 chiffres (« 23439495408908 ») : on en tire le code-barres du produit (13 chiffres).
import * as F from './moteur/facture.js';

const num = s => { const n = parseFloat(String(s).replace(',', '.')); return isFinite(n) ? n : null; };
const cle13 = d12 => { let s = 0; [...d12].forEach((c, i) => { s += +c * (i % 2 ? 3 : 1); }); return String((10 - s % 10) % 10); };
/** GTIN-14 de carton → EAN-13 du produit (chiffre indicateur retiré, clé recalculée). */
export const ean14vers13 = c => /^\d{14}$/.test(c) ? c.slice(1, 13) + cle13(c.slice(1, 13)) : '';
/** Taille du lot écrite dans la désignation : « X 12 », « X12 », « 12X », « LOT DE 6 ». */
export function tailleLot(des) {
  const u = String(des || '').toUpperCase();
  const m = u.match(/\bX\s?(\d{1,3})\b(?!\s?(?:G|GR|KG|CL|ML|L|CM|MM)\b)/) || u.match(/\b(\d{1,3})\s?X\b(?!\s?\d)/) || u.match(/\bLOT\s+DE\s+(\d{1,3})\b/);
  const n = m ? +m[1] : 0; return n >= 2 && n <= 200 ? n : 0;
}

/** Applique les corrections aux lignes lues. P : produits StorePOS. Renvoie les lignes (modifiées sur place). */
export function corrigerPrix(texte, r, P) {
  const L = texte.split(/\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  // 1. prix au kilo écrit sous la ligne, et codes de carton à 14 chiffres
  const kg = new Map(), carton = new Map();
  let prec = '';
  for (const l of L) {
    const m = l.match(/PRIX AU KG OU AU LITRE\s*:?\s*(\d+[.,]\d+)/i);
    if (m && prec) kg.set(prec, num(m[1]));
    const c14 = l.match(/^(\d{14})\s/);
    if (/\d+[.,]\d{2}/.test(l) && !m) { prec = l; if (c14) carton.set(l, ean14vers13(c14[1])); }
  }
  const source = x => L.find(l => l.includes(x.des)) || '';
  for (const x of r.lines) {
    if (r.sup === 'AGRIFRESH' || x.fl) continue; // Agrifresh a ses propres règles (V1)
    const s = source(x);
    if (carton.has(s)) { if (/^\d{14}$/.test(x.ref || '')) x.ref = ''; const e = carton.get(s); if (P[e]) { x.e = e; x.how = 'ean'; x.act = x.act || {}; x.act.lab = true; } x.des = x.des.replace(/^\d{14}\s+/, '').replace(/^\d{5,8}\s+/, ''); }
    if (x.pu == null) continue;
    const pk = kg.get(s), n = tailleLot(s) || tailleLot(x.des);
    x.cands = [{ pu: x.pu, note: '' }];
    if (pk) x.cands.push({ pu: pk, note: `prix au kilo de la facture (${String(x.pu).replace('.', ',')} € le colis)`, kg: true });
    if (n) x.cands.push({ pu: Math.round(x.pu / n * 1000) / 1000, note: `lot de ${n} : ${String(x.pu).replace('.', ',')} € ÷ ${n}`, lot: true });
    choisirPrix(x, P[x.e]);
  }
  return r.lines;
}

/** Choisit, parmi les prix lus, celui qui correspond à l'unité vendue en caisse. À rappeler quand on change le produit d'une ligne. */
export function choisirPrix(x, o) {
  if (!x.cands || x.cands.length < 2) return x;
  const pa = o && o.pa0 > 0 ? o.pa0 : null, kg = x.cands.find(c => c.kg), lot = x.cands.find(c => c.lot);
  let c = x.cands[0];
  if (pa) c = x.cands.reduce((a, b) => Math.abs(Math.log(b.pu / pa)) < Math.abs(Math.log(a.pu / pa)) ? b : a);
  else if (kg && (!o || F.isFL(o))) c = kg;       // fruits et légumes : prix au kilo
  else if (lot) c = lot;                            // un lot se revend à l'unité
  x.pu = c.pu; x.note = c.note; x.puLu = c === x.cands[0] ? undefined : x.cands[0].pu;
  return x;
}
