// Mode invité : lien envoyé par le responsable → « Mode invité » → code reçu par e-mail par le responsable → session de 6 h.
// Au bout de 6 h (ou si le responsable coupe les sessions), tout ce que le téléphone a reçu est effacé.
import { icone } from './icones.js';
import { barreMode } from './ecrans.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** « encore 5 h 42 » */
export function resteInvite(fin) {
  const m = Math.max(0, Math.round((fin - Date.now()) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
}

export function bandeauInvite(fin, nom) {
  return `<div class="bandeau invite-bandeau">${icone('info', 'cb-ico cb-ico--24')}<span><b>Mode invité${nom ? ` · ${esc(nom)}` : ''}</b> · encore <span data-reste>${resteInvite(fin)}</span></span></div>`;
}

/** Accueil d'un invité : uniquement les étiquettes (scanner les produits du rayon, faire la planche, l'imprimer). */
export function ecranAccueilInvite({ fin, nom, donnees, planche = 0 }) {
  return `<div class="scr cb"><div class="scr__corps">
    <h1 class="titre-1">Bonjour${nom ? ` ${esc(nom)}` : ''}</h1>
    ${bandeauInvite(fin, nom)}
    <button class="tuile tuile--magasin" data-action="etiquettes">${icone('imprimer')}<div><b>Étiquettes</b><span>${planche ? `${planche} sur la planche` : 'Scanne les produits du rayon, puis imprime'}</span></div></button>
    <div class="carte" style="display:grid;gap:8px"><div class="titre-3">Comment faire</div>
      <div class="note">1. Touche « Scanner pour étiqueter » et scanne les produits un par un.</div>
      <div class="note">2. Touche « Créer le PDF ».</div>
      <div class="note">3. « Partager » puis « Imprimer », ou « Enregistrer le PDF ». Impression à 100 %, sans ajuster à la page.</div></div>
    ${donnees ? `<div class="note">${donnees}</div>` : ''}
    <button class="lien" data-action="invite-quitter">Quitter le mode invité</button>
  </div>
  <button class="btn btn--scan fab" data-action="etiq-scanner" aria-label="Scanner pour étiqueter">${icone('scan')}</button></div>`;
}

/** Étape 1 : prénom, puis « Demander un code ». Étape 2 : saisie du code. */
export function ecranDemandeInvite({ etape = 1, nom = '', minutes = 15, message = '', erreur = '' }) {
  const haut = `<div class="scr cb">${barreMode('magasin', 'Mode invité', true)}<div class="scr__corps"><h1 class="titre-1">Mode invité</h1>
    ${erreur ? `<div class="bandeau bandeau--erreur">${icone('alerte', 'cb-ico cb-ico--24')}<span>${esc(erreur)}</span></div>` : ''}
    ${message ? `<div class="bandeau" style="background:var(--succes-fond);color:var(--succes)">${icone('check', 'cb-ico cb-ico--24')}<span>${esc(message)}</span></div>` : ''}`;
  if (etape === 1) return `${haut}
    <div class="note">Tu as reçu ce lien du responsable du magasin. Il va recevoir un code par e-mail : demande-le-lui.</div>
    <label class="fort" for="inv-nom">Ton prénom</label>
    <input class="champ" id="inv-nom" value="${esc(nom)}" autocomplete="given-name" maxlength="30" style="font-size:20px">
    <div class="note">Accès pendant 6 heures pour scanner les produits du rayon et imprimer leurs étiquettes. Ensuite, tout s'efface de ce téléphone.</div>
    </div><div class="scr__bas"><button class="btn btn--principal" data-action="invite-demander">Demander un code</button>
    <button class="btn btn--discret" data-action="accueil">Retour</button></div></div>`;
  return `${haut}
    <div class="note">Le code est parti chez le responsable. Il est valable ${minutes} minutes.</div>
    <label class="fort" for="inv-code">Code à 6 chiffres</label>
    <input class="champ" id="inv-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" style="font:700 32px/1 var(--font-titre);letter-spacing:.3em;text-align:center">
    </div><div class="scr__bas"><button class="btn btn--principal" data-action="invite-valider">Ouvrir la session</button>
    <button class="btn btn--secondaire" data-action="invite-renvoyer">Demander un autre code</button></div></div>`;
}

export function ecranInviteFini() {
  return `<div class="scr cb"><div class="scr__corps" style="justify-content:center">
    <h1 class="titre-1">Session terminée</h1>
    <div class="carte"><div class="titre-2">Les 6 heures sont passées.</div><div class="note" style="margin-top:8px">Tout ce que l'appli avait reçu a été effacé de ce téléphone. Pour revenir, demande un nouveau lien au responsable du magasin.</div></div>
  </div></div>`;
}

/** Réglages du responsable : inviter quelqu'un, couper les sessions. */
export function blocInviter() {
  return `<div class="carte" style="display:grid;gap:12px">
    <div class="titre-3">Mode invité</div>
    <div class="note">Envoie le lien. La personne touche « Mode invité », tu reçois un code par e-mail, tu le lui donnes : elle a 6 heures pour scanner des produits et imprimer leurs étiquettes (rien d'autre : ni factures, ni achats, ni réglages).</div>
    <button class="btn btn--secondaire" data-action="invite-lien" style="width:100%">Envoyer le lien d'invitation</button>
    <button class="btn btn--discret" data-action="invite-arreter" style="width:100%">Arrêter les sessions invitées</button><div data-msg-invite></div>
  </div>`;
}
