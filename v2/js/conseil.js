// Lot 6 : Conseil d'achat par fournisseur. Objectif : moins de passages chez le grossiste sans dépasser les dates limites.
// Calcul sur les ventes (le stock n'est pas fiable avant l'inventaire : il est montré, jamais utilisé pour décider).
// Choix par défaut (spec à confirmer) : écran utilisable chez soi la veille comme sur place ; « À ne pas prendre » = aucune vente sur 8 semaines,
// ou ventes des 4 dernières semaines inférieures à 30 % des 4 précédentes (baisse de plus de 70 %).
import { etat, lire, ecrire, trouver } from './donnees.js';
import { barreMode, joli } from './ecrans.js';
import { icone } from './icones.js';
import { fournisseursCaisse } from './fournisseurs.js';
import { besoinsAchat, carteExports, brancherBesoins, actionBesoins } from './besoins.js';
import { ouvrirScanner } from './moteur/scan.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SN = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');
const SANS = '__sans__';
/** Familles du conseil : couverture visée et date limite par défaut (modifiable produit par produit). */
const CATS = [
  { k: 'cremerie', re: /CREMERIE|FROMAGE|FRAIS LS|ULTRA FRAIS/, nom: 'Crèmerie', couv: 7, dluo: 15 },
  { k: 'exotique', re: /FRAIS EXO|EXOTIQUE|SURGEL/, nom: 'Frais exotique', couv: 10, dluo: 30 },
  { k: 'boissons', re: /LIQ/, nom: 'Boissons', couv: 30, dluo: 180 },
  { k: 'dph', re: /DPH|BAZAR|DIVERS 20/, nom: 'DPH', couv: 30, dluo: 730 },
  { k: 'epicerie', re: /EPIC|CASHER|DIVERS 5|DIVERS 10/, nom: 'Épicerie', couv: 30, dluo: 365 }
];
const HORS = /FRUIT|LEG|BOULANG|RESERVE|CONSIGNE|PRESSE|GAZ|LIBRAIRIE|SERVICE|POSTAUX|CONS\. MAG/;
export const categorie = o => { const d = `${o.dep || ''} ${o.fam || ''}`.toUpperCase(); if (HORS.test(d)) return null; return CATS.find(c => c.re.test(d)) || null; };
const DUREES = [[7, '1 semaine'], [15, '15 jours'], [30, '1 mois'], [60, '2 mois'], [90, '3 mois'], [180, '6 mois'], [365, '1 an'], [730, '2 ans']];
const duree = j => (DUREES.find(([d]) => d === j) || [j, `${j} jours`])[1];

let DLUO = {}, choix = '', ajoutes = new Set();
export async function chargerConseil() { DLUO = await lire('dluo', {}); }

const duFournisseur = (o, four) => four === SANS ? !String(o.four || '').trim() : (SN(o.four) === SN(four));
/** Le conseil pour un produit. P4/P8 : quantités vendues sur 4 et 8 semaines (null si l'export manque). */
export function conseiller(o, P4, P8) {
  const c = categorie(o); if (!c || !P4) return null;
  const v4 = P4.q[o.e] || 0, v8 = P8 ? (P8.q[o.e] || 0) : null, prev = v8 != null ? Math.max(0, v8 - v4) : null;
  const dluo = DLUO[o.e] || c.dluo, parJour = v4 / P4.jours;
  const besoin = Math.ceil(parJour * c.couv - 1e-9), max = Math.floor(parJour * dluo);
  const qte = Math.max(0, Math.min(besoin, max));
  let pasPrendre = '';
  if (v8 === 0) pasPrendre = 'aucune vente sur 8 semaines';
  else if (prev != null && prev >= 4 && v4 < 0.3 * prev) pasPrendre = `ventes en baisse : ${v4} sur les 4 dernières semaines contre ${prev} avant`;
  const rupture = o.stk > 0 && parJour > 0 ? Math.floor(o.stk / parJour) : null;
  return { o, c, v4, v8, prev, dluo, parJour, besoin, max, qte, limite: besoin > max && max >= 0, pasPrendre, rupture };
}

function ecranFournisseurs(nav) {
  const L = fournisseursCaisse(), P = Object.values(etat.produits);
  const n = f => P.filter(o => categorie(o) && duFournisseur(o, f)).length;
  const sans = n(SANS);
  nav.afficher(`<div class="scr cb">${barreMode('achat', 'Conseil d\'achat', true)}<div class="scr__corps">
    <h1 class="titre-1">Conseil d'achat</h1>
    <div class="note">Choisis le fournisseur : l'appli prépare ce qu'il faut prendre pour un mois (une semaine pour la crèmerie), sans dépasser les dates limites.</div>
    ${L.map(f => `<button class="ligne" data-action="cons-four" data-f="${esc(f.nom)}" style="border:0;font:inherit;text-align:left;width:100%"><div class="ligne__ico">${icone('achat')}</div><div class="ligne__txt"><div class="ligne__titre">${esc(f.nom)}</div><div class="ligne__detail">${n(f.nom)} produits</div></div>${icone('chevron', 'cb-ico cb-ico--24')}</button>`).join('')}
    ${sans ? `<button class="ligne" data-action="cons-four" data-f="${SANS}" style="border:0;font:inherit;text-align:left;width:100%"><div class="ligne__ico">${icone('boite')}</div><div class="ligne__txt"><div class="ligne__titre">Sans fournisseur dans StorePOS</div><div class="ligne__detail">${sans} produits (souvent achetés chez Metro ou Promocash)</div></div>${icone('chevron', 'cb-ico cb-ico--24')}</button>` : ''}
  </div><div class="scr__bas"><button class="btn btn--discret" data-action="mode" data-mode="achat">Retour</button></div></div>`, 'conseil');
}

let dernier = { prendre: [], pas: [] };
async function ecranConseil(nav, message = '') {
  const besoins = await besoinsAchat(), P4 = besoins[0].periode, P8 = besoins[1].periode;
  const nomF = choix === SANS ? 'Sans fournisseur' : choix;
  const tous = Object.values(etat.produits).filter(o => duFournisseur(o, choix)).map(o => conseiller(o, P4, P8)).filter(Boolean);
  const pas = tous.filter(x => x.pasPrendre), prendre = tous.filter(x => !x.pasPrendre && x.qte > 0).sort((a, b) => b.v4 - a.v4);
  dernier = { prendre, pas };
  const ligne = x => `<div class="cons-ligne${ajoutes.has(x.o.e) ? ' cons-ligne--ok' : ''}">
      <button class="cons-txt" data-action="cons-dluo" data-e="${esc(x.o.e)}"><div class="ligne__titre">${esc(joli(x.o.lib))}</div>
      <div class="ligne__detail">${x.v4} vendus en 4 sem. · ${x.c.nom.toLowerCase()} ${x.c.couv} j${x.rupture != null ? ` · rupture vers ${x.rupture} j (stock théorique)` : ''}</div>
      ${x.limite ? `<div class="cons-dluo">Date limite ${duree(x.dluo)} : ne prends que ${x.max}</div>` : ''}</button>
      <div class="cons-qte"><b>${x.qte}</b>${ajoutes.has(x.o.e) ? `<span class="exp-ok">${icone('check', 'cb-ico cb-ico--24')}</span>` : `<button class="btn btn--achat cons-ajout" data-action="cons-ajouter" data-e="${esc(x.o.e)}" aria-label="Ajouter à ma liste">+</button>`}</div></div>`;
  nav.afficher(`<div class="scr cb" data-ecran="conseil">${barreMode('achat', nomF, true)}<div class="scr__corps">
    <h1 class="titre-1">${esc(nomF)}</h1>
    ${message ? `<div class="bandeau bandeau--alerte">${icone('info', 'cb-ico cb-ico--24')}<span>${message}</span></div>` : ''}
    ${carteExports(besoins, 'Pour calculer le conseil d\'achat')}
    ${P4 ? `<div class="bandeau bandeau--alerte">${icone('alerte', 'cb-ico cb-ico--24')}<span>Stock pas fiable avant l'inventaire : les quantités viennent des ventes des 4 dernières semaines (${P4.du.split('-').reverse().join('/')} → ${P4.au.split('-').reverse().join('/')}).</span></div>
      <h2 class="titre-2">À prendre cette fois <span class="note">(${prendre.length})</span></h2>
      ${prendre.length ? prendre.map(ligne).join('') : '<div class="carte"><div class="note">Rien à prendre chez ce fournisseur pour l\'instant.</div></div>'}
      ${P8 && pas.length ? `<details class="carte"><summary style="min-height:48px;display:flex;align-items:center;font:700 18px var(--font-texte)">À ne pas prendre (${pas.length})</summary>
        <div class="note" style="margin:8px 0">${choix === SANS ? 'Produits sans fournisseur dans StorePOS (souvent créés en caisse) : ne les rachète pas tant qu\'ils ne repartent pas.' : `Ne les reprends pas chez ${esc(nomF)} cette fois : l'argent reste dans la caisse.`}</div>
        ${pas.map(x => `<div class="cons-pas"><b>${esc(joli(x.o.lib))}</b><span class="note">${esc(x.pasPrendre)}</span></div>`).join('')}</details>` : ''}`
      : ''}
  </div><div class="scr__bas">
    ${prendre.length ? `<button class="btn btn--principal btn--achat" data-action="cons-tout">Tout ajouter à ma liste (${prendre.filter(x => !ajoutes.has(x.o.e)).length})</button>` : ''}
    <button class="btn btn--secondaire" data-action="cons-promo">${icone('scan', 'cb-ico cb-ico--24')}Scanner une promo</button>
  </div></div>`, 'conseil');
  brancherBesoins(() => ecranConseil(nav), nav.toast);
}

async function ajouterListe(x, qte, raison) {
  const i = etat.liste.findIndex(y => y.e === x.o.e);
  const l = { e: x.o.e, lib: x.o.lib, qte, raison, date: new Date().toISOString() };
  if (i >= 0) etat.liste[i] = l; else etat.liste.push(l);
  delete etat.listeSupprimes[x.o.e]; ajoutes.add(x.o.e);
}
const sauverListe = () => Promise.all([ecrire('liste', etat.liste), ecrire('listeSupprimes', etat.listeSupprimes), ecrire('listeAEnvoyer', true)]);

function feuilleDluo(nav, e) {
  const o = etat.produits[e], c = o && categorie(o); if (!c) return;
  const v = DLUO[e] || c.dluo;
  const d = document.createElement('div'); d.className = 'toast-zone cb'; d.style.cssText = 'top:auto;bottom:0;left:0;right:0';
  d.innerHTML = `<div class="feuille-saisie" style="position:relative"><div class="titre-3">${esc(joli(o.lib))}</div>
    <div class="note">Date limite habituelle à la livraison. Tu la notes une fois : elle sert à chaque conseil.</div>
    <div class="duo">${DUREES.map(([j, t]) => `<button class="btn ${j === v ? 'btn--achat' : 'btn--secondaire'}" data-j="${j}" style="font-size:17px">${t}</button>`).join('')}</div>
    <button class="btn btn--secondaire" data-fermer>Fermer</button></div>`;
  document.body.appendChild(d);
  d.querySelector('[data-fermer]').onclick = () => d.remove();
  d.querySelectorAll('[data-j]').forEach(b => b.onclick = async () => {
    const avant = DLUO[e]; DLUO[e] = +b.dataset.j; await ecrire('dluo', DLUO); d.remove(); await ecranConseil(nav);
    nav.toast(`Date limite : ${duree(+b.dataset.j)}`, async () => { if (avant) DLUO[e] = avant; else delete DLUO[e]; await ecrire('dluo', DLUO); ecranConseil(nav); });
  });
}

/** Promo : quantité gonflée (deux fois le conseil), toujours bornée par la date limite. */
async function feuillePromo(nav, code) {
  const o = trouver(code);
  const besoins = await besoinsAchat(), x = o && conseiller(o, besoins[0].periode, besoins[1].periode);
  const d = document.createElement('div'); d.className = 'toast-zone cb'; d.style.cssText = 'top:auto;bottom:0;left:0;right:0';
  if (!o || !x) { nav.toast(!o ? `${code} : code inconnu en caisse` : besoins[0].periode ? `${joli(o.lib)} : hors du conseil (fruits et légumes, pain…)` : 'Il manque l\'export des 4 dernières semaines'); return; }
  let q = Math.max(1, Math.min(Math.max(x.besoin, 1) * 2, x.max || 1));
  const rendre = () => `<div class="feuille-saisie" style="position:relative"><div class="titre-3">Promo · ${esc(joli(o.lib))}</div>
    <div class="note">${x.v4} vendus en 4 semaines · date limite ${duree(x.dluo)} · conseil normal : ${x.qte}</div>
    <div class="achat__qte" style="justify-content:center"><button class="btn btn--geste" data-m>−</button><b style="font:800 48px var(--font-titre);min-width:90px;text-align:center">${q}</b><button class="btn btn--geste" data-p>+</button></div>
    <div class="note">${x.max > 0 ? `Au plus ${x.max} pour tout vendre avant la date limite.` : 'Il ne se vend presque pas : même en promo, prends-en peu.'}</div>
    <button class="btn btn--principal btn--achat" data-ok>Ajouter à ma liste</button><button class="btn btn--secondaire" data-fermer>Fermer</button></div>`;
  const brancher = () => {
    d.querySelector('[data-fermer]').onclick = () => d.remove();
    d.querySelector('[data-m]').onclick = () => { q = Math.max(1, q - 1); d.innerHTML = rendre(); brancher(); };
    d.querySelector('[data-p]').onclick = () => { q = x.max > 0 ? Math.min(x.max, q + 1) : q + 1; d.innerHTML = rendre(); brancher(); };
    d.querySelector('[data-ok]').onclick = async () => { const avant = etat.liste.slice(); await ajouterListe(x, q, 'promo'); await sauverListe(); d.remove(); nav.sync && nav.sync(); await ecranConseil(nav); nav.toast(`${q} × ${joli(o.lib)} ajouté (promo)`, async () => { etat.liste = avant; ajoutes.delete(o.e); await sauverListe(); ecranConseil(nav); }); };
  };
  d.innerHTML = rendre(); document.body.appendChild(d); brancher();
}

export async function actionConseil(a, b, nav) {
  if (document.querySelector('.scr[data-ecran="conseil"]') && await actionBesoins(a, b, () => ecranConseil(nav), nav.toast)) return true;
  if (a !== 'conseil' && !a.startsWith('cons-')) return false;
  if (a === 'conseil') { ecranFournisseurs(nav); return true; }
  if (a === 'cons-four') { choix = b.dataset.f; ajoutes = new Set(etat.liste.map(l => l.e)); await ecranConseil(nav); return true; }
  if (a === 'cons-dluo') { feuilleDluo(nav, b.dataset.e); return true; }
  if (a === 'cons-ajouter' || a === 'cons-tout') {
    const L = a === 'cons-tout' ? dernier.prendre.filter(x => !ajoutes.has(x.o.e)) : dernier.prendre.filter(x => x.o.e === b.dataset.e);
    if (!L.length) return true;
    const avant = etat.liste.slice(), avantA = new Set(ajoutes);
    for (const x of L) await ajouterListe(x, x.qte, `conseil ${x.c.couv} j · ${x.v4} vendus en 4 sem.`);
    await sauverListe(); nav.sync && nav.sync(); await ecranConseil(nav);
    nav.toast(L.length > 1 ? `${L.length} produits ajoutés à ta liste` : `${L[0].qte} × ${joli(L[0].o.lib)} ajouté`, async () => { etat.liste = avant; ajoutes = avantA; await sauverListe(); ecranConseil(nav); });
    return true;
  }
  if (a === 'cons-promo') { ouvrirScanner({ mode: 'achat', titre: 'Scanne le produit en promo', onCode: c => { feuillePromo(nav, c); return { ok: true, txt: c }; }, onFermer: () => ecranConseil(nav) }); return true; }
  return false;
}
