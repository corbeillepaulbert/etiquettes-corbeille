// Mode caisse (lot 5) : l'appareil posé à la caisse ne montre qu'un écran. Le caissier scanne : produit connu → nom et prix en grand ;
// produit inconnu → fiche OpenFoodFacts et « Signaler au responsable » signé avec son code PIN. Sortir du mode caisse demande le PIN du responsable.
// Les PIN restent sur cet appareil, en empreinte SHA-256 salée (jamais en clair, jamais dans le Drive).
import { lire, ecrire, trouver } from './donnees.js';
import { icone } from './icones.js';
import { joli } from './ecrans.js';
import { euros } from './calcul.js';
import { ouvrirScanner } from './moteur/scan.js';
import { noterInconnu, chercherOFF } from './inconnus.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let C = { actif: false, sel: '', resp: '', caissiers: [] };
let dernier = null; // { code, produit, off }
export async function chargerCaisse() { C = { ...C, ...(await lire('caisse', {})) }; if (!C.sel) { C.sel = crypto.getRandomValues(new Uint32Array(4)).join('-'); await sauver(); } }
const sauver = () => ecrire('caisse', C);
export const modeCaisse = () => !!C.actif;
async function empreinte(pin) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(C.sel + ':' + pin)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
const pinValide = p => /^\d{4,6}$/.test(p);

/** Bloc des Réglages (responsable). */
export function blocCaisse() {
  return `<div class="carte" style="display:grid;gap:12px">
    <div class="titre-3">Mode caisse</div>
    <div class="note">Pour l'appareil posé à la caisse : le caissier scanne un produit, voit son prix, et signale les produits inconnus avec son code PIN.</div>
    ${C.caissiers.length ? C.caissiers.map((x, i) => `<div class="ligne" style="box-shadow:none;padding:0;min-height:56px"><div class="ligne__txt"><div class="ligne__titre">${esc(x.nom)}</div><div class="ligne__detail">PIN enregistré</div></div><button class="btn btn--discret" data-action="caisse-retirer" data-i="${i}">Retirer</button></div>`).join('') : '<div class="note">Aucun caissier pour l\'instant.</div>'}
    <div class="duo"><input class="champ" id="cs-nom" placeholder="Prénom" style="font-size:18px" maxlength="20"><input class="champ" id="cs-pin" placeholder="PIN (4 chiffres)" inputmode="numeric" maxlength="6" style="font-size:18px"></div>
    <button class="btn btn--secondaire" data-action="caisse-ajouter">Ajouter ce caissier</button>
    <label class="fort" for="cs-resp">PIN du responsable (pour sortir du mode caisse)</label>
    <input class="champ" id="cs-resp" type="password" inputmode="numeric" maxlength="6" placeholder="${C.resp ? 'déjà enregistré : écris-en un autre pour le changer' : '4 à 6 chiffres'}" style="font-size:18px">
    <button class="btn btn--principal" data-action="caisse-activer">Passer cet appareil en mode caisse</button><div data-msg-caisse></div>
  </div>`;
}

export function ecranCaisse(message = '', type = 'info') {
  const d = dernier;
  let corps = `<div class="carte"><div class="titre-2">Scanne un produit.</div><div class="note" style="margin-top:8px">Tu vois son prix en caisse. S'il n'est pas connu, signale-le au responsable.</div></div>`;
  if (d && d.produit) corps = `<div class="carte caisse-res"><div class="caisse-nom">${esc(joli(d.produit.lib))}</div><div class="caisse-prix">${d.produit.prix != null ? euros(d.produit.prix) : 'Prix à définir'}</div><div class="note">${esc(d.code)}</div></div>`;
  else if (d) corps = `<div class="carte caisse-res" style="box-shadow:inset 0 0 0 3px var(--alerte-vif)"><div class="titre-2">Pas en caisse</div><div class="note">${esc(d.code)}</div>
      ${d.off === undefined ? '<div class="note">Recherche du produit…</div>' : d.off && d.off.trouve ? `<div class="row" style="display:flex;gap:12px;align-items:center">${d.off.image ? `<img src="${esc(d.off.image)}" alt="" class="inc-img">` : ''}<div><div class="titre-3">${esc(d.off.nom)}</div><div class="note">${esc([d.off.marque, d.off.qte].filter(Boolean).join(' · '))}</div></div></div>` : '<div class="note">Produit introuvable sur internet.</div>'}
      <div class="note">Demande le prix au responsable ou lis l'étiquette du rayon.</div>
      <label class="fort" for="cs-signe">Ton code PIN</label><input class="champ" id="cs-signe" type="password" inputmode="numeric" maxlength="6" style="font:700 28px/1 var(--font-titre);letter-spacing:.3em;text-align:center">
      <button class="btn btn--principal" data-action="caisse-signaler">Signaler au responsable</button></div>`;
  return `<div class="scr cb"><div class="mode mode--magasin">${icone('magasin', 'cb-ico cb-ico--24')}Caisse<span class="mode__qui"></span></div>
  <div class="scr__corps">
    ${message ? `<div class="bandeau ${type === 'ok' ? '' : 'bandeau--alerte'}" ${type === 'ok' ? 'style="background:var(--succes-fond);color:var(--succes)"' : ''}>${icone(type === 'ok' ? 'check' : 'info', 'cb-ico cb-ico--24')}<span>${esc(message)}</span></div>` : ''}
    ${corps}
    <details class="note" style="margin-top:24px"><summary style="min-height:48px;display:flex;align-items:center">Quitter le mode caisse (responsable)</summary>
      <input class="champ" id="cs-sortie" type="password" inputmode="numeric" maxlength="6" placeholder="PIN du responsable" style="font-size:18px;margin:8px 0">
      <button class="btn btn--secondaire" data-action="caisse-quitter">Quitter le mode caisse</button></details>
  </div>
  <div class="scr__bas"><button class="btn btn--principal" data-action="caisse-scanner">${icone('scan')}Scanner un produit</button></div></div>`;
}

const INTERDIT = /^(?!caisse-).*/; // en mode caisse, seules les actions caisse-* passent
export const interditEnCaisse = a => modeCaisse() && INTERDIT.test(a);

export async function actionCaisse(a, b, nav) {
  if (!a.startsWith('caisse-')) return false;
  const app = document.getElementById('app'), val = id => (app.querySelector('#' + id)?.value || '').trim();
  if (a === 'caisse-ajouter') {
    const nom = val('cs-nom'), pin = val('cs-pin'), z = app.querySelector('[data-msg-caisse]');
    if (!nom || !pinValide(pin)) { z.innerHTML = '<div class="bandeau bandeau--erreur"><span>Écris un prénom et un PIN de 4 à 6 chiffres.</span></div>'; return true; }
    const h = await empreinte(pin);
    if (C.caissiers.some(x => x.h === h) || C.resp === h) { z.innerHTML = '<div class="bandeau bandeau--erreur"><span>Ce PIN est déjà pris : choisis-en un autre.</span></div>'; return true; }
    C.caissiers.push({ nom, h }); await sauver(); nav.reglages(); nav.toast(`${nom} ajouté`, async () => { C.caissiers = C.caissiers.filter(x => x.h !== h); await sauver(); nav.reglages(); });
    return true;
  }
  if (a === 'caisse-retirer') { const i = +b.dataset.i, x = C.caissiers[i]; C.caissiers.splice(i, 1); await sauver(); nav.reglages(); nav.toast(`${x.nom} retiré`, async () => { C.caissiers.splice(i, 0, x); await sauver(); nav.reglages(); }); return true; }
  if (a === 'caisse-activer') {
    const p = val('cs-resp'), z = app.querySelector('[data-msg-caisse]');
    if (p) { if (!pinValide(p)) { z.innerHTML = '<div class="bandeau bandeau--erreur"><span>PIN du responsable : 4 à 6 chiffres.</span></div>'; return true; } C.resp = await empreinte(p); }
    if (!C.resp) { z.innerHTML = '<div class="bandeau bandeau--erreur"><span>Choisis d\'abord le PIN du responsable : sans lui, impossible de sortir du mode caisse.</span></div>'; return true; }
    if (!C.caissiers.length) { z.innerHTML = '<div class="bandeau bandeau--erreur"><span>Ajoute au moins un caissier.</span></div>'; return true; }
    C.actif = true; dernier = null; await sauver(); nav.afficher(ecranCaisse(), 'caisse'); return true;
  }
  if (!modeCaisse()) return true;
  if (a === 'caisse-scanner') {
    // scan simple : le scanner se ferme après un code (onCode), ou sans code (onFermer)
    const montrer = async c => {
      const p = trouver(c); dernier = { code: c, produit: p, off: p ? null : undefined };
      nav.afficher(ecranCaisse(), 'caisse');
      if (!p) { try { dernier.off = navigator.onLine ? await chercherOFF(c) : null; } catch (x) { dernier.off = null; } if (dernier && dernier.code === c) { const v = document.getElementById('cs-signe')?.value || ''; nav.afficher(ecranCaisse(), 'caisse'); const z = document.getElementById('cs-signe'); if (z) z.value = v; } }
    };
    ouvrirScanner({ mode: 'magasin', titre: 'Scanne le produit', onCode: c => { montrer(c); return { ok: true, txt: c }; }, onFermer: () => nav.afficher(ecranCaisse(), 'caisse') });
    return true;
  }
  if (a === 'caisse-signaler') {
    const pin = val('cs-signe'), h = pinValide(pin) ? await empreinte(pin) : '';
    const qui = C.caissiers.find(x => x.h === h);
    if (!qui) { nav.afficher(ecranCaisse('Code PIN inconnu : réessaie.', 'alerte'), 'caisse'); return true; }
    await noterInconnu(dernier.code, 'caisse', qui.nom);
    const code = dernier.code; dernier = null; nav.afficher(ecranCaisse(`Merci ${qui.nom} : le responsable a reçu le code ${code}.`, 'ok'), 'caisse');
    if (nav.sync) nav.sync();
    return true;
  }
  if (a === 'caisse-quitter') {
    const p = val('cs-sortie');
    if (!pinValide(p) || await empreinte(p) !== C.resp) { nav.afficher(ecranCaisse('PIN du responsable incorrect.', 'alerte'), 'caisse'); return true; }
    C.actif = false; dernier = null; await sauver(); document.querySelector('[data-action="accueil"]') ? null : null; nav.accueil(); return true;
  }
  return true;
}
