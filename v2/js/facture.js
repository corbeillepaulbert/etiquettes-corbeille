// Lot 2c : travailler une facture. Lecture des lignes, comparaison avec StorePOS, prix de vente.
// Tout reste sur l'appareil : rien n'est écrit dans StorePOS ni dans le Drive (l'écriture vient au lot suivant).
// Les règles (lecture Agrifresh, rapprochement, marge, prix de vente suggéré) sont celles de la V1, dans moteur/facture.js.
import { etat, lire, ecrire } from './donnees.js';
import { estRelie, facturesDrive, fichierFacture } from './drive.js';
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

export async function chargerFacture() { FAC = await lire('factureEnCours', null); }
const garder = () => ecrire('factureEnCours', FAC);

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
  const ligne = (f, four) => `<button class="ligne" data-action="fac-ouvrir" data-id="${esc(f.id)}" style="border:0;font:inherit;text-align:left;width:100%"><div class="ligne__ico">${icone('facture')}</div><div class="ligne__txt"><div class="ligne__titre">${esc(jour(f.date))} · ${esc(four || f.nom)}</div><div class="ligne__detail">${esc(f.nom.replace(/^\d{4}-\d{2}-\d{2}_/, '').slice(0, 56))}</div></div></button>`;
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
    <div class="note">Vérifie chaque ligne : une photo peut se tromper sur un chiffre. Rien n'est envoyé à StorePOS pour l'instant.</div>
    ${vues.map(([x, i]) => carteLigne(x, i)).join('') || '<div class="carte"><div class="titre-2">Rien à vérifier.</div></div>'}
  </div><div class="scr__bas"><button class="btn btn--principal btn--achat" data-action="fac-fin">Terminé</button></div></div>`;
}

function ecranChoix(i, q = '') {
  const x = FAC.lignes[i];
  return `<div class="scr cb">${barre('Facture')}<div class="scr__corps"><h1 class="titre-1">Quel produit ?</h1>
  <div class="note">${esc(x.des)}</div>
  <input id="fac-q" class="champ" type="search" autocomplete="off" placeholder="Chercher par son nom" data-i="${i}" value="${esc(q)}">
  <div id="fac-res"></div></div><div class="scr__bas"><button class="btn btn--discret" data-action="fac-retour">Retour à la facture</button></div></div>`;
}

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
    try { const f = await fichierFacture(b.dataset.id); await lireEtMontrer(f, nav, 'drive'); }
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
    if (o) { x.e = o.e; x.how = 'manuel'; x.fl = F.isFL(o) && FAC.sup === 'AGRIFRESH'; if (x.fl) x.ill = F.autoIll(o.lib); F.repricer(x, FAC.sup); await garder(); }
    rendre(); return true;
  }
  if (a === 'fac-fin') { FAC.fini = true; await garder(); nav.toast('Modifications gardées sur cet appareil'); document.querySelector('[data-action="accueil"]')?.click(); return true; }
  return false;
}

async function lireEtMontrer(file, nav, source) {
  preparerMoteur();
  nav.afficher(ecranLecture('Lecture du texte de la facture…'), 'facture-lecture');
  const maj = p => { const z = document.querySelector('[data-pct]'); if (z) z.textContent = p + ' %'; };
  const texte = await texteDeFichier(file, maj);
  const r = F.parseInvoice(texte, null);
  if (!r.lines.length) throw new Error('aucune ligne reconnue (essaie le PDF, ou une photo plus nette)');
  FAC = { sup: r.sup, date: r.date, nom: file.name, source, lignes: r.lines, lue: new Date().toISOString() };
  filtre = 'toutes'; await garder();
  nav.afficher(ecranFacture(), 'facture');
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
    if (t.dataset.champ && FAC) {
      const carte = t.closest('.fac-ligne'); const x = FAC.lignes[+carte.dataset.i];
      const v = nombre(t.value);
      if (t.dataset.champ === 'pa') x.pu = v; else x.pv = v;
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
