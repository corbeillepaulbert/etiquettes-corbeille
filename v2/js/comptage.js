// Lot 7 : écrans de comptage (inventoriste en mode invité, et gérant qui compte aussi).
// Les comptages restent sur le téléphone et partent par paquets toutes les 10 secondes ; sans réseau, ils attendent.
// L'inventoriste ne voit jamais de prix, de ventes ni de stock : seulement les noms des produits.
import { lire, ecrire, etat, trouver } from './donnees.js';
import { barreMode, joli } from './ecrans.js';
import { icone } from './icones.js';
import { ouvrirScanner } from './moteur/scan.js';
import { appelInv, estInventoriste, infoInventoriste } from './drive.js';
import { FIN, lignesActives, avancement, nouvelId } from './inv-calcul.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const heure = t => new Date(t).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
let S = { inv: null, appareil: '', zone: '', mes: [], envoyees: 0, autres: {}, depuis: {}, n: 0 };
let PROD = {};                 // e -> nom (liste envoyée par le gérant, sans prix)
let C = null;                  // produit en cours : { e, nom, rem?, saisie, confirmer }
let synchro = null, timer = null, surMaj = null;

export async function chargerComptage() {
  S = { ...S, ...(await lire('invTel', {})) };
  if (!S.appareil) { S.appareil = Array.from(crypto.getRandomValues(new Uint8Array(10)), b => b.toString(16).padStart(2, '0')).join(''); await sauver(); }
  PROD = await lire('invProduits', {});
}
const sauver = () => ecrire('invTel', S);
export const qui = () => estInventoriste() ? infoInventoriste().prenom : 'Gérant';
export const inventaireCourant = () => S.inv;
export const enAttente = () => S.mes.length - S.envoyees;
/** Toutes les lignes connues : les miennes et celles des autres téléphones. */
export function toutesLignes() {
  const autres = Object.entries(S.autres).filter(([a]) => a !== S.appareil).flatMap(([, x]) => x.lignes);
  return [...autres, ...S.mes.map(l => ({ ...l, qui: l.qui || qui() }))];
}
const nomDe = e => PROD[e] || (etat.produits[e] ? etat.produits[e].lib : '') || (trouver(e) ? trouver(e).lib : '');
export const zones = () => (S.inv && S.inv.zones) || [];
const zoneNom = id => (zones().find(z => z.id === id) || {}).nom || id;

/** Envoie ce qui attend, puis lit ce que les autres ont compté. Une seule synchronisation à la fois. */
export async function synchroniser() {
  if (synchro) return synchro;
  synchro = (async () => {
    if (!navigator.onLine) return false;
    const aEnvoyer = S.mes.slice(S.envoyees);
    if (aEnvoyer.length) { await appelInv('invEnvoyer', { appareil: S.appareil, lignes: aEnvoyer.slice(0, 500) }); S.envoyees += Math.min(500, aEnvoyer.length); }
    const r = await appelInv('invLire', { depuis: S.depuis });
    if (r.inv && (!S.inv || S.inv.id !== r.inv.id)) { S.autres = {}; S.depuis = {}; if (S.inv && S.inv.id !== r.inv.id) { S.mes = []; S.envoyees = 0; } }
    S.inv = r.inv;
    for (const [a, x] of Object.entries(r.appareils || {})) {
      const o = S.autres[a] || (S.autres[a] = { qui: x.qui, lignes: [] });
      o.qui = x.qui; o.lignes.push(...x.lignes); S.depuis[a] = x.total;
    }
    if (!Object.keys(PROD).length) { const p = await appelInv('invProduits'); PROD = Object.fromEntries(p.produits || []); await ecrire('invProduits', PROD); }
    await sauver();
    return true;
  })().catch(x => { console.warn('[V2/Inventaire] synchronisation :', x.message); return false; }).finally(() => { synchro = null; });
  return synchro;
}
/** Toutes les 10 secondes tant qu'un écran d'inventaire est ouvert ; `apres` redessine l'écran. */
export function demarrer(apres) { surMaj = apres; if (!timer) timer = setInterval(async () => { if (await synchroniser() && surMaj) surMaj(); }, 10000); }
export function arreter() { clearInterval(timer); timer = null; surMaj = null; }

async function ajouterLigne(l) { const x = { id: nouvelId(), t: new Date().toISOString(), qui: qui(), ...l }; S.mes.push(x); await sauver(); synchroniser(); return x; }

// ---------- écrans ----------
const barre = droite => barreMode('inventaire', droite, true);
function bandeauEnvoi() {
  const n = enAttente();
  return n ? `<div class="bandeau bandeau--alerte">${icone('info', 'cb-ico cb-ico--24')}<span>${n} comptage${n > 1 ? 's' : ''} en attente d'envoi${navigator.onLine ? '' : ' : pas de réseau, ils partiront tout seuls'}</span></div>` : '';
}

export function ecranZones(nav, message = '') {
  const Z = zones(), A = avancement(toutesLignes(), Z), meres = Z.filter(z => !z.parent);
  const etatZ = z => { const a = A[z.id]; if (!a) return ['À faire', '']; if (a.finie) return [`Finie · ${esc(a.finie)}`, 'var(--succes)']; if (a.produits.size) return [`En cours · ${[...a.qui].map(esc).join(', ')} · ${a.produits.size} produit${a.produits.size > 1 ? 's' : ''}`, 'var(--inventaire)']; return ['À faire', '']; };
  const ligne = z => { const [t, c] = etatZ(z); return `<button class="ligne" data-action="inv-zone" data-z="${esc(z.id)}" style="border:0;font:inherit;text-align:left;width:100%"><div class="ligne__txt"><div class="ligne__titre">${esc(z.nom)}</div><div class="ligne__detail"${c ? ` style="color:${c};font-weight:600"` : ''}>${t}</div></div>${icone('chevron', 'cb-ico cb-ico--24')}</button>`; };
  const groupe = m => { const s = Z.filter(z => z.parent === m.id); const f = s.filter(z => A[z.id] && A[z.id].finie).length;
    return `<div style="display:grid;gap:8px"><div class="accueil__haut"><h2 class="titre-3">${esc(m.nom)}</h2><span class="note">${f} finie${f > 1 ? 's' : ''} sur ${s.length}</span></div>${s.map(ligne).join('') || ligne(m)}</div>`; };
  nav.afficher(`<div class="scr cb" data-ecran="inv-zones">${barre(qui())}
  <div class="scr__corps">
    <h1 class="titre-1">Où comptes-tu ?</h1>
    ${message ? `<div class="bandeau bandeau--alerte">${icone('info', 'cb-ico cb-ico--24')}<span>${esc(message)}</span></div>` : ''}
    ${bandeauEnvoi()}
    ${S.inv ? meres.map(groupe).join('') : '<div class="carte"><div class="titre-2">Chargement de l\'inventaire…</div><div class="note" style="margin-top:8px">Il faut du réseau la première fois.</div></div>'}
    <div class="note">Une sous-zone finie peut encore être recomptée.</div>
  </div>
  <div class="scr__bas">${estInventoriste() ? '<button class="btn btn--discret" data-action="inv-quitter">Quitter l\'inventaire</button>' : '<button class="btn btn--secondaire" data-action="inv-gerant">Retour au suivi</button>'}</div></div>`, 'inv-zones');
}

function pave(saisie) {
  const t = (v, txt = v, cls = '') => `<button class="btn inv-touche ${cls}" data-action="inv-touche" data-v="${v}"${v === '<' ? ' aria-label="Effacer"' : ''}>${txt}</button>`;
  return `<div class="inv-pave">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => t(n)).join('')}${t('<', '‹', 'inv-touche--gris')}${t(0)}${t('+1', '+1', 'inv-touche--plus')}</div>`;
}

export function ecranCompter(nav, message = '') {
  const z = S.zone, mes = S.mes.filter(l => l.z === z && !l.ann && l.e !== FIN), annulees = new Set(S.mes.filter(l => l.ann).map(l => l.ann));
  const recents = mes.filter(l => !annulees.has(l.id)).slice(-5).reverse();
  let corps;
  if (C) {
    const ici = lignesActives(toutesLignes()).filter(l => l.z === z && l.e === C.e && (!C.rem || l.id !== C.rem));
    const q = C.saisie === '' ? '–' : C.saisie;
    corps = `<div class="carte" style="display:grid;gap:2px"><div class="titre-2" style="overflow-wrap:anywhere">${esc(joli(C.nom) || 'Code inconnu')}</div><div class="note">${esc(C.e)}${C.rem ? ' · correction' : ''}</div></div>
      ${ici.length ? `<div class="bandeau bandeau--alerte">${icone('info', 'cb-ico cb-ico--24')}<span>Déjà compté ici : ${ici.map(l => `${esc(l.qui)} ${l.q}`).join(', ')}. ${C.rem ? '' : 'Ton chiffre sera un recomptage.'}</span></div>` : ''}
      ${C.confirmer ? `<div class="bandeau bandeau--alerte">${icone('alerte', 'cb-ico cb-ico--24')}<span>${esc(q)} : c'est bien ça ? Touche encore « Valider ».</span></div>` : ''}
      <div class="accueil__haut"><span class="fort">Combien ?</span><b class="inv-qte" data-inv-qte>${esc(q)}</b></div>
      ${pave(C.saisie)}`;
  } else {
    corps = `<div class="carte"><div class="titre-2">${mes.length ? 'Produit suivant' : 'Scanne le premier produit'}</div><div class="note" style="margin-top:8px">Scanne, tape la quantité, valide. Compte à l'unité.</div></div>`;
  }
  nav.afficher(`<div class="scr cb" data-ecran="inv-compter">${barre(`${zoneNom(z)} · ${qui()}`)}
  <div class="scr__corps">
    ${message ? `<div class="bandeau bandeau--alerte">${icone('info', 'cb-ico cb-ico--24')}<span>${esc(message)}</span></div>` : ''}
    ${bandeauEnvoi()}
    ${corps}
    ${!C && recents.length ? `<h2 class="titre-3">Mes derniers comptages</h2>${recents.map(l => `<div class="ligne"><div class="ligne__txt"><div class="ligne__titre">${esc(joli(nomDe(l.e)) || l.e)}</div><div class="ligne__detail">${l.q} · ${heure(l.t)}</div></div><button class="btn btn--secondaire" data-action="inv-corriger" data-id="${esc(l.id)}">Corriger</button></div>`).join('')}` : ''}
    ${!C ? `<button class="btn btn--secondaire" data-action="inv-finie">J'ai fini cette sous-zone</button>` : ''}
  </div>
  <div class="scr__bas">${C ? `<button class="btn btn--principal btn--inventaire" data-action="inv-valider" data-suite="1">Valider et scanner le suivant</button>
    <div class="duo"><button class="btn btn--secondaire" data-action="inv-valider">Valider</button><button class="btn btn--discret" data-action="inv-abandon">Laisser tomber</button></div>`
    : `<button class="btn btn--principal btn--inventaire" data-action="inv-scanner">${icone('scan')}Scanner un produit</button>
    <button class="btn btn--discret" data-action="inv-zones">Changer de sous-zone</button>`}</div></div>`, 'inv-compter');
}

function scanner(nav) {
  ouvrirScanner({ mode: 'inventaire', qui: zoneNom(S.zone), titre: 'Scanne le produit à compter',
    onCode: c => { const p = trouver(c), e = p ? p.e : c; C = { e, nom: nomDe(e) || (p ? p.lib : ''), saisie: '' }; ecranCompter(nav); return { ok: true, txt: c }; },
    onFermer: () => ecranCompter(nav) });
}

async function valider(nav, suite) {
  if (!C) return;
  const q = parseInt(C.saisie, 10);
  if (!(q >= 0)) { ecranCompter(nav, 'Tape la quantité.'); return; }
  if (q > 200 && !C.confirmer) { C.confirmer = true; ecranCompter(nav); return; }
  const l = await ajouterLigne({ e: C.e, q, z: S.zone, ...(C.rem ? { rem: C.rem } : {}) });
  const nom = joli(C.nom) || C.e; C = null;
  if (suite) scanner(nav); else ecranCompter(nav);
  nav.toast(`${nom} : ${q}`, async () => { await ajouterLigne({ e: l.e, q: 0, z: l.z, ann: l.id }); if (document.querySelector('[data-ecran="inv-compter"]')) ecranCompter(nav); });
}

/** Actions des écrans de comptage. */
export async function actionComptage(a, b, nav) {
  if (!a.startsWith('inv-')) return false;
  if (a === 'inv-zones') { C = null; ecranZones(nav); synchroniser().then(ok => ok && document.querySelector('[data-ecran="inv-zones"]') && ecranZones(nav)); demarrer(() => { if (document.querySelector('[data-ecran="inv-zones"]')) ecranZones(nav); }); return true; }
  if (a === 'inv-zone') { S.zone = b.dataset.z; C = null; await sauver(); ecranCompter(nav); demarrer(() => { if (document.querySelector('[data-ecran="inv-compter"]') && !C) ecranCompter(nav); }); return true; }
  if (a === 'inv-scanner') { scanner(nav); return true; }
  if (a === 'inv-touche' && C) {
    const v = b.dataset.v, etait = C.confirmer; C.confirmer = false;
    if (v === '<') C.saisie = C.saisie.slice(0, -1);
    else if (v === '+1') C.saisie = String((parseInt(C.saisie, 10) || 0) + 1);
    else if (C.saisie.length < 5) C.saisie = (C.saisie === '0' ? '' : C.saisie) + v;
    const el = document.querySelector('[data-inv-qte]'); if (el && !etait) el.textContent = C.saisie || '–'; else ecranCompter(nav);
    return true;
  }
  if (a === 'inv-valider') { await valider(nav, !!b.dataset.suite); return true; }
  if (a === 'inv-abandon') { C = null; ecranCompter(nav); return true; }
  if (a === 'inv-corriger') {
    const l = toutesLignes().find(x => x.id === b.dataset.id); if (!l) return true;
    C = { e: l.e, nom: nomDe(l.e), rem: l.id, saisie: String(l.q) }; ecranCompter(nav); return true;
  }
  if (a === 'inv-finie') {
    const l = await ajouterLigne({ e: FIN, q: 0, z: S.zone }); ecranZones(nav);
    nav.toast(`${zoneNom(l.z)} : finie`, async () => { await ajouterLigne({ e: FIN, q: 0, z: l.z, ann: l.id }); ecranZones(nav); });
    return true;
  }
  return false;
}

/** Fin de session de l'inventoriste : ce que le téléphone a reçu est effacé (après un dernier envoi si possible). */
export async function dernierEnvoi() { try { await synchroniser(); } catch (x) { } return enAttente(); }
export function oublierCourant() { C = null; arreter(); }
