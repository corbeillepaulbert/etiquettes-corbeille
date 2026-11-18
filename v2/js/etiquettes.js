// Écran Étiquettes épicerie (lot 2a). Le dessin des étiquettes et le PDF viennent de moteur/etiquettes.js (repris de la V1).
import { etat, lire, ecrire, trouver, joursVentes } from './donnees.js';
import { barreMode, joli } from './ecrans.js';
import { icone } from './icones.js';
import { euros } from './calcul.js';
import { configurer, nameOf, modelOf, isTop, cleanName, chk, labelStd, labelTop, pagesGondole, buildPdf, fitName } from './moteur/etiquettes.js';
import { ouvrirScanner } from './moteur/scan.js';
import { livrer } from './livrer.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const E = { codes: [], noms: {}, force: {}, historique: [], pdf: null, vue: 'planche', page: 0 };
let CACHE = { cle: '', pages: null };
const estFL = o => /FRUIT|LEG/i.test(o.dep || ''); // même règle que la V1 : les F&L ont leurs affiches
const imprimable = e => /^\d+$/.test(e) && (e.length === 13 || e.length === 8) && chk(e);

export async function chargerEtiquettes() {
  E.codes = await lire('etiqSelection', []);
  E.noms = await lire('etiqNoms', {});
  E.force = await lire('etiqForce', {});
  E.historique = await lire('etiqHistorique', []);
}
async function sauver() {
  await ecrire('etiqSelection', E.codes); await ecrire('etiqNoms', E.noms);
  await ecrire('etiqForce', E.force); await ecrire('etiqHistorique', E.historique);
}
/** Ajoute des produits épicerie à la planche en cours (depuis une facture validée). Retourne ceux qui ont été ajoutés. */
export async function ajouterEtiquettes(codes) {
  const nouveaux = codes.filter(e => !E.codes.includes(e) && etat.produits[e] && !estFL(etat.produits[e]) && imprimable(e));
  if (nouveaux.length) { E.codes.push(...nouveaux); await sauver(); }
  return nouveaux;
}
export async function retirerEtiquettes(codes) { E.codes = E.codes.filter(e => !codes.includes(e)); await sauver(); }
function ctx() { configurer({ noms: E.noms, force: E.force, seuil: etat.reglages.seuilTop || 365, jours: joursVentes() }); }
const liste = () => E.codes.map(e => etat.produits[e]).filter(Boolean);

/** Ajoute un produit à la planche. Renvoie {ok, txt} comme le scan de la V1. */
function ajouter(code) {
  const p = trouver(code);
  if (!p) return { ok: false, txt: `${esc(code)} : code inconnu en caisse` };
  if (estFL(p)) return { ok: false, txt: `${esc(joli(p.lib))} : fruit ou légume, il a son affiche` };
  if (E.codes.includes(p.e)) return { ok: false, txt: `${esc(joli(p.lib))} : déjà sur la planche` };
  E.codes.push(p.e);
  return { ok: true, txt: `${esc(joli(p.lib))} · ${p.prix != null ? euros(p.prix) : 'prix à définir'}` };
}

function alertes(l) {
  ctx();
  const w = [];
  const np = l.filter(o => o.prix == null).length;
  if (np) w.push(`${np} produit${np > 1 ? 's' : ''} sans prix : « PRIX À DÉFINIR » sera imprimé.`);
  const bad = l.filter(o => !imprimable(o.e)).length;
  if (bad) w.push(`${bad} code${bad > 1 ? 's' : ''}-barres non imprimable${bad > 1 ? 's' : ''} (code interne ou invalide).`);
  const c = document.createElement('canvas').getContext('2d');
  const longs = l.filter(o => fitName(c, nameOf(o).toUpperCase(), 497, 138).s < 40).length;
  if (longs) w.push(`${longs} nom${longs > 1 ? 's' : ''} trop long${longs > 1 ? 's' : ''} : touche la ligne pour le raccourcir.`);
  return w;
}

async function polices() {
  try { await document.fonts.load('900 40px InterE'); await document.fonts.load('700 20px InterE'); } catch (e) { }
}

/** Dessine une étiquette à l'écran avec exactement les fonctions de l'impression. */
async function apercu(canvas, o) {
  await polices(); ctx();
  const k = 2; canvas.width = 529 * k; canvas.height = 280 * k;
  const x = canvas.getContext('2d'); x.scale(k, k);
  (modelOf(o) === 'top' ? labelTop : labelStd)(x, o);
}

/** La planche A4 de l'écran est dessinée par pagesGondole, la fonction même qui fabrique le PDF (reprise de la V1). */
async function planche(canvas, l) {
  await polices(); ctx();
  const cle = JSON.stringify([E.codes, E.noms, E.force]);
  if (CACHE.cle !== cle) { CACHE = { cle, pages: await pagesGondole(l, '') }; }
  const pg = CACHE.pages[Math.min(E.page, CACHE.pages.length - 1)]; if (!pg || !canvas.isConnected) return;
  canvas.width = 1050; canvas.height = Math.round(1050 * pg.h / pg.w);
  canvas.getContext('2d').drawImage(pg.c, 0, 0, canvas.width, canvas.height);
}

export function ecranEtiquettes(nav, message = '') {
  ctx();
  const l = liste();
  const pages = Math.ceil(l.length / 24);
  const w = alertes(l);
  const ligne = (o, i) => `<div class="ligne ligne--tap" data-action="etiq-modifier" data-i="${i}">
      <div class="ligne__txt"><div class="ligne__titre">${esc(nameOf(o))}</div>
      <div class="ligne__detail">${o.prix != null ? euros(o.prix) : '<span style="color:var(--alerte)">Prix à définir</span>'}${modelOf(o) === 'top' ? ' · Top vente' : ''}${E.force[o.e] ? ' (choisi)' : ''}</div></div>
      ${icone('chevron', 'cb-ico cb-ico--24')}</div>`;
  const histo = E.historique.slice(0, 5).map((h, i) => `<div class="ligne"><div class="ligne__txt"><div class="ligne__titre">${h.n} étiquette${h.n > 1 ? 's' : ''}</div>
      <div class="ligne__detail">${new Date(h.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} à ${new Date(h.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div></div>
      <button class="btn btn--secondaire" data-action="etiq-reprendre" data-i="${i}">Reprendre</button></div>`).join('');
  nav.afficher(`<div class="scr cb">${barreMode('magasin', 'Étiquettes', true)}
  <div class="scr__corps">
    <div class="accueil__haut"><h1 class="titre-1">Étiquettes</h1>${l.length ? `<span class="note">${l.length} · ${pages} planche${pages > 1 ? 's' : ''}</span>` : ''}</div>
    ${message ? `<div class="bandeau bandeau--alerte">${icone('info', 'cb-ico cb-ico--24')}<span>${message}</span></div>` : ''}
    ${E.pdf ? `<div class="carte" style="display:grid;gap:12px;box-shadow:inset 0 0 0 2px var(--corbeille)"><div class="titre-2">PDF prêt</div>
        <div class="note">${esc(E.pdf.nom)} · ${E.pdf.pages} page${E.pdf.pages > 1 ? 's' : ''} A4. Impression à 100 %, sans ajuster à la page.</div>
        <button class="btn btn--principal" data-action="etiq-partager">${icone('imprimer')}Imprimer ou enregistrer</button></div>` : ''}
    ${l.length ? (E.vue === 'etiquette'
      ? `<canvas class="apercu-etiq" data-apercu aria-label="Aperçu de la première étiquette"></canvas>
      <button class="btn btn--secondaire" data-action="etiq-vue" data-v="planche">Voir la planche</button>`
      : `<div class="planche-vue"><canvas class="apercu-etiq apercu-planche" data-planche aria-label="Aperçu de la planche A4, 24 étiquettes"></canvas>
        ${pages > 1 ? `<div class="duo"><button class="btn btn--secondaire" data-action="etiq-page" data-d="-1" ${E.page <= 0 ? 'disabled' : ''}>Planche précédente</button><button class="btn btn--secondaire" data-action="etiq-page" data-d="1" ${E.page >= pages - 1 ? 'disabled' : ''}>Planche suivante</button></div>` : ''}
        <div class="note" data-planche-txt>Planche ${Math.min(E.page + 1, pages)} sur ${pages} · A4, 24 étiquettes</div></div>
      <button class="btn btn--secondaire" data-action="etiq-vue" data-v="etiquette">Voir l'étiquette</button>`) + `
      ${w.map(x => `<div class="bandeau bandeau--alerte">${icone('alerte', 'cb-ico cb-ico--24')}<span>${x}</span></div>`).join('')}
      <div class="accueil__haut"><h2 class="titre-3">Sur la planche</h2><button class="btn btn--discret" data-action="etiq-vider">Tout retirer</button></div>
      ${l.map(ligne).join('')}`
      : `<div class="carte"><div class="titre-2">La planche est vide.</div><div class="note" style="margin-top:8px">Scanne les produits à étiqueter, ou cherche-les par leur nom.</div></div>`}
    <div><label class="fort" for="etiq-q">Ajouter par le nom</label>
      <input class="champ" id="etiq-q" placeholder="ex. pois chiches" autocomplete="off" style="font-size:18px;margin-top:8px"></div>
    <div class="recherche-res" data-res></div>
    ${histo ? `<h2 class="titre-3" style="margin-top:8px">Dernières planches</h2>${histo}` : ''}
  </div>
  <div class="scr__bas">
    ${l.length ? `<button class="btn btn--principal" data-action="etiq-pdf">${icone('imprimer')}Créer le PDF (${l.length})</button>` : ''}
    <button class="btn ${l.length ? 'btn--secondaire' : 'btn--principal'}" data-action="etiq-scanner">${icone('scan', l.length ? 'cb-ico cb-ico--24' : 'cb-ico')}Scanner pour étiqueter</button>
  </div></div>`, 'etiquettes');
  const cv = document.querySelector('[data-apercu]'); if (cv && l[0]) apercu(cv, l[0]);
  const cp = document.querySelector('[data-planche]'); if (cp) planche(cp, l);
  const q = document.getElementById('etiq-q');
  q.oninput = () => {
    const t = q.value.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const res = document.querySelector('[data-res]');
    if (t.length < 2) { res.innerHTML = ''; return; }
    const sel = new Set(E.codes);
    const hits = Object.values(etat.produits).filter(o => !sel.has(o.e) && !estFL(o) && (String(o.lib).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(t) || o.e.includes(t)))
      .sort((a, b) => (b.q || 0) - (a.q || 0)).slice(0, 8);
    res.innerHTML = hits.length ? hits.map(o => `<button class="ligne" data-action="etiq-ajouter" data-e="${esc(o.e)}" style="text-align:left;border:0;font:inherit;width:100%">
        <div class="ligne__txt"><div class="ligne__titre">${esc(joli(o.lib))}</div><div class="ligne__detail">${o.prix != null ? euros(o.prix) : 'sans prix'}</div></div>${icone('nouveau', 'cb-ico cb-ico--24')}</button>`).join('')
      : '<div class="note">Aucun produit trouvé (les fruits et légumes ont leurs affiches).</div>';
  };
}

function feuilleModifier(nav, i) {
  ctx();
  const o = liste()[i]; if (!o) return;
  const m = E.force[o.e] || '';
  const d = document.createElement('div');
  d.className = 'toast-zone cb'; d.style.cssText = 'top:auto;bottom:0;left:0;right:0';
  d.innerHTML = `<div class="feuille-saisie" style="position:relative">
    <div class="titre-3">Nom imprimé</div>
    <input class="champ" data-nom value="${esc(nameOf(o))}" style="text-transform:uppercase;font-size:20px">
    <div class="note">Nom en caisse : ${esc(o.lib)}</div>
    <div class="titre-3">Modèle</div>
    <div class="duo" style="grid-template-columns:1fr 1fr 1fr">${[['', 'Auto'], ['std', 'Standard'], ['top', 'Top vente']].map(([v, t]) => `<button class="btn ${m === v ? 'btn--achat' : 'btn--secondaire'}" data-modele="${v}" style="padding:0 8px;font-size:17px">${t}</button>`).join('')}</div>
    <button class="btn btn--principal" data-ok>Enregistrer</button>
    <div class="duo"><button class="btn btn--danger" data-retirer>Retirer</button><button class="btn btn--secondaire" data-fermer>Fermer</button></div></div>`;
  document.body.appendChild(d);
  let modele = m;
  d.querySelectorAll('[data-modele]').forEach(b => b.onclick = () => { modele = b.dataset.modele; d.querySelectorAll('[data-modele]').forEach(x => x.className = `btn ${x.dataset.modele === modele ? 'btn--achat' : 'btn--secondaire'}`); });
  d.querySelector('[data-fermer]').onclick = () => d.remove();
  d.querySelector('[data-ok]').onclick = async () => {
    const v = d.querySelector('[data-nom]').value.toUpperCase().trim();
    if (!v || v === cleanName(o.lib)) delete E.noms[o.e]; else E.noms[o.e] = v; // même règle que la V1
    if (modele) E.force[o.e] = modele; else delete E.force[o.e];
    E.pdf = null; await sauver(); d.remove(); ecranEtiquettes(nav);
  };
  d.querySelector('[data-retirer]').onclick = async () => {
    const avant = E.codes.slice(); E.codes = E.codes.filter(x => x !== o.e); E.pdf = null;
    await sauver(); d.remove(); ecranEtiquettes(nav);
    nav.toast(`${nameOf(o)} retiré`, async () => { E.codes = avant; await sauver(); ecranEtiquettes(nav); });
  };
}

async function creerPdf(nav, bouton) {
  const l = liste(); if (!l.length) return;
  bouton.disabled = true; bouton.textContent = 'Fabrication du PDF…';
  await polices(); ctx();
  try {
    const pages = await pagesGondole(l, '');
    const blob = await buildPdf(pages);
    const d = new Date(), z = n => String(n).padStart(2, '0');
    const nom = `ETIQUETTES-EPICERIE-${String(d.getFullYear()).slice(2)}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}.pdf`;
    E.pdf = { nom, pages: Math.ceil(l.length / 24), blob };
    E.historique.unshift({ date: d.toISOString(), n: l.length, codes: l.map(o => o.e) });
    E.historique = E.historique.slice(0, 20);
    await sauver();
    ecranEtiquettes(nav);
  } catch (x) { ecranEtiquettes(nav, `Le PDF n'a pas pu être fabriqué : ${esc(x.message)}`); }
}

async function partager(nav) {
  if (!E.pdf) return;
  await livrer(new File([E.pdf.blob], E.pdf.nom, { type: 'application/pdf' }));
}

/** Actions de l'écran ; renvoie true si l'action a été prise en charge. */
export async function actionEtiquettes(a, b, nav) {
  if (a === 'etiquettes') { ecranEtiquettes(nav); return true; }
  if (a === 'etiq-scanner') {
    if (!Object.keys(etat.produits).length) { nav.donnees('Charge d’abord les produits : c’est ce que le scan va lire.'); return true; }
    ouvrirScanner({
      mode: 'magasin', continu: true, titre: 'Scanne les produits à étiqueter',
      onCode: c => { const r = ajouter(c); if (r.ok) { E.pdf = null; sauver(); } return r; },
      onFermer: () => ecranEtiquettes(nav)
    });
    return true;
  }
  if (a === 'etiq-ajouter') { const r = ajouter(b.dataset.e); E.pdf = null; await sauver(); ecranEtiquettes(nav); nav.toast(r.ok ? 'Ajouté à la planche' : r.txt.replace(/<[^>]+>/g, '')); return true; }
  if (a === 'etiq-vue') { E.vue = b.dataset.v; ecranEtiquettes(nav); return true; }
  if (a === 'etiq-page') { E.page = Math.max(0, E.page + +b.dataset.d); ecranEtiquettes(nav); return true; }
  if (a === 'etiq-modifier') { feuilleModifier(nav, +b.dataset.i); return true; }
  if (a === 'etiq-vider') {
    const avant = E.codes.slice(); E.codes = []; E.pdf = null; await sauver(); ecranEtiquettes(nav);
    nav.toast('Planche vidée', async () => { E.codes = avant; await sauver(); ecranEtiquettes(nav); });
    return true;
  }
  if (a === 'etiq-pdf') { await creerPdf(nav, b); return true; }
  if (a === 'etiq-partager') { await partager(nav); return true; }
  if (a === 'etiq-reprendre') {
    const h = E.historique[+b.dataset.i]; if (!h) return true;
    const avant = E.codes.slice();
    E.codes = h.codes.filter(e => etat.produits[e]); E.pdf = null; await sauver(); ecranEtiquettes(nav);
    nav.toast(`${E.codes.length} étiquettes reprises`, async () => { E.codes = avant; await sauver(); ecranEtiquettes(nav); });
    return true;
  }
  return false;
}
