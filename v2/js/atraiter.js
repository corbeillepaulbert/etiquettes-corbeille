// Écran « À traiter » : une file d'attente de factures, pas une liste de fichiers.
import { icone } from './icones.js';
import { barreMode } from './ecrans.js';
import { fournisseurDe } from './fournisseurs.js';
import { lecture } from './lectures.js';
import { estEnCours } from './facture.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const heure = iso => iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
const MOTS_VIDES = /^(FACTURE|FACTURES|BL|AVOIR|COPIE|SCAN|PDF|N|NO)$/;

let onglet = 'todo';            // todo | cours | faites | archives
export const ongletAT = () => onglet;
export const choisirOnglet = o => { onglet = o; };

/** Le nom du fournisseur, lisible : jamais le nom du fichier. */
export function nomFournisseur(x, liste) {
  const brut = String(x.nom || '').replace(/\.[a-z0-9]{3,4}$/i, '');
  const morceaux = brut.split('_').map(m => m.replace(/\d{4}[-_.]\d{2}[-_.]\d{2}/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  let n = morceaux.find(m => /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ '&.-]{2,}$/.test(m) && !MOTS_VIDES.test(m.toUpperCase()));
  if (!n) n = fournisseurDe(x, liste) || String(x.dossier || '').split('›').pop().trim() || 'Fournisseur à identifier';
  // « METRO » → « Metro », « GLOBAL FOOD » → « Global Food »
  return n.toLowerCase().replace(/(^|[\s'-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
}

const jours = date => Math.max(0, Math.floor((Date.now() - new Date(date + 'T12:00').getTime()) / 864e5));
const dateLongue = date => new Date(date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const dateDe = x => x.date || String(x.cree || '').slice(0, 10);

function carte(x, liste) {
  const d = dateDe(x), j = jours(d), l = lecture(x.id), fait = x.etat === 'traite', cours = !fait && estEnCours(x.id);
  const vieux = !fait && !cours && j >= 7;
  const classe = fait ? 'fait' : cours ? 'cours' : vieux ? 'vieux' : 'neuf';
  const badge = fait ? ['Traitée', 'fait'] : cours ? ['En cours', 'cours'] : [vieux ? 'À traiter' : 'À traiter', vieux ? 'vieux' : 'neuf'];
  const quand = j === 0 ? ' · aujourd\'hui' : j === 1 ? ' · hier' : '';
  return `<div class="at-carte at-carte--${classe}" data-id="${esc(x.id)}">
    <div class="at-l1"><div class="at-four">${esc(nomFournisseur(x, liste))}</div><span class="at-badge at-badge--${badge[1]}">${badge[0]}</span></div>
    <div class="at-date">${esc(dateLongue(d))}${quand}</div>
    ${vieux ? `<div class="at-sous">En attente depuis ${j} jours</div>` : ''}
    <div class="at-infos"><span class="at-mt">${l && l.montant != null ? euro.format(l.montant) : '—'}</span><span class="at-nb">${l && l.nb != null ? `${l.nb} produit${l.nb > 1 ? 's' : ''}` : '— produits'}</span></div>
    ${fait ? `<div class="at-note">Traitée le ${new Date(x.traiteLe || x.cree).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}${x.traitePar ? ` · ${esc(x.traitePar)}` : ''}</div>` : ''}
    ${fait ? '' : `<button class="btn btn--principal at-traiter" data-action="at-traiter" data-id="${esc(x.id)}" data-date="${esc(d)}">${cours ? 'Reprendre' : 'Traiter'}</button>`}
    <div class="at-liens"><button class="at-lien" data-action="at-voir" data-id="${esc(x.id)}">Voir la facture</button>${fait ? '' : `<button class="at-lien at-lien--gris" data-action="traite" data-id="${esc(x.id)}">Déjà traitée</button>`}</div>
  </div>`;
}

/** { relie, elements, masques, actif, recu, derniere, message, erreur, liste } → HTML de l'écran. */
export function ecranATraiter({ relie, elements, masques = [], actif = true, recu, derniere, message = '', erreur = '', liste }) {
  if (!relie) {
    return `<div class="scr cb">${barreMode('magasin', 'À traiter', true)}<div class="scr__corps"><h1 class="titre-1">À traiter</h1>
      <div class="carte"><div class="titre-2">Pas encore relié au Drive.</div><div class="note" style="margin-top:8px">Relie l'appli dans Réglages pour voir arriver les factures toutes seules.</div></div></div>
      <div class="scr__bas"><button class="btn btn--principal" data-action="reglages">Ouvrir les réglages</button></div></div>`;
  }
  const tri = a => a.slice().sort((p, q) => dateDe(q).localeCompare(dateDe(p)));
  const limite30 = Date.now() - 30 * 864e5, quand = x => Date.parse(x.traiteLe || x.cree) || 0;
  const nouveaux = elements.filter(x => x.etat === 'nouveau');
  const todo = tri(nouveaux.filter(x => !estEnCours(x.id))), cours = tri(nouveaux.filter(x => estEnCours(x.id)));
  const traitees = elements.filter(x => x.etat === 'traite');
  const faites = tri(traitees.filter(x => quand(x) >= limite30)), archives = tri(traitees.filter(x => quand(x) < limite30));
  if (onglet === 'archives' && !archives.length) onglet = 'faites';
  const liste_ = { todo, cours, faites, archives }[onglet] || todo;
  const onglets = [['todo', 'À traiter', todo.length], ['cours', 'En cours', cours.length], ['faites', 'Traitées', faites.length]];
  const vide = { todo: ['Rien à traiter.', 'Les nouvelles factures du dossier FACTURES ACHAT arrivent ici toutes seules, toutes les 15 minutes.'], cours: ['Aucune facture en cours.', 'Touche « Traiter » sur une facture : elle passe ici jusqu\'à ce que tu la valides (3 au plus).'], faites: ['Aucune facture traitée ces 30 derniers jours.', ''], archives: ['', ''] }[onglet];
  return `<div class="scr cb">${barreMode('magasin', 'À traiter', true)}
  <div class="scr__corps">
    <h1 class="titre-1">À traiter</h1>
    <div class="at-onglets" role="tablist">${onglets.map(([k, t, n]) => `<button class="at-on${onglet === k || (onglet === 'archives' && k === 'faites') ? ' at-on--actif' : ''}" role="tab" data-action="at-onglet" data-o="${k}"><b>${n}</b>${t}</button>`).join('')}</div>
    ${erreur ? `<div class="bandeau bandeau--erreur">${icone('alerte', 'cb-ico cb-ico--24')}<span>${esc(erreur)}</span></div><button class="btn btn--secondaire" data-action="at-reessayer">Réessayer</button>` : ''}
    ${message ? `<div class="bandeau bandeau--alerte">${icone('info', 'cb-ico cb-ico--24')}<span>${esc(message)}</span></div>` : ''}
    ${onglet === 'archives' ? `<h2 class="titre-3">Archives (plus de 30 jours)</h2>` : ''}
    ${liste_.length ? liste_.map(x => carte(x, liste)).join('') : `<div class="carte"><div class="titre-2">${esc(vide[0])}</div>${vide[1] ? `<div class="note" style="margin-top:8px">${esc(vide[1])}</div>` : ''}</div>`}
    ${onglet === 'faites' && archives.length ? `<button class="at-lien at-lien--centre" data-action="at-onglet" data-o="archives">Voir les archives (>30 jours)</button>` : ''}
    ${onglet === 'archives' ? `<button class="at-lien at-lien--centre" data-action="at-onglet" data-o="faites">Retour aux traitées</button>` : ''}
    ${masques.length ? `<details class="note"><summary style="min-height:48px;display:flex;align-items:center">${masques.length} facture(s) masquée(s) : fournisseur absent de StorePOS</summary>${masques.slice(0, 15).map(x => `<div>${esc(nomFournisseur(x, liste))} · ${esc(dateLongue(dateDe(x)))}</div>`).join('')}</details>` : ''}
    ${!actif ? `<div class="note">Filtre fournisseurs inactif : charge d'abord les produits.</div>` : ''}
    <div class="note" data-verif>${derniere ? `Drive vérifié à ${heure(derniere)}` : 'Pas encore vérifié'}${recu ? ` · reçu à ${heure(recu)}` : ''}</div>
  </div>
  <div class="scr__bas"><button class="btn btn--secondaire" data-action="rafraichir">${icone('import')}Rafraîchir maintenant</button></div></div>`;
}
