/* Ebook Maker — EPUB & PDF reader */
(() => {
const $ = s => document.querySelector(s);
const note = msg => { const t=$('#toast'); t.textContent=msg; t.hidden=false; clearTimeout(t._t); t._t=setTimeout(()=>t.hidden=true,3200); };
const R = { mode:'', key:'', zip:null, spine:[], toc:[], i:0, tk:0, urls:new Map(), css:new Map(),
  fs:+localStorage.getItem('rfs')||100, theme:+localStorage.getItem('rth')||0 };
const P = { pdf:null, zoom:1, vp:null, divs:[], io:null, cur:1, raf:0, w:0 };
const MIME = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', svg:'image/svg+xml', css:'text/css', ttf:'font/ttf', otf:'font/otf', woff:'font/woff', woff2:'font/woff2' };
const THEMES = ['', 'html,body{background:#f4ecd8!important;color:#3b2f1e!important}', 'html,body{background:#14181f!important;color:#d8dde6!important}a{color:#8ab4f8!important}'];
const BASE = 'body{font-family:"Noto Serif Bengali","Hind Siliguri",Georgia,serif;line-height:1.85;padding:18px 16px 48px;max-width:46em;margin:0 auto;overflow-wrap:anywhere}img,svg,video{max-width:100%;height:auto}';

/* ---------- helpers ---------- */
function loadScript(src){ return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=()=>rej(new Error(src)); document.head.appendChild(s); }); }
let pdfReady=null;
function loadPdfLib(){
  if(window.pdfjsLib) return Promise.resolve();
  return pdfReady||(pdfReady=(async()=>{
    const CDN='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
    try{ await loadScript('lib/pdf.min.js'); pdfjsLib.GlobalWorkerOptions.workerSrc='lib/pdf.worker.min.js'; }
    catch(e){ await loadScript(CDN+'pdf.min.js'); pdfjsLib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob([`importScripts("${CDN}pdf.worker.min.js");`],{type:'text/javascript'})); }
  })().catch(e=>{ pdfReady=null; throw e; }));
}
const xml = s => new DOMParser().parseFromString(s,'application/xml');
const zipText = async p => { const f=R.zip.file(p); if(!f) throw new Error('missing '+p); return f.async('string'); };
function resolve(from, rel){
  const u=new URL(rel,'http://x/'+encodeURI(from)); let p=u.pathname.slice(1);
  try{ p=decodeURIComponent(p); }catch(e){} return p;
}
async function blobUrl(path){
  if(R.urls.has(path)) return R.urls.get(path);
  const f=R.zip&&R.zip.file(path); if(!f) return '';
  const b=await f.async('blob'), u=URL.createObjectURL(new Blob([b],{type:MIME[path.split('.').pop().toLowerCase()]||''}));
  R.urls.set(path,u); return u;
}
async function cssText(path){
  if(R.css.has(path)) return R.css.get(path);
  let css=''; try{ css=await zipText(path); }catch(e){ return ''; }
  for(const m of [...css.matchAll(/url\(\s*['"]?(?!data:|https?:|#)([^'")]+?)['"]?\s*\)/g)]){
    const u=await blobUrl(resolve(path,m[1])); if(u) css=css.split(m[0]).join(`url("${u}")`);
  }
  R.css.set(path,css); return css;
}
const userCss = () => `html{font-size:${R.fs}%!important}${THEMES[R.theme]}`;

/* ---------- reader shell ---------- */
function setMode(m){
  R.mode=m; const e=m==='epub';
  $('#rFrame').hidden=!e; $('#rPdf').hidden=e; $('#rTheme').hidden=!e; $('#rDrawer').hidden=true;
  $('#rToc').textContent=e?'সূচি':'পৃষ্ঠা';
}
function closeReader(){
  R.tk++; R.zip=null; R.spine=[]; R.toc=[];
  R.urls.forEach(u=>URL.revokeObjectURL(u)); R.urls.clear(); R.css.clear();
  if(P.io) P.io.disconnect(); if(P.pdf){ try{ P.pdf.destroy(); }catch(e){} P.pdf=null; } P.divs=[];
  $('#rPdf').innerHTML=''; const d=$('#rFrame').contentDocument; if(d){ d.open(); d.write(''); d.close(); }
  $('#reader').hidden=true; document.body.style.overflow='';
}
async function openBook(file){
  const ext=file.name.split('.').pop().toLowerCase();
  if(ext!=='epub'&&ext!=='pdf') return note('শুধু .epub বা .pdf ফাইল খোলা যাবে');
  closeReader(); $('#reader').hidden=false; document.body.style.overflow='hidden';
  $('#rTitle').textContent=file.name; $('#rPos').textContent='লোড হচ্ছে…'; setMode(ext==='pdf'?'pdf':'epub');
  try{
    const buf=await file.arrayBuffer(); R.key=file.name+':'+file.size;
    if(ext==='pdf') await openPdf(buf); else await openEpub(buf);
  }catch(e){ console.error(e); note('ফাইলটি খোলা যায়নি'); closeReader(); }
}

/* ---------- EPUB ---------- */
async function openEpub(buf){
  if(typeof JSZip==='undefined') throw new Error('JSZip');
  R.zip=await JSZip.loadAsync(buf);
  const opfPath=xml(await zipText('META-INF/container.xml')).getElementsByTagName('rootfile')[0].getAttribute('full-path');
  const opf=xml(await zipText(opfPath)), man={};
  for(const it of opf.getElementsByTagName('item')) man[it.getAttribute('id')]={path:resolve(opfPath,it.getAttribute('href')),type:it.getAttribute('media-type')||'',props:it.getAttribute('properties')||''};
  R.spine=[...opf.getElementsByTagName('itemref')].map(r=>man[r.getAttribute('idref')]).filter(m=>m&&/html|xml/.test(m.type)&&!/ncx/.test(m.type));
  if(!R.spine.length) throw new Error('empty spine');
  const t=opf.getElementsByTagName('dc:title')[0]; if(t&&t.textContent.trim()) $('#rTitle').textContent=t.textContent.trim();
  await buildToc(man); renderToc();
  const saved=+localStorage.getItem('rp:'+R.key)||0;
  await renderChapter(Math.min(saved,R.spine.length-1));
}
async function buildToc(man){
  R.toc=[]; const all=Object.values(man), nav=all.find(m=>/\bnav\b/.test(m.props)), ncx=all.find(m=>/ncx/.test(m.type));
  try{
    if(nav){
      const d=new DOMParser().parseFromString(await zipText(nav.path),'text/html');
      const n=[...d.querySelectorAll('nav')].find(x=>/toc/.test(x.getAttribute('epub:type')||''))||d.querySelector('nav');
      if(n) n.querySelectorAll('a[href]').forEach(a=>{
        let lv=0; for(let p=a.parentElement;p&&p!==n;p=p.parentElement) if(/^(OL|UL)$/.test(p.tagName)) lv++;
        const [h,hash]=a.getAttribute('href').split('#');
        R.toc.push({label:a.textContent.trim().replace(/\s+/g,' '),path:h?resolve(nav.path,h):nav.path,hash,lv:Math.max(0,lv-1)});
      });
    } else if(ncx){
      const d=xml(await zipText(ncx.path));
      for(const np of d.getElementsByTagName('navPoint')){
        let lv=0; for(let p=np.parentNode;p;p=p.parentNode) if(p.nodeName==='navPoint') lv++;
        const [h,hash]=np.getElementsByTagName('content')[0].getAttribute('src').split('#');
        R.toc.push({label:np.getElementsByTagName('text')[0].textContent.trim(),path:resolve(ncx.path,h),hash,lv});
      }
    }
  }catch(e){ console.warn(e); }
  if(!R.toc.length) R.toc=R.spine.map((s,i)=>({label:'অংশ '+(i+1),path:s.path,hash:'',lv:0}));
}
function renderToc(){
  const ol=$('#rTocList'); ol.innerHTML='';
  R.toc.forEach(e=>{
    const li=document.createElement('li'), b=document.createElement('button');
    b.textContent=e.label||'(নামহীন)'; b.style.paddingLeft=(10+e.lv*16)+'px';
    b.onclick=()=>{ const i=R.spine.findIndex(s=>s.path===e.path); if(i>=0){ renderChapter(i,e.hash); $('#rDrawer').hidden=true; } };
    li.appendChild(b); ol.appendChild(li);
  });
}
async function renderChapter(i,hash){
  const it=R.spine[i]; if(!it) return; const tk=++R.tk;
  const raw=await zipText(it.path);
  let doc=new DOMParser().parseFromString(raw,'application/xhtml+xml');
  if(doc.getElementsByTagName('parsererror').length) doc=new DOMParser().parseFromString(raw,'text/html');
  doc.querySelectorAll('script,iframe,object,embed,audio,video').forEach(n=>n.remove());
  const styles=[];
  for(const l of [...doc.querySelectorAll('link[href]')]){ if(/stylesheet/i.test(l.getAttribute('rel')||'')) styles.push(await cssText(resolve(it.path,l.getAttribute('href')))); l.remove(); }
  doc.querySelectorAll('style').forEach(s=>styles.push(s.textContent));
  for(const im of doc.querySelectorAll('img[src]')){ const u=await blobUrl(resolve(it.path,im.getAttribute('src'))); if(u) im.setAttribute('src',u); }
  for(const im of doc.querySelectorAll('image')){ const a=im.getAttribute('xlink:href')?'xlink:href':'href', v=im.getAttribute(a); if(v){ const u=await blobUrl(resolve(it.path,v)); if(u) im.setAttribute(a,u); } }
  if(tk!==R.tk) return;
  R.i=i; const idoc=$('#rFrame').contentDocument;
  idoc.open(); idoc.write('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>'); idoc.close();
  const st=(css,id)=>{ const e=idoc.createElement('style'); if(id) e.id=id; e.textContent=css; idoc.head.appendChild(e); };
  st(BASE); styles.forEach(c=>st(c)); st(userCss(),'rs');
  [...doc.body.childNodes].forEach(n=>idoc.body.appendChild(idoc.importNode(n,true)));
  if(doc.body.getAttribute('class')) idoc.body.className=doc.body.getAttribute('class');
  const toId=id=>{ const el=id&&idoc.getElementById(id); if(el) el.scrollIntoView(); };
  idoc.addEventListener('click',e=>{
    const a=e.target.closest&&e.target.closest('a[href]'); if(!a) return; e.preventDefault();
    const h=a.getAttribute('href'); if(h.startsWith('#')) return toId(decodeURIComponent(h.slice(1)));
    if(/^[a-z][a-z0-9+.-]*:/i.test(h)) return;
    const [p,hh]=h.split('#'), k=R.spine.findIndex(s=>s.path===resolve(it.path,p)); if(k>=0) renderChapter(k,hh);
  });
  let sx=0,sy=0;
  idoc.addEventListener('touchstart',e=>{ sx=e.changedTouches[0].clientX; sy=e.changedTouches[0].clientY; },{passive:true});
  idoc.addEventListener('touchend',e=>{ const dx=e.changedTouches[0].clientX-sx, dy=e.changedTouches[0].clientY-sy; if(Math.abs(dx)>110&&Math.abs(dy)<45) (dx<0?next:prev)(); },{passive:true});
  if(hash) toId(hash); else idoc.defaultView.scrollTo(0,0);
  $('#rFrame').style.background=R.theme===1?'#f4ecd8':R.theme===2?'#14181f':'#fff';
  $('#rPos').textContent=`অংশ ${i+1} / ${R.spine.length}`;
  try{ localStorage.setItem('rp:'+R.key,i); }catch(e){}
}
function applyStyle(){ const d=$('#rFrame').contentDocument, s=d&&d.getElementById('rs'); if(s) s.textContent=userCss(); $('#rFrame').style.background=R.theme===1?'#f4ecd8':R.theme===2?'#14181f':'#fff'; }

/* ---------- PDF ---------- */
const pbox=()=>$('#rPdf');
const pScale=()=>Math.max(.3,(pbox().clientWidth-20)/P.vp.width)*P.zoom;
async function openPdf(buf){
  await loadPdfLib();
  const task=pdfjsLib.getDocument({data:new Uint8Array(buf)});
  task.onPassword=cb=>{ const p=prompt('পিডিএফটির পাসওয়ার্ড দিন'); if(p===null) task.destroy(); else cb(p); };
  P.pdf=await task.promise; P.zoom=1; P.w=pbox().clientWidth;
  P.vp=(await P.pdf.getPage(1)).getViewport({scale:1});
  buildPages(); goPdf(+localStorage.getItem('rp:'+R.key)||1); posText();
}
function buildPages(){
  const box=pbox(); box.innerHTML=''; if(P.io) P.io.disconnect(); P.divs=[];
  const s=pScale();
  P.io=new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting) renderPage(e.target); else if(e.target._s){ e.target.replaceChildren(); e.target._s=0; } }),{root:box,rootMargin:'900px 0px'});
  for(let n=1;n<=P.pdf.numPages;n++){
    const d=document.createElement('div'); d.className='pdfPage'; d.dataset.n=n;
    d.style.width=P.vp.width*s+'px'; d.style.height=P.vp.height*s+'px';
    box.appendChild(d); P.divs.push(d); P.io.observe(d);
  }
}
async function renderPage(d){
  const s=pScale(); if(d._busy||d._s===s) return; d._busy=true;
  try{
    const page=await P.pdf.getPage(+d.dataset.n), vp=page.getViewport({scale:s}), dpr=Math.min(window.devicePixelRatio||1,2);
    const c=document.createElement('canvas'); c.width=Math.floor(vp.width*dpr); c.height=Math.floor(vp.height*dpr);
    c.style.width=vp.width+'px'; c.style.height=vp.height+'px';
    await page.render({canvasContext:c.getContext('2d'),viewport:vp,transform:dpr!==1?[dpr,0,0,dpr,0,0]:null}).promise;
    d.style.width=vp.width+'px'; d.style.height=vp.height+'px'; d.replaceChildren(c); d._s=s;
  }catch(e){} finally{ d._busy=false; }
}
function goPdf(n){ if(!P.pdf) return; n=Math.min(Math.max(1,n),P.pdf.numPages); P.cur=n; pbox().scrollTop=P.divs[n-1].offsetTop-8; posText(); }
function posText(){ if(P.pdf) $('#rPos').textContent=`পৃষ্ঠা ${P.cur} / ${P.pdf.numPages}`; }
function zoomPdf(d){ if(!P.pdf) return; const n=P.cur; P.zoom=Math.min(3,Math.max(.5,P.zoom+d)); buildPages(); goPdf(n); }
pbox().addEventListener('scroll',()=>{
  if(P.raf||!P.pdf) return;
  P.raf=requestAnimationFrame(()=>{
    P.raf=0; const box=pbox(), y=box.scrollTop+box.clientHeight/3; let n=1;
    for(const d of P.divs){ if(d.offsetTop<=y) n=+d.dataset.n; else break; }
    P.cur=n; posText(); try{ localStorage.setItem('rp:'+R.key,n); }catch(e){}
  });
});
let rz; window.addEventListener('resize',()=>{ clearTimeout(rz); rz=setTimeout(()=>{ if(P.pdf&&pbox().clientWidth!==P.w){ P.w=pbox().clientWidth; const n=P.cur; buildPages(); goPdf(n); } },250); });

/* ---------- controls ---------- */
function next(){ if(R.mode==='epub'){ if(R.i<R.spine.length-1) renderChapter(R.i+1); } else goPdf(P.cur+1); }
function prev(){ if(R.mode==='epub'){ if(R.i>0) renderChapter(R.i-1); } else goPdf(P.cur-1); }
$('#btnRead').onclick=()=>$('#fileRead').click();
$('#fileRead').onchange=e=>{ const f=e.target.files[0]; e.target.value=''; if(f) openBook(f); };
$('#rClose').onclick=closeReader;
$('#rNext').onclick=next; $('#rPrev').onclick=prev;
$('#rToc').onclick=()=>{
  if(R.mode==='epub') $('#rDrawer').hidden=!$('#rDrawer').hidden;
  else if(P.pdf){ const v=parseInt(prompt(`কোন পৃষ্ঠায় যাবেন? (১–${P.pdf.numPages})`,P.cur),10); if(v) goPdf(v); }
};
const fs=d=>{ R.fs=Math.min(220,Math.max(70,R.fs+d)); try{ localStorage.setItem('rfs',R.fs); }catch(e){} applyStyle(); };
$('#rMinus').onclick=()=>R.mode==='epub'?fs(-10):zoomPdf(-.25);
$('#rPlus').onclick=()=>R.mode==='epub'?fs(10):zoomPdf(.25);
$('#rTheme').onclick=()=>{ R.theme=(R.theme+1)%THEMES.length; try{ localStorage.setItem('rth',R.theme); }catch(e){} applyStyle(); };
document.addEventListener('keydown',e=>{
  if($('#reader').hidden) return;
  if(e.key==='Escape') closeReader(); else if(e.key==='ArrowRight') next(); else if(e.key==='ArrowLeft') prev();
});

/* ---------- Android: "Open with" / file-manager / WhatsApp support ---------- */
const cap=window.Capacitor, AppPlugin=cap&&cap.Plugins&&cap.Plugins.App;
let lastUri='', lastAt=0;
function b64ToBytes(b64){ const bin=atob(b64), u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u; }
async function openFromUri(uri){
  if(!uri||!cap||!cap.Plugins||!cap.Plugins.Filesystem) return;
  if(uri===lastUri&&Date.now()-lastAt<4000) return;           // cold start can report the same file twice
  lastUri=uri; lastAt=Date.now();
  try{
    note('ফাইল খোলা হচ্ছে…');
    const {data}=await cap.Plugins.Filesystem.readFile({path:uri});   // works with content:// and file://
    const b=b64ToBytes(data);
    const isPdf=b[0]===0x25&&b[1]===0x50&&b[2]===0x44&&b[3]===0x46;  // %PDF
    const isZip=b[0]===0x50&&b[1]===0x4B;                            // PK (EPUB is a zip)
    if(!isPdf&&!isZip) return note('শুধু .epub বা .pdf ফাইল খোলা যাবে');
    const ext=isPdf?'pdf':'epub';
    let name=''; try{ name=decodeURIComponent(uri.split('?')[0].split('/').pop()); }catch(e){}
    if(!name.toLowerCase().endsWith('.'+ext)) name=(name.replace(/[^\w.\u0980-\u09FF-]+/g,'_')||'book')+'.'+ext;
    await openBook(new File([b],name));
  }catch(e){ console.error(e); note('ফাইলটি খোলা যায়নি'); }
}
if(AppPlugin){
  AppPlugin.addListener('appUrlOpen',e=>openFromUri(e&&e.url));                       // app already running
  AppPlugin.getLaunchUrl().then(r=>{ if(r&&r.url) openFromUri(r.url); }).catch(()=>{}); // app started by the file
  AppPlugin.addListener('backButton',()=>{
    if(!$('#reader').hidden) closeReader();
    else if(!$('#modal').hidden) $('#btnClose').click();
    else AppPlugin.exitApp();
  });
}
})();
