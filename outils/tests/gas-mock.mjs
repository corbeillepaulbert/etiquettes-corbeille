// Drive simulé pour exécuter apps-script/Code.gs tel quel. Les dossiers en lecture seule lèvent une erreur sur toute écriture.
import vm from 'node:vm'; import fs from 'node:fs'; import crypto from 'node:crypto';
export const mails = [];
const AUTORISES = new Set(['getParents','getId','getName','getFolders','getFiles','searchFiles','getFoldersByName','getFilesByName','getDateCreated','getLastUpdated','getMimeType','getSize','getBlob']);
export const violations = [];
let n = 0; const id = () => 'id' + String(++n).padStart(14, '0');
const iter = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
function garde(obj, lectureSeule, quoi) {
  if (!lectureSeule) return obj;
  return new Proxy(obj, { get(t, k) { if (typeof t[k] === 'function' && !AUTORISES.has(k)) { violations.push(`${quoi}.${String(k)}`); throw new Error('INTERDIT ' + quoi + '.' + String(k)); } return t[k]; } });
}
export function fichier(nom, contenu, { cree = new Date(), ro = false } = {}) {
  const f = { _id: id(), _nom: nom, _c: contenu, _cree: cree, _maj: cree,
    getId() { return this._id; }, getName() { return this._nom; }, getDateCreated() { return this._cree; }, getLastUpdated() { return this._maj; },
    getMimeType() { return /\.pdf$/i.test(this._nom) ? 'application/pdf' : 'x'; }, getSize() { return Buffer.byteLength(this._c); },
    getBlob() { const c = this._c; return { getDataAsString: cs => /1252|latin/i.test(cs || '') ? Buffer.from(c).toString('latin1') : c.toString(), getBytes: () => [...Buffer.from(c)].map(b => b > 127 ? b - 256 : b) }; },
    setContent(t) { this._c = Buffer.from(t); this._maj = new Date(); } };
  return garde(f, ro, 'fichier ' + nom);
}
function dossier(nom, ro = false) {
  const d = { _id: id(), _nom: nom, _d: [], _f: [], _ro: ro,
    getId() { return this._id; }, getName() { return this._nom; },
    getFolders() { return iter(this._d); }, getFiles() { return iter(this._f); }, getParents() { return iter(this._parent ? [this._parent] : []); },
    getFoldersByName(x) { return iter(this._d.filter(y => y.getName() === x)); },
    getFilesByName(x) { return iter(this._f.filter(y => y.getName() === x)); },
    searchFiles(q) { const m = q.match(/modifiedDate > "([^"]+)"/); const s = m ? Date.parse(m[1] + 'Z') : 0; return iter(this._f.filter(f => f.getLastUpdated().getTime() > s)); },
    createFolder(x) { const c = dossier(x); c._parent = this; this._d.push(c); return c; },
    createFile(x, t) { const f = fichier(x, Buffer.from(t)); this._f.push(f); return f; } };
  return garde(d, ro, 'dossier ' + nom);
}
export function monDrive({ nf525 = null } = {}) {
  const factures = dossier('FACTURES ACHAT', true), appli = dossier('APPLI ETIQUETTES CORBEILLE'), exportsD = dossier('EXPORTS STOREPOS', true);
  const an = dossier('2026', true), metro = dossier('METRO', true); factures._d.push(an); an._d.push(metro); an._parent = factures; metro._parent = an;
  const vieux = new Date(Date.now() - 40 * 864e5);
  metro._f.push(fichier('METRO 2026-10-01.pdf', Buffer.from('%PDF'), { cree: vieux, ro: true }));
  metro._f.push(fichier('METRO 2026-11-14.pdf', Buffer.from('%PDF'), { cree: new Date(Date.now() - 3 * 864e5), ro: true }));
  appli._d.push(exportsD); exportsD._parent = appli;
  exportsD._f.push(fichier('PRODUITS STOREPOS 17_11_26.xlsx', fs.readFileSync('/home/claude/data/produits.xlsx'), { ro: true }));
  exportsD._f.push(fichier('EXPORT_PLU_01_11_25_31_10_26.xlsx', fs.readFileSync('/home/claude/data/ventes.xlsx'), { ro: true }));
  exportsD._d.push(dossier('ANCIENS', true));
  const racine = [factures, appli];
  if (nf525) { // SAUVEGARDES STOREPOS / NF525 / { SAUVEFISCAL, DONNEES_ANALYSE / LIGNES_PAR_MOIS } : tout en lecture seule
    const sauv = dossier('SAUVEGARDES STOREPOS', true), nf = dossier('NF525', true), fisc = dossier('SAUVEFISCAL', true), da = dossier('DONNEES_ANALYSE', true), lm = dossier('LIGNES_PAR_MOIS', true);
    sauv._d.push(nf); nf._parent = sauv; nf._d.push(fisc, da); fisc._parent = nf; da._parent = nf; da._d.push(lm); lm._parent = da;
    fisc._f.push(fichier('20261126_TPV1_ARCHIVE.zip', Buffer.from('PK'), { ro: true }));
    for (const f of fs.readdirSync(nf525)) if (/\.csv$/.test(f)) da._f.push(fichier(f, fs.readFileSync(nf525 + '/' + f), { ro: true }));
    for (const f of fs.readdirSync(nf525 + '/LIGNES_PAR_MOIS')) lm._f.push(fichier(f, fs.readFileSync(nf525 + '/LIGNES_PAR_MOIS/' + f), { ro: true }));
    racine.push(sauv);
  }
  const tout = []; const walk = d => { tout.push(d); d._d.forEach(walk); }; racine.forEach(walk);
  const props = {};
  const ctx = {
    console, Date, JSON, String, Number, Set, Math, Error,
    DriveApp: {
      getFolderById: x => { const f = tout.find(d => d.getId() === x) || (walk(appli), tout.find(d => d.getId() === x)); return f; },
      getFoldersByName: x => iter(tout.filter(d => d.getName() === x)),
      getFileById: x => { const tous = []; const w = d => { tous.push(d); d._d.forEach(w); }; racine.forEach(w); for (const d of tous) { const f = d._f.find(f => f.getId() === x); if (f) { if (!f.getParents) Object.defineProperty(f, 'getParents', { value: () => iter([d]) }); return f; } } throw new Error('introuvable'); }
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => { }, releaseLock: () => { } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ texte: t, setMimeType() { return this; } }) },
    Utilities: { base64Encode: b => Buffer.from(b.map(x => x & 255)).toString('base64'), getUuid: () => crypto.randomUUID(),
      computeDigest: (a, t) => [...crypto.createHash('sha256').update(String(t)).digest()], DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      base64EncodeWebSafe: b => Buffer.from(b.map(x => x & 255)).toString('base64url'), formatDate: (d, tz, f) => /yyyy/.test(f || '') ? new Date(d).toISOString().slice(0, 10) : '14:12' },
    MailApp: { sendEmail: (a, sujet, corps) => mails.push({ a, sujet, corps }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'magasin@gmail.com' }) },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => { } }) }) }) }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('/home/claude/etiquettes-corbeille/apps-script/Code.gs', 'utf8'), ctx);
  return { ctx, props, metro, factures, appli };
}
