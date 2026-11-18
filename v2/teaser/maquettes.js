// Maquettes du teaser pour les fonctions des prochains lots. Elles utilisent les mêmes composants que l'appli.
// Prix : uniquement ceux enregistrés dans StorePOS (prix de vente et prix d'achat). Aucun prix inventé.
import { icone } from '../js/icones.js';
import { barreMode, joli } from '../js/ecrans.js';
import { euros } from '../js/calcul.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const scr = (mode, droite, corps, bas = '') => `<div class="scr cb">${barreMode(mode, droite, true)}<div class="scr__corps">${corps}</div>${bas ? `<div class="scr__bas">${bas}</div>` : ''}</div>`;
const nb = x => x.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const jourMois = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

// ---------- code-barres EAN-13 réel (dessiné, pas une image) ----------
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PAR = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
export function ean13(code, h = 40) {
  const d = code.split('').map(Number); const p = PAR[d[0]];
  let b = '101'; for (let i = 1; i <= 6; i++) b += (p[i - 1] === 'L' ? L : G)[d[i]];
  b += '01010'; for (let i = 7; i <= 12; i++) b += R[d[i]]; b += '101';
  const rects = [...b].map((x, i) => x === '1' ? `<rect x="${i}" y="0" width="1" height="${(i < 3 || (i >= 45 && i < 50) || i >= 92) ? h + 5 : h}"/>` : '').join('');
  return `<svg viewBox="-9 0 113 ${h + 14}" class="ean" aria-hidden="true"><g fill="#16140F">${rects}</g><text x="-8" y="${h + 13}" font-size="10" font-family="ui-monospace,monospace">${code[0]}</text><text x="5" y="${h + 13}" font-size="10" font-family="ui-monospace,monospace" letter-spacing="2.2">${code.slice(1, 7)}</text><text x="51" y="${h + 13}" font-size="10" font-family="ui-monospace,monospace" letter-spacing="2.2">${code.slice(7)}</text></svg>`;
}

// ---------- Achat : acheter plus, moins souvent ----------
/** Modèle du lot Achat : ventes 1 jour / 1 semaine / 1 mois, fenêtre de stockage sans périmer, recommandation. */
export function calculStock(p, { jours = 365, dluo = null, marge = 3, horizonMax = 90, aujourdHui = new Date() } = {}) {
  const parJour = p.q / jours;
  const joursDate = dluo ? Math.round((dluo - aujourdHui) / 864e5) : null;
  const fenetreDate = joursDate != null ? Math.max(0, joursDate - marge) : null;
  const fenetre = fenetreDate != null ? Math.min(fenetreDate, horizonMax) : horizonMax;
  const qte = Math.round(parJour * fenetre);
  const jusqu = new Date(aujourdHui.getTime() + fenetre * 864e5);
  return { parJour, parSemaine: parJour * 7, parMois: parJour * 30, joursDate, fenetreDate, fenetre, qte, jusqu, limitePar: fenetreDate != null && fenetreDate < horizonMax ? 'date' : 'horizon', stockMaxDate: fenetreDate != null ? Math.round(parJour * fenetreDate) : null };
}

export function ecranAchatStock(p, opts) {
  const c = calculStock(p, opts);
  const col = (lib, v) => `<div class="trio__case"><b>${v < 10 ? nb(v) : Math.round(v)}</b><span>${lib}</span></div>`;
  const limite = c.limitePar === 'date'
    ? `Date limite au ${jourMois(opts.dluo)} : tu peux stocker jusqu'à <b>${c.stockMaxDate} unités</b> sans périmer, soit <b>${c.fenetreDate} jours</b> de vente (${opts.marge || 3} jours de marge).`
    : `Date limite lointaine (${opts.dluo.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}) : c'est ton maximum de <b>${Math.round((opts.horizonMax || 90) / 30)} mois</b> de stock qui limite.`;
  return scr('achat', '', `
    <div class="produit"><div class="vignette">${icone(/ayran/i.test(p.lib) ? 'bouteille' : 'pot')}</div><div><h2 class="titre-2">${esc(joli(p.lib))}</h2><div class="note">Prix en caisse : <b class="fort" style="color:var(--encre)">${euros(p.prix)}</b></div></div></div>
    <div><div class="titre-3" style="margin-bottom:8px">Il en part</div>
      <div class="trio">${col('par jour', c.parJour)}${col('par semaine', c.parSemaine)}${col('par mois', c.parMois)}</div></div>
    <div class="bandeau ${c.limitePar === 'date' ? 'bandeau--alerte' : ''}" style="${c.limitePar === 'date' ? '' : 'background:var(--carte);box-shadow:inset 0 0 0 2px var(--trait)'};font-weight:400">${icone(c.limitePar === 'date' ? 'frais' : 'agenda', 'cb-ico cb-ico--24')}<span>${limite}</span></div>
    <div class="achat">
      <div class="achat__prends">Achète d'un coup</div>
      <div class="achat__qte"><b>${c.qte}</b><span>unités</span><span class="achat__reglage"><button class="btn btn--geste">−</button><button class="btn btn--geste">+</button></span></div>
      <div class="raison" style="margin-top:16px">${icone('check', 'cb-ico cb-ico--24')}<span>Tu tiens jusqu'au <b>${jourMois(c.jusqu)}</b></span></div>
      <div class="raison">${icone('agenda', 'cb-ico cb-ico--24')}<span>Prochain réappro dans <b>${c.fenetre} jours</b></span></div>
    </div>`,
    `<button class="btn btn--principal btn--achat">Ajouter à ma liste</button>`);
}

export function ecranListe(lignes, fin) {
  return scr('achat', 'Metro', `
    <h1 class="titre-1">Ma liste d'achat</h1>
    <div class="note" style="margin-top:-8px">${lignes.length} produits · stock jusqu'au ${jourMois(fin)} au plus tôt</div>
    ${lignes.map(l => `<div class="ligne"><div class="ligne__txt"><div class="ligne__titre">${esc(joli(l.lib))}</div><div class="ligne__detail">tu tiens jusqu'au ${jourMois(l.jusqu)}</div></div><b style="font:700 28px/1 var(--font-titre);color:var(--achat)">${l.qte}</b></div>`).join('')}`,
    `<button class="btn btn--principal btn--achat">${icone('scan')}Scanner en rayon chez Metro</button>`);
}

// ---------- Étiquettes ----------
const prixUnite = (prix, lib) => {
  const m = lib.match(/(\d+(?:[.,]\d+)?)\s?(KG|G|L|CL|ML)\b/i); if (!m) return '';
  let q = parseFloat(m[1].replace(',', '.')); const u = m[2].toUpperCase();
  if (u === 'G') q /= 1000; if (u === 'CL') q /= 100; if (u === 'ML') q /= 1000;
  return `${euros(prix / q)} le ${/L/.test(u) ? 'litre' : 'kilo'}`;
};
export function etiquette(p, top = false) {
  return `<div class="etiq${top ? ' etiq--top' : ''}"><div class="etiq__nom">${esc(joli(p.lib))}</div><div class="etiq__bas"><div><div class="etiq__prix">${euros(p.prix)}</div><div class="etiq__unite">${prixUnite(p.prix, p.lib)}</div></div>${ean13(p.e, 34)}</div></div>`;
}
export function ecranEtiquettes(produits) {
  return scr('magasin', 'Étiquettes', `
    <h1 class="titre-1">Étiquettes</h1>
    <div class="note" style="margin-top:-8px">${produits.length} étiquettes · planche A4 de 24</div>
    <div class="carte" style="padding:12px;display:grid;place-items:center;background:var(--papier)">${etiquette(produits[0], true)}</div>
    <div class="note" style="text-align:center;margin-top:-8px">Taille réelle : ce qui sort de l'imprimante.</div>
    ${produits.slice(1, 4).map(p => `<div class="ligne" style="min-height:64px"><div class="ligne__txt"><div class="ligne__titre">${esc(joli(p.lib))}</div><div class="ligne__detail">${euros(p.prix)} · ${prixUnite(p.prix, p.lib) || 'pas de contenance'}</div></div>${icone('check', 'cb-ico cb-ico--24')}</div>`).join('')}`,
    `<button class="btn btn--principal">${icone('imprimer')}Imprimer la planche</button>`);
}
export function planche(produits) {
  const cases = []; for (let i = 0; i < 24; i++) { const p = produits[i % produits.length]; cases.push(etiquette(p, p.top)); }
  return `<div class="planche">${cases.join('')}</div>`;
}

// ---------- Affiche fruits et légumes ----------
export function affiche({ nom, sous, origine, drapeau, prix, unite, auKilo }) {
  return `<div class="affiche"><div class="affiche__illus"><svg viewBox="0 0 120 120"><ellipse cx="60" cy="68" rx="42" ry="40" fill="#C8873A"/><path d="M60 28c-4-10 2-18 8-22-2 8 0 14 0 22z" fill="#5C7A2E"/><path d="M40 50c10 8 30 8 40 0" stroke="#A86A28" stroke-width="3" fill="none"/><path d="M34 74c14 10 38 10 52 0" stroke="#A86A28" stroke-width="3" fill="none"/></svg></div>
  <div class="affiche__nom">${esc(nom)}</div><div class="affiche__sous">${esc(sous)}</div>
  <div class="affiche__origine"><span class="drapeau">${drapeau.map(c => `<i style="background:${c}"></i>`).join('')}</span>Origine : ${esc(origine)} · Cat. I</div>
  <div class="affiche__prix">${euros(prix)}</div><div class="affiche__unite">${esc(unite)}${auKilo ? ` · soit ${euros(auKilo)} le kg` : ''}</div></div>`;
}

// ---------- Facture lue ----------
export function ecranFacture(lignes, fournisseur) {
  return scr('magasin', 'Facture', `
    <div><h1 class="titre-2">${esc(fournisseur)}</h1><div class="note">Lue sur le Drive · ${lignes.length} lignes</div></div>
    <div class="progres"><i style="width:${Math.round(lignes.filter(l => l.ok).length / lignes.length * 100)}%"></i></div>
    <div class="note" style="margin-top:-8px">${lignes.filter(l => l.ok).length} sur ${lignes.length} vérifiées</div>
    ${lignes.map(l => `<div class="carte" style="padding:14px 16px;${l.ok ? '' : 'box-shadow:inset 0 0 0 2px var(--alerte)'}"><div class="ligne__titre">${esc(joli(l.lib))}</div>
      <div class="ligne__detail">${l.ok ? `${l.quantite} × ${euros(l.pa)} · reconnu ${esc(l.comment)}` : esc(l.message)}</div>
      <div style="margin-top:8px">${l.ok ? `<span class="pastille pastille--ok">${icone('check', 'cb-ico cb-ico--24')}Prix d'achat identique à la caisse</span>` : `<button class="btn btn--secondaire" style="width:100%">${icone('scan', 'cb-ico cb-ico--24')}Scanner le produit</button>`}</div></div>`).join('')}`,
    `<button class="btn btn--principal">Encore 1 ligne à vérifier</button>`);
}

// ---------- Envoi à la caisse (fichier d'import StorePOS) ----------
export function ecranEnvoiCaisse(lignes) {
  return scr('magasin', 'Caisse', `
    <h1 class="titre-1">Envoyer à la caisse</h1>
    <div class="carte" style="display:grid;gap:4px"><div class="titre-2">${lignes.length} changements prêts</div><div class="note">Fichier d'import StorePOS, 25 colonnes, rangé sur le Drive.</div></div>
    ${lignes.map(l => `<div class="ligne" style="min-height:64px"><div class="ligne__txt"><div class="ligne__titre">${esc(joli(l.lib))}</div><div class="ligne__detail">${esc(l.quoi)}</div></div>${icone('check', 'cb-ico cb-ico--24')}</div>`).join('')}
    <div class="bandeau bandeau--alerte">${icone('info', 'cb-ico cb-ico--24')}<span>Nouveau type de fichier : on teste d'abord sur 1 ligne.</span></div>`,
    `<button class="btn btn--principal">Préparer le test sur 1 ligne</button><button class="btn btn--secondaire">Voir le fichier complet</button>`);
}

// ---------- Produit inconnu + Open Food Facts ----------
export function ecranInconnu(code) {
  return scr('magasin', 'Prénom · Caisse', `
    <div><div class="note">Nouveau produit</div><h1 class="titre-2">${esc(code)}</h1></div>
    <div class="carte" style="display:grid;gap:14px">
      <div style="display:flex;gap:14px;align-items:center"><div class="vignette" style="width:96px;height:96px;background:var(--alerte-fond);color:var(--alerte)">${icone('pot')}</div>
      <div><div class="titre-2">Harissa</div><div>Le Phare du Cap Bon</div><div class="note">Boîte 1/6 · Tunisie</div></div></div>
      <div class="note">Trouvé sur Open Food Facts. C'est bien ce produit ?</div>
      <div class="duo"><button class="btn btn--principal" style="width:100%">Oui, c'est ça</button><button class="btn btn--secondaire">Non</button></div>
    </div>
    <div><div class="fort">Prix de vente</div><div class="champ" style="display:flex;align-items:center;margin-top:8px;color:var(--encre-2);font-weight:400">Le prix tapé en caisse</div></div>
    <div><div class="fort" style="margin-bottom:8px">Rayon</div><div class="duo">${['Épicerie salée', 'Épicerie sucrée', 'Boissons', 'Frais'].map((r, i) => `<button class="btn ${i === 0 ? 'btn--achat' : 'btn--secondaire'}" style="width:100%">${r}</button>`).join('')}</div></div>`,
    `<button class="btn btn--principal">Créer la fiche</button>`);
}

export function ecranPin() {
  const t = n => `<button class="btn btn--geste" style="width:100%;height:72px;font-size:30px">${n}</button>`;
  return `<div class="scr cb" style="justify-content:center">
    <div class="scr__corps" style="justify-content:center;align-items:stretch;gap:20px">
      <h1 class="titre-1" style="text-align:center">Qui est à la caisse ?</h1>
      <div class="duo"><button class="btn btn--principal">Matin</button><button class="btn btn--secondaire">Soir</button></div>
      <div class="note" style="text-align:center">Ton code à 4 chiffres</div>
      <div class="pin">${[1, 1, 0, 0].map(x => `<i class="${x ? 'plein' : ''}"></i>`).join('')}</div>
      <div class="clavier">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(t).join('')}<span></span>${t(0)}<button class="btn btn--discret" style="height:72px">Effacer</button></div>
    </div></div>`;
}

export function ecranInventaire() {
  return scr('inventaire', 'Allée 3 · Conserves', `
    <div class="compteur-inv"><b>47</b> produits · <b>312</b> unités<span class="pastille pastille--ok" style="margin-left:auto">Tout est enregistré</span></div>
    <div class="titre-3">Quantité par scan</div>
    <div class="quatre">${['1', '6', '12', 'Autre'].map((x, i) => `<button class="btn ${i === 2 ? 'btn--inventaire' : 'btn--secondaire'}" style="width:100%;min-height:64px">${x}</button>`).join('')}</div>
    <div class="carte" style="display:grid;gap:10px"><div class="note">Dernier scan</div><div class="titre-2">Pois Chiches Gros Barco 1 kg</div>
      <div style="display:flex;align-items:center;gap:12px"><b style="font:700 64px/64px var(--font-titre)">24</b><span class="note">unités comptées</span><span class="achat__reglage"><button class="btn btn--geste">−</button><button class="btn btn--geste">+</button></span></div></div>
    ${[['Harissa Phare du Cap Bon 1/6', 36], ['Huile Tournesol 5 L', 8], ['Haricots Rouge Rochambeau', 18]].map(([n, q]) => `<div class="ligne" style="min-height:56px"><div class="ligne__txt"><div class="ligne__titre">${n}</div></div><b style="font:700 24px/1 var(--font-titre)">${q}</b></div>`).join('')}`,
    `<button class="btn btn--principal btn--inventaire">Terminer la zone</button>`);
}

// ---------- Mac ----------
export function ecranMac(lignesFacture) {
  return `<div class="mac__ecran cb">
    <div class="lat"><div class="lat__marque"><i></i>Corbeille</div>
      <div class="lat__item">${icone('magasin', 'cb-ico cb-ico--24')}Magasin</div><div class="lat__item">${icone('achat', 'cb-ico cb-ico--24')}Achat</div>
      <div class="lat__item">${icone('inventaire', 'cb-ico cb-ico--24')}Inventaire</div><div class="lat__item lat__item--actif">${icone('boite', 'cb-ico cb-ico--24')}À traiter<span class="pastille pastille--top">2</span></div>
      <div style="margin-top:auto" class="note">⌘K pour tout chercher</div></div>
    <div class="mac__liste"><div class="titre-2" style="padding:24px 20px 8px">À traiter</div>
      ${[['Facture Globalfood', '3 lignes · 1 à vérifier', true], ['Facture DCA Distribution', '2 lignes', false], ['Nouveau produit', 'créé en caisse ce matin', false]].map(([t, d, a]) => `<div class="mac__item${a ? ' mac__item--actif' : ''}"><b>${t}</b><span>${d}</span></div>`).join('')}</div>
    <div class="mac__detail"><div style="display:flex;align-items:center;gap:12px"><div class="titre-2">Facture Globalfood</div><span class="pastille pastille--alerte" style="margin-left:auto">1 à vérifier</span></div>
      <div class="mac__tableau"><div class="mac__entete"><span>Produit</span><span>Qté</span><span>Prix d'achat</span><span>En caisse</span><span></span></div>
      ${lignesFacture.map(l => `<div class="mac__ligne${l.ok ? '' : ' mac__ligne--alerte'}"><span>${esc(joli(l.lib))}</span><span>${l.ok ? l.quantite : ''}</span><span>${l.ok ? euros(l.pa) : ''}</span><span>${l.ok ? euros(l.pa) : 'inconnu'}</span><span>${l.ok ? icone('check', 'cb-ico cb-ico--24') : icone('alerte', 'cb-ico cb-ico--24')}</span></div>`).join('')}</div>
      <div style="display:flex;gap:12px;margin-top:auto"><button class="btn btn--secondaire">Voir la facture</button><button class="btn btn--principal" style="width:auto;margin-left:auto">Tout est bon ⌘↵</button></div></div>
  </div>`;
}

/** Bloc compact du nouveau modèle, pour la fiche Magasin et l'iPad. */
export function blocStock(p, opts) {
  const c = calculStock(p, opts);
  const col = (lib, v) => `<div class="trio__case"><b>${v < 10 ? nb(v) : Math.round(v)}</b><span>${lib}</span></div>`;
  return `<div class="achat"><div class="achat__prends">Il en part</div>
    <div class="trio" style="margin:10px 0 16px">${col('par jour', c.parJour)}${col('par semaine', c.parSemaine)}${col('par mois', c.parMois)}</div>
    <div class="achat__prends">Si tu en reprends d'un coup</div>
    <div class="achat__qte"><b>${c.qte}</b><span>unités</span></div>
    <div class="raison" style="margin-top:12px">${icone('check', 'cb-ico cb-ico--24')}<span>Tu tiens jusqu'au <b>${jourMois(c.jusqu)}</b>${c.limitePar === 'date' ? ' (date limite)' : ''}</span></div></div>`;
}

// ---------- Mode Ramadan (lot 8) ----------
// Quantités d'exemple pour la présentation : le calcul réel viendra des exports Vente PLU de chaque Ramadan passé.
const lune = (cls = 'cb-ico') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/><path d="M17 3l.6 1.4L19 5l-1.4.6L17 7l-.6-1.4L15 5l1.4-.6z"/></svg>`;

/** La tuile qui apparaît sur l'accueil à J-30. */
export function tuileRamadan(jours, debut) {
  return `<button class="tuile tuile--ramadan">${lune()}<div><b>Préparer le Ramadan</b><span>Dans ${jours} jours · vers le ${jourMois(debut)}</span></div></button>`;
}

/** Un produit : ce qui s'est vendu pendant le dernier Ramadan, ce qu'il faut prévoir, et ce que la date limite permet. */
function ligneRamadan(r) {
  const t = `${r.tendance > 0 ? '↑ +' : r.tendance < 0 ? '↓ ' : '= '}${r.tendance} % en ce moment`;
  return `<div class="carte ram-ligne">
    <div class="ram-haut"><div class="ram-nom">${esc(joli(r.lib))}</div><div class="ram-prix">${euros(r.prix)}</div></div>
    <div class="ram-phrase">L'an dernier tu as vendu <b>${r.an}</b>, cette année prévois <b class="ram-y">${r.prevois}</b></div>
    <div class="ram-detail">${t} · se garde ${r.garde}</div>
    ${r.enPlusieurs ? `<div class="ram-dluo">${icone('frais', 'cb-ico')}<span>Prends <b>${r.maintenant}</b> maintenant, le reste en ${r.enPlusieurs} fois</span></div>` : ''}
  </div>`;
}

export function ecranRamadan({ jours, debut, aid, produits }) {
  return scr('achat', 'Ramadan', `
    <div class="ram-alerte"><div><b>Ramadan dans ${jours} jours</b><span>Du ${jourMois(debut)} à l'Aïd le ${jourMois(aid)}</span></div></div>
    <div><h2 class="titre-2">Les produits phares</h2><div class="note">Moyenne de tes 3 derniers Ramadans, corrigée par les 3 dernières semaines.</div></div>
    ${produits.map(ligneRamadan).join('')}`,
    `<button class="btn btn--principal btn--achat">Ajouter les ${produits.length} à ma liste</button>`);
}
