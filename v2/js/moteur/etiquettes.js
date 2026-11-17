// Étiquettes épicerie : planche A4 de 24 (3 × 8, 66 × 35 mm), modèles Standard et Top Vente, PDF fabriqué sur l'appareil.
// Repris À L'IDENTIQUE de la V1 (index.html v16, onglet Étiquettes épicerie) : mêmes fonctions, mêmes tailles, même police InterE.
// Seules adaptations : les réglages globaux de la V1 (noms modifiés, modèle forcé, seuil Top Vente, durée des ventes) passent par CTX.
const CTX = { noms: {}, force: {}, seuil: 365, jours: 365 };
export function configurer(o) { Object.assign(CTX, o); }
function cleanName(l){let s=' '+String(l).toUpperCase().replace(/\s+/g,' ')+' ';
 s=s.replace(/\/CT\s*\d+.*$/,' ').replace(/\b(PQT?|BTE|PAV\.?|IDS|MDD|NON-UE|CT\s*\d+\s*PQT)\b/g,' ').replace(/\*/g,' X ');
 s=s.replace(/(\d)\.(\d)/g,'$1,$2').replace(/(\d)\s*(KG|GR?|CL|ML|L)\b/g,"$1\u00a0$2").replace(/\s*-\s*$/,' ').replace(/\s+/g,' ').trim();return s}
const nameOf=o=>CTX.noms[o.e]??cleanName(o.lib);

const LP=["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"],GP=["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"],RP=["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"],PAR=["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];
function chk(code){const d=[...code].map(Number);const b=d.pop();let s=0;d.reverse().forEach((x,i)=>s+=x*(i%2?1:3));return (10-s%10)%10===b}

const fmt=x=>x.toFixed(2).replace('.',',');
function qty(nom){const u=nom.toUpperCase();if(/\d\s*X\s*\d/.test(u))return null;const m=u.match(/(\d+(?:[.,]\d+)?)\s*(CL|ML|L|G|GR|KG|LITRES?|LITRE)\b/);if(!m)return null;const v=parseFloat(m[1].replace(',','.'));const k=m[2];
 if(k==='CL')return[v/100,'L'];if(k==='ML')return[v/1000,'L'];if(/^L/.test(k))return[v,'L'];if(k==='KG')return[v,'kg'];return[v/1000,'kg']}

function pu(o,nm){const q=qty(nm)||qty(o.lib);if(!q||o.prix==null)return null;return [q[1]==='L'?'PRIX AU LITRE':'PRIX AU KILO',fmt(o.prix/q[0])+' €']}

const isTop=o=>(o.q||0)*365/(CTX.jours||365)>=(CTX.seuil||365);
const modelOf=o=>CTX.force[o.e]||(isTop(o)?'top':'std');

const PXMM=12;

const F=(w,s)=>`${w} ${s}px InterE, "Helvetica Neue", Arial, sans-serif`;
function wrapLines(ctx,text,font,maxW){ctx.font=font;const words=text.split(' ');const out=[];let cur='';for(const w of words){const t=cur?cur+' '+w:w;if(ctx.measureText(t).width<=maxW||!cur)cur=t;else{out.push(cur);cur=w}}if(cur)out.push(cur);return out}
function fitName(ctx,text,maxW,maxH,sizes=[74,70,66,62,58,55,52,49,46,43,40,37,34,31,28,26,24,22]){for(const s of sizes){const l=wrapLines(ctx,text,F(900,s),maxW);if(l.length<=2&&l.length*s*1.0<=maxH&&l.every(x=>ctx.measureText(x).width<=maxW))return {s,l}}const s=22;return {s,l:wrapLines(ctx,text,F(900,s),maxW).slice(0,2)}}
function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
function star(ctx,cx,cy,r){ctx.beginPath();for(let i=0;i<10;i++){const rr2=i%2?r*.42:r,a=-Math.PI/2+i*Math.PI/5;ctx.lineTo(cx+rr2*Math.cos(a),cy+rr2*Math.sin(a))}ctx.closePath();ctx.fill()}

function bitsOf(code){if(!/^\d+$/.test(code)||!((code.length===13||code.length===8)&&chk(code)))return null;const d=[...code].map(Number);
 if(code.length===13){const p=PAR[d[0]];return {bits:'101'+[1,2,3,4,5,6].map((k,i)=>(p[i]==='L'?LP:GP)[d[k]]).join('')+'01010'+[7,8,9,10,11,12].map(k=>RP[d[k]]).join('')+'101',g:[0,1,2,45,46,47,48,49,92,93,94]}}
 return {bits:'101'+[0,1,2,3].map(k=>LP[d[k]]).join('')+'01010'+[4,5,6,7].map(k=>RP[d[k]]).join('')+'101',g:[0,1,2,31,32,33,34,35,64,65,66]}}
// code-barres dessiné en pixels réels : module = 0,25 mm = 3 px
function drawBarcode(ctx,code,x,y,w,h,mod=3){const b=bitsOf(code);const T=ctx.getTransform();ctx.save();
 if(!b){ctx.fillStyle='#c62828';ctx.font=F(700,13);ctx.textAlign='center';ctx.fillText('code '+code+' non imprimable',x+w/2,y+h/2);ctx.restore();return}
 const p0=T.transformPoint(new DOMPoint(x,y)),p1=T.transformPoint(new DOMPoint(x+w,y+h));ctx.setTransform(1,0,0,1,0,0);
 const n=b.bits.length,bw=n*mod,X=Math.round((p0.x+p1.x)/2-bw/2),H=p1.y-p0.y,fs=Math.round(H*0.2),bh=Math.round(H-fs-2);ctx.fillStyle='#000';
 for(let i=0;i<n;){if(b.bits[i]==='1'){let j=i;while(b.bits[j]==='1')j++;ctx.fillRect(X+i*mod,Math.round(p0.y),(j-i)*mod,bh+(b.g.includes(i)?Math.round(fs*.5):0));i=j}else i++}
 ctx.font=F(700,fs);ctx.textBaseline='alphabetic';const yb=p1.y-1;
 if(code.length===13){ctx.textAlign='right';ctx.fillText(code[0],X-mod,yb);ctx.textAlign='center';ctx.fillText(code.slice(1,7),X+24*mod,yb);ctx.fillText(code.slice(7),X+71*mod,yb)}else{ctx.textAlign='center';ctx.fillText(code.slice(0,4),X+17*mod,yb);ctx.fillText(code.slice(4),X+50*mod,yb)}
 ctx.restore()}
// prix « 2,50 € » : euros, puis ,centimes et € en colonne (modèle validé)
function drawPrice3(ctx,pr,x,midY,k,col){const [e,c]=pr.toFixed(2).split('.');let [b,cs,eu]=e.length===1?[200,92,52]:[150,70,40];[b,cs,eu]=[b,cs,eu].map(v=>v*k);ctx.fillStyle=col;ctx.textBaseline='alphabetic';ctx.textAlign='left';
 const top=midY-b*.36;ctx.font=F(900,b);const ew=ctx.measureText(e).width;ctx.fillText(e,x,top+b*.72);ctx.font=F(900,cs);ctx.fillText(','+c,x+ew+6,top+cs*.72);ctx.font=F(900,eu);ctx.fillText('€',x+ew+10,top+cs*.72+16*k+eu*.75+4)}
function labelStd(ctx,o){const nm=nameOf(o),u=pu(o,nm);ctx.fillStyle='#fff';ctx.fillRect(0,0,529,280);
 const {s,l}=fitName(ctx,nm.toUpperCase(),497,138);ctx.fillStyle='#000';ctx.font=F(900,s);ctx.textAlign='left';ctx.textBaseline='alphabetic';const y0=10+(138-l.length*s)/2;l.forEach((t,i)=>ctx.fillText(t,16,y0+i*s+s*.8));
 ctx.fillRect(16,151,497,3);const midY=158+56;
 if(o.prix!=null)drawPrice3(ctx,o.prix,16,midY,o.prix<10?.48:.54,'#000');else{ctx.font=F(900,34);ctx.fillText('PRIX À',16,midY-4);ctx.fillText('DÉFINIR',16,midY+32)}
 const bx=513-238,by=160;ctx.lineWidth=2;ctx.strokeStyle='#000';ctx.strokeRect(bx+1,by+1,236,106);
 if(u){ctx.textAlign='center';ctx.font=F(900,11);ctx.fillText(u[0],bx+119,by+15);ctx.font=F(900,20);ctx.fillText(u[1],bx+119,by+36)}
 drawBarcode(ctx,o.e,bx+5,by+50,228,52)}
function labelTop(ctx,o){const nm=nameOf(o),u=pu(o,nm);ctx.fillStyle='#fff';ctx.fillRect(0,0,529,280);ctx.fillStyle='#000';ctx.fillRect(0,0,54,280);ctx.fillStyle='#fff';star(ctx,27,26,12);star(ctx,27,254,12);
 ctx.save();ctx.translate(27,140);ctx.rotate(-Math.PI/2);ctx.font=F(900,25);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('T O P   V E N T E',0,1);ctx.restore();
 const {s,l}=fitName(ctx,nm.toUpperCase(),447,124);ctx.fillStyle='#000';ctx.font=F(900,s);ctx.textAlign='left';ctx.textBaseline='alphabetic';const y0=8+(124-l.length*s)/2;l.forEach((t,i)=>ctx.fillText(t,68,y0+i*s+s*.8));
 ctx.fillRect(54,134,475,74);if(o.prix!=null)drawPrice3(ctx,o.prix,70,171,o.prix<10?.42:.48,'#fff');else{ctx.fillStyle='#fff';ctx.font=F(900,30);ctx.fillText('PRIX À DÉFINIR',70,182)}
 if(u){ctx.fillStyle='#fff';ctx.textAlign='right';ctx.font=F(900,11);ctx.fillText(u[0],515,160);ctx.font=F(900,22);ctx.fillText(u[1],515,186)}
 drawBarcode(ctx,o.e,54+(475-228)/2,216,228,54)}
function cutDash(ctx,x,y,w,h){ctx.save();ctx.strokeStyle='#9a9a9a';ctx.lineWidth=2;ctx.setLineDash([8,6]);ctx.strokeRect(x+1,y+1,w-2,h-2);ctx.restore()}
function newPage(wmm,hmm){const c=document.createElement('canvas');c.width=Math.round(wmm*PXMM);c.height=Math.round(hmm*PXMM);const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);return {c,x}}
async function pagesGondole(list,force){const pages=[];const sc=66*PXMM/529;for(let i=0;i<list.length;i+=24){const {c,x}=newPage(210,297);list.slice(i,i+24).forEach((o,j)=>{const col=j%3,row=Math.floor(j/3);x.save();x.translate((6+col*66)*PXMM,(8.5+row*35)*PXMM);x.scale(sc,sc);((force||modelOf(o))==='top'?labelTop:labelStd)(x,o);cutDash(x,0,0,529,280);x.restore()});pages.push({c,w:210,h:297})}return pages}

async function canvasJpeg(c){return new Promise(r=>c.toBlob(b=>b.arrayBuffer().then(a=>r(new Uint8Array(a))),'image/jpeg',0.92))}
async function buildPdf(pages){const te=new TextEncoder();const chunks=[];let off=0;const xref=[];const push=x=>{const b=typeof x==='string'?te.encode(x):x;chunks.push(b);off+=b.length};
 const n=pages.length;const pageIds=[],objs=[];let id=3;for(let i=0;i<n;i++){pageIds.push(id);id+=3}
 push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');xref[1]=off;push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);xref[2]=off;push(`2 0 obj\n<< /Type /Pages /Kids [${pageIds.map(i=>i+' 0 R').join(' ')}] /Count ${n} >>\nendobj\n`);
 for(let i=0;i<n;i++){const p=pages[i],pid=pageIds[i];const W=(p.w*72/25.4).toFixed(2),H=(p.h*72/25.4).toFixed(2);const jpg=await canvasJpeg(p.c);p.c.width=p.c.height=1;
  const cs=`q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;xref[pid]=off;push(`${pid} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${pid+2} 0 R >> >> /Contents ${pid+1} 0 R >>\nendobj\n`);
  xref[pid+1]=off;push(`${pid+1} 0 obj\n<< /Length ${cs.length} >>\nstream\n${cs}\nendstream\nendobj\n`);
  xref[pid+2]=off;push(`${pid+2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${Math.round(p.w*PXMM)} /Height ${Math.round(p.h*PXMM)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);push(jpg);push('\nendstream\nendobj\n')}
 const xo=off;let x=`xref\n0 ${id}\n0000000000 65535 f \n`;for(let i=1;i<id;i++)x+=String(xref[i]).padStart(10,'0')+' 00000 n \n';push(x+`trailer\n<< /Size ${id} /Root 1 0 R >>\nstartxref\n${xo}\n%%EOF`);return new Blob(chunks,{type:'application/pdf'})}

export { cleanName, nameOf, qty, pu, fmt, chk, isTop, modelOf, labelStd, labelTop, pagesGondole, buildPdf, PXMM, fitName, F };
