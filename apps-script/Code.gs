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
 * CHANGER LA CLÉ : écrire la nouvelle valeur dans la propriété CLE_NOUVELLE, puis exécuter rotationCle().
 * L'ancienne clé reste acceptée 7 jours, le temps de mettre à jour chaque appareil.
 *
 * RÈGLES (voir CLAUDE.md) :
 *  - FACTURES ACHAT et EXPORTS STOREPOS sont en LECTURE SEULE : rien n'y est déplacé, renommé, supprimé ni écrit.
 *  - Ce script n'écrit que dans le dossier « APPLI V2 », rangé dans « APPLI ETIQUETTES CORBEILLE ».
 *  - Le secret n'apparaît jamais dans un journal ni dans une réponse.
 */

const VERSION = 2;
const NOM_FACTURES = 'FACTURES ACHAT';
const NOM_EXPORTS = 'EXPORTS STOREPOS';
const NOM_APPLI = 'APPLI ETIQUETTES CORBEILLE';
const NOM_V2 = 'APPLI V2';
const FICHIER_A_TRAITER = 'a-traiter.json';
const JOURS_CLE_PRECEDENTE = 7;
const EXTENSIONS_FACTURE = /\.(pdf|jpe?g|png|heic)$/i;
const EXTENSIONS_EXPORT = /\.(xlsx|csv|txt)$/i;

const props = () => PropertiesService.getScriptProperties();

// ---------------------------------------------------------------- entrée Web

function doPost(e) {
  let req = {};
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { return repondre({ ok: false }); }
  if (!cleValide(req.cle)) return repondre({ ok: false });
  try {
    switch (req.action) {
      case 'ping': return repondre({ ok: true, version: VERSION });
      case 'aTraiter': return repondre({ ok: true, ...lireATraiter() });
      case 'rafraichir': return repondre({ ok: true, ...rafraichir() });
      case 'traiter': return repondre({ ok: true, ...marquer(req.id, req.etat, req.par) });
      case 'exports': return repondre({ ok: true, fichiers: listerExports() });
      case 'fichier': return repondre({ ok: true, ...lireExport(req.id) });
      case 'factures': return repondre({ ok: true, factures: listerFactures(req.mot, req.max) });
      case 'facture': return repondre({ ok: true, ...lireFacture(req.id) });
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

/** Parcourt FACTURES ACHAT en lecture seule et ajoute les nouvelles factures à « À traiter ». */
function chercherFactures() {
  const p = props();
  const depuis = Number(p.getProperty('DEPUIS') || (Date.now() - 7 * 864e5));
  const etat = lireJson(FICHIER_A_TRAITER, { derniere: null, elements: [] });
  const connus = new Set(etat.elements.map(x => x.id));
  const debut = new Date().toISOString();
  const seuil = new Date(depuis).toISOString().slice(0, 19);
  let ajoutes = 0;
  const parcourir = (dossierCourant, chemin, profondeur) => {
    const fichiers = dossierCourant.searchFiles('modifiedDate > "' + seuil + '" and trashed = false');
    while (fichiers.hasNext()) {
      const f = fichiers.next();
      const nom = f.getName();
      if (connus.has(f.getId()) || !EXTENSIONS_FACTURE.test(nom)) continue;
      etat.elements.push({
        id: f.getId(), type: 'facture', nom, dossier: chemin,
        cree: f.getDateCreated().toISOString(), maj: f.getLastUpdated().toISOString(),
        url: 'https://drive.google.com/file/d/' + f.getId() + '/view', etat: 'nouveau'
      });
      connus.add(f.getId()); ajoutes++;
    }
    if (profondeur >= 4) return;
    const sous = dossierCourant.getFolders();
    while (sous.hasNext()) { const d = sous.next(); parcourir(d, chemin ? chemin + ' › ' + d.getName() : d.getName(), profondeur + 1); }
  };
  parcourir(dossierFactures(), '', 0);
  // on garde les éléments traités 30 jours, les nouveaux toujours
  const limite = Date.now() - 30 * 864e5;
  etat.elements = etat.elements.filter(x => x.etat !== 'traite' || Date.parse(x.traiteLe || x.cree) > limite);
  etat.derniere = debut;
  ecrireJson(FICHIER_A_TRAITER, etat);
  return { ajoutes };
}

function lireATraiter() {
  const etat = lireJson(FICHIER_A_TRAITER, { derniere: null, elements: [] });
  etat.elements.sort((a, b) => (a.etat === b.etat ? 0 : a.etat === 'nouveau' ? -1 : 1) || String(b.cree).localeCompare(String(a.cree)));
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

/** Les factures les plus récentes (nom commençant par la date), filtrées par un mot du nom ou du dossier. */
function listerFactures(mot, max) {
  const m = String(mot || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const out = [];
  parcourirFactures((f, chemin) => {
    const nom = f.getName();
    if (!EXTENSIONS_FACTURE.test(nom)) return true;
    if (m && (nom + chemin).toUpperCase().replace(/[^A-Z0-9]/g, '').indexOf(m) < 0) return true;
    out.push({ id: f.getId(), nom, dossier: chemin, cree: f.getDateCreated().toISOString(), taille: f.getSize() });
    return true;
  });
  out.sort((a, b) => b.nom.localeCompare(a.nom));
  return out.slice(0, Math.min(Number(max) || 40, 100));
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

// ---------------------------------------------------------------- installation et déclencheur

function passage15min() {
  purgerClePrecedente();
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(1000)) return;
  try { chercherFactures(); } finally { verrou.releaseLock(); }
}

function installer() {
  const p = props();
  if (!p.getProperty('CLE_APPLI')) throw new Error('Ajoute d\'abord la propriété CLE_APPLI (Paramètres du projet › Propriétés du script).');
  dossierFactures(); dossierExports(); dossierV2();
  if (!p.getProperty('DEPUIS')) p.setProperty('DEPUIS', String(Date.now() - 7 * 864e5));
  const existe = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'passage15min');
  if (!existe) ScriptApp.newTrigger('passage15min').timeBased().everyMinutes(15).create();
  chercherFactures();
  console.log('Installé : dossiers trouvés, déclencheur toutes les 15 minutes, premier passage fait.');
}
