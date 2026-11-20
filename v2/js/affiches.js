// Écran Affiches fruits et légumes (lot 2b). Le dessin et le PDF viennent de moteur/affiches.js (repris de la V1, identique au pixel près).
import { etat, lire, ecrire, trouver } from './donnees.js';
import { barreMode, joli } from './ecrans.js';
import { icone } from './icones.js';
import { euros } from './calcul.js';
import { configurer, flOf, pagesFL, enSaison, ILLUSTRATIONS, ORIGINES } from './moteur/affiches.js';
import { buildPdf } from './moteur/etiquettes.js';
import { ouvrirScanner } from './moteur/scan.js';
import { noterInconnu } from './inconnus.js';
import { telecharger } from './livrer.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const estFL = o => /FRUIT|LEG/i.test(o.dep || ''); // même règle que la V1
const FORMATS = [['land', 'A4 paysage', '1 produit par page'], ['list', 'A4 liste', '7 produits par page'], ['a6', 'A6 × 4', 'à piquer dans les cagettes'], ['caisse', 'Fiche de caisse', 'codes à flasher, 12 par page']];
const UNITES = ['le kg', 'la pièce', 'la botte', 'la barquette', 'le sac', 'les 3'];
const F = { codes: [], fmt: 'land', reg: {}, pdf: null, page: 0 };
let CACHE = { cle: '', pages: null };

function lireV1(cle, defaut) { try { const v = localStorage.getItem(cle); return v ? JSON.parse(v) : defaut; } catch (e) { return defaut; } }
/** Réglages par produit : ceux de la V1 (cpb_fl, lus sans jamais y écrire), puis ceux faits dans la V2 par-dessus. */
function ctx() {
  const v1 = lireV1('cpb_fl', {}), s = {};
  for (const e of new Set([...Object.keys(v1), ...Object.keys(F.reg)])) s[e] = { ...(v1[e] || {}), ...(F.reg[e] || {}) };
  configurer({ SETF: s, HIST: lireV1('cpb_hist', {}) });
}
export async function chargerAffiches() {
  F.codes = await lire('flSelection', []); F.fmt = await lire('flFormat', 'land'); F.reg = await lire('flReglages', {});
}
async function sauver() { await ecrire('flSelection', F.codes); await ecrire('flFormat', F.fmt); await ecrire('flReglages', F.reg); }
const liste = () => F.codes.map(e => etat.produits[e]).filter(Boolean);

function ajouter(code) {
  const p = trouver(code);
  if (!p) { noterInconnu(code, 'affiches'); return { ok: false, txt: `${esc(code)} : code inconnu en caisse` }; }
  if (!estFL(p)) return { ok: false, txt: `${esc(joli(p.lib))} : pas un fruit ou légume (va dans Étiquettes)` };
  if (F.codes.includes(p.e)) return { ok: false, txt: `${esc(joli(p.lib))} : déjà dans la liste` };
  F.codes.push(p.e); F.pdf = null;
  return { ok: true, txt: `${esc(joli(p.lib))} · ${p.prix != null ? euros(p.prix) : 'prix à définir'}` };
}

function alertes(l) {
  ctx(); const w = [];
  const np = l.filter(o => o.prix == null).length; if (np) w.push(`${np} produit${np > 1 ? 's' : ''} sans prix dans StorePOS : « PRIX À DÉFINIR » sera imprimé.`);
  const no = l.filter(o => !flOf(o).ori).length; if (no) w.push(`${no} produit${no > 1 ? 's' : ''} sans origine : elle est obligatoire en fruits et légumes. Touche la ligne pour la choisir.`);
  const ni = l.filter(o => !flOf(o).ill).length; if (ni) w.push(`${ni} produit${ni > 1 ? 's' : ''} sans illustration.`);
  return w;
}

async function polices() { try { await document.fonts.load('900 40px InterE'); await document.fonts.load('700 20px InterE'); } catch (e) { } }
/** L'aperçu est la page même du PDF, dessinée par pagesFL. */
async function apercu(canvas, l) {
  await polices(); ctx();
  const cle = JSON.stringify([F.codes, F.fmt, F.reg, l.map(o => o.prix)]);
  if (CACHE.cle !== cle) CACHE = { cle, pages: await pagesFL(l, F.fmt) };
  const pg = CACHE.pages[Math.min(F.page, CACHE.pages.length - 1)]; if (!pg || !canvas.isConnected) return;
  const W = 1050; canvas.width = W; canvas.height = Math.round(W * pg.h / pg.w);
  canvas.getContext('2d').drawImage(pg.c, 0, 0, canvas.width, canvas.height);
  const t = document.querySelector('[data-af-txt]'); if (t) t.textContent = `Page ${Math.min(F.page + 1, CACHE.pages.length)} sur ${CACHE.pages.length}`;
  const n = document.querySelectorAll('[data-action="af-page"]'); n.forEach(b => { b.disabled = (+b.dataset.d < 0 && F.page <= 0) || (+b.dataset.d > 0 && F.page >= CACHE.pages.length - 1); });
}

export function ecranAffiches(nav, message = '') {
  ctx();
  const l = liste(), w = alertes(l);
  const ligne = (o, i) => { const f = flOf(o); return `<div class="ligne ligne--tap" data-action="af-modifier" data-i="${i}">
      <div class="ligne__txt"><div class="ligne__titre">${esc(f.nom)}</div>
      <div class="ligne__detail">${o.prix != null ? `${euros(o.prix)} ${esc(f.unit)}` : '<span style="color:var(--alerte)">Prix à définir</span>'} · ${f.ori ? esc(f.ori) : '<span style="color:var(--alerte)">origine ?</span>'}</div></div>
      ${icone('chevron', 'cb-ico cb-ico--24')}</div>`; };
  nav.afficher(`<div class="scr cb">${barreMode('magasin', 'Affiches', true)}
  <div class="scr__corps">
    <div class="accueil__haut"><h1 class="titre-1">Affiches fruits et légumes</h1></div>
    ${message ? `<div class="bandeau bandeau--alerte">${icone('info', 'cb-ico cb-ico--24')}<span>${message}</span></div>` : ''}
    <div class="af-formats">${FORMATS.map(([k, t, d]) => `<button class="af-format${F.fmt === k ? ' af-format--actif' : ''}" data-action="af-format" data-f="${k}"><b>${t}</b><span>${d}</span></button>`).join('')}</div>
    ${F.pdf ? `<div class="carte" style="display:grid;gap:12px;box-shadow:inset 0 0 0 2px var(--corbeille)"><div class="titre-2">PDF prêt</div>
        <div class="note">${esc(F.pdf.nom)} · ${F.pdf.pages} page${F.pdf.pages > 1 ? 's' : ''}. Impression à 100 %, sans ajuster à la page.</div>
        <div class="btns-pdf">${typeof navigator.share === 'function' ? `<button class="btn btn--principal" data-action="af-partager">${icone('imprimer')}Partager</button>` : ''}
        <button class="btn ${typeof navigator.share === 'function' ? 'btn--secondaire' : 'btn--principal'}" data-action="af-enregistrer">${icone('import')}Enregistrer le PDF</button></div></div>` : ''}
    ${l.length ? `<div class="planche-vue"><canvas class="apercu-etiq apercu-planche" data-af-apercu aria-label="Aperçu de l'affiche"></canvas>
        <div class="duo"><button class="btn btn--secondaire" data-action="af-page" data-d="-1">Précédente</button><button class="btn btn--secondaire" data-action="af-page" data-d="1">Suivante</button></div>
        <div class="note" data-af-txt>Préparation de l'aperçu…</div></div>
      ${w.map(x => `<div class="bandeau bandeau--alerte">${icone('alerte', 'cb-ico cb-ico--24')}<span>${x}</span></div>`).join('')}
      <div class="accueil__haut"><h2 class="titre-3">Produits (${l.length})</h2><button class="btn btn--discret" data-action="af-vider">Tout retirer</button></div>
      ${l.map(ligne).join('')}`
      : `<div class="carte"><div class="titre-2">Aucun produit.</div><div class="note" style="margin-top:8px">Scanne les fruits et légumes, cherche-les par leur nom, ou prends tous ceux de saison.</div></div>`}
    <button class="btn btn--secondaire" data-action="af-saison">Ajouter les fruits et légumes de saison</button>
    <div><label class="fort" for="af-q">Ajouter par le nom</label>
      <input class="champ" id="af-q" placeholder="ex. tomate" autocomplete="off" style="font-size:18px;margin-top:8px"></div>
    <div class="recherche-res" data-af-res></div>
  </div>
  <div class="scr__bas">
    ${l.length ? `<button class="btn btn--principal" data-action="af-pdf">${icone('imprimer')}Créer le PDF (${l.length})</button>` : ''}
    <button class="btn ${l.length ? 'btn--secondaire' : 'btn--principal'}" data-action="af-scanner">${icone('scan', l.length ? 'cb-ico cb-ico--24' : 'cb-ico')}Scanner pour ajouter</button>
  </div></div>`, 'affiches');
  const cv = document.querySelector('[data-af-apercu]'); if (cv) apercu(cv, l);
  const q = document.getElementById('af-q');
  q.oninput = () => {
    const t = q.value.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), res = document.querySelector('[data-af-res]');
    if (t.length < 2) { res.innerHTML = ''; return; }
    const sel = new Set(F.codes);
    const hits = Object.values(etat.produits).filter(o => estFL(o) && !sel.has(o.e) && String(o.lib).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(t)).sort((a, b) => String(a.lib).localeCompare(String(b.lib), 'fr')).slice(0, 10);
    res.innerHTML = hits.length ? hits.map(o => `<button class="ligne" data-action="af-ajouter" data-e="${esc(o.e)}" style="text-align:left;border:0;font:inherit;width:100%">
        <div class="ligne__txt"><div class="ligne__titre">${esc(joli(o.lib))}</div><div class="ligne__detail">${o.prix != null ? euros(o.prix) : 'sans prix'}</div></div>${icone('nouveau', 'cb-ico cb-ico--24')}</button>`).join('')
      : '<div class="note">Aucun fruit ou légume trouvé.</div>';
  };
}

function feuilleModifier(nav, i) {
  ctx(); const o = liste()[i]; if (!o) return; const f = flOf(o);
  const d = document.createElement('div'); d.className = 'toast-zone cb'; d.style.cssText = 'top:auto;bottom:0;left:0;right:0';
  const opt = (L, v) => L.map(([k, t]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(t)}</option>`).join('');
  d.innerHTML = `<div class="feuille-saisie" style="position:relative;max-height:88vh;overflow:auto">
    <div class="titre-3">${esc(joli(o.lib))}</div><div class="note">${o.prix != null ? euros(o.prix) : 'Prix à définir'} (prix StorePOS)</div>
    <label class="fort">Nom sur l'affiche</label><input class="champ" data-k="nom" value="${esc(f.nom)}" style="font-size:20px"><div class="note">« — » sépare le sous-titre (ex. Oignon jaune — sac 5 kg)</div>
    <label class="fort">Origine</label><select class="champ" data-k="ori" style="font-size:18px"><option value="">À préciser</option>${opt(ORIGINES(), f.ori)}</select>
    <label class="fort">Illustration</label><select class="champ" data-k="ill" style="font-size:18px"><option value="">Sans illustration</option>${opt(ILLUSTRATIONS(), f.ill)}</select>
    <label class="fort">Vendu</label><select class="champ" data-k="unit" style="font-size:18px">${opt(UNITES.map(u => [u, u]), f.unit)}</select>
    <label class="fort">Catégorie, calibre, variété</label><input class="champ" data-k="cat" value="${esc(f.cat)}" style="font-size:18px">
    <button class="btn btn--principal" data-ok>Enregistrer</button>
    <div class="duo"><button class="btn btn--danger" data-retirer>Retirer</button><button class="btn btn--secondaire" data-fermer>Fermer</button></div></div>`;
  document.body.appendChild(d);
  d.querySelector('[data-fermer]').onclick = () => d.remove();
  d.querySelector('[data-ok]').onclick = async () => {
    const avant = F.reg[o.e] ? { ...F.reg[o.e] } : null, r = { ...(F.reg[o.e] || {}) };
    d.querySelectorAll('[data-k]').forEach(x => { r[x.dataset.k] = x.value.trim(); });
    F.reg[o.e] = r; F.pdf = null; await sauver(); d.remove(); ecranAffiches(nav);
    nav.toast('Affiche modifiée', async () => { if (avant) F.reg[o.e] = avant; else delete F.reg[o.e]; F.pdf = null; await sauver(); ecranAffiches(nav); });
  };
  d.querySelector('[data-retirer]').onclick = async () => {
    const avant = F.codes.slice(); F.codes = F.codes.filter(x => x !== o.e); F.pdf = null; await sauver(); d.remove(); ecranAffiches(nav);
    nav.toast(`${f.nom} retiré`, async () => { F.codes = avant; await sauver(); ecranAffiches(nav); });
  };
}

async function creerPdf(nav, bouton) {
  const l = liste(); if (!l.length) return;
  bouton.disabled = true; bouton.textContent = 'Fabrication du PDF…';
  await polices(); ctx();
  try {
    const pages = await pagesFL(l, F.fmt), blob = await buildPdf(pages);
    const d = new Date(), z = n => String(n).padStart(2, '0'), st = `${String(d.getFullYear()).slice(2)}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}`;
    const nom = F.fmt === 'caisse' ? `FICHE-CAISSE-FL-${st}.pdf` : `AFFICHES-FL-${F.fmt === 'land' ? 'A4-PAYSAGE' : F.fmt === 'list' ? 'A4-LISTE' : 'A6'}-${st}.pdf`; // mêmes noms que la V1
    F.pdf = { nom, pages: pages.length, blob }; CACHE = { cle: '', pages: null };
    ecranAffiches(nav);
  } catch (x) { ecranAffiches(nav, `Le PDF n'a pas pu être fabriqué : ${esc(x.message)}`); }
}
const fichierPdf = () => new File([F.pdf.blob], F.pdf.nom, { type: 'application/pdf' });

export async function actionAffiches(a, b, nav) {
  if (a !== 'affiches' && !a.startsWith('af-')) return false;
  if (a === 'affiches') { ecranAffiches(nav); return true; }
  if (a === 'af-format') { F.fmt = b.dataset.f; F.page = 0; F.pdf = null; await sauver(); ecranAffiches(nav); return true; }
  if (a === 'af-page') { F.page = Math.max(0, F.page + +b.dataset.d); const cv = document.querySelector('[data-af-apercu]'); if (cv) apercu(cv, liste()); return true; }
  if (a === 'af-ajouter') { const r = ajouter(b.dataset.e); await sauver(); ecranAffiches(nav); nav.toast(r.ok ? 'Ajouté' : r.txt.replace(/<[^>]+>/g, '')); return true; }
  if (a === 'af-modifier') { feuilleModifier(nav, +b.dataset.i); return true; }
  if (a === 'af-saison') {
    ctx(); const avant = F.codes.slice(), fmtAvant = F.fmt;
    const l = Object.values(etat.produits).filter(o => estFL(o) && enSaison(o));
    F.codes = [...new Set([...F.codes, ...l.map(o => o.e)])]; F.pdf = null; await sauver(); ecranAffiches(nav);
    nav.toast(`${F.codes.length - avant.length} produit(s) de saison ajouté(s)`, async () => { F.codes = avant; F.fmt = fmtAvant; await sauver(); ecranAffiches(nav); });
    return true;
  }
  if (a === 'af-vider') {
    const avant = F.codes.slice(); F.codes = []; F.pdf = null; await sauver(); ecranAffiches(nav);
    nav.toast('Liste vidée', async () => { F.codes = avant; await sauver(); ecranAffiches(nav); }); return true;
  }
  if (a === 'af-scanner') {
    if (!Object.keys(etat.produits).length) { nav.donnees('Charge d’abord les produits : c’est ce que le scan va lire.'); return true; }
    ouvrirScanner({ mode: 'magasin', continu: true, titre: 'Scanne les fruits et légumes', onCode: c => { const r = ajouter(c); if (r.ok) sauver(); return r; }, onFermer: () => ecranAffiches(nav) });
    return true;
  }
  if (a === 'af-pdf') { await creerPdf(nav, b); return true; }
  if (a === 'af-enregistrer') { if (F.pdf) telecharger(fichierPdf()); return true; }
  if (a === 'af-partager') {
    if (!F.pdf) return true;
    try { const f = fichierPdf(); if (navigator.canShare && !navigator.canShare({ files: [f] })) throw new Error('partage non pris en charge'); await navigator.share({ files: [f], title: F.pdf.nom }); }
    catch (x) { if (x && x.name !== 'AbortError') nav.toast('Le partage n\'a pas marché : touche « Enregistrer le PDF ».'); }
    return true;
  }
  return false;
}
