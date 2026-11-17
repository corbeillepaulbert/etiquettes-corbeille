// Scan de codes-barres : caméra arrière, photo pleine résolution, saisie, douchette.
// Le moteur de lecture (détecteur natif, sinon ZXing ; recadrage ; essais sur la photo ; anti-doublon)
// est repris à l'identique de la V1 (openScanner, v16), qui fonctionne sur l'iPhone 13 mini.
// Seule l'interface autour change.
import { eanStr } from './xlsx.js';
import { icone } from '../icones.js';
import { barreMode } from '../ecrans.js';

const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';

function loadZX() {
  if (window.ZXing) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = ZXING_URL; s.onload = res;
    s.onerror = () => rej(new Error("lecteur de codes-barres pas encore installé : ouvre l'appli une fois avec internet"));
    document.head.appendChild(s);
  });
}

let AC = null;
export function bip(ok = true) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.frequency.value = ok ? 1250 : 330; g.gain.value = .15; o.connect(g); g.connect(AC.destination);
    o.start(); o.stop(AC.currentTime + (ok ? .09 : .25));
  } catch (e) { }
}

let mfr = null;
async function zx() {
  if (mfr) return mfr;
  await loadZX();
  const h = new Map();
  h.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E]);
  h.set(ZXing.DecodeHintType.TRY_HARDER, true);
  mfr = new ZXing.MultiFormatReader(); mfr.setHints(h);
  return mfr;
}
const BD = ('BarcodeDetector' in window) ? new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] }) : null;
async function dec(c) {
  if (BD) { try { const r = await BD.detect(c); if (r[0]) return r[0].rawValue; } catch (e) { } }
  const m = await zx();
  try { return m.decodeWithState(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(c)))).getText(); } catch (e) { return ''; }
}
const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
function grab(src, sw, sh, x, y, w, h, maxW) {
  const s = Math.min(1, maxW / w);
  cv.width = Math.round(w * s); cv.height = Math.round(h * s);
  cx.drawImage(src, x, y, w, h, 0, 0, cv.width, cv.height);
  return cv;
}

export function normaliserCode(c) {
  c = eanStr(c);
  if (c.length === 12) c = '0' + c;
  return c;
}

/**
 * Ouvre le scanner plein écran. onCode(code) est appelé une fois par code lu ; le scanner se ferme alors.
 * Renvoie une fonction fermer().
 */
export function ouvrirScanner({ mode = 'magasin', qui = '', onCode, onFermer, continu = false, titre = '' }) {
  let stream = null, stop = false, torch = false, fini = false;
  let dernier = '', dernierT = 0, nbLus = 0;
  const el = document.createElement('div');
  el.className = 'scan-plein cb';
  el.innerHTML = `
    <video playsinline muted></video>
    ${barreMode(mode, qui, true)}
    <div class="scan-cadre"></div>
    <div class="scan-aide" data-msg>${titre || 'Approche le code du cadre'}</div>
    ${continu ? '<div class="scan-continu"><div class="scan-continu__liste" data-liste></div><button class="btn btn--principal" data-t="fini">Terminé</button></div>' : ''}
    <div class="scan-outils">
      <button class="btn" data-t="lampe" hidden>${icone('lampe', 'cb-ico cb-ico--24')}Lampe</button>
      <label class="btn">${icone('photo', 'cb-ico cb-ico--24')}Photo<input type="file" accept="image/*" capture="environment" hidden></label>
      <button class="btn" data-t="taper">${icone('clavier', 'cb-ico cb-ico--24')}Taper</button>
    </div>`;
  document.body.appendChild(el);
  const msg = t => { el.querySelector('[data-msg]').textContent = t; };
  const v = el.querySelector('video');

  const fermer = (code) => {
    if (fini) return; fini = true; stop = true;
    try { stream && stream.getTracks().forEach(t => t.stop()); } catch (e) { }
    el.remove();
    if (code) onCode(code); else onFermer && onFermer();
  };
  const lu = (c) => {
    c = normaliserCode(c); if (!c) return false;
    if (!continu) { fermer(c); return true; }
    // scan en continu (étiquettes) : même code ignoré pendant 2,5 s, comme dans la V1
    const now = Date.now();
    if (c === dernier && now - dernierT < 2500) return true;
    dernier = c; dernierT = now;
    const r = onCode(c) || { ok: true, txt: c };
    bip(r.ok); nbLus++;
    const l = el.querySelector('[data-liste]');
    l.insertAdjacentHTML('afterbegin', `<div class="scan-continu__ligne${r.ok ? '' : ' scan-continu__ligne--ko'}">${r.txt}</div>`);
    msg(`${nbLus} code${nbLus > 1 ? 's' : ''} lu${nbLus > 1 ? 's' : ''} · continue ou touche Terminé`);
    const f = el.querySelector('.feuille-saisie input'); if (f) { f.value = ''; f.focus(); }
    return true;
  };

  el.querySelector('.mode__fermer').onclick = () => fermer();
  if (continu) el.querySelector('[data-t="fini"]').onclick = () => fermer();

  // saisie au clavier
  el.querySelector('[data-t="taper"]').onclick = () => {
    if (el.querySelector('.feuille-saisie')) return;
    const f = document.createElement('div');
    f.className = continu ? 'feuille-saisie feuille-saisie--dedans' : 'feuille-saisie';
    f.innerHTML = `<div class="titre-3">Taper le code-barres</div>
      <input class="champ" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="13 chiffres">
      <button class="btn btn--principal">Valider le code</button>`;
    if (continu) el.querySelector('.scan-continu').prepend(f); else el.appendChild(f);
    const i = f.querySelector('input'); i.focus();
    const ok = () => { if (!lu(i.value)) i.focus(); };
    f.querySelector('button').onclick = ok;
    i.onkeydown = e => { if (e.key === 'Enter') ok(); };
  };

  // photo pleine résolution (la plus fiable sur iPhone) — repris de la V1
  el.querySelector('input[type=file]').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    msg('Lecture de la photo…');
    try {
      const bm = await createImageBitmap(f); const W = bm.width, H = bm.height; let code = '';
      const tries = [[0, 0, W, H, 1600], [W * .1, H * .3, W * .8, H * .4, 1600], [0, H * .2, W, H * .6, 2000], [W * .2, H * .4, W * .6, H * .2, 1400]];
      for (const [x, y, w, h, m] of tries) { code = await dec(grab(bm, W, H, x, y, w, h, m)); if (code) break; }
      if (!code) {
        const r = document.createElement('canvas'); const s = Math.min(1, 1600 / H); r.width = H * s; r.height = W * s;
        const rx = r.getContext('2d'); rx.translate(r.width / 2, r.height / 2); rx.rotate(Math.PI / 2); rx.drawImage(bm, -W * s / 2, -H * s / 2, W * s, H * s);
        code = await dec(r);
      }
      if (!code || !lu(code)) msg('Code non lu sur la photo : rapproche-toi, code bien net et à plat.');
    } catch (x) { msg('Photo illisible : ' + x.message); }
  };

  // caméra en continu — repris de la V1
  (async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('caméra non accessible dans ce navigateur');
      if (!BD) await zx();
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      if (stop) { stream.getTracks().forEach(t => t.stop()); return; }
      v.srcObject = stream; await v.play();
      const tr = stream.getVideoTracks()[0];
      try {
        const cap = tr.getCapabilities ? tr.getCapabilities() : {}; const adv = {};
        if (cap.focusMode && cap.focusMode.includes('continuous')) adv.focusMode = 'continuous';
        if (cap.zoom && cap.zoom.max >= 1.6) adv.zoom = Math.min(cap.zoom.max, 2);
        if (Object.keys(adv).length) await tr.applyConstraints({ advanced: [adv] });
        if (cap.torch) {
          const b = el.querySelector('[data-t="lampe"]'); b.hidden = false;
          b.onclick = () => { torch = !torch; tr.applyConstraints({ advanced: [{ torch }] }).catch(() => { }); };
        }
      } catch (e) { }
      let n = 0;
      const loop = async () => {
        if (stop) return;
        const W = v.videoWidth, H = v.videoHeight;
        if (W && H) {
          n++; let c;
          if (n % 3) c = grab(v, W, H, W * .08, H * .32, W * .84, H * .36, 1280); else c = grab(v, W, H, 0, 0, W, H, 1100);
          const code = await dec(c);
          if (code && lu(code) && !continu) return;
        }
        setTimeout(loop, 90);
      };
      loop();
    } catch (e) {
      const why = /NotAllowed|Permission/i.test(e.name + e.message) ? "accès à la caméra refusé : Réglages de l'iPhone › Safari › Caméra › Autoriser" : e.message;
      msg(`Caméra indisponible (${why}). Utilise « Photo du code » ou « Taper le code ».`);
    }
  })();

  return fermer;
}

/** Douchette Bluetooth (mode clavier) : des chiffres tapés très vite puis Entrée, hors d'un champ de saisie. */
export function ecouterDouchette(onCode) {
  let buf = '', t = 0;
  window.addEventListener('keydown', e => {
    const cible = e.target;
    if (cible && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA')) return;
    const now = Date.now();
    if (now - t > 80) buf = '';
    t = now;
    if (/^\d$/.test(e.key)) { buf += e.key; return; }
    if (e.key === 'Enter' && buf.length >= 8) { const c = normaliserCode(buf); buf = ''; onCode(c); }
  });
}
