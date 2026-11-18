// Aperçu d'une facture dans l'appli (PDF ou photo). Même principe que la visionneuse de la V1 : PDF.js dessine chaque page, zoom + / −.
import { pdfLib } from './moteur/lecture.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Ouvre l'aperçu plein écran. `onLire` (facultatif) ajoute le bouton « Lire cette facture ». */
export async function ouvrirVisionneuse(fichier, titre, onLire) {
  document.getElementById('visionneuse')?.remove();
  const v = document.createElement('div'); v.id = 'visionneuse'; v.className = 'cb visionneuse';
  v.innerHTML = `<div class="visionneuse__barre"><b class="visionneuse__titre">${esc(titre)}</b>
      <button class="btn btn--secondaire" data-vz="moins" aria-label="Réduire">−</button><button class="btn btn--secondaire" data-vz="plus" aria-label="Agrandir">+</button>
      <button class="btn btn--secondaire" data-vz="fermer">Fermer</button></div>
    <div class="visionneuse__corps" data-corps><p class="note">Chargement…</p></div>
    ${onLire ? '<div class="visionneuse__bas"><button class="btn btn--principal" data-vz="lire">Lire cette facture</button></div>' : ''}`;
  document.body.appendChild(v);
  const corps = v.querySelector('[data-corps]');
  const fermer = () => v.remove();
  v.querySelector('[data-vz="fermer"]').onclick = fermer;
  if (onLire) v.querySelector('[data-vz="lire"]').onclick = () => { fermer(); onLire(); };
  let z = 1; const els = [];
  try {
    if (/pdf/i.test(fichier.type) || /\.pdf$/i.test(fichier.name)) {
      const L = await pdfLib();
      const doc = await L.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()) }).promise;
      for (let i = 1; i <= doc.numPages; i++) { const pg = await doc.getPage(i); const c = document.createElement('canvas'); c.className = 'visionneuse__page'; els.push({ c, pg }); }
    } else {
      const im = new Image(); im.src = URL.createObjectURL(fichier); im.className = 'visionneuse__page'; els.push({ im });
    }
  } catch (x) { corps.innerHTML = `<p class="note" style="color:#fff">Aperçu impossible : ${esc(x.message)}</p>`; return; }
  const dessiner = async () => {
    corps.innerHTML = ''; const W = (corps.clientWidth - 16) * z;
    for (const e of els) {
      if (e.im) { e.im.style.width = W + 'px'; corps.appendChild(e.im); continue; }
      const sc = W / e.pg.getViewport({ scale: 1 }).width, dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const vp = e.pg.getViewport({ scale: sc * dpr });
      e.c.width = vp.width; e.c.height = vp.height; e.c.style.width = W + 'px'; corps.appendChild(e.c);
      await e.pg.render({ canvasContext: e.c.getContext('2d'), viewport: vp }).promise;
    }
  };
  v.querySelector('[data-vz="plus"]').onclick = () => { z = Math.min(3, z + 0.5); dessiner(); };
  v.querySelector('[data-vz="moins"]').onclick = () => { z = Math.max(1, z - 0.5); dessiner(); };
  await dessiner();
}
