// Lecture de facture et calcul des prix : code repris à l'identique de la V1 (index.html v16).
// Seules adaptations : module ES, données passées par configurer() au lieu de variables globales,
// et fonctions qui lisaient l'écran (INV, scanner, modales) retirées ou rendues pures.
import { norm, eanStr, num } from './xlsx.js';

let P = {}, MAP = { four: {} }, CASC = [], REFMAP = {}, REGDES = {}, SETF = {}, REFDB = null;
const D = { ori: {}, lab: {} };           // illustrations et origines : lot affiches F&L
export function configurer(o) {
  if (o.P) P = o.P; if (o.MAP) MAP = o.MAP; if (o.CASC) CASC = o.CASC; if (o.REFMAP) REFMAP = o.REFMAP; if (o.REGDES) REGDES = o.REGDES; if (o.SETF) SETF = o.SETF;
  REFDB = null; TOKIDX = null;
}
const isFL = o => /FRUIT|LEG/i.test(o.dep || '');

const today=()=>new Date().toISOString().slice(0,10);
const key=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
const KW=[[/SAC.*OIGNON|OIGNON.*SAC|OIGNON JAUNE 5 ?KG/,'oignon_jaune_sac5'],[/PDT AGATHA|AGATHA X ?5|AGATHA 5 ?KG/,'pdt_agatha_sac5'],[/\bBAN\b/,'banane'],[/\bTOM\b/,'tomate_ronde'],[/OIGNON ROUGE/,'oignon_rouge'],[/OIGNON BLANC/,'oignon_blanc'],[/OIGNON/,'oignon_jaune'],[/SAC.*(POMME DE TERRE|PDT)|(POMME DE TERRE|PDT).*SAC/,'pdt_agatha_sac5'],[/NOUVELLE/,'pdt_nouvelle'],[/POMME DE TERRE|PDT|PATATE/,'pdt_vrac'],[/CAROTTE/,'carotte_sac5'],
 [/GOLDEN/,'golden'],[/FUJI/,'pomme_fuji'],[/GALA/,'royal_gala'],[/POMME/,'pomme_rouge'],[/POIRE/,'poire'],[/CLEMENTINE|MANDARINE/,'clementine'],[/ORANGE/,'orange'],[/CITRON/,'citron'],[/KIWI/,'kiwi'],[/AVOCAT/,'avocat'],[/MANGUE/,'mangue'],[/PASTEQUE/,'pasteque'],[/MELON VERT/,'melon_vert'],[/MELON/,'melon_jaune'],
 [/NECTARINE BLANCHE/,'nectarine_blanche'],[/NECTARINE/,'nectarine_jaune'],[/PECHE/,'peche_jaune'],[/ABRICOT/,'abricot'],[/PRUNE JAUNE|MIRABELLE/,'prune_jaune'],[/PRUNE/,'prune_rouge'],[/CERISE/,'cerise'],[/FRAISE/,'fraise'],[/BARBARIE/,'figue_barbarie'],[/FIGUE/,'figue'],[/KAKI/,'kaki'],[/GRENADE/,'grenade'],[/BANANE/,'banane'],
 [/RED GLOBE|RAISIN ROUGE/,'raisin_red_globe'],[/RAISIN NOIR/,'raisin_noir'],[/RAISIN/,'raisin_blanc'],[/GRAPPE/,'tomate_grappe'],[/ROMA/,'tomate_roma'],[/PLATEAU|COEUR DE BOEUF/,'tomate_plateau'],[/TOMATE/,'tomate_ronde'],[/PIMENT/,'piment_vert'],[/POIVRON/,'poivron_long'],[/CONCOMBRE MINI|MINI CONCOMBRE/,'concombre_mini'],[/CONCOMBRE/,'concombre'],
 [/COURGETTE/,'courgette'],[/COURGE|POTIRON|BUTTERNUT/,'courge'],[/CELERI/,'celeri'],[/BATAVIA/,'salade_batavia'],[/SALADE|LAITUE|ICEBERG/,'salade_iceberg'],[/CORIANDRE/,'coriandre'],[/MENTHE/,'menthe'],[/PERSIL/,'persil_plat'],[/GINGEMBRE/,'gingembre'],[/MAIS/,'mais'],[/AIL PELE/,'ail_pele'],[/AIL.*3|3.*AIL/,'ail_3'],[/\bAIL\b/,'ail']];
const COUNTRY={MAROC:'MA',ESPAGNE:'ES',FRANCE:'FR',ITALIE:'IT',HOLLANDE:'NL','PAYS BAS':'NL',EGYPTE:'EG',ARGENTINE:'AR',CHINE:'CN','COSTA RICA':'CR',EQUATEUR:'EC',COLOMBIE:'CO',PORTUGAL:'PT',TURQUIE:'TR',PEROU:'PE',CHILI:'CL',BRESIL:'BR',GRECE:'GR',BELGIQUE:'BE',MEXIQUE:'MX',MAURITANIE:'MR'};
function autoIll(lib){const u=norm(lib).length?String(lib).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,''):'';for(const [r,k] of KW)if(r.test(u))return k;return ''}
function flOf(o){const s=SETF[o.e]||{};const u=String(o.lib).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
 const ill=s.ill??autoIll(o.lib);let ori=s.ori;if(ori==null){ori='';for(const [n,c] of Object.entries(COUNTRY))if(u.includes(n))ori=c;if(!ori&&ill&&D.ori[ill]&&D.ori[ill].length===1)ori=D.ori[ill][0]}
 const unit=s.unit??(/SAC/.test(u)?'le sac':/SALADE|ICEBERG|BATAVIA|CELERI|MAIS/.test(u)?'la pièce':/FRAISE|BARQ/.test(u)?'la barquette':/BOTTE|PERSIL|CORIANDRE|MENTHE/.test(u)?'la botte':/PAR 3|X3|3 TETES/.test(u)?'les 3':'le kg');
 let nom=s.nom??(D.lab[ill]&&!/SAC|PAR 3/.test(u)?D.lab[ill]:o.lib.charAt(0)+o.lib.slice(1).toLowerCase());return {ill,ori,unit,nom,cat:s.cat??'Cat. I',info:s.info??''}}
const COUNTRIES=['ESPAGNE','MAROC','FRANCE','ITALIE','HOLLANDE','EGYPTE','ARGENTINE','CHINE','COSTA-RICA','COSTA RICA','EQUATEUR','COLOMBIE','PORTUGAL','TURQUIE','PEROU','CHILI','BRESIL','GRECE','BELGIQUE','MEXIQUE','MAURITANIE','AFRIQUE DU SUD','GUATEMALA','COTE-D IVOIRE','COTE D IVOIRE','REPUBLIQUE POPULAIRE DE CHINE','UKRAINE','BULGARIE'];
const C2={'ESPAGNE':'ES','MAROC':'MA','FRANCE':'FR','ITALIE':'IT','HOLLANDE':'NL','EGYPTE':'EG','ARGENTINE':'AR','CHINE':'CN','REPUBLIQUE POPULAIRE DE CHINE':'CN','COSTA-RICA':'CR','COSTA RICA':'CR','EQUATEUR':'EC','COLOMBIE':'CO','PORTUGAL':'PT','TURQUIE':'TR','PEROU':'PE','CHILI':'CL','BRESIL':'BR','GRECE':'GR','BELGIQUE':'BE','MEXIQUE':'MX','MAURITANIE':'MR','AFRIQUE DU SUD':'ZA','GUATEMALA':'GT','COTE-D IVOIRE':'CI','COTE D IVOIRE':'CI'};
function fixNum(s){if(s==null)return null;s=String(s).replace(/[Oo]/g,'0').replace(/[|\]!:;'’]/g,'').replace(',','.');if(/^\d{3}$/.test(s))s=s[0]+'.'+s.slice(1);if(/^\d{4}$/.test(s))s=s.slice(0,2)+'.'+s.slice(2);const n=parseFloat(s);return isNaN(n)?null:n}
function detectSupplier(t){const u=key(t);if(/AGRIFRESH|CORBAS/.test(u))return 'AGRIFRESH';if(/METRO/.test(u))return 'METRO';if(/PROMOCASH/.test(u))return 'PROMOCASH';if(/AGIDRA/.test(u))return 'AGIDRA';if(/MONDIAL/.test(u))return 'MONDIAL';if(/\bDCA\b/.test(u))return 'DCA';if(/GLOBAL FOOD/.test(u))return 'GLOBAL FOOD';if(/TRANSGOURMET/.test(u))return 'TRANSGOURMET';return 'AUTRE'}
const SN=s=>key(s||'').replace(/[^A-Z0-9]/g,''),RN=r=>String(r||'').toUpperCase().replace(/\s/g,'').replace(/^0+/,'');
function refDb(){if(REFDB)return REFDB;REFDB={ref:{},des:{}};const put=(s,r,e,d)=>{e=eanStr(e);if(!e)return;if(!P[e]&&P[e.padStart(13,'0')])e=e.padStart(13,'0');if(!P[e])return;const sn=SN(s);if(!sn)return;if(r)REFDB.ref[sn+'|'+RN(r)]=e;if(d){const k=TOK(d).join(' ');if(k)REFDB.des[sn+'|'+k]=e}};
 for(const o of Object.values(P))if(o.reff&&o.four)put(o.four,o.reff,o.e);for(const [s,r,e,d] of CASC)put(s,r,e,d);for(const [k,e] of Object.entries(REFMAP)){const i=k.indexOf('|');put(k.slice(0,i),k.slice(i+1),e)}for(const [k,e] of Object.entries(REGDES)){const i=k.indexOf('|');put(k.slice(0,i),'',e,k.slice(i+1))}return REFDB}
function supList(){const s=new Map();const add=n=>{n=String(n||'').trim();if(n&&n!=='nan'&&!s.has(SN(n)))s.set(SN(n),n)};Object.keys(MAP.four||{}).forEach(add);CASC.forEach(r=>add(r[0]));Object.values(P).forEach(o=>add(o.four));return [...s.values()].sort()}
const sameSup=(a,b)=>{a=SN(a);b=SN(b);return !!a&&!!b&&(a===b||a.startsWith(b)||b.startsWith(a))};
function supCanon(d){const n=SN(d);if(!n||n==='AUTRE')return 'AUTRE';const l=supList();return l.find(x=>SN(x)===n)||l.find(x=>sameSup(x,d))||l.find(x=>SN(x).includes(n))||d}
function supOpts(sel,first){return (first?`<option value="">${first}</option>`:'')+supList().map(s=>`<option ${sameSup(s,sel)?'selected':''}>${esc(s)}</option>`).join('')}
const DEC=/^\d{1,5}[.,]\d{2,4}$/,UNITS=/^(U|UN|UNI|PCE|PC|PCS|KG|COL|CT|CRT|X|L|BT|BTE|PQT|SAC|LOT|FD|EUR|€|HT|TTC)$/;
const byBag=o=>{if(!o)return false;const u=flOf(o).unit;return u==='le sac'||u==='le filet'};
function bagKg(d){const u=String(d).toUpperCase();let m=u.match(/(\d+(?:[.,]\d+)?)\s*KG/);if(m)return parseFloat(m[1].replace(',','.'));m=u.match(/\bX\s?(\d{1,2})\b/);return m?+m[1]:null}
function agriPa(o,x){if(x.raw==null)return null;if(x.uv==='k'&&byBag(o)&&x.bag>0)return Math.round(x.raw*x.bag*100)/100;return x.raw}
function agriNote(o,x){if(x.raw==null)return '';const f=n=>Number(n).toFixed(2).replace('.',','),g=n=>String(n).replace('.',',');if(x.uv==='k'&&byBag(o)&&x.bag>0)return `P.U. ${f(x.raw)} €/kg × sac de ${g(x.bag)} kg = ${f(x.pu)} € le sac`;if(x.uv==='k')return `P.U. ${f(x.raw)} € le kg`;if(x.uv==='p')return `P.U. ${f(x.raw)} € la pièce`;return ''}
function genLine(l,sup){let tk=l.split(' ').filter(Boolean);if(tk.length<3)return null;
 if(/^(5[.,]5|5[.,]50|20|20[.,]00?|10|10[.,]00?|2[.,]1)%?$/.test(tk[tk.length-1])&&tk.filter(w=>DEC.test(w)).length>=3)tk.pop();while(tk.length&&/^(€|EUR|[A-D])$/i.test(tk[tk.length-1]))tk.pop();
 const decs=tk.map((w,i)=>[w,i]).filter(([w])=>DEC.test(w));const em=l.match(/\b(\d{12,13}|\d{8})\b/);if(decs.length<2&&!(em&&decs.length))return null;
 let i0=0,ref='';if(tk[0]&&/\d/.test(tk[0])&&/^[A-Z0-9][A-Z0-9.\-\/]{2,14}$/i.test(tk[0])&&!DEC.test(tk[0])&&!(em&&tk[0]===em[1])){ref=tk[0];i0=1}
 let ean='';if(em){ean=em[1];const k=tk.indexOf(ean);if(k>=i0&&k<=i0+2)i0=k+1}if(!ref&&/^\d{4,8}$/.test(tk[i0]||'')&&/[A-Za-z]/.test(tk[i0+1]||'')){ref=tk[i0];i0++}
 let last=-1;for(let i=i0;i<tk.length;i++)if(/[A-Za-zÀ-ÿ]{2,}/.test(tk[i])&&!UNITS.test(key(tk[i])))last=i;if(last<i0)return null;
 const des=tk.slice(i0,last+1).join(' ').replace(/^[-*]+|[-*]+$/g,'').trim();if((des.match(/[A-Za-zÀ-ÿ]/g)||[]).length<4)return null;
 const after=tk.slice(last+1),nums=after.filter(w=>DEC.test(w)).map(fixNum),ints=after.filter(w=>/^\d{1,4}$/.test(w)).map(Number);if(!nums.length)return null;
 const mt=nums[nums.length-1];let pu=nums.length>1?nums[nums.length-2]:null;
 for(const c of nums.slice(0,-1)){if(!c)continue;const q=mt/c;if(Math.abs(q-Math.round(q))<0.02&&Math.round(q)>=1&&(ints.includes(Math.round(q))||Math.round(q)===1)){pu=c;break}}
 return {ref,ean,des,pu,mt}}
function invDate(t){const m=t.match(/(\d{2})[\/-](\d{2})[\/-](20\d{2})/);return m?`${m[3]}-${m[2]}-${m[1]}`:today()}
const EANS=()=>Object.keys(P);
function fixEan(s){s=s.replace(/\D/g,'');if(P[s])return s;if(s.length===12){for(const e of EANS())if(e.length===13){for(let i=0;i<13;i++)if(e.slice(0,i)+e.slice(i+1)===s)return e}}return ''}
const TOK=s=>key(s).replace(/[^A-Z0-9 ]/g,' ').split(' ').filter(w=>w.length>=3&&!/^(KG|GR|BTE|PQT|CT|LOT|PAV|IDS|POUR|AVEC|SANS|LES|DES|UHT)$/.test(w));
let TOKIDX=null;function tokIndex(){TOKIDX={};for(const o of Object.values(P))for(const w of new Set(TOK(o.lib)))(TOKIDX[w]||(TOKIDX[w]=[])).push(o.e);return TOKIDX}
function fuzzy(des,onlyFL,sup){const idx=TOKIDX||tokIndex();const sc={};for(const w of new Set(TOK(des)))for(const e of (idx[w]||[])){if(onlyFL&&!isFL(P[e]))continue;sc[e]=(sc[e]||0)+1}let best='',bs=0;for(const [e,s] of Object.entries(sc)){const n=TOK(P[e].lib).length||1;const v=s-0.15*Math.max(0,n-s)+(sup&&sameSup(P[e].four,sup)?0.6:0);if(v>bs){bs=v;best=e}}return bs>=1?best:''}
function flFiche(k){if(!k)return '';const c=Object.values(P).filter(o=>isFL(o)&&autoIll(o.lib)===k);c.sort((a,b)=>(b.q||0)-(a.q||0));return c[0]?c[0].e:''}
function parseInvoice(text,forced){const sup=forced||supCanon(detectSupplier(text)),date=invDate(text),out=[];const lines=text.split(/\n/).map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean);
 for(let l of lines){l=l.replace(/^.*?\bBL\s*N[°O]?\s*\d+\s+\d{2}\/\d{2}\/\d{4}\s*/i,'').trim();if(!l)continue;const u=key(l);if(/TOTAL|MONTANT|TVA|FACTURE|PAGE|CLIENT|CAPITAL|SIRET|PRIX AU KG|DESIGNATION|EUR$|ECHEANCE|BL N/.test(u))continue;
  if(sup==='AGRIFRESH'){let ci=-1,cn='';for(const c of COUNTRIES){const i=u.indexOf(' '+c);if(i>0&&(ci<0||i<ci)){ci=i;cn=c}}if(ci<0){const k0=autoIll(l),nn=(l.match(/\d+[.,]\d{2}/g)||[]).length;if(!k0||nn<2)continue;const fm=l.search(/\s\S*\d/);ci=fm>3?fm:l.length;cn=''}
   let des=l.slice(0,ci).replace(/[|\]\[]/g,' ').replace(/\s1\s*$/,'').replace(/\s+/g,' ').trim();if(des.length<4)continue;const tail=l.slice(ci);const um=tail.match(/\s(?:(\d+)\s+)?([kKpP])\s+(\d+[.,]\d{1,4})\s+(\d+[.,]\d{2})(?:\s+\d)?\s*$/);let uv='',raw=null,mt=null,kgc=null;
   if(um){uv=um[2].toLowerCase();raw=fixNum(um[3]);mt=fixNum(um[4]);const pre=tail.slice(0,um.index),ns=pre.match(/\d+[.,]\d{2}|\b\d+\b/g)||[],colis=ns.length?parseInt(ns[0],10):0,dec=pre.match(/\d+[.,]\d{2}/g)||[],net=dec.length?fixNum(dec[dec.length-1]):null;if(uv==='k'&&colis>0&&net)kgc=Math.round(net/colis*10)/10}
   else{const nums=(tail.match(/[\dOo][\dOo.,|\]!:]*/g)||[]).map(fixNum).filter(x=>x!=null);mt=nums.length?nums[nums.length-1]:null;raw=nums.length>1?nums[nums.length-2]:null}
   const k=autoIll(des);const egg=/OEUF/.test(u);
   const rg=refDb().des[SN(sup)+'|'+TOK(des).join(' ')];const fe=egg?'':(rg&&isFL(P[rg])?rg:(flFiche(k)||fuzzy(des,true)));const ln={des,ori:C2[cn]||'',raw,uv,bag:bagKg(des)??kgc,mt,ill:egg?'':k,e:fe,fl:!egg,act:{lab:!egg,pa:!egg&&!!fe}};ln.pu=agriPa(P[fe],ln);ln.note=agriNote(P[fe],ln);out.push(ln)}
  else{const g=genLine(l,sup);if(!g)continue;let e='',how='';const eg=g.ean?(P[g.ean]?g.ean:(P[g.ean.padStart(13,'0')]?g.ean.padStart(13,'0'):fixEan(g.ean))):'';
   if(eg){e=eg;how='ean'}else{const R=refDb(),sn=SN(sup);const hr=g.ref&&R.ref[sn+'|'+RN(g.ref)],hd=R.des[sn+'|'+TOK(g.des).join(' ')];if(hr){e=hr;how='ref';const st=w=>w.slice(0,5),A=new Set(TOK(g.des).filter(w=>!/\d/.test(w)).map(st));if(A.size&&!TOK(P[e].lib).some(w=>A.has(st(w))))how='refdiff'}else if(hd){e=hd;how='ref'}else if(!g.ean){e=fuzzy(g.des,false,sup);if(e)how='proche'}}
   const o=P[e];const fl=!!o&&isFL(o)&&sup==='AGRIFRESH';out.push({des:g.des,ref:g.ref,ori:'',pu:g.pu,mt:g.mt,ill:fl?autoIll(o.lib):'',e,how,raw:g.ean&&!eg?g.ean:'',fl,act:{lab:!!e&&how!=='proche'&&how!=='refdiff',pa:false}})}}
 return {sup,date,lines:out}}
const tvaOf=o=>/TAUX NORMAL/.test(key(o.dep))?1.2:/INTERM/.test(key(o.dep))?1.1:1.055;
function suggPv(o,pa){if(!o||pa==null||!(pa>0))return null;const t=tvaOf(o),cur=o.prix;const m=cur!=null?1-pa/(cur/t):null;if(cur!=null&&m>=0.25)return {pv:cur,keep:true,m};
 let pv=Math.ceil(pa*1.64*t*10-1e-9)/10;if(cur!=null)pv=Math.min(pv,Math.round(cur*1.25*10)/10);if(cur!=null&&pv<cur)pv=cur;return {pv,keep:false,m:1-pa/(pv/t)}}
const fmt=x=>x.toFixed(2).replace('.',',');
// Rapprochement d'une ligne avec un produit, puis prix d'achat : même enchaînement que la V1 (reprice, lineChecks).
export function repricer(x, sup) { if (sup !== 'AGRIFRESH' || x.raw == null) return; x.pu = agriPa(P[x.e], x); x.note = agriNote(P[x.e], x); }
export function controles(x, sup) {
  const o = P[x.e]; const w = []; if (!o) return w;
  const s = sup !== 'AUTRE' ? sup : '';
  if (s && !x.fl) { if (!o.four) w.push(`fournisseur manquant en caisse (facture ${s})`); else if (!sameSup(o.four, s)) w.push(`fournisseur en caisse : ${o.four} (facture ${s})`); }
  if (x.pu != null && o.pa0 != null && o.pa0 > 0) { const d = (x.pu - o.pa0) / o.pa0; if (Math.abs(d) > 0.05) w.push(`PA en caisse ${fmt(o.pa0)} € ≠ facture ${fmt(x.pu)} € (${d > 0 ? '+' : ''}${Math.round(d * 100)} %)`); } else if (x.pu != null && !o.pa0) w.push("pas de prix d'achat en caisse");
  if (o.prix != null && x.pu != null) { const tva = tvaOf(o); const m = 1 - x.pu / (o.prix / tva); if (m < 0.25) w.push(`marge ${Math.round(m * 100)} % (< 25 %)`); if (o.prix / tva > x.pu * 3) w.push("PV plus de 3 fois le PA : colis ou lot ? vérifier que c'est la bonne fiche (unité)"); }
  return w;
}
export { P as _P, key, SN, RN, TOK, sameSup, supCanon, supList, parseInvoice, suggPv, tvaOf, fmt, isFL, autoIll, flOf, detectSupplier, fuzzy, fixEan };
