// Aperçu d'une facture dans l'appli (PDF ou photo). Même principe que la visionneuse de la V1 : PDF.js dessine chaque page, zoom + / −.
import { pdfLib } from './moteur/lecture.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Ouvre l'aperçu plein écran. `onLire` (facultatif) ajoute le bouton « Lire cette facture ». */
export async function ouvrirVisionneuse(fichier, titre, onLire) {
  document.getElementById('visionneuse')?.remove();
  const v = document.createElement('div'); v.id = 'visionneuse'; v.className = 'cb visionneuse';
  v.innerHTML = `<div class="visionneuse__barre"><b class="visionneuse__titre">${esc(titre)}</b>
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
  // Les pages sont dessinées à la largeur × z ; le pincement agrandit d'abord l'image (fluide), puis la redessine nette au lâcher.
  const feuille = document.createElement('div'); feuille.className = 'visionneuse__feuille';
  let rendu = 0;
  const dessiner = async () => {
    const n = ++rendu; corps.innerHTML = ''; feuille.innerHTML = ''; feuille.style.transform = ''; corps.appendChild(feuille);
    const W = (corps.clientWidth - 16) * z;
    for (const e of els) {
      if (n !== rendu) return;
      if (e.im) { e.im.style.width = W + 'px'; feuille.appendChild(e.im); continue; }
      const sc = W / e.pg.getViewport({ scale: 1 }).width, dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const vp = e.pg.getViewport({ scale: sc * dpr });
      e.c = document.createElement('canvas'); e.c.className = 'visionneuse__page'; // une toile neuve à chaque dessin : PDF.js refuse deux rendus sur la même
      e.c.width = vp.width; e.c.height = vp.height; e.c.style.width = W + 'px'; feuille.appendChild(e.c);
      await e.pg.render({ canvasContext: e.c.getContext('2d'), viewport: vp }).promise;
    }
  };
  const borne = x => Math.max(1, Math.min(4, x));
  const zoomer = async (nz, cx, cy) => {
    nz = borne(nz); if (Math.abs(nz - z) < 0.01) { feuille.style.transform = ''; return; }
    const r = corps.getBoundingClientRect(), px = (corps.scrollLeft + cx - r.left) / z, py = (corps.scrollTop + cy - r.top) / z;
    z = nz; await dessiner();
    corps.scrollLeft = px * z - (cx - r.left); corps.scrollTop = py * z - (cy - r.top);
  };
  let pince = null, dernierTap = 0;
  const ecart = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  corps.addEventListener('touchstart', e => {
    if (e.touches.length === 2) { pince = { d: ecart(e.touches), cx: (e.touches[0].clientX + e.touches[1].clientX) / 2, cy: (e.touches[0].clientY + e.touches[1].clientY) / 2, f: 1 }; e.preventDefault(); }
    else if (e.touches.length === 1) { const t = Date.now(); if (t - dernierTap < 300) { e.preventDefault(); zoomer(z > 1.5 ? 1 : 2.5, e.touches[0].clientX, e.touches[0].clientY); } dernierTap = t; }
  }, { passive: false });
  corps.addEventListener('touchmove', e => {
    if (!pince || e.touches.length !== 2) return; e.preventDefault();
    pince.f = borne(z * ecart(e.touches) / pince.d) / z;
    const r = corps.getBoundingClientRect();
    feuille.style.transformOrigin = `${corps.scrollLeft + pince.cx - r.left}px ${corps.scrollTop + pince.cy - r.top}px`;
    feuille.style.transform = `scale(${pince.f})`;
  }, { passive: false });
  corps.addEventListener('touchend', e => { if (pince && e.touches.length < 2) { const p = pince; pince = null; zoomer(z * p.f, p.cx, p.cy); } });
  // ordinateur : Ctrl + molette (ou pincement du pavé tactile)
  corps.addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); zoomer(z * (e.deltaY < 0 ? 1.25 : 0.8), e.clientX, e.clientY); }, { passive: false });
  await dessiner();
}
