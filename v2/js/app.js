// Corbeille V2 — lot 1 : accueil, scan, fiche Magasin et fiche Achat, en lecture seule.
import { etat, charger, trouver, joursVentes, importerFichier, donneesV1Disponibles, reprendreV1, sauverListe, sauverReglages } from './donnees.js';
import { ecranAccueil, ecranEclair, ecranFicheMagasin, ecranFicheAchat, barreMode, joli } from './ecrans.js';
import { calculAchat, euros } from './calcul.js';
import { icone } from './icones.js';
import { ouvrirScanner, ecouterDouchette, bip } from './moteur/scan.js';

const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let mode = 'magasin';
let courant = null; // { produit, qte }

const meta = () => ({ jours: joursVentes() });
const dateDuJour = () => new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase());

function afficher(html) { document.querySelector('.toast-zone')?.remove(); app.innerHTML = html; app.scrollTop = 0; }

function resumeDonnees() {
  const n = Object.keys(etat.produits).length;
  if (!n) return '<span class="fort" style="color:var(--alerte)">Aucun produit chargé.</span> Touche « Mettre à jour les ventes » pour commencer.';
  const v = etat.meta.ventes;
  const d = iso => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '';
  return `${n.toLocaleString('fr-FR')} produits${v ? ` · ventes mises à jour le ${d(v.date)}` : ' · pas encore de ventes'}`;
}

// ---------- écrans ----------
function accueil() {
  courant = null;
  afficher(ecranAccueil({ bonjour: 'Bonjour', date: dateDuJour(), aTraiter: 0, donnees: resumeDonnees() })
    .replace('data-action="factures">' + icone('facture') + '<b>Lire une facture</b>',
      'data-action="liste">' + icone('achat') + `<b>Ma liste d'achat${etat.liste.length ? ` (${etat.liste.length})` : ''}</b>`));
}

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
    <label class="btn btn--principal">${icone('import')}Choisir les fichiers<input type="file" accept=".xlsx,.csv,.txt" multiple hidden data-fichiers></label>
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
  ${L.length ? `<button class="btn btn--secondaire" data-action="vider">Vider la liste</button>` : ''}</div></div>`);
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
    <div class="note">Version : lot 1 (lecture seule). Données : ${resumeDonnees()}</div>
  </div>
  <div class="scr__bas"><button class="btn btn--principal" data-action="accueil">Terminé</button></div></div>`);
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
app.addEventListener('click', async e => {
  const b = e.target.closest('[data-action]'); if (!b) return;
  const a = b.dataset.action;
  if (a === 'accueil') return accueil();
  if (a === 'mode') { if (b.dataset.mode === 'inventaire') return pasEncore('inventaire'); return scanner(b.dataset.mode); }
  if (a === 'scanner') return scanner(mode);
  if (a === 'scanner-achat') return scanner('achat');
  if (a === 'donnees') return donnees();
  if (a === 'factures') return pasEncore('factures');
  if (a === 'liste') return liste();
  if (a === 'reglages') return reglages();
  if (a === 'a-traiter') return;
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
    await sauverListe();
    toast(`${courant.qte} × ${joli(p.lib)} ajouté à la liste`, async () => { etat.liste = avant; await sauverListe(); });
    return;
  }
  if (a === 'retirer') {
    const avant = etat.liste.slice(); const x = etat.liste.splice(+b.dataset.i, 1)[0];
    await sauverListe(); liste();
    toast(`${joli(x.lib)} retiré`, async () => { etat.liste = avant; await sauverListe(); liste(); });
    return;
  }
  if (a === 'vider') {
    const avant = etat.liste.slice(); etat.liste = []; await sauverListe(); liste();
    toast('Liste vidée', async () => { etat.liste = avant; await sauverListe(); liste(); });
  }
});

ecouterDouchette(code => { if (!document.querySelector('.scan-plein')) resultat(code); });

// ---------- démarrage ----------
(async () => {
  await charger();
  accueil();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => { });
})();
