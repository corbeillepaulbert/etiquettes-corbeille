/**
 * Corbeille V2 — liaison Google Drive (Apps Script).
 *
 * INSTALLATION (une fois, sur script.google.com, connecté au compte du magasin) :
 *  1. Nouveau projet « Corbeille liaison Drive », coller ce fichier à la place de Code.gs.
 *  2. Paramètres du projet › Propriétés du script › ajouter CLE_APPLI = une phrase secrète longue
 *     (au moins 24 caractères). Ne jamais l'écrire ailleurs que là et dans les Réglages de l'appli.
 *  3. Exécuter la fonction installer() une fois et accepter les autorisations Drive.
 *  4. Déployer › Nouveau déploiement › Application Web :
 *       Exécuter en tant que : moi
 *       Qui a accès : Tout le monde
 *     Copier l'adresse qui finit par /exec et la saisir dans l'appli : Réglages › Liaison avec le Drive.
 *
 * MODE INVITÉ (version 5) : après avoir recollé ce fichier, exécuter une fois installer() et accepter la nouvelle
 * autorisation « Envoyer des e-mails en votre nom » (le code d'accès part sur l'adresse du compte du magasin,
 * ou sur la propriété MAIL_ADMIN si elle existe). Puis Déployer › Gérer les déploiements › Modifier › Nouvelle version.
 *
 * CHANGER LA CLÉ : écrire la nouvelle valeur dans la propriété CLE_NOUVELLE, puis exécuter rotationCle().
 * L'ancienne clé reste acceptée 7 jours, le temps de mettre à jour chaque appareil.
 *
 * RÈGLES (voir CLAUDE.md) :
 *  - FACTURES ACHAT et EXPORTS STOREPOS sont en LECTURE SEULE : rien n'y est déplacé, renommé, supprimé ni écrit.
 *  - Ce script n'écrit que dans le dossier « APPLI V2 », rangé dans « APPLI ETIQUETTES CORBEILLE ».
 *  - Le secret n'apparaît jamais dans un journal ni dans une réponse.
 */

const VERSION = 5;
const NOM_FACTURES = 'FACTURES ACHAT';
const NOM_EXPORTS = 'EXPORTS STOREPOS';
const NOM_APPLI = 'APPLI ETIQUETTES CORBEILLE';
const NOM_V2 = 'APPLI V2';
const FICHIER_A_TRAITER = 'a-traiter.json';
const JOURS_CLE_PRECEDENTE = 7;
const FENETRE_JOURS = 90;
const JOURS_TRAITEES = 365; // les factures traitées restent consultables (archives) bien après les 90 jours
const NOM_CACHE = 'FACTURES_CACHE';
const ID_VALIDE = /^[A-Za-z0-9_-]{10,80}$/;
// Mode invité : une session de 6 h ouverte par un code à 6 chiffres envoyé au responsable.
const DUREE_INVITE_MS = 6 * 3600e3;
const DUREE_CODE_MS = 15 * 60e3;
const ESSAIS_CODE = 5;
const DEMANDES_PAR_HEURE = 5;
const ACTIONS_INVITE = new Set(['ping', 'exports', 'fichier', 'lire', 'ecrire']); // pas de factures, ni d'À traiter, ni de cache
const DOCS_INVITE = new Set(['liste-achat']);
const EXTENSIONS_FACTURE = /\.(pdf|jpe?g|png|heic)$/i;
const EXTENSIONS_EXPORT = /\.(xlsx|csv|txt)$/i;

const props = () => PropertiesService.getScriptProperties();

// ---------------------------------------------------------------- entrée Web

function doPost(e) {
  let req = {};
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { return repondre({ ok: false }); }
  try {
    // Deux seules actions sans clé : demander un code invité, et l'échanger contre une session de 6 h.
    if (req.action === 'inviteDemande') return repondre(inviteDemande(req.nom));
    if (req.action === 'inviteValider') return repondre(inviteValider(req.demande, req.code));
  } catch (x) { return repondre({ ok: false, erreur: 'réessaie dans un instant' }); }
  let invite = null;
  if (req.jeton) {
    invite = sessionInvite(req.jeton);
    if (!invite) return repondre({ ok: false, invite: 'fini' }); // session finie ou coupée : l'appli invitée s'efface
    if (!ACTIONS_INVITE.has(req.action)) return repondre({ ok: false });
    if ((req.action === 'lire' || req.action === 'ecrire') && !DOCS_INVITE.has(req.doc)) return repondre({ ok: false });
  } else if (!cleValide(req.cle)) return repondre({ ok: false });
  try {
    switch (req.action) {
      case 'ping': return repondre(invite ? { ok: true, version: VERSION, invite: true, fin: invite.fin } : { ok: true, version: VERSION });
      case 'inviteArreter': return repondre(arreterInvites());
      case 'aTraiter': return repondre({ ok: true, ...lireATraiter() });
      case 'rafraichir': return repondre({ ok: true, ...rafraichir() });
      case 'traiter': return repondre({ ok: true, ...marquer(req.id, req.etat, req.par) });
      case 'exports': return repondre({ ok: true, fichiers: listerExports() });
      case 'fichier': return repondre({ ok: true, ...lireExport(req.id) });
      case 'factures': return repondre({ ok: true, factures: listerFactures(req.mot, req.max, req.jours) });
      case 'facture': return repondre({ ok: true, ...lireFacture(req.id) });
      case 'cacheLire': return repondre({ ok: true, cache: lireCacheFactures(req.ids) });
      case 'cacheEcrire': return repondre(ecrireCacheFacture(req.id, req.fournisseur, req.montant, req.nb));
      case 'lire': return repondre({ ok: true, ...lireDoc(req.doc) });
      case 'ecrire': return repondre(ecrireDoc(req.doc, req.valeur, req.version));
      default: return repondre({ ok: false, erreur: 'action inconnue' });
    }
  } catch (x) {
    return repondre({ ok: false, erreur: String(x && x.message || x).slice(0, 200) });
  }
}

function doGet() { return repondre({ ok: false }); }

function repondre(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- secret partagé

function egalTempsConstant(a, b) {
  a = String(a || ''); b = String(b || '');
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function cleValide(cle) {
  const p = props();
  const actuelle = p.getProperty('CLE_APPLI');
  if (!actuelle || !cle) return false;
  let ok = egalTempsConstant(cle, actuelle);
  const prec = p.getProperty('CLE_PRECEDENTE'), jusqu = Number(p.getProperty('CLE_PRECEDENTE_JUSQU') || 0);
  if (prec && Date.now() < jusqu) ok = egalTempsConstant(cle, prec) || ok;
  return ok;
}

function rotationCle() {
  const p = props();
  const nouvelle = p.getProperty('CLE_NOUVELLE');
  if (!nouvelle || nouvelle.length < 24) throw new Error('Écris d\'abord une nouvelle clé de 24 caractères ou plus dans la propriété CLE_NOUVELLE.');
  p.setProperty('CLE_PRECEDENTE', p.getProperty('CLE_APPLI') || '');
  p.setProperty('CLE_PRECEDENTE_JUSQU', String(Date.now() + JOURS_CLE_PRECEDENTE * 864e5));
  p.setProperty('CLE_APPLI', nouvelle);
  p.deleteProperty('CLE_NOUVELLE');
  console.log('Clé changée. L\'ancienne reste acceptée ' + JOURS_CLE_PRECEDENTE + ' jours.');
}

function purgerClePrecedente() {
  const p = props();
  const jusqu = Number(p.getProperty('CLE_PRECEDENTE_JUSQU') || 0);
  if (jusqu && Date.now() >= jusqu) { p.deleteProperty('CLE_PRECEDENTE'); p.deleteProperty('CLE_PRECEDENTE_JUSQU'); }
}

// ---------------------------------------------------------------- dossiers (lecture seule sauf APPLI V2)

function dossier(nomPropriete, nom, parent) {
  const id = props().getProperty(nomPropriete);
  if (id) return DriveApp.getFolderById(id);
  const it = parent ? parent.getFoldersByName(nom) : DriveApp.getFoldersByName(nom);
  if (!it.hasNext()) throw new Error('dossier introuvable : ' + nom);
  const f = it.next();
  props().setProperty(nomPropriete, f.getId());
  return f;
}
const dossierFactures = () => dossier('ID_FACTURES', NOM_FACTURES);   // lecture seule
const dossierAppli = () => dossier('ID_APPLI', NOM_APPLI);
const dossierExports = () => dossier('ID_EXPORTS', NOM_EXPORTS, dossierAppli()); // lecture seule

/** Seul dossier où ce script écrit. */
function dossierV2() {
  const id = props().getProperty('ID_V2');
  if (id) return DriveApp.getFolderById(id);
  const parent = dossierAppli();
  const it = parent.getFoldersByName(NOM_V2);
  const f = it.hasNext() ? it.next() : parent.createFolder(NOM_V2);
  props().setProperty('ID_V2', f.getId());
  return f;
}

/** Cache des lectures de factures : APPLI V2/FACTURES_CACHE/{idFacture}.json. Seul endroit, avec APPLI V2, où ce script écrit. */
function dossierCache() {
  const id = props().getProperty('ID_CACHE');
  if (id) return DriveApp.getFolderById(id);
  const parent = dossierV2();
  const it = parent.getFoldersByName(NOM_CACHE);
  const f = it.hasNext() ? it.next() : parent.createFolder(NOM_CACHE);
  props().setProperty('ID_CACHE', f.getId());
  return f;
}

function lireJson(nom, defaut) {
  const it = dossierV2().getFilesByName(nom);
  if (!it.hasNext()) return defaut;
  try { return JSON.parse(it.next().getBlob().getDataAsString('UTF-8')); } catch (x) { return defaut; }
}
function ecrireJson(nom, valeur) {
  const v2 = dossierV2();
  const it = v2.getFilesByName(nom);
  const texte = JSON.stringify(valeur);
  if (it.hasNext()) it.next().setContent(texte);
  else v2.createFile(nom, texte, 'application/json');
}

// ---------------------------------------------------------------- factures → À traiter

/** Date d'une facture : la dernière date AAAA-MM-JJ du nom, sinon la date de création. Jamais la date de modification
 *  (les anciennes factures importées en bloc ont une date de modification récente). */
function dateDuNom(nom, creeIso) {
  const m = String(nom).match(/20\d{2}[-_.]\d{2}[-_.]\d{2}/g);
  if (m) return m[m.length - 1].replace(/[_.]/g, '-');
  return String(creeIso || '').slice(0, 10);
}
const limiteJours = jours => new Date(Date.now() - (jours || FENETRE_JOURS) * 864e5).toISOString().slice(0, 10);

/** Parcourt FACTURES ACHAT en lecture seule et ajoute à « À traiter » les factures des 90 derniers jours (date du nom). */
function chercherFactures() {
  const etat = lireJson(FICHIER_A_TRAITER, { derniere: null, elements: [] });
  const connus = new Set(etat.elements.map(x => x.id));
  const debut = new Date().toISOString();
  const limite = limiteJours();
  const seuil = limite + 'T00:00:00'; // premier tri côté Drive ; le vrai filtre est la date du nom, ci-dessous
  let ajoutes = 0;
  const parcourir = (dossierCourant, chemin, profondeur) => {
    const fichiers = dossierCourant.searchFiles('modifiedDate > "' + seuil + '" and trashed = false');
    while (fichiers.hasNext()) {
      const f = fichiers.next();
      if (connus.has(f.getId())) {
        const k = etat.elements.find(y => y.id === f.getId());
        const maj = f.getLastUpdated().toISOString();
        if (k && k.maj !== maj) k.maj = maj; // le PDF a changé : le cache de lecture n'est plus valable (empreinte)
        continue;
      }
      const nom = f.getName();
      if (!EXTENSIONS_FACTURE.test(nom)) continue;
      const cree = f.getDateCreated().toISOString();
      const date = dateDuNom(nom, cree);
      if (date < limite) continue;
      etat.elements.push({
        id: f.getId(), type: 'facture', nom, dossier: chemin, date,
        cree, maj: f.getLastUpdated().toISOString(),
        url: 'https://drive.google.com/file/d/' + f.getId() + '/view', etat: 'nouveau'
      });
      connus.add(f.getId()); ajoutes++;
    }
    if (profondeur >= 4) return;
    const sous = dossierCourant.getFolders();
    while (sous.hasNext()) { const d = sous.next(); parcourir(d, chemin ? chemin + ' › ' + d.getName() : d.getName(), profondeur + 1); }
  };
  parcourir(dossierFactures(), '', 0);
  etat.elements = gardeRecents(etat.elements);
  etat.derniere = debut;
  ecrireJson(FICHIER_A_TRAITER, etat);
  return { ajoutes };
}

/** À traiter : 90 derniers jours (date du nom). Traitées : un an, pour les archives. Sert aussi à vider ce qui a été stocké avant ce filtre. */
function gardeRecents(elements) {
  const limite = limiteJours();
  const limiteTraitees = new Date(Date.now() - JOURS_TRAITEES * 864e5).toISOString();
  return elements.filter(x => {
    x.date = x.date || dateDuNom(x.nom, x.cree);
    if (x.etat === 'traite') return String(x.traiteLe || x.cree) >= limiteTraitees;
    return x.date >= limite;
  });
}

function lireATraiter() {
  const etat = lireJson(FICHIER_A_TRAITER, { derniere: null, elements: [] });
  etat.elements = gardeRecents(etat.elements); // le filtre se fait ici : 90 jours, jamais le Drive entier
  etat.elements.sort((a, b) => (a.etat === b.etat ? 0 : a.etat === 'nouveau' ? -1 : 1) || b.date.localeCompare(a.date));
  return etat;
}

/** « Rafraîchir maintenant » : même passage que le déclencheur, protégé par un verrou. */
function rafraichir() {
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(20000)) return { ...lireATraiter(), occupe: true };
  try { const r = chercherFactures(); return { ...lireATraiter(), ajoutes: r.ajoutes }; }
  finally { verrou.releaseLock(); }
}

function marquer(id, etatVoulu, par) {
  const verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    const etat = lireJson(FICHIER_A_TRAITER, { derniere: null, elements: [] });
    const x = etat.elements.find(y => y.id === id);
    if (x) {
      x.etat = etatVoulu === 'traite' ? 'traite' : 'nouveau';
      x.traiteLe = x.etat === 'traite' ? new Date().toISOString() : null;
      x.traitePar = x.etat === 'traite' ? String(par || '').slice(0, 40) : null;
      ecrireJson(FICHIER_A_TRAITER, etat);
    }
    return lireATraiter();
  } finally { verrou.releaseLock(); }
}

// ---------------------------------------------------------------- lecture d'une facture (lecture seule)

/** Parcourt FACTURES ACHAT et ses sous-dossiers (getFolders / getFiles uniquement) ; `visiteur` reçoit chaque fichier. */
function parcourirFactures(visiteur) {
  const marche = (d, chemin, prof) => {
    const fi = d.getFiles();
    while (fi.hasNext()) { if (visiteur(fi.next(), chemin) === false) return false; }
    if (prof >= 4) return true;
    const sous = d.getFolders();
    while (sous.hasNext()) { const s = sous.next(); if (marche(s, chemin ? chemin + ' › ' + s.getName() : s.getName(), prof + 1) === false) return false; }
    return true;
  };
  marche(dossierFactures(), '', 0);
}

/** Date d'une facture, comme dans la V1 : la dernière date AAAA-MM-JJ du nom, sinon la date de création. */
function dateFacture(f, nom) { return dateDuNom(nom, f.getDateCreated().toISOString()); }

/** Les factures des `jours` derniers jours (90 par défaut), les plus récentes d'abord, filtrées par un mot du nom ou du dossier.
 *  Le tri et le filtre se font ici : le Drive entier ne transite jamais vers l'appli. */
function listerFactures(mot, max, jours) {
  const m = String(mot || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const limite = new Date(Date.now() - (Number(jours) || 90) * 864e5).toISOString().slice(0, 10);
  const out = [];
  parcourirFactures((f, chemin) => {
    const nom = f.getName();
    if (!EXTENSIONS_FACTURE.test(nom)) return true;
    const date = dateFacture(f, nom);
    if (date < limite) return true;
    if (m && (nom + chemin).toUpperCase().replace(/[^A-Z0-9]/g, '').indexOf(m) < 0) return true;
    out.push({ id: f.getId(), nom, dossier: chemin, date });
    return true;
  });
  out.sort((a, b) => b.date.localeCompare(a.date) || b.nom.localeCompare(a.nom));
  return out.slice(0, Math.min(Number(max) || 150, 300));
}

// ---------------------------------------------------------------- cache de lecture des factures (écrit dans APPLI V2 seulement)

/** Lectures déjà faites pour ces factures. Valables seulement si l'empreinte (date de modification du PDF) n'a pas changé. */
function lireCacheFactures(ids) {
  const voulus = new Set((Array.isArray(ids) ? ids : []).filter(i => ID_VALIDE.test(String(i))).slice(0, 200));
  if (!voulus.size) return {};
  const maj = {};
  lireJson(FICHIER_A_TRAITER, { elements: [] }).elements.forEach(x => { if (voulus.has(x.id)) maj[x.id] = x.maj; });
  const out = {};
  const it = dossierCache().getFiles();
  while (it.hasNext()) {
    const f = it.next(), nom = f.getName();
    const id = nom.replace(/\.json$/, '');
    if (!voulus.has(id) || !(id in maj)) continue;
    try {
      const v = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
      if (v.empreinte === maj[id]) out[id] = { fournisseur: v.fournisseur, montant: v.montant, nb: v.nb };
    } catch (x) { }
  }
  return out;
}

/** Garde la lecture faite par l'appli (le script ne sait pas lire un PDF sans écrire dans le Drive : c'est l'appli qui lit, comme la V1). */
function ecrireCacheFacture(id, fournisseur, montant, nb) {
  if (!ID_VALIDE.test(String(id))) return { ok: false, erreur: 'identifiant invalide' };
  const el = lireJson(FICHIER_A_TRAITER, { elements: [] }).elements.find(x => x.id === id);
  if (!el) return { ok: true, ignore: true }; // pas une facture de « À traiter » : rien à garder
  const m = Number(montant), n = Number(nb);
  const valeur = {
    empreinte: el.maj,
    fournisseur: String(fournisseur || '').slice(0, 60),
    montant: isFinite(m) ? Math.round(m * 100) / 100 : null,
    nb: isFinite(n) ? Math.round(n) : null,
    ecrit: new Date().toISOString()
  };
  const dossierC = dossierCache(), texte = JSON.stringify(valeur);
  const it = dossierC.getFilesByName(id + '.json');
  if (it.hasNext()) it.next().setContent(texte); else dossierC.createFile(id + '.json', texte, 'application/json');
  return { ok: true };
}

/** Contenu d'une facture de FACTURES ACHAT (lecture seule : getBlob). Un identifiant hors de ce dossier est refusé. */
function lireFacture(id) {
  let trouve = null;
  parcourirFactures(f => { if (f.getId() === id) { trouve = f; return false; } return true; });
  if (!trouve) throw new Error('facture non autorisée');
  if (trouve.getSize() > 20 * 1024 * 1024) throw new Error('fichier trop gros');
  return { nom: trouve.getName(), type: trouve.getMimeType(), base64: Utilities.base64Encode(trouve.getBlob().getBytes()) };
}

// ---------------------------------------------------------------- exports StorePOS (lecture seule)

function listerExports() {
  const out = [];
  const it = dossierExports().getFiles(); // fichiers directs seulement : ANCIENS est ignoré
  while (it.hasNext()) {
    const f = it.next();
    if (!EXTENSIONS_EXPORT.test(f.getName())) continue;
    out.push({ id: f.getId(), nom: f.getName(), maj: f.getLastUpdated().toISOString(), taille: f.getSize() });
  }
  out.sort((a, b) => b.maj.localeCompare(a.maj));
  return out;
}

/** Ne renvoie que des fichiers posés directement dans EXPORTS STOREPOS. */
function lireExport(id) {
  if (!listerExports().some(x => x.id === id)) throw new Error('fichier non autorisé');
  const f = DriveApp.getFileById(id);
  return { nom: f.getName(), maj: f.getLastUpdated().toISOString(), base64: Utilities.base64Encode(f.getBlob().getBytes()) };
}

// ---------------------------------------------------------------- documents partagés entre appareils

function nomDoc(doc) {
  if (!/^[a-z0-9-]{1,40}$/.test(String(doc || ''))) throw new Error('document non autorisé');
  return 'doc-' + doc + '.json';
}
function lireDoc(doc) {
  const d = lireJson(nomDoc(doc), { version: 0, valeur: null, maj: null });
  return { version: d.version, valeur: d.valeur, maj: d.maj };
}
/** Écriture avec contrôle de version : si un autre appareil a écrit entre-temps, on refuse et l'appli fusionne. */
function ecrireDoc(doc, valeur, version) {
  const verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    const nom = nomDoc(doc);
    const d = lireJson(nom, { version: 0, valeur: null, maj: null });
    if (Number(version) !== d.version) return { ok: false, conflit: true, version: d.version, valeur: d.valeur };
    const nouveau = { version: d.version + 1, valeur, maj: new Date().toISOString() };
    ecrireJson(nom, nouveau);
    return { ok: true, version: nouveau.version };
  } finally { verrou.releaseLock(); }
}

// ---------------------------------------------------------------- mode invité (aucune écriture dans le Drive : tout est dans les propriétés du script)

/** Empreinte SHA-256 : ni le code ni le jeton ne sont gardés en clair. */
function empreinte(t) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(t), Utilities.Charset.UTF_8));
}
function lireProp(nom, defaut) { try { return JSON.parse(props().getProperty(nom) || '') || defaut; } catch (x) { return defaut; } }
function ecrireProp(nom, v) { props().setProperty(nom, JSON.stringify(v)); }
function mailAdmin() { return props().getProperty('MAIL_ADMIN') || Session.getEffectiveUser().getEmail(); }

/** Un invité demande l'accès : un code à 6 chiffres part par e-mail au responsable. Le code n'est jamais renvoyé à l'appli. */
function inviteDemande(nom) {
  const verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    const maintenant = Date.now();
    const journal = lireProp('INVITE_JOURNAL', []).filter(t => maintenant - t < 3600e3);
    if (journal.length >= DEMANDES_PAR_HEURE) return { ok: false, erreur: 'trop de demandes : réessaie dans une heure' };
    const qui = String(nom || '').replace(/[^\p{L}\p{N} '.-]/gu, '').trim().slice(0, 30) || 'Un invité';
    const demandes = lireProp('INVITE_DEMANDES', {});
    for (const k of Object.keys(demandes)) if (demandes[k].exp < maintenant) delete demandes[k];
    const id = Utilities.getUuid().replace(/-/g, '');
    const code = String(parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 12), 16) % 1000000).padStart(6, '0');
    demandes[id] = { h: empreinte(id + code), exp: maintenant + DUREE_CODE_MS, essais: 0, nom: qui };
    journal.push(maintenant);
    ecrireProp('INVITE_DEMANDES', demandes); ecrireProp('INVITE_JOURNAL', journal);
    const heure = Utilities.formatDate(new Date(), 'Europe/Paris', 'HH:mm');
    MailApp.sendEmail(mailAdmin(), `Code invité : ${code}`,
      `${qui} demande un accès invité à l'appli (${heure}).\n\nCode : ${code}\n\nDonne-lui ce code seulement si tu le connais. ` +
      `Il est valable 15 minutes et ouvre une session de 6 heures sur son téléphone : prix, ventes et liste d'achat, sans les factures ni les réglages.\n\n` +
      `Pour couper tout de suite toutes les sessions invitées : Réglages › Arrêter les sessions invitées.`);
    return { ok: true, demande: id, minutes: DUREE_CODE_MS / 60e3 };
  } finally { verrou.releaseLock(); }
}

/** L'invité tape le code : s'il est bon, il reçoit un jeton valable 6 h. 5 essais au plus par code. */
function inviteValider(id, code) {
  const verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    const demandes = lireProp('INVITE_DEMANDES', {});
    const d = demandes[String(id || '')];
    if (!d || d.exp < Date.now()) { if (d) { delete demandes[id]; ecrireProp('INVITE_DEMANDES', demandes); } return { ok: false, erreur: 'code expiré : demande un nouveau code' }; }
    d.essais++;
    if (!egalTempsConstant(empreinte(id + String(code || '').replace(/\D/g, '')), d.h)) {
      if (d.essais >= ESSAIS_CODE) { delete demandes[id]; ecrireProp('INVITE_DEMANDES', demandes); return { ok: false, erreur: 'trop d\'essais : demande un nouveau code' }; }
      ecrireProp('INVITE_DEMANDES', demandes);
      return { ok: false, erreur: `code faux (encore ${ESSAIS_CODE - d.essais} essai${ESSAIS_CODE - d.essais > 1 ? 's' : ''})` };
    }
    delete demandes[id]; ecrireProp('INVITE_DEMANDES', demandes);
    const jeton = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    const fin = Date.now() + DUREE_INVITE_MS;
    const sessions = purgerSessions(lireProp('INVITE_SESSIONS', {}));
    sessions[empreinte(jeton)] = { fin, nom: d.nom };
    ecrireProp('INVITE_SESSIONS', sessions);
    return { ok: true, jeton, fin, nom: d.nom };
  } finally { verrou.releaseLock(); }
}

function purgerSessions(s) { const m = Date.now(); for (const k of Object.keys(s)) if (s[k].fin < m) delete s[k]; return s; }
/** Session invitée encore valable pour ce jeton, sinon null. */
function sessionInvite(jeton) {
  if (!/^[a-f0-9]{64}$/.test(String(jeton || ''))) return null;
  const s = lireProp('INVITE_SESSIONS', {})[empreinte(jeton)];
  return s && s.fin > Date.now() ? s : null;
}
/** Réglages › Arrêter les sessions invitées (avec la clé du magasin seulement). */
function arreterInvites() {
  const n = Object.keys(purgerSessions(lireProp('INVITE_SESSIONS', {}))).length;
  props().deleteProperty('INVITE_SESSIONS'); props().deleteProperty('INVITE_DEMANDES');
  return { ok: true, arretees: n };
}

// ---------------------------------------------------------------- installation et déclencheur

function passage15min() {
  purgerClePrecedente();
  try { const s = lireProp('INVITE_SESSIONS', null); if (s) ecrireProp('INVITE_SESSIONS', purgerSessions(s)); } catch (x) { }
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(1000)) return;
  try { chercherFactures(); } finally { verrou.releaseLock(); }
}

function installer() {
  const p = props();
  if (!p.getProperty('CLE_APPLI')) throw new Error('Ajoute d\'abord la propriété CLE_APPLI (Paramètres du projet › Propriétés du script).');
  dossierFactures(); dossierExports(); dossierV2();
  console.log('Adresse qui reçoit les codes invités : ' + mailAdmin());
  if (!p.getProperty('DEPUIS')) p.setProperty('DEPUIS', String(Date.now() - 7 * 864e5));
  const existe = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'passage15min');
  if (!existe) ScriptApp.newTrigger('passage15min').timeBased().everyMinutes(15).create();
  chercherFactures();
  console.log('Installé : dossiers trouvés, déclencheur toutes les 15 minutes, premier passage fait.');
}
