// Lecture d'une photo ou d'un PDF de facture : code repris de la V1 (OCR Tesseract, PDF.js).
// Les bibliothèques et la langue française sont celles de la V1 (dossiers ../lib et ../tessdata), lues sans y toucher.
let TESS=null;
let PDFJS=null;export async function pdfLib(){if(PDFJS)return PDFJS;try{PDFJS=await import(new URL('../lib/pdf.min.mjs',location.href).href)}catch(e){throw new Error('lecteur PDF pas encore installé : ouvrez l\'appli une fois avec internet')}PDFJS.GlobalWorkerOptions.workerSrc=new URL('../lib/pdf.worker.min.mjs',location.href).href;return PDFJS}
export async function ocrImage(file,onp){if(!window.Tesseract){await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=res;s.onerror=()=>rej(new Error('Le moteur de lecture n\'est pas encore installé sur ce téléphone : ouvrez l\'appli une fois avec internet.'));document.head.appendChild(s)})}
 if(!TESS)TESS=await Tesseract.createWorker('fra',1,{langPath:new URL('../tessdata/',location.href).href,gzip:true,logger:m=>{if(m.status==='recognizing text')onp(Math.round(m.progress*100))}});
 await TESS.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});const img=await prepImage(file);const r=await TESS.recognize(img);return r.data.text}
async function prepImage(file){const bmp=await createImageBitmap(file);const sc=Math.min(1,2600/Math.max(bmp.width,bmp.height));const c=document.createElement('canvas');c.width=bmp.width*sc;c.height=bmp.height*sc;const x=c.getContext('2d');x.drawImage(bmp,0,0,c.width,c.height);
 const d=x.getImageData(0,0,c.width,c.height),a=d.data;for(let i=0;i<a.length;i+=4){const g=.3*a[i]+.59*a[i+1]+.11*a[i+2];const v=g>150?255:g<90?0:(g-90)*4.25;a[i]=a[i+1]=a[i+2]=v}x.putImageData(d,0,0);return c}
// texte d'un PDF, ligne par ligne ; une page sans texte (scan) est rendue en image pour la lecture optique
export async function pdfRead(file){const L=await pdfLib();const doc=await L.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;let text='';const imgs=[];
 for(let p=1;p<=doc.numPages;p++){const pg=await doc.getPage(p);const tc=await pg.getTextContent();const it=tc.items.filter(i=>i.str&&i.str.trim());
  if(it.length<15){const vp=pg.getViewport({scale:2.6});const c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;imgs.push(c);continue}
  const rows=[];for(const i of it){const y=i.transform[5];let r=rows.find(r=>Math.abs(r.y-y)<3);if(!r){r={y,a:[]};rows.push(r)}r.a.push({x:i.transform[4],s:i.str.trim()})}
  rows.sort((a,b)=>b.y-a.y);for(const r of rows){r.a.sort((a,b)=>a.x-b.x);text+=r.a.map(i=>i.s).join(' ')+'\n'}}
 return {text,imgs}}
/** Une facture (photo ou PDF) → son texte, ligne par ligne. */
export async function texteDeFichier(file, progres = () => {}) {
  if (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name)) {
    const { text, imgs } = await pdfRead(file);
    let t = text;
    for (const c of imgs) t += '\n' + await ocrCanvas(c, progres);
    return t;
  }
  return ocrImage(file, progres);
}
async function ocrCanvas(c, onp) { const b = await new Promise(r => c.toBlob(r, 'image/png')); return ocrImage(new File([b], 'page.png', { type: 'image/png' }), onp); }
