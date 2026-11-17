// Lecture des fichiers Excel et CSV exportés par StorePOS.
// Repris à l'identique de la V1 (index.html, v16 du 17/11/2026) : ne pas modifier sans tester sur les vrais exports.
async function inflate(buf){const ds=new DecompressionStream('deflate-raw');const s=new Blob([buf]).stream().pipeThrough(ds);return new Uint8Array(await new Response(s).arrayBuffer())}
async function unzip(ab){const u=new Uint8Array(ab),dv=new DataView(ab);let e=u.length-22;while(e>=0&&dv.getUint32(e,true)!==0x06054b50)e--;if(e<0)throw new Error('zip');
 const n=dv.getUint16(e+10,true);let p=dv.getUint32(e+16,true);const out={};const td=new TextDecoder();
 for(let i=0;i<n;i++){const m=dv.getUint16(p+10,true),cs=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),xl=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),lo=dv.getUint32(p+42,true);
  const name=td.decode(u.subarray(p+46,p+46+nl));const lnl=dv.getUint16(lo+26,true),lxl=dv.getUint16(lo+28,true);const st=lo+30+lnl+lxl;const raw=u.subarray(st,st+cs);
  out[name]={m,raw};p+=46+nl+xl+cl}
 return {async text(name){const f=out[name];if(!f)return null;const b=f.m===0?f.raw:await inflate(f.raw);return new TextDecoder().decode(b)},names:Object.keys(out)}}
function colIdx(r){let n=0;for(const c of r.replace(/\d/g,''))n=n*26+c.charCodeAt(0)-64;return n-1}
async function readXlsx(ab){const z=await unzip(ab);const ss=[];const sst=await z.text('xl/sharedStrings.xml');const dp=new DOMParser();
 if(sst){const x=dp.parseFromString(sst,'application/xml');x.querySelectorAll('si').forEach(si=>{let t='';si.querySelectorAll('t').forEach(e=>t+=e.textContent);ss.push(t)})}
 let sheet='xl/worksheets/sheet1.xml';if(!z.names.includes(sheet))sheet=z.names.find(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n));
 const x=dp.parseFromString(await z.text(sheet),'application/xml');const rows=[];
 x.querySelectorAll('sheetData row').forEach(r=>{const a=[];r.querySelectorAll('c').forEach(c=>{const t=c.getAttribute('t');let v='';const ve=c.querySelector('v');
  if(t==='s')v=ss[+ve.textContent]??'';else if(t==='inlineStr'){v='';c.querySelectorAll('is t').forEach(e=>v+=e.textContent)}else v=ve?ve.textContent:'';a[colIdx(c.getAttribute('r'))]=v});rows.push(a)});
 return rows}
function readCsv(txt){const sep=(txt.split('\n')[0].match(/;/g)||[]).length>=(txt.split('\n')[0].match(/,/g)||[]).length?';':',';const rows=[];let row=[],f='',q=false;
 for(let i=0;i<txt.length;i++){const c=txt[i];if(q){if(c=='"'){if(txt[i+1]=='"'){f+='"';i++}else q=false}else f+=c}else if(c=='"')q=true;else if(c==sep){row.push(f);f=''}else if(c=='\n'){row.push(f.replace(/\r$/,''));rows.push(row);row=[];f=''}else f+=c}
 if(f||row.length){row.push(f);rows.push(row)}return rows}
const norm=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z0-9]/g,'');
function findCol(h,cands){const H=h.map(norm);for(const c of cands){const i=H.indexOf(norm(c));if(i>=0)return i}for(const c of cands){const i=H.findIndex(x=>x.includes(norm(c)));if(i>=0)return i}return -1}
function eanStr(v){v=String(v??'').trim();if(!v)return '';if(/^[\d.]+e[+-]?\d+$/i.test(v)){v=Number(v).toFixed(0)}v=v.replace(/\.0+$/,'').replace(/\s/g,'');return v}
function num(v){if(v===''||v==null)return null;const n=parseFloat(String(v).replace(',','.').replace(/[^\d.\-]/g,''));return isNaN(n)?null:n}

export { inflate, unzip, colIdx, readXlsx, readCsv, norm, findCol, eanStr, num };
