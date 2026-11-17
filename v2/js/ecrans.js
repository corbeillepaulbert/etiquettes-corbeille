// Écrans de la V2. Les mêmes fonctions servent à l'appli et aux maquettes du teaser.
import { icone } from './icones.js';
import { calculAchat, euros, marge } from './calcul.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ACCENTS = { cremerie: 'crémerie', sale: 'salé', legumes: 'légumes', epicerie: 'épicerie', epices: 'épices', the: 'thé', cafe: 'café', pate: 'pâte', pates: 'pâtes' };
export function joli(lib) {
  // « AYRAN SUNTAT 1L » → « Ayran Suntat 1 L » : lecture plus facile, le libellé caisse reste inchangé.
  const s = String(lib || '').toLowerCase().replace(/\s+/g, ' ').trim()
    .replace(/(\d)\s?(kg|g|gr|l|cl|ml)\b/g, (m, d, u) => `${d} ${u === 'gr' ? 'g' : u === 'l' ? 'L' : u}`);
  const acc = s.replace(/[a-z]+/g, w => ACCENTS[w] || w);
  return acc.replace(/(^|[ (-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
}

export function barreMode(mode, droite = '', fermer = false) {
  const noms = { magasin: 'Magasin', achat: 'Achat', inventaire: 'Inventaire' };
  return `<div class="mode mode--${mode}">${icone(mode, 'cb-ico cb-ico--24')}${noms[mode]}<span class="mode__qui">${esc(droite)}</span>${fermer ? `<button class="mode__fermer" data-action="accueil" aria-label="Fermer">${icone('x', 'cb-ico cb-ico--24')}</button>` : ''}</div>`;
}

export function ecranAccueil({ bonjour = 'Bonjour', date = '', aTraiter = 0, donnees = '', petites = [['factures', 'facture', 'Lire une facture'], ['donnees', 'import', 'Mettre à jour les ventes']], liens = [['reglages', 'Réglages']] } = {}) {
  return `<div class="scr cb">
  <div class="scr__corps">
    <div class="accueil__haut"><h1 class="titre-1">${esc(bonjour)}</h1>${aTraiter ? `<button class="compteur" data-action="a-traiter">${aTraiter} à traiter</button>` : ''}</div>
    ${date ? `<div class="note" style="margin-top:-12px">${esc(date)}</div>` : ''}
    <button class="tuile tuile--magasin" data-action="mode" data-mode="magasin">${icone('magasin')}<div><b>Magasin</b><span>Prix, ventes, étiquettes</span></div></button>
    <button class="tuile tuile--achat" data-action="mode" data-mode="achat">${icone('achat')}<div><b>Achat</b><span>Combien en prendre, et pourquoi</span></div></button>
    <div class="duo">
      ${petites.map(([a, i, t]) => `<button class="tuile tuile--petite" data-action="${a}">${icone(i)}<b>${t}</b></button>`).join('')}
    </div>
    ${donnees ? `<div class="note">${donnees}</div>` : ''}
    <div style="display:flex;gap:24px">${liens.map(([a, t]) => `<button class="lien" data-action="${a}">${t}</button>`).join('')}</div>
  </div>
  <button class="btn btn--scan fab" data-action="scanner" aria-label="Scanner">${icone('scan')}</button>
</div>`;
}

export function ecranEclair({ type = 'ok', nom = '', info = '', detail = '' }) {
  const ic = { ok: 'check', inconnu: 'x', deja: 'alerte' }[type];
  return `<div class="eclair eclair--${type} cb" style="height:100%;min-height:100%">${icone(ic)}<div class="eclair__nom">${esc(nom)}</div>${info ? `<div class="eclair__info">${esc(info)}</div>` : ''}${detail ? `<div class="corps-fort">${esc(detail)}</div>` : ''}</div>`;
}

export function blocVentes(c, contexte) {
  const titre = contexte === 'achat' ? 'Prends' : 'Si tu en reprends';
  return `<div class="achat">
    <div class="achat__prends">${titre}</div>
    <div class="achat__qte"><b data-qte>${c.qte}</b><span>${c.unite}</span>${contexte === 'achat' ? `<span class="achat__reglage"><button class="btn btn--geste" data-action="moins" aria-label="Un de moins">−</button><button class="btn btn--geste" data-action="plus" aria-label="Un de plus">+</button></span>` : ''}</div>
    <div class="achat__pourquoi">Pourquoi ce chiffre</div>
    ${c.raisons.map(r => `<div class="raison">${icone(r.icone, 'cb-ico cb-ico--24')}<span>${r.html}</span></div>`).join('')}
    ${c.alerte ? `<div class="bandeau bandeau--alerte" style="margin-top:12px">${icone('alerte', 'cb-ico cb-ico--24')}<span>${c.alerte}</span></div>` : ''}
    <div class="fiabilite">${c.fiabilite}</div>
  </div>`;
}

export function rayon(p) {
  if (p.ray) return joli(p.ray);
  if (p.fam && !/cr[eé]ation/i.test(p.fam)) return joli(p.fam);
  return joli(String(p.dep || '').replace(/\b(ls\s+)?taux\s+(r[eé]duit|normal|interm\w*)\b/i, '').trim());
}

function enTeteProduit(p, c, pict = 'pot') {
  const pills = [];
  if (c.top) pills.push('<span class="pastille pastille--top">Top vente</span>');
  return `<div class="produit"><div class="vignette">${icone(pict)}</div><div><h2 class="titre-2">${esc(joli(p.lib))}</h2><div class="note">${esc(rayon(p))}</div></div></div>${pills.length ? `<div class="pastilles">${pills.join('')}</div>` : ''}`;
}

export function carteMagasin(p, meta, reglages, { pict = 'pot' } = {}) {
  const c = calculAchat(p, meta, reglages);
  const m = marge(p);
  return `<div class="carte" style="display:grid;gap:16px">
      ${enTeteProduit(p, c, pict)}
      <div class="grand-prix"><b>${euros(p.prix)}</b><span class="note">prix en caisse</span></div>
      <div class="infos">
        <div class="info"><span>Vendu par mois</span><b>${c.parMois != null ? Math.round(c.parMois) : '0'}</b></div>
        ${m != null ? `<div class="info"><span>Marge</span><b>${m}\u00a0%</b></div>` : ''}
      </div>
    </div>`;
}

export function ecranFicheMagasin(p, meta, reglages, { qui = '', lectureSeule = true, pict = 'pot' } = {}) {
  const c = calculAchat(p, meta, reglages);
  return `<div class="scr cb">
  ${barreMode('magasin', qui, true)}
  <div class="scr__corps">
    ${carteMagasin(p, meta, reglages, { pict })}
    ${blocVentes(c, 'magasin')}
  </div>
  <div class="scr__bas">
    ${lectureSeule ? `<div class="note" style="text-align:center">Pour changer le prix ou imprimer : l'appli actuelle, pour l'instant.</div>` : `<button class="btn btn--principal">${icone('imprimer')}Imprimer l'étiquette</button>`}
    <button class="btn btn--secondaire" data-action="scanner">${icone('scan', 'cb-ico cb-ico--24')}Scanner un autre produit</button>
  </div>
</div>`;
}

export function ecranFicheAchat(p, meta, reglages, { qui = '', pict = 'bouteille' } = {}) {
  const c = calculAchat(p, meta, reglages);
  return `<div class="scr cb">
  ${barreMode('achat', qui, true)}
  <div class="scr__corps">
    ${enTeteProduit(p, c, pict)}
    <div class="note" style="margin-top:-8px">Prix en caisse : <b class="fort" style="color:var(--encre)">${euros(p.prix)}</b></div>
    ${blocVentes(c, 'achat')}
  </div>
  <div class="scr__bas">
    <button class="btn btn--principal btn--achat" data-action="ajouter">Ajouter à ma liste</button>
    <button class="btn btn--secondaire" data-action="scanner">${icone('scan', 'cb-ico cb-ico--24')}Scanner le suivant</button>
  </div>
</div>`;
}
