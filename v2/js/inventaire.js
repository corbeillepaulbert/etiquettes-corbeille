// Lot 7 : inventaire connecté, côté gérant (préparer, ouvrir, code du jour, suivi) et entrée des inventoristes.
// Le gérant envoie au Drive les zones et la liste des produits à compter (code-barres et nom, jamais de prix).
import { etat, lire, ecrire } from './donnees.js';
import { barreMode, joli } from './ecrans.js';
import { icone } from './icones.js';
import { appelInv, estAdmin, lienInventaire, entrerInventaire } from './drive.js';
import { chargerComptage, synchroniser, inventaireCourant, toutesLignes, zones, demarrer, arreter, enAttente, ecranZones } from './comptage.js';
import { ZONES_DEFAUT, aCompter, avancement, totaux, lignesActives } from './inv-calcul.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let PREP = null;           // zones en préparation (avant d'ouvrir, ou en modification)
let CODE = null;           // { code, exp } : affiché chez le gérant seulement
const slug = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16) || 'zone';
const nomParDefaut = () => `Grand inventaire ${new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;

// ---------- préparation ----------
function editeurZones() {
  const Z = PREP.zones, meres = Z.filter(z => !z.parent);
  return meres.map(m => `<div class="carte" style="display:grid;gap:8px">
    <div class="accueil__haut"><div class="titre-3">${esc(m.nom)}</div><button class="btn btn--discret" data-action="inv-z-retirer" data-z="${esc(m.id)}" aria-label="Retirer la zone ${esc(m.nom)}">${icone('x', 'cb-ico cb-ico--24')}</button></div>
    ${Z.filter(z => z.parent === m.id).map(z => `<div class="ligne" style="box-shadow:none;padding:0"><div class="ligne__txt"><div class="ligne__titre">${esc(z.nom)}</div></div><button class="btn btn--discret" data-action="inv-z-retirer" data-z="${esc(z.id)}" aria-label="Retirer ${esc(z.nom)}">${icone('x', 'cb-ico cb-ico--24')}</button></div>`).join('')}
    <div class="duo" style="grid-template-columns:1fr auto"><input class="champ" data-nouvelle="${esc(m.id)}" placeholder="Nouvelle sous-zone" aria-label="Nouvelle sous-zone dans ${esc(m.nom)}" style="font-size:18px"><button class="btn btn--secondaire" data-action="inv-z-ajouter" data-parent="${esc(m.id)}">Ajouter</button></div></div>`).join('')
    + `<div class="duo" style="grid-template-columns:1fr auto"><input class="champ" data-nouvelle="" placeholder="Nouvelle zone (ex. Vitrine)" aria-label="Nouvelle zone" style="font-size:18px"><button class="btn btn--secondaire" data-action="inv-z-ajouter" data-parent="">Ajouter</button></div>`;
}
function ecranPreparer(nav, message = '') {
  const ouvert = !!inventaireCourant() && !inventaireCourant().ferme;
  const n = Object.values(etat.produits).filter(aCompter).length;
  nav.afficher(`<div class="scr cb" data-ecran="inv-preparer">${barreMode('inventaire', '', true)}
  <div class="scr__corps">
    <h1 class="titre-1">${ouvert ? 'Modifier les zones' : 'Préparer l\'inventaire'}</h1>
    ${message ? `<div class="bandeau bandeau--alerte">${icone('info', 'cb-ico cb-ico--24')}<span>${esc(message)}</span></div>` : ''}
    ${ouvert ? '' : `<label class="fort" for="inv-nom">Nom</label><input class="champ" id="inv-nom" value="${esc(PREP.nom)}" style="font-size:18px">`}
    <div class="note">On compte toujours dans une sous-zone. Tu pourras en ajouter pendant l'inventaire.</div>
    ${editeurZones()}
    ${ouvert ? '' : `<div class="note">${n.toLocaleString('fr-FR')} produits à compter : sans fruits et légumes, pain ni produits pesés. Les inventoristes reçoivent leurs noms, jamais leurs prix.</div>`}
  </div>
  <div class="scr__bas"><button class="btn btn--principal btn--inventaire" data-action="${ouvert ? 'inv-z-enregistrer' : 'inv-ouvrir'}">${ouvert ? 'Enregistrer les zones' : 'Ouvrir l\'inventaire'}</button>
  <button class="btn btn--discret" data-action="${ouvert ? 'inv-gerant' : 'accueil'}">Retour</button></div></div>`, 'inv-preparer');
}

// ---------- suivi ----------
function ecranGerant(nav, message = '') {
  const inv = inventaireCourant();
  if (!inv || inv.ferme) { PREP = PREP || { nom: nomParDefaut(), zones: ZONES_DEFAUT.map(z => ({ ...z })) }; return ecranPreparer(nav, message || (inv && inv.ferme ? 'Le dernier inventaire est fermé. Tu peux en préparer un nouveau.' : '')); }
  const L = toutesLignes(), Z = zones(), A = avancement(L, Z), T = totaux(L), sous = Z.filter(z => z.parent);
  const finies = sous.filter(z => A[z.id] && A[z.id].finie).length, comptes = Object.keys(T).length;
  const attendus = Object.values(etat.produits).filter(o => aCompter(o)).length;
  const qui = new Set(lignesActives(L).map(l => l.qui));
  const zoneL = z => { const a = A[z.id]; const t = a.finie ? `Finie · ${esc(a.finie)}` : a.produits.size ? `${[...a.qui].map(esc).join(', ')} · ${a.produits.size} produit${a.produits.size > 1 ? 's' : ''}` : 'À faire';
    return `<div class="info"><span>${esc(z.nom)}</span><b style="font:600 18px/24px var(--font-texte);text-align:right;color:${a.finie ? 'var(--succes)' : a.produits.size ? 'var(--inventaire)' : 'var(--encre-2)'}">${t}</b></div>`; };
  const code = CODE && CODE.exp > Date.now() ? CODE : null;
  nav.afficher(`<div class="scr cb" data-ecran="inv-gerant">${barreMode('inventaire', 'Suivi', true)}
  <div class="scr__corps">
    <h1 class="titre-1">${esc(inv.nom)}</h1>
    ${message ? `<div class="bandeau bandeau--alerte">${icone('info', 'cb-ico cb-ico--24')}<span>${esc(message)}</span></div>` : ''}
    <div class="carte" style="display:grid;gap:10px;justify-items:center">
      <div class="fort">Code du jour</div>
      ${code ? `<div class="inv-code">${code.code.slice(0, 3)} ${code.code.slice(3)}</div><div class="note">Valable jusqu'à ${new Date(code.exp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} pour entrer. Les sessions durent jusqu'à minuit.</div>
        <button class="btn btn--secondaire" data-action="inv-code">Nouveau code</button>` : `<div class="note">Les inventoristes tapent ce code et leur prénom.</div><button class="btn btn--principal btn--inventaire" data-action="inv-code">Afficher le code du jour</button>`}
    </div>
    <button class="btn btn--secondaire" data-action="inv-lien">Partager le lien d'inventaire</button><div data-msg-lien></div>
    <div class="carte" style="display:grid;gap:8px">
      <div style="font:800 32px/1 var(--font-titre);font-variant-numeric:tabular-nums">${comptes.toLocaleString('fr-FR')} <span style="font:600 20px var(--font-texte);color:var(--encre-2)">produit${comptes > 1 ? 's' : ''} compté${comptes > 1 ? 's' : ''} sur ${attendus.toLocaleString('fr-FR')}</span></div>
      <div class="note">${finies} sous-zone${finies > 1 ? 's' : ''} finie${finies > 1 ? 's' : ''} sur ${sous.length} · ${qui.size} personne${qui.size > 1 ? 's' : ''}${enAttente() ? ` · ${enAttente()} de mes comptages en attente d'envoi` : ''}</div>
    </div>
    ${Z.filter(z => !z.parent).map(m => `<div class="carte" style="display:grid;gap:4px"><div class="titre-3">${esc(m.nom)}</div>${Z.filter(z => z.parent === m.id).map(zoneL).join('')}</div>`).join('')}
    <div class="note">Mis à jour toutes les 10 secondes environ. Écarts, oublis, rapport d'étape et clôture arrivent avec la suite du lot 7.</div>
    <button class="btn btn--secondaire" data-action="inv-preparer">Modifier les zones</button>
    <button class="btn btn--discret" data-action="inv-fermer">Fermer l'inventaire</button>
  </div>
  <div class="scr__bas"><button class="btn btn--principal btn--inventaire" data-action="inv-zones">${icone('scan')}Compter moi aussi</button>
  <button class="btn btn--discret" data-action="accueil">Retour à l'accueil</button></div></div>`, 'inv-gerant');
}

// ---------- entrée d'un inventoriste ----------
export function ecranEntrer(nav, { erreur = '', prenom = '' } = {}) {
  nav.afficher(`<div class="scr cb" data-ecran="inv-entrer">${barreMode('inventaire', '', false)}
  <div class="scr__corps">
    <h1 class="titre-1">Grand inventaire</h1>
    ${erreur ? `<div class="bandeau bandeau--erreur">${icone('alerte', 'cb-ico cb-ico--24')}<span>${esc(erreur)}</span></div>` : ''}
    <div class="note">Tape ton prénom et le code affiché sur l'écran du gérant.</div>
    <label class="fort" for="inv-prenom">Ton prénom</label><input class="champ" id="inv-prenom" value="${esc(prenom)}" autocomplete="given-name" style="font-size:20px">
    <label class="fort" for="inv-code">Code du jour</label><input class="champ" id="inv-code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" style="font:700 32px var(--font-titre);letter-spacing:4px">
    <div class="note">Tu verras seulement les noms des produits et les comptages. Ton téléphone s'efface à la fin de la journée.</div>
  </div>
  <div class="scr__bas"><button class="btn btn--principal btn--inventaire" data-action="inv-entrer">Entrer dans l'inventaire</button></div></div>`, 'inv-entrer');
}

/** Actions côté gérant et entrée ; `ctx.urlLien` : adresse venue d'un lien d'inventaire. */
export async function actionInventaire(a, b, nav, ctx = {}) {
  const val = id => (document.getElementById(id)?.value || '').trim();
  if (a === 'inv-entrer') {
    const prenom = val('inv-prenom'), code = val('inv-code').replace(/\D/g, '');
    if (!prenom) { ecranEntrer(nav, { erreur: 'Écris ton prénom.' }); return true; }
    if (code.length !== 6) { ecranEntrer(nav, { erreur: 'Le code a 6 chiffres.', prenom }); return true; }
    b.disabled = true; b.textContent = 'Vérification…';
    try { await entrerInventaire(ctx.urlLien, code, prenom); await ecrire('inviteUrl', ''); await chargerComptage(); await synchroniser(); ctx.entre && ctx.entre(); }
    catch (x) { ecranEntrer(nav, { erreur: x.message.replace(/^./, c => c.toUpperCase()) + '.', prenom }); }
    return true;
  }
  if (!estAdmin()) return false;
  if (a === 'inventaire' || a === 'inv-gerant') {
    if (!Object.keys(etat.produits).length) { nav.donnees('Charge d\'abord les produits : c\'est la liste à compter.'); return true; }
    ecranGerant(nav); await synchroniser(); if (document.querySelector('[data-ecran="inv-gerant"]')) ecranGerant(nav);
    demarrer(() => { if (document.querySelector('[data-ecran="inv-gerant"]')) ecranGerant(nav); });
    return true;
  }
  if (a === 'inv-preparer') { const inv = inventaireCourant(); PREP = { nom: inv ? inv.nom : nomParDefaut(), zones: zones().map(z => ({ ...z })) }; ecranPreparer(nav); return true; }
  if (a === 'inv-z-ajouter') {
    const parent = b.dataset.parent, nom = (document.querySelector(`[data-nouvelle="${CSS.escape(parent)}"]`)?.value || '').trim().slice(0, 40);
    if (!nom) return true;
    const nomInv = document.getElementById('inv-nom'); if (nomInv) PREP.nom = nomInv.value;
    let id = slug(nom), i = 2; while (PREP.zones.some(z => z.id === id)) id = slug(nom).slice(0, 13) + '-' + i++;
    PREP.zones.push({ id, nom, parent }); ecranPreparer(nav); return true;
  }
  if (a === 'inv-z-retirer') {
    const nomInv = document.getElementById('inv-nom'); if (nomInv) PREP.nom = nomInv.value;
    const avant = PREP.zones.slice(), id = b.dataset.z;
    if (toutesLignes().some(l => l.z === id)) { ecranPreparer(nav, 'Cette sous-zone a déjà des comptages : on la garde.'); return true; }
    PREP.zones = PREP.zones.filter(z => z.id !== id && z.parent !== id); ecranPreparer(nav);
    nav.toast('Zone retirée', () => { PREP.zones = avant; ecranPreparer(nav); });
    return true;
  }
  if (a === 'inv-ouvrir') {
    PREP.nom = val('inv-nom') || nomParDefaut();
    if (!PREP.zones.some(z => z.parent)) { ecranPreparer(nav, 'Ajoute au moins une sous-zone.'); return true; }
    b.disabled = true; b.textContent = 'Ouverture…';
    const produits = Object.values(etat.produits).filter(aCompter).map(o => [o.e, o.lib]);
    try {
      const id = new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6);
      await appelInv('invOuvrir', { inv: { id, nom: PREP.nom, zones: PREP.zones }, produits });
      PREP = null; await synchroniser(); ecranGerant(nav); nav.toast('Inventaire ouvert : affiche le code du jour');
    } catch (x) { ecranPreparer(nav, `Pas ouvert : ${x.message}.`); }
    return true;
  }
  if (a === 'inv-z-enregistrer') {
    b.disabled = true;
    try { await appelInv('invZones', { zones: PREP.zones }); PREP = null; await synchroniser(); ecranGerant(nav); nav.toast('Zones enregistrées'); }
    catch (x) { ecranPreparer(nav, `Pas enregistré : ${x.message}.`); }
    return true;
  }
  if (a === 'inv-code') {
    b.disabled = true;
    try { const r = await appelInv('invCode'); CODE = { code: r.code, exp: r.exp }; ecranGerant(nav); }
    catch (x) { ecranGerant(nav, `Pas de code : ${x.message}.`); }
    return true;
  }
  if (a === 'inv-lien') {
    const lien = lienInventaire(), zone = document.querySelector('[data-msg-lien]');
    try { if (typeof navigator.share === 'function') { await navigator.share({ title: 'Inventaire', text: 'Ouvre ce lien, tape ton prénom et le code du jour.', url: lien }); return true; } }
    catch (x) { if (x && x.name === 'AbortError') return true; }
    try { await navigator.clipboard.writeText(lien); zone.innerHTML = '<div class="note">Lien copié : colle-le dans un message.</div>'; }
    catch (x) { zone.innerHTML = `<div class="note" style="word-break:break-all">${esc(lien)}</div>`; }
    return true;
  }
  if (a === 'inv-fermer') {
    if (b.dataset.ok !== '1') { b.dataset.ok = '1'; b.textContent = 'Touche encore pour fermer : plus personne ne pourra compter'; b.className = 'btn btn--danger'; return true; }
    try { await synchroniser(); await appelInv('invFermer'); CODE = null; arreter(); await synchroniser(); ecranGerant(nav, 'Inventaire fermé. Les comptages restent dans le Drive (APPLI V2).'); }
    catch (x) { ecranGerant(nav, `Pas fermé : ${x.message}.`); }
    return true;
  }
  return false;
}
