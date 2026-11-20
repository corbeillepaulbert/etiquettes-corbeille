// Corbeille V2 — lot 1 : accueil, scan, fiche Magasin et fiche Achat, en lecture seule.
import { etat, charger, trouver, joursVentes, importerFichier, donneesV1Disponibles, reprendreV1, sauverListe, sauverReglages } from './donnees.js';
import { ecranAccueil, ecranEclair, ecranFicheMagasin, ecranFicheAchat, barreMode, joli } from './ecrans.js';
import { calculAchat, euros } from './calcul.js';
import { icone } from './icones.js';
import { ouvrirScanner, ecouterDouchette, bip } from './moteur/scan.js';
import { lire, ecrire } from './donnees.js';
import { chargerEtiquettes, actionEtiquettes } from './etiquettes.js';
import { filtrer, fournisseursCaisse } from './fournisseurs.js';
import { chercher } from './recherche.js';
import { ouvrirVisionneuse } from './visionneuse.js';
import { chargerAffiches, actionAffiches } from './affiches.js';
import { chargerFacture, actionFacture, brancherFacture, estEnCours, reprendreEnCours, retirerEnCours, restaurerEnCours } from './facture.js';
import { ecranATraiter, choisirOnglet, nomFournisseur } from './atraiter.js';
import { chargerLectures, chargerCache, lirePremieres } from './lectures.js';
import { chargerConfig, estRelie, relier, delier, aTraiterEnCache, majATraiter, rafraichirMaintenant, marquerTraite, prendreExports, synchroniserListe, fichierFacture, testerScript, estInvite, finInvite, nomInvite, estAdmin, urlDuLien, urlValide, demanderCode, validerCode, arreterInvites, lienInvitation, siInviteFini } from './drive.js';
import { ecranAccueilInvite, ecranDemandeInvite, ecranInviteFini, blocInviter, resteInvite } from './invite.js';
import { toutEffacer } from './donnees.js';

const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let mode = 'magasin';
let courant = null; // { produit, qte }
let ecranCourant = 'accueil';
let cacheAT = { derniere: null, elements: [] };
let nomAppareil = '';
const heure = iso => iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
let dernierJournal = '';
/** Éléments de À traiter, filtrés sur les fournisseurs de la caisse. Le journal sort dans la console à chaque changement. */
function vueAT() {
  const f = filtrer(cacheAT.elements || [], etat.produits);
  if (f.journal !== dernierJournal) { dernierJournal = f.journal; console.info(f.journal); }
  return f;
}
const nouveaux = () => vueAT().gardes.filter(x => x.etat === 'nouveau').length;

const meta = () => ({ jours: joursVentes() });
const dateDuJour = () => new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase());

function afficher(html, nom = '') { ecranCourant = nom; document.querySelector('.toast-zone')?.remove(); app.innerHTML = html; app.scrollTop = 0; }

function resumeDonnees() {
  const n = Object.keys(etat.produits).length;
  if (!n) return estInvite() ? '<span class="fort" style="color:var(--alerte)">Produits pas encore chargés.</span> Vérifie le réseau.' : '<span class="fort" style="color:var(--alerte)">Aucun produit chargé.</span> Touche « Mettre à jour les ventes » pour commencer.';
  const v = etat.meta.ventes;
  const d = iso => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '';
  const drive = estRelie() ? ` · Drive ${cacheAT.recu ? `vérifié à ${heure(cacheAT.recu)}` : 'relié'}` : '';
  return `${n.toLocaleString('fr-FR')} produits${v ? ` · ventes du ${d(v.date)}` : ' · pas encore de ventes'}${drive}`;
}

// ---------- écrans ----------
let urlInvitation = ''; // adresse /exec venue d'un lien d'invitation, en attente du code
let demandeInvite = null; // { demande, minutes, nom }
async function accueil() {
  courant = null;
  if (estInvite()) { afficher(ecranAccueilInvite({ fin: finInvite(), nom: nomInvite(), donnees: resumeDonnees(), planche: (await lire('etiqSelection', [])).length }), 'accueil'); return; }
  if (!estRelie() && urlInvitation) {
    afficher(`<div class="scr cb"><div class="scr__corps"><h1 class="titre-1">Bonjour</h1>
      <div class="note">Tu as reçu un lien d'invitation.</div>
      <button class="tuile tuile--magasin" data-action="invite-ouvrir">${icone('magasin')}<div><b>Mode invité</b><span>Étiquettes pendant 6 heures, avec un code du responsable</span></div></button>
      </div></div>`, 'accueil');
    return;
  }
  afficher(ecranAccueil({
    bonjour: 'Bonjour', date: dateDuJour(), aTraiter: nouveaux(), donnees: resumeDonnees(),
    petites: [['etiquettes', 'imprimer', 'Étiquettes'], ['affiches', 'frais', 'Affiches fruits et légumes'], ['factures', 'facture', 'Travailler une facture'], ['liste', 'achat', `Ma liste d'achat${etat.liste.length ? ` (${etat.liste.length})` : ''}`]],
    liens: [['donnees', 'Mettre à jour les ventes'], ['reglages', 'Réglages']]
  }), 'accueil');
}

/** Ouvrir Magasin ou Achat : une recherche par nom, la dernière fiche et le bouton Scanner. La caméra ne s'allume jamais d'office. */
async function ouvrirMode(m) {
  mode = m; courant = null;
  const dernier = await lire(m === 'achat' ? 'dernierAchat' : 'dernierMagasin', '');
  const p = dernier && trouver(dernier);
  const vide = !Object.keys(etat.produits).length;
  afficher(`<div class="scr cb">${barreMode(m, '', true)}
  <div class="scr__corps">
    <h1 class="titre-1">${m === 'achat' ? 'Achat' : 'Magasin'}</h1>
    <input id="rech" class="champ" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Chercher un produit par son nom" aria-label="Chercher un produit par son nom"${vide ? ' disabled' : ''}>
    <div id="rech-res" aria-live="polite"></div>
    <div id="rech-repos">
    ${vide ? `<div class="carte"><div class="titre-2">Aucun produit chargé.</div><div class="note" style="margin-top:8px">Touche « Mettre à jour les ventes » sur l'accueil.</div></div>` : ''}
    ${p ? `<button class="ligne" data-action="ouvrir-fiche" data-e="${esc(p.e)}" style="border:0;font:inherit;text-align:left;width:100%"><div class="ligne__ico">${icone(m)}</div><div class="ligne__txt"><div class="ligne__titre">${esc(joli(p.lib))}</div><div class="ligne__detail">Dernière fiche · ${euros(p.prix)}</div></div></button>` : ''}
    ${m === 'achat' ? `<button class="ligne" data-action="liste" style="border:0;font:inherit;text-align:left;width:100%"><div class="ligne__ico">${icone('achat')}</div><div class="ligne__txt"><div class="ligne__titre">Ma liste d'achat</div><div class="ligne__detail">${etat.liste.length ? etat.liste.length + ' produit(s)' : 'Vide pour l\'instant'}</div></div></button>` : ''}
    </div>
  </div>
  <div class="scr__bas"><button class="btn btn--principal${m === 'achat' ? ' btn--achat' : ''}" data-action="scanner">${icone('scan')}Scanner un produit</button></div></div>`, m);
}

app.addEventListener('input', e => {
  if (e.target.id !== 'rech') return;
  const zone = app.querySelector('#rech-res'), repos = app.querySelector('#rech-repos');
  const q = e.target.value.trim();
  if (q.length < 2) { zone.innerHTML = ''; repos.hidden = false; return; }
  repos.hidden = true;
  const r = chercher(q, etat.produits);
  zone.innerHTML = r.length
    ? r.map(o => `<button class="ligne" data-action="ouvrir-fiche" data-e="${esc(o.e)}" style="border:0;font:inherit;text-align:left;width:100%"><div class="ligne__txt"><div class="ligne__titre">${esc(joli(o.lib))}</div><div class="ligne__detail">${o.prix != null ? euros(o.prix) : 'Prix à définir'}${o.q != null ? ' · ' + (o.q >= 1 ? Math.round(o.q) + ' vendus' : 'pas vendu') : ''}</div></div></button>`).join('')
    : `<div class="carte"><div class="titre-2">Aucun produit « ${esc(q)} ».</div><div class="note" style="margin-top:8px">Essaie un seul mot, ou scanne le code-barres.</div></div>`;
});

function eclair(type, nom, info, detail, ensuite) {
  const d = document.createElement('div');
  d.className = 'eclair-plein';
  d.innerHTML = ecranEclair({ type, nom, info, detail });
  document.body.appendChild(d);
  bip(type === 'ok');
  setTimeout(() => { d.remove(); ensuite(); }, 700);
}

function scanner(m = mode) {
  mode = m;
  if (!Object.keys(etat.produits).length) { donnees('Charge d’abord les produits et les ventes : c’est ce que le scan va lire.'); return; }
  ouvrirScanner({ mode, onCode: code => resultat(code), onFermer: () => { if (!courant) accueil(); } });
}

function resultat(code) {
  const p = trouver(code);
  if (!p) { eclair('inconnu', 'Code inconnu', '', code, () => inconnu(code)); return; }
  eclair('ok', joli(p.lib), euros(p.prix), mode === 'achat' ? 'Achat' : 'Magasin', () => fiche(p));
}

function fiche(p) {
  ecrire(mode === 'achat' ? 'dernierAchat' : 'dernierMagasin', p.e);
  const c = calculAchat(p, meta(), etat.reglages);
  courant = { produit: p, qte: c.qte };
  const pict = /boisson|lait|ayran|eau|jus|soda|cola/i.test(`${p.lib} ${p.dep} ${p.fam}`) ? 'bouteille' : 'pot';
  if (mode === 'achat') afficher(ecranFicheAchat(p, meta(), etat.reglages, { qui: navigator.onLine ? '' : 'Hors ligne', pict }));
  else afficher(ecranFicheMagasin(p, meta(), etat.reglages, { lectureSeule: true, pict }));
}

function inconnu(code) {
  courant = null;
  afficher(`<div class="scr cb">${barreMode(mode, '', true)}
  <div class="scr__corps">
    <h1 class="titre-1">Code inconnu</h1>
    <div class="carte" style="display:grid;gap:12px"><div class="titre-2">${esc(code)}</div>
      <div>Ce code n'est pas dans les produits chargés.</div>
      <div class="note">S'il vient d'être créé en caisse, mets à jour les produits. Sinon, la fiche se crée dans l'appli actuelle pour l'instant.</div></div>
  </div>
  <div class="scr__bas"><button class="btn btn--principal" data-action="scanner">${icone('scan')}Scanner un autre produit</button>
  <button class="btn btn--secondaire" data-action="accueil">Retour à l'accueil</button></div></div>`);
}

function donnees(message = '') {
  const v1 = donneesV1Disponibles();
  const m = etat.meta;
  const ligne = (t, x) => `<div class="info"><span>${t}</span><b style="font:600 18px/24px var(--font-texte);text-align:right">${x ? `${esc(x.nom)}<br><span class="note">${x.lignes.toLocaleString('fr-FR')} lignes${x.jours ? ` · ${x.jours} jours` : ''}</span>` : '<span class="note">aucun</span>'}</b></div>`;
  afficher(`<div class="scr cb">${barreMode('magasin', 'Données', true)}
  <div class="scr__corps">
    <h1 class="titre-1">Mettre à jour</h1>
    ${message ? `<div class="bandeau bandeau--alerte">${icone('info', 'cb-ico cb-ico--24')}<span>${esc(message)}</span></div>` : ''}
    <div>Choisis les deux exports de StorePOS : le fichier des produits et le fichier des ventes (Vente PLU). L'appli reconnaît chacun toute seule.</div>
    <div class="infos carte">${ligne('Produits', m.base)}${ligne('Ventes', m.ventes)}</div>
    <div class="note">Rien n'est envoyé à la caisse : l'appli lit seulement.</div>
    <div data-zone-msg></div>
  </div>
  <div class="scr__bas">
    ${estRelie() ? `<button class="btn btn--principal" data-action="exports-drive">${icone('import')}Prendre les derniers exports du Drive</button>` : ''}
    <label class="btn ${estRelie() ? 'btn--secondaire' : 'btn--principal'}">${icone('import')}Choisir les fichiers<input type="file" accept=".xlsx,.csv,.txt" multiple hidden data-fichiers></label>
    ${v1 ? `<button class="btn btn--secondaire" data-action="reprendre-v1">Reprendre les données de l'appli actuelle</button>` : ''}
    <button class="btn btn--discret" data-action="accueil">Retour</button>
  </div></div>`);
  app.querySelector('[data-fichiers]').onchange = async e => {
    const files = [...e.target.files]; e.target.value = '';
    const zone = app.querySelector('[data-zone-msg]');
    // les produits d'abord, les ventes ensuite
    files.sort((a, b) => (/vente|plu/i.test(a.name) ? 1 : 0) - (/vente|plu/i.test(b.name) ? 1 : 0));
    const faits = [];
    for (const f of files) {
      zone.innerHTML = `<div class="note">Lecture de ${esc(f.name)}…</div>`;
      try { const r = await importerFichier(f); faits.push(`${r.type === 'ventes' ? 'Ventes' : 'Produits'} : ${r.lignes.toLocaleString('fr-FR')} lignes`); }
      catch (x) { zone.innerHTML = `<div class="bandeau bandeau--erreur">${icone('alerte', 'cb-ico cb-ico--24')}<span>${esc(f.name)} : ${esc(x.message)}</span></div>`; return; }
    }
    donnees();
    toast(faits.join(' · '));
  };
}

function liste() {
  const L = etat.liste;
  afficher(`<div class="scr cb">${barreMode('achat', '', true)}
  <div class="scr__corps">
    <h1 class="titre-1">Ma liste d'achat</h1>
    ${L.length ? L.map((x, i) => `<div class="ligne"><div class="ligne__txt"><div class="ligne__titre">${esc(joli(x.lib))}</div><div class="ligne__detail">${esc(x.raison || '')}</div></div><b style="font:700 28px/1 var(--font-titre);color:var(--achat)">${x.qte}</b><button class="btn btn--discret" data-action="retirer" data-i="${i}" aria-label="Retirer">${icone('x', 'cb-ico cb-ico--24')}</button></div>`).join('')
      : `<div class="carte"><div class="titre-2">La liste est vide.</div><div class="note" style="margin-top:8px">En mode Achat, scanne un produit puis touche « Ajouter à ma liste ».</div></div>`}
  </div>
  <div class="scr__bas"><button class="btn btn--principal btn--achat" data-action="scanner-achat">${icone('scan')}Scanner en mode Achat</button>
  ${L.length ? `<button class="btn btn--secondaire" data-action="vider">Vider la liste</button>` : ''}</div></div>`, 'liste');
}

function reglages() {
  const s = etat.reglages.semaines;
  afficher(`<div class="scr cb">${barreMode('magasin', 'Réglages', true)}
  <div class="scr__corps">
    <h1 class="titre-1">Réglages</h1>
    <div class="carte" style="display:grid;gap:16px">
      <div class="titre-3">Tu fais tes achats…</div>
      ${[1, 2, 3, 4].map(n => `<button class="btn ${n === s ? 'btn--achat' : 'btn--secondaire'}" data-action="semaines" data-n="${n}" style="width:100%">${n === 1 ? 'Chaque semaine' : `Toutes les ${n} semaines`}</button>`).join('')}
      <div class="note">La quantité proposée couvre la période jusqu'au prochain achat.</div>
    </div>
    <div class="carte" style="display:grid;gap:12px">
      <div class="titre-3">Liaison avec le Drive</div>
      ${estRelie() ? `<div class="bandeau" style="background:var(--succes-fond);color:var(--succes)">${icone('check', 'cb-ico cb-ico--24')}<span>Relié au Drive du magasin</span></div>
        <button class="btn btn--secondaire" data-action="tester-script" style="width:100%">Tester la connexion Apps Script</button><div data-msg-test></div>
        </div>${blocInviter()}<div class="carte" style="display:grid;gap:12px">
        <button class="btn btn--secondaire" data-action="delier" style="width:100%">Délier cet appareil</button>`
      : `<div class="note">Adresse et clé fournies à l'installation du script. Elles restent sur cet appareil.</div>
        <label class="fort" for="drv-url">Adresse (finit par /exec)</label><input class="champ" id="drv-url" autocomplete="off" autocapitalize="off" spellcheck="false" style="font-size:18px">
        <label class="fort" for="drv-cle">Clé</label><input class="champ" id="drv-cle" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" style="font-size:18px">
        <button class="btn btn--principal" data-action="relier">Tester et relier</button><div data-msg-drive></div>`}
      <label class="fort" for="nom-app">Nom de cet appareil</label><input class="champ" id="nom-app" value="${esc(nomAppareil)}" placeholder="iPhone du magasin" style="font-size:18px">
      <div class="note">Il apparaît à côté des factures marquées « traitées ».</div>
    </div>
    <div class="note">Version : lot 1 + liaison Drive. Données : ${resumeDonnees()}</div>
  </div>
  <div class="scr__bas"><button class="btn btn--principal" data-action="fin-reglages">Terminé</button></div></div>`, 'reglages');
}

const nomVu = x => `${nomFournisseur(x, fournisseursCaisse())} · ${new Date((x.date || String(x.cree).slice(0, 10)) + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
let erreurAT = '';
const MSG_ERREUR_DRIVE = 'Erreur de connexion au Drive. Vérifie que Code.gs est à jour et redéployé.';
function aTraiter(message = '') {
  const vue = vueAT();
  const ancien = estRelie() && (cacheAT.elements || []).some(x => !x.date); // un script d'avant la version 4 ne renvoie pas la date de facture
  const erreur = estRelie() && navigator.onLine ? (erreurAT || (ancien ? MSG_ERREUR_DRIVE + ' (script ancien)' : '')) : '';
  const st = ecranCourant === 'atraiter' ? (document.querySelector('.scr__corps')?.scrollTop || 0) : 0;
  afficher(ecranATraiter({ relie: estRelie(), elements: vue.gardes, masques: vue.masques, actif: vue.actif, recu: cacheAT.recu, derniere: cacheAT.derniere, message, erreur, liste: fournisseursCaisse() }), 'atraiter');
  if (st && ecranCourant === 'atraiter') document.querySelector('.scr__corps').scrollTop = st;
}
/** Montants et nombres de produits : cache du Drive d'abord, puis première lecture des PDF qui n'en ont pas encore. */
async function chargerEnFond() {
  if (!estRelie() || !navigator.onLine) return;
  const el = vueAT().gardes;
  try { if (await chargerCache(el) && ecranCourant === 'atraiter') aTraiter(); }
  catch (x) { console.error('[V2/ATraiter] cache illisible :', x.message); }
  lirePremieres(el, { quandFini: () => { if (ecranCourant === 'atraiter') aTraiter(); }, encore: () => ecranCourant === 'atraiter' });
}

function pasEncore(quoi) {
  afficher(`<div class="scr cb">${barreMode(quoi === 'inventaire' ? 'inventaire' : 'magasin', '', true)}
  <div class="scr__corps"><h1 class="titre-1">${quoi === 'inventaire' ? 'Inventaire' : 'Factures'}</h1>
  <div class="carte"><div class="titre-2">Pour l'instant, dans l'appli actuelle.</div>
  <div class="note" style="margin-top:8px">${quoi === 'inventaire' ? "L'inventaire et le fichier de comptage restent dans l'appli actuelle jusqu'au lot Inventaire." : 'La lecture des factures arrive dans un prochain lot.'}</div></div></div>
  <div class="scr__bas"><a class="btn btn--principal" href="../" style="text-decoration:none">Ouvrir l'appli actuelle</a>
  <button class="btn btn--discret" data-action="accueil">Retour</button></div></div>`);
}

// ---------- toast avec Annuler ----------
let toastT = null;
function toast(texte, annuler) {
  document.querySelector('.toast-zone')?.remove(); clearTimeout(toastT);
  const z = document.createElement('div'); z.className = 'toast-zone cb';
  z.innerHTML = `<div class="toast" role="status">${esc(texte)}${annuler ? '<button class="btn">Annuler</button>' : ''}</div>`;
  document.body.appendChild(z);
  if (annuler) z.querySelector('button').onclick = () => { annuler(); z.remove(); };
  toastT = setTimeout(() => z.remove(), 6000);
}

// ---------- actions ----------
const nav = { afficher: (h, n) => afficher(h, n), toast: (t, f) => toast(t, f), donnees: m => donnees(m), sync: () => syncFond(true) };
app.addEventListener('click', async e => {
  const b = e.target.closest('[data-action]'); if (!b) return;
  const a = b.dataset.action;
  if (/^at-/.test(a) || a === 'rafraichir' || a === 'traite' || a === 'a-traiter' || a === 'tester-script') console.log(`[V2/ATraiter] clic « ${a} »${b.dataset.id ? ' facture ' + b.dataset.id : ''}`);
  if (await actionEtiquettes(a, b, nav)) return;
  if (await actionAffiches(a, b, nav)) return;
  if (await actionFacture(a, b, nav)) return;
  if (estInvite() && INTERDIT_INVITE.test(a)) { console.warn('[V2/Invité] action refusée :', a); return accueil(); }
  if (a === 'accueil') return accueil();
  if (a === 'invite-ouvrir') { afficher(ecranDemandeInvite({ etape: 1, nom: await lire('inviteNom', '') }), 'invite'); return; }
  if (a === 'invite-demander' || a === 'invite-renvoyer') {
    const nom = a === 'invite-demander' ? (app.querySelector('#inv-nom')?.value || '').trim() : (demandeInvite?.nom || '');
    if (!nom) { afficher(ecranDemandeInvite({ etape: 1, erreur: 'Écris ton prénom : le responsable saura qui demande.' }), 'invite'); return; }
    await ecrire('inviteNom', nom);
    b.disabled = true; b.textContent = 'Envoi du code…';
    try { const r = await demanderCode(urlInvitation, nom); demandeInvite = { ...r, nom }; afficher(ecranDemandeInvite({ etape: 2, minutes: r.minutes, message: 'Code envoyé au responsable.' }), 'invite'); setTimeout(() => app.querySelector('#inv-code')?.focus(), 50); }
    catch (x) { afficher(ecranDemandeInvite({ etape: demandeInvite ? 2 : 1, nom, erreur: `Pas de code envoyé : ${x.message}.` }), 'invite'); }
    return;
  }
  if (a === 'invite-valider') {
    const code = (app.querySelector('#inv-code')?.value || '').replace(/\D/g, '');
    if (code.length !== 6) { afficher(ecranDemandeInvite({ etape: 2, minutes: demandeInvite?.minutes, erreur: 'Le code a 6 chiffres.' }), 'invite'); return; }
    b.disabled = true; b.textContent = 'Vérification…';
    try {
      await validerCode(urlInvitation, demandeInvite?.demande, code);
      urlInvitation = ''; demandeInvite = null; await ecrire('inviteUrl', '');
      afficher(`<div class="scr cb"><div class="scr__corps" style="justify-content:center"><h1 class="titre-1">Bienvenue</h1><div class="carte"><div class="titre-2">Chargement des produits…</div><div class="note" style="margin-top:8px">Une minute au plus.</div></div></div></div>`, 'invite');
      try { await prendreExports({ forcer: true }); } catch (x) { console.error('[V2/Invité] produits :', x.message); }
      surveillerInvite(); accueil(); toast(`Session ouverte pour ${resteInvite(finInvite())}`);
    } catch (x) { afficher(ecranDemandeInvite({ etape: 2, minutes: demandeInvite?.minutes, erreur: x.message.replace(/^./, c => c.toUpperCase()) + '.' }), 'invite'); }
    return;
  }
  if (a === 'invite-quitter') { await terminerInvite(); return; }
  if (a === 'invite-lien') {
    const lien = lienInvitation(); if (!lien) return;
    const zone = app.querySelector('[data-msg-invite]');
    try {
      if (typeof navigator.share === 'function') { await navigator.share({ title: 'Accès invité', text: 'Ouvre ce lien sur ton téléphone, puis touche « Mode invité ».', url: lien }); return; }
    } catch (x) { if (x && x.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(lien); zone.innerHTML = '<div class="note">Lien copié : colle-le dans un message.</div>'; }
    catch (x) { zone.innerHTML = `<div class="note" style="word-break:break-all">${esc(lien)}</div>`; }
    return;
  }
  if (a === 'invite-arreter') {
    const zone = app.querySelector('[data-msg-invite]');
    try { const n = await arreterInvites(); zone.innerHTML = `<div class="note">${n ? `${n} session(s) arrêtée(s).` : 'Aucune session en cours.'} Les téléphones invités s'effacent à leur prochain appel.</div>`; }
    catch (x) { zone.innerHTML = `<div class="bandeau bandeau--erreur"><span>${esc(x.message)}</span></div>`; }
    return;
  }
  if (a === 'mode') { if (b.dataset.mode === 'inventaire') return pasEncore('inventaire'); return ouvrirMode(b.dataset.mode); }
  if (a === 'at-onglet') { choisirOnglet(b.dataset.o); aTraiter(); document.querySelector('.scr__corps').scrollTop = 0; return; }
  if (a === 'at-voir') {
    const id = b.dataset.id, x = (cacheAT.elements || []).find(y => y.id === id); if (!x) return;
    const texte = b.textContent; b.disabled = true; b.textContent = 'Ouverture…';
    try {
      const f = await fichierFacture(id);
      b.disabled = false; b.textContent = texte;
      console.log(`[V2/ATraiter] aperçu : ${f.name}, ${f.size} octets, ${f.type}`);
      await ouvrirVisionneuse(f, nomVu(x), () => actionFacture('fac-ouvrir', { dataset: { id, date: x.date || '' } }, nav));
    } catch (er) { console.error('[V2/ATraiter] aperçu impossible :', er.message); aTraiter(`Aperçu impossible : ${er.message}.`); }
    return;
  }
  if (a === 'at-traiter') {
    const id = b.dataset.id, date = b.dataset.date || '';
    b.disabled = true;
    try {
      if (estEnCours(id) && await reprendreEnCours(id, nav)) return;
      await actionFacture('fac-ouvrir', { dataset: { id, date } }, nav);
    } catch (er) { console.error('[V2/ATraiter] ouverture impossible :', er.message); aTraiter(`Ouverture impossible : ${er.message}.`); }
    return;
  }
  if (a === 'at-reessayer') {
    b.disabled = true; b.textContent = 'Je réessaie…';
    try { cacheAT = await majATraiter(); erreurAT = ''; } catch (x) { erreurAT = MSG_ERREUR_DRIVE; console.error('[V2/ATraiter] échec :', x.message); }
    aTraiter(); chargerEnFond(); return;
  }
  if (a === 'tester-script') {
    const zone = app.querySelector('[data-msg-test]'); zone.innerHTML = '<div class="note">Test du script…</div>';
    const r = await testerScript();
    zone.innerHTML = r.ok ? `<div class="bandeau" style="background:var(--succes-fond);color:var(--succes)">${icone('check', 'cb-ico cb-ico--24')}<span>${esc(r.message)}</span></div>`
      : `<div class="bandeau bandeau--erreur">${icone('alerte', 'cb-ico cb-ico--24')}<span>${esc(r.message)}</span></div>`;
    return;
  }
  if (a === 'ouvrir-fiche') { const p = trouver(b.dataset.e); return p && fiche(p); }
  if (a === 'scanner') return scanner(mode);
  if (a === 'scanner-achat') return scanner('achat');
  if (a === 'donnees') return donnees();
  if (a === 'liste') { liste(); return syncFond(true); }
  if (a === 'reglages') return reglages();
  if (a === 'a-traiter') { aTraiter(); chargerEnFond(); return; }
  if (a === 'rafraichir') {
    b.disabled = true; b.innerHTML = 'Je regarde le Drive…';
    try { cacheAT = await rafraichirMaintenant(); erreurAT = ''; aTraiter(cacheAT.occupe ? 'Un passage était déjà en cours : la liste est celle du dernier passage.' : ''); toast(cacheAT.ajoutes ? `${cacheAT.ajoutes} nouvelle(s) facture(s)` : 'Rien de nouveau sur le Drive'); }
    catch (x) { erreurAT = MSG_ERREUR_DRIVE; console.error('[V2/ATraiter] échec :', x.message); aTraiter(); }
    chargerEnFond();
    return;
  }
  if (a === 'traite') {
    const id = b.dataset.id; b.disabled = true;
    try {
      const meta = await retirerEnCours(id);
      cacheAT = await marquerTraite(id, true, nomAppareil); aTraiter();
      toast('Facture marquée traitée', async () => { await restaurerEnCours(id, meta); try { cacheAT = await marquerTraite(id, false); } catch (x) { } aTraiter(); });
    }
    catch (x) { b.disabled = false; toast(`Pas enregistré : ${x.message}`); }
    return;
  }
  if (a === 'relier') {
    const zone = app.querySelector('[data-msg-drive]'); zone.innerHTML = '<div class="note">Test de la liaison…</div>';
    try { await relier(app.querySelector('#drv-url').value, app.querySelector('#drv-cle').value); reglages(); toast('Relié au Drive'); syncFond(true); }
    catch (x) { zone.innerHTML = `<div class="bandeau bandeau--erreur">${icone('alerte', 'cb-ico cb-ico--24')}<span>${esc(x.message)}</span></div>`; }
    return;
  }
  if (a === 'delier') { await delier(); cacheAT = { derniere: null, elements: [] }; await ecrire('aTraiter', cacheAT); return reglages(); }
  if (a === 'fin-reglages') { nomAppareil = (app.querySelector('#nom-app')?.value || '').trim().slice(0, 40); await ecrire('nomAppareil', nomAppareil); return accueil(); }
  if (a === 'exports-drive') {
    b.disabled = true; b.innerHTML = 'Lecture des exports du Drive…';
    try { const f = await prendreExports({ forcer: true }); donnees(); toast(f.map(r => `${r.type === 'ventes' ? 'Ventes' : 'Produits'} : ${r.lignes.toLocaleString('fr-FR')} lignes`).join(' · ') || 'Aucun export trouvé'); }
    catch (x) { donnees(`Impossible de lire les exports : ${x.message}.`); }
    return;
  }
  if (a === 'reprendre-v1') { const n = await reprendreV1(); donnees(); toast(`${n.toLocaleString('fr-FR')} produits repris de l'appli actuelle`); return; }
  if (a === 'semaines') { etat.reglages.semaines = +b.dataset.n; await sauverReglages(); return reglages(); }
  if ((a === 'plus' || a === 'moins') && courant) {
    courant.qte = Math.max(0, courant.qte + (a === 'plus' ? 1 : -1));
    const q = app.querySelector('[data-qte]'); if (q) q.textContent = courant.qte;
    return;
  }
  if (a === 'ajouter' && courant) {
    const p = courant.produit, c = calculAchat(p, meta(), etat.reglages);
    const avant = etat.liste.slice();
    const i = etat.liste.findIndex(x => x.e === p.e);
    const ligne = { e: p.e, lib: p.lib, qte: courant.qte, raison: c.parSemaine != null ? `il en part ${c.parSemaine < 1 ? "moins d'un" : Math.round(c.parSemaine)} par semaine` : '', date: new Date().toISOString() };
    if (i >= 0) etat.liste[i] = ligne; else etat.liste.push(ligne);
    delete etat.listeSupprimes[p.e];
    await sauverListe(); planifierSync();
    toast(`${courant.qte} × ${joli(p.lib)} ajouté à la liste`, async () => { etat.liste = avant; if (i < 0) etat.listeSupprimes[p.e] = new Date().toISOString(); await sauverListe(); planifierSync(); });
    return;
  }
  if (a === 'retirer') {
    const avant = etat.liste.slice(), suppAvant = { ...etat.listeSupprimes }; const x = etat.liste.splice(+b.dataset.i, 1)[0];
    etat.listeSupprimes[x.e] = new Date().toISOString();
    await sauverListe(); liste(); planifierSync();
    toast(`${joli(x.lib)} retiré`, async () => { etat.liste = avant.map(l => l.e === x.e ? { ...l, date: new Date().toISOString() } : l); etat.listeSupprimes = suppAvant; await sauverListe(); liste(); planifierSync(); });
    return;
  }
  if (a === 'vider') {
    const avant = etat.liste.slice(), suppAvant = { ...etat.listeSupprimes }, maintenant = new Date().toISOString();
    for (const l of avant) etat.listeSupprimes[l.e] = maintenant;
    etat.liste = []; await sauverListe(); liste(); planifierSync();
    toast('Liste vidée', async () => { const t = new Date().toISOString(); etat.liste = avant.map(l => ({ ...l, date: t })); etat.listeSupprimes = suppAvant; await sauverListe(); liste(); planifierSync(); });
  }
});

brancherFacture(app, nav);

ecouterDouchette(code => { if (!document.querySelector('.scan-plein')) resultat(code); });

// ---------- mode invité : fin de session ----------
// L'invité ne fait que des étiquettes : tout le reste est refusé (et le serveur ne lui donne que les produits).
const INTERDIT_INVITE = /^(factures|fac-.*|a-traiter|at-.*|rafraichir|traite|reglages|fin-reglages|relier|delier|tester-script|donnees|exports-drive|reprendre-v1|mode|scanner|scanner-achat|liste|ouvrir-fiche|vider|retirer|affiches|af-.*|invite-lien|invite-arreter)$/;
let minuteurInvite = null;
function surveillerInvite() {
  clearInterval(minuteurInvite);
  minuteurInvite = setInterval(() => {
    if (!estInvite()) return clearInterval(minuteurInvite);
    if (Date.now() >= finInvite()) return terminerInvite();
    const z = document.querySelector('[data-reste]'); if (z) z.textContent = resteInvite(finInvite());
  }, 20000);
}
/** Fin des 6 heures, session coupée par le responsable, ou « Quitter » : tout ce que le téléphone a reçu est effacé. */
async function terminerInvite() {
  clearInterval(minuteurInvite);
  console.log('[V2/Invité] fin de session : effacement des données');
  await toutEffacer();
  await chargerConfig();
  urlInvitation = '';
  afficher(ecranInviteFini(), 'invite-fini');
}
siInviteFini(() => { if (estInvite()) terminerInvite(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && estInvite() && Date.now() >= finInvite()) terminerInvite(); });

// ---------- synchronisation en fond ----------
let syncT = null, dernierSync = 0, syncEnCours = false;
function planifierSync() { clearTimeout(syncT); syncT = setTimeout(() => syncFond(true), 3000); }
async function syncFond(force = false) {
  if (!estRelie() || syncEnCours || !navigator.onLine) return;
  if (!force && Date.now() - dernierSync < 120000) return;
  syncEnCours = true; dernierSync = Date.now();
  try {
    if (!estInvite()) { try { cacheAT = await majATraiter(); erreurAT = ''; } catch (x) { erreurAT = MSG_ERREUR_DRIVE; console.error('[V2/ATraiter] échec :', x.message); } }
    try {
      const faits = await prendreExports();
      if (faits.length) toast(`Mis à jour depuis le Drive : ${faits.map(r => r.type === 'ventes' ? 'ventes' : 'produits').join(' et ')}`);
    } catch (x) { }
    try { if (await lire('listeAEnvoyer', false) || force || ecranCourant === 'liste') await synchroniserListe(); } catch (x) { }
  } finally {
    syncEnCours = false;
    if (ecranCourant === 'accueil') accueil();
    else if (ecranCourant === 'liste') liste();
    else if (ecranCourant === 'atraiter') { aTraiter(); chargerEnFond(); }
  }
}
window.addEventListener('online', () => syncFond(true));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncFond(); });

// ---------- démarrage ----------
(async () => {
  await charger();
  await chargerConfig();
  // lien d'invitation (#invite=…) : gardé tant que le code n'est pas validé, puis retiré de l'adresse
  const venue = urlDuLien();
  if (venue && !estAdmin()) { urlInvitation = venue; await ecrire('inviteUrl', venue); }
  else if (!estRelie()) { const u = await lire('inviteUrl', ''); if (urlValide(u)) urlInvitation = u; }
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  if (estInvite() && finInvite() <= Date.now()) { await terminerInvite(); return; }
  if (estInvite()) surveillerInvite();
  await chargerEtiquettes();
  await chargerFacture();
  await chargerAffiches();
  await chargerLectures();
  cacheAT = await aTraiterEnCache();
  nomAppareil = await lire('nomAppareil', '');
  accueil();
  syncFond(true);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => { });
})();
