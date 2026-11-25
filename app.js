(() => {
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const OLD_KEY = 'ebook-maker-v1';
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fresh = () => ({ meta:{title:'',author:'',lang:'bn',desc:''}, cover:null, cur:0, previewLimit:3,
  toc:{on:true,title:'সূচিপত্র',auto:true,html:''},
  chapters:[{id:uid(),title:'অধ্যায় ১',html:'<p><br></p>',mode:'html'}] });
const norm = d => { const f=fresh(); if(!d||!d.meta||!Array.isArray(d.chapters)||!d.chapters.length) return f;
  const s={...f,...d,toc:{...f.toc,...(d.toc||{})}}; if(s.cur>=s.chapters.length||s.cur<-1) s.cur=0; return s; };

let S=null, timer, selFig=null, lastRange=null;
let prevFontSize = 100, prevThemeMode = 0;
const body=$('#body'), plain=$('#plain'), srcBox=$('#srcBox');
let srcOn=false;

const idb={
  open(){ return new Promise((res,rej)=>{ const r=indexedDB.open('ebook-maker',1); r.onupgradeneeded=()=>r.result.createObjectStore('kv'); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); },
  async get(k){ const db=await this.open(); return new Promise((res,rej)=>{ const q=db.transaction('kv').objectStore('kv').get(k); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error); }); },
  async set(k,v){ const db=await this.open(); return new Promise((res,rej)=>{ const t=db.transaction('kv','readwrite'); t.objectStore('kv').put(v,k); t.oncomplete=()=>res(); t.onerror=()=>rej(t.error); }); }
};
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.hidden=false; clearTimeout(t._t); t._t=setTimeout(()=>t.hidden=true,3200); }
async function save(){ if(!S) return; commit(); try{ await idb.set('project',S); $('#saved').textContent='সেভ হয়েছে'; }catch(e){ $('#saved').textContent='অটো-সেভ ব্যর্থ'; } }
function queueSave(){ $('#saved').textContent='সেভ হচ্ছে…'; clearTimeout(timer); timer=setTimeout(save,500); }
const clean = h => h.replace(/ sel(?=")/g,'');
function commit(){
  if(!S) return;
  if(S.cur===-1){ if(!S.toc.auto) S.toc.html=clean(body.innerHTML); return; }
  const c=S.chapters[S.cur]; if(c) c.html=c.mode==='text'?plain.value:clean(body.innerHTML);
}
const tocAuto=()=>'<ol>'+S.chapters.map((c,i)=>`<li>${esc(c.title||'অধ্যায় '+(i+1))}</li>`).join('')+'</ol>';
const isText=()=>S&&S.cur!==-1&&S.chapters[S.cur]&&S.chapters[S.cur].mode==='text';
function words(){ const t=(isText()?plain.value:body.innerText).trim(); return t?t.split(/\s+/).length:0; }

const SAFE=new Set('B STRONG I EM U S SPAN P BR H1 H2 BLOCKQUOTE UL OL LI DIV A SUB SUP HR'.split(' '));
const SAFE_IMG=new Set([...SAFE,'FIGURE','FIGCAPTION','IMG']);
const KEEP_CSS=['color','background-color','font-weight','font-style','text-decoration','text-align','width'];
const DROP=/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|LINK|META|TITLE|NOSCRIPT|TEMPLATE|SVG|MATH|FORM|INPUT|BUTTON|TEXTAREA|SELECT)$/;
function sanitize(h,imgs){
  const d=new DOMParser().parseFromString('<body>'+h+'</body>','text/html'), ok=imgs?SAFE_IMG:SAFE;
  (function walk(n){
    [...n.childNodes].forEach(c=>{
      if(c.nodeType===3) return;
      if(c.nodeType!==1) return c.remove();
      if(DROP.test(c.tagName)) return c.remove();
      if(c.tagName==='FONT'){ const s=d.createElement('span'); if(c.getAttribute('color')) s.style.color=c.getAttribute('color'); s.append(...c.childNodes); c.replaceWith(s); c=s; }
      walk(c);
      if(!ok.has(c.tagName)) return c.replaceWith(...c.childNodes);
      const css=KEEP_CSS.filter(p=>c.style.getPropertyValue(p)&&(p!=='width'||imgs)).map(p=>[p,c.style.getPropertyValue(p)]);
      const g=k=>c.getAttribute(k), cls=g('class'), sv=g('src'), alt=g('alt'), href=g('href'), ce=g('contenteditable');
      [...c.attributes].forEach(a=>c.removeAttribute(a.name));
      css.forEach(([p,v])=>c.style.setProperty(p,v));
      if(imgs){ if(cls) c.setAttribute('class',cls.replace(/[^\w\- ]/g,'')); if(ce!==null) c.setAttribute('contenteditable',ce); }
      if(c.tagName==='IMG'){ if(sv&&/^data:image\//i.test(sv)){ c.setAttribute('src',sv); c.setAttribute('alt',alt||''); } else c.remove(); }
      if(c.tagName==='A'&&href&&/^(https?:|mailto:|#)/i.test(href)) c.setAttribute('href',href);
    });
  })(d.body);
  return d.body.innerHTML;
}
function textToHtml(t){
  const ps=String(t).replace(/\r\n?/g,'\n').split(/\n{2,}/).map(s=>s.trim()).filter(Boolean);
  return ps.length?ps.map(p=>'<p>'+esc(p).replace(/\n/g,'<br>')+'</p>').join(''):'<p><br></p>';
}
function htmlToText(h){
  const d=new DOMParser().parseFromString('<body>'+h+'</body>','text/html');
  d.querySelectorAll('br').forEach(b=>b.replaceWith('\n'));
  d.querySelectorAll('li').forEach(l=>l.append('\n'));
  const out=[]; d.body.childNodes.forEach(n=>{ const t=(n.textContent||'').replace(/ /g,' ').trim(); if(t) out.push(t); });
  return out.join('\n\n');
}
const ch2html=c=>c.mode==='text'?textToHtml(c.html):c.html;
const fileName=()=>(S.meta.title.trim()||'ebook').replace(/[\\/:*?"<>|]+/g,'').replace(/\s+/g,'-');

async function download(blob, name){
  const cap=window.Capacitor;
  if(cap && cap.isNativePlatform && cap.isNativePlatform()){
    try{
      const {Filesystem,Share}=cap.Plugins, i=name.lastIndexOf('.');
      const base=name.slice(0,i).replace(/[^A-Za-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'')||'ebook';
      const data=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result).split(',')[1]); r.onerror=rej; r.readAsDataURL(blob); });
      const f=await Filesystem.writeFile({path:base+name.slice(i),data,directory:'CACHE'});
      await Share.share({title:name,dialogTitle:'ফাইলটি সেভ বা শেয়ার করুন',url:f.uri});
    }catch(e){ if(!/cancel/i.test(String(e&&e.message))) toast('ফাইল সেভ করা যায়নি'); }
    return;
  }
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}

function renderMeta(){
  $('#mTitle').value=S.meta.title; $('#mAuthor').value=S.meta.author; $('#mLang').value=S.meta.lang; $('#mDesc').value=S.meta.desc;
  $('#previewLimit').value=S.previewLimit||3;
  const box=$('#coverBox'); box.innerHTML='';
  if(S.cover){ const i=new Image(); i.alt='কভার'; i.src=S.cover; box.appendChild(i); } else box.textContent='কভার নেই';
}
function renderList(){
  const ol=$('#chapters'); ol.innerHTML='';
  const t=document.createElement('li'); t.className='tocRow'+(S.cur===-1?' on':'');
  t.innerHTML='<button class="name"></button>';
  t.firstChild.textContent=(S.toc.title||'সূচিপত্র')+(S.toc.on?(S.toc.auto?' (স্বয়ংক্রিয়)':''):' (বন্ধ)');
  t.firstChild.onclick=()=>{ select(-1); goEditor(); };
  ol.appendChild(t);
  S.chapters.forEach((c,i)=>{
    const li=document.createElement('li'); if(i===S.cur) li.className='on';
    li.innerHTML=`<button class="name"></button><button class="mini" data-a="up" title="উপরে">↑</button><button class="mini" data-a="down" title="নিচে">↓</button><button class="mini del" data-a="del" title="মুছুন">✕</button>`;
    li.querySelector('.name').textContent=c.title||'(নামহীন)';
    li.querySelector('.name').onclick=()=>{ select(i); goEditor(); };
    li.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>act(i,b.dataset.a));
    ol.appendChild(li);
  });
}
function renderPane(){
  const toc=S.cur===-1; lastRange=null; deselect(); srcOn=false;
  $('#tocBar').hidden=!toc;
  if(toc){
    $('#cTitle').value=S.toc.title; $('#tocOn').checked=S.toc.on; $('#tocMode').value=S.toc.auto?'auto':'manual';
    body.innerHTML=S.toc.auto?tocAuto():(S.toc.html||'<p><br></p>'); body.contentEditable=S.toc.auto?'false':'true';
  } else {
    const c=S.chapters[S.cur]; $('#cTitle').value=c.title; body.contentEditable='true';
    if(c.mode==='text') plain.value=c.html; else body.innerHTML=c.html;
  }
  showMode();
}
function select(i){ commit(); S.cur=i; renderPane(); renderList(); stat(); }
function goEditor(){ if(window.innerWidth<=820) $('.editor').scrollIntoView({behavior:'smooth',block:'start'}); }
function stat(){ $('#stat').textContent=`${S.chapters.length}টি অধ্যায় · ${S.cur===-1?'সূচিপত্রে':'এই অধ্যায়ে'} ${words()} শব্দ`; }
function act(i,a){
  commit();
  if(a==='del'){
    if(S.chapters.length===1) return toast('অন্তত একটি অধ্যায় থাকতে হবে');
    if(!confirm(`"${S.chapters[i].title}" মুছে ফেলবেন?`)) return;
    S.chapters.splice(i,1); S.cur=Math.min(Math.max(S.cur,0),S.chapters.length-1);
  } else {
    const j=a==='up'?i-1:i+1; if(j<0||j>=S.chapters.length) return;
    [S.chapters[i],S.chapters[j]]=[S.chapters[j],S.chapters[i]]; S.cur=j;
  }
  renderPane(); renderList(); stat(); save();
}

$('#btnAdd').onclick=()=>{ commit(); S.chapters.push({id:uid(),title:`অধ্যায় ${S.chapters.length+1}`,html:'<p><br></p>',mode:'html'}); select(S.chapters.length-1); save(); $('#cTitle').focus(); };
$('#cTitle').oninput=e=>{ if(S.cur===-1) S.toc.title=e.target.value; else S.chapters[S.cur].title=e.target.value; renderList(); queueSave(); };
$('#tocOn').onchange=e=>{ S.toc.on=e.target.checked; renderList(); queueSave(); };
$('#tocMode').onchange=e=>{ const auto=e.target.value==='auto'; if(auto===S.toc.auto) return; commit(); if(!auto&&!S.toc.html) S.toc.html=tocAuto(); S.toc.auto=auto; renderPane(); renderList(); queueSave(); };
$('#previewLimit').oninput=e=>{ S.previewLimit = parseInt(e.target.value)||1; queueSave(); };
body.oninput=()=>{ commit(); stat(); queueSave(); };

body.addEventListener('paste',e=>{
  e.preventDefault(); const cd=e.clipboardData||window.clipboardData;
  const img=[...(cd.files||[])].find(f=>f.type.startsWith('image/'));
  if(img) return addImage(img);
  const h=cd.getData('text/html');
  if(h&&body.contentEditable==='true') document.execCommand('insertHTML',false,sanitize(h));
  else document.execCommand('insertText',false,cd.getData('text/plain'));
});
[['#mTitle','title'],['#mAuthor','author'],['#mLang','lang'],['#mDesc','desc']].forEach(([s,k])=>$(s).addEventListener('input',e=>{ S.meta[k]=e.target.value; queueSave(); }));
$$('.toolbar button[data-cmd]').forEach(b=>{
  b.onmousedown=e=>e.preventDefault();
  b.onclick=()=>{ body.focus(); document.execCommand(b.dataset.cmd,false,b.dataset.val||null); commit(); queueSave(); };
});

function showMode(){
  const toc=S.cur===-1, text=isText(), tb=$('#toolbar');
  $('#modeBar').hidden=toc;
  $$('#modeBar [data-mode]').forEach(b=>{ const on=b.dataset.mode===(text?'text':'html'); b.classList.toggle('on',on); b.setAttribute('aria-pressed',on); });
  tb.hidden=text; tb.classList.toggle('off',body.contentEditable==='false'); tb.classList.toggle('srcmode',srcOn);
  $('#btnSrc').classList.toggle('on',srcOn);
  body.hidden=text||srcOn; plain.hidden=!text; srcBox.hidden=text||!srcOn;
}
$$('#modeBar [data-mode]').forEach(b=>b.onclick=()=>{
  if(S.cur===-1) return;
  commit(); const c=S.chapters[S.cur], to=b.dataset.mode;
  if((c.mode||'html')===to) return;
  if(to==='text'){
    if(/<(?!\/?(p|br|div)\b)[a-z]/i.test(c.html)&&!confirm('সাধারণ টেক্সটে গেলে ফরম্যাট বাদ যাবে। চালিয়ে যাবেন?')) return;
    c.html=htmlToText(c.html);
  } else c.html=textToHtml(c.html);
  c.mode=to; renderPane(); renderList(); stat(); save();
  (to==='text'?plain:body).focus();
});
plain.oninput=()=>{ commit(); stat(); queueSave(); };
$('#btnSrc').onclick=()=>{
  if(isText()||body.contentEditable!=='true') return;
  commit(); srcOn=!srcOn; deselect();
  if(srcOn) srcBox.value=clean(body.innerHTML).replace(/<\/(p|h1|h2|blockquote|ul|ol|li|figure|div)>/g,'</$1>\n').trim();
  showMode(); (srcOn?srcBox:body).focus();
};
srcBox.oninput=()=>{ body.innerHTML=sanitize(srcBox.value,true); commit(); stat(); queueSave(); };
function applyColor(col){
  if(isText()||srcOn||body.contentEditable!=='true') return;
  body.focus();
  if(lastRange&&body.contains(lastRange.startContainer)){ const s=getSelection(); s.removeAllRanges(); s.addRange(lastRange); }
  document.execCommand('styleWithCSS',false,true);
  document.execCommand('foreColor',false,col);
  document.execCommand('styleWithCSS',false,false);
  commit(); queueSave();
}
$$('#toolbar [data-color]').forEach(b=>{ b.onmousedown=e=>e.preventDefault(); b.onclick=()=>applyColor(b.dataset.color); });
$('#fgColor').onchange=e=>applyColor(e.target.value);

function readImg(file,max,byH,alpha){
  return new Promise((res,rej)=>{
    const im=new Image();
    im.onload=()=>{
      const k=Math.min(1,max/(byH?im.height:im.width)), c=document.createElement('canvas');
      c.width=Math.round(im.width*k); c.height=Math.round(im.height*k);
      const g=c.getContext('2d'), png=alpha&&/png|gif|webp|svg/.test(file.type);
      if(!png){ g.fillStyle='#fff'; g.fillRect(0,0,c.width,c.height); }
      g.drawImage(im,0,0,c.width,c.height); URL.revokeObjectURL(im.src);
      res(c.toDataURL(png?'image/png':'image/jpeg',0.85));
    };
    im.onerror=()=>rej(new Error('img')); im.src=URL.createObjectURL(file);
  });
}
document.addEventListener('selectionchange',()=>{ const s=getSelection(); if(s.rangeCount&&body.contains(s.anchorNode)) lastRange=s.getRangeAt(0).cloneRange(); });
async function addImage(file){
  if(S.cur===-1&&S.toc.auto) return toast('স্বয়ংক্রিয় সূচিপত্রে ছবি দেওয়া যায় না');
  try{
    const src=await readImg(file,1200,false,true);
    body.focus();
    if(lastRange&&body.contains(lastRange.startContainer)){ const s=getSelection(); s.removeAllRanges(); s.addRange(lastRange); }
    document.execCommand('insertHTML',false,`<figure class="fig fig-center" style="width:66%" contenteditable="false"><img src="${src}" alt=""></figure><p><br></p>`);
    commit(); queueSave(); stat();
  }catch(e){ toast('ছবিটি যোগ করা যায়নি'); }
}
$('#btnImg').onclick=()=>{ if(S.cur===-1&&S.toc.auto) return toast('ছবি দিতে সূচিপত্রের ধরন "নিজে লিখব" করুন'); $('#fileImg').click(); };
$('#fileImg').onchange=async e=>{ for(const f of e.target.files) await addImage(f); e.target.value=''; };
function pick(f){ deselect(); selFig=f; f.classList.add('sel'); $('#imgBar').hidden=false; }
function deselect(){ if(selFig) selFig.classList.remove('sel'); selFig=null; $('#imgBar').hidden=true; }
body.addEventListener('click',e=>{ const f=e.target.closest&&e.target.closest('figure'); if(f&&body.contains(f)&&body.contentEditable==='true') pick(f); else deselect(); });
$$('#imgBar [data-img]').forEach(b=>{
  b.onmousedown=e=>e.preventDefault();
  b.onclick=()=>{
    if(!selFig) return; const a=b.dataset.img, v=b.dataset.v;
    if(a==='w') selFig.style.width=v;
    else if(a==='al'){ selFig.classList.remove('fig-left','fig-center','fig-right'); selFig.classList.add('fig-'+v); }
    else if(a==='cap'){
      let fc=selFig.querySelector('figcaption'); const t=prompt('ছবির ক্যাপশন (খালি রাখলে মুছে যাবে)',fc?fc.textContent:''); if(t===null) return;
      if(t.trim()){ if(!fc){ fc=document.createElement('figcaption'); selFig.appendChild(fc); } fc.textContent=t.trim(); } else if(fc) fc.remove();
    } else if(a==='alt'){
      const im=selFig.querySelector('img'), t=prompt('ছবির বিকল্প বর্ণনা (স্ক্রিন রিডারের জন্য)',im.alt); if(t===null) return; im.alt=t.trim();
    } else if(a==='del'){ selFig.remove(); deselect(); }
    commit(); queueSave(); stat();
  };
});

$('#btnCover').onclick=()=>$('#fileCover').click();
$('#btnCoverDel').onclick=()=>{ S.cover=null; renderMeta(); save(); };
$('#fileCover').onchange=async e=>{
  const f=e.target.files[0]; if(!f) return;
  try{ S.cover=await readImg(f,1600,true,false); renderMeta(); save(); }catch(_){ toast('ছবিটি পড়া যায়নি'); }
  e.target.value='';
};
function load(d){ S=norm(d); renderMeta(); renderPane(); renderList(); stat(); }
$('#btnNew').onclick=()=>{ if(!confirm('বর্তমান বইটি মুছে নতুন বই শুরু করবেন? আগে প্রজেক্ট সেভ করে রাখুন।')) return; load(null); save(); };
$('#btnSave').onclick=()=>{ commit(); download(new Blob([JSON.stringify(S)],{type:'application/json'}),fileName()+'.ebook.json'); toast('প্রজেক্ট ফাইল নামানো হয়েছে'); };
$('#btnOpen').onclick=()=>$('#fileOpen').click();
$('#fileOpen').onchange=e=>{
  const f=e.target.files[0]; if(!f) return; const r=new FileReader();
  r.onload=()=>{ try{ const d=JSON.parse(r.result); if(!d.meta||!Array.isArray(d.chapters)||!d.chapters.length) throw 0; d.cur=0; load(d); save(); toast('প্রজেক্ট খোলা হয়েছে'); }catch(_){ toast('ফাইলটি সঠিক প্রজেক্ট ফাইল নয়'); } };
  r.readAsText(f); e.target.value='';
};

function toXhtml(html,ctx){
  const d=new DOMParser().parseFromString('<body>'+html+'</body>','text/html'), x=new XMLSerializer();
  d.querySelectorAll('[contenteditable]').forEach(n=>n.removeAttribute('contenteditable'));
  d.querySelectorAll('.sel').forEach(n=>n.classList.remove('sel'));
  if(ctx) d.querySelectorAll('img').forEach(im=>{
    const src=im.getAttribute('src')||'', m=/^data:(image\/[\w+.-]+);base64,(.+)$/.exec(src);
    if(!m) return im.remove();
    let f=ctx.map.get(src);
    if(!f){ f={name:`images/img${ctx.list.length+1}.${m[1].includes('png')?'png':'jpg'}`,mime:m[1],b64:m[2]}; ctx.map.set(src,f); ctx.list.push(f); }
    im.setAttribute('src',f.name); if(!im.hasAttribute('alt')) im.setAttribute('alt','');
  });
  return [...d.body.childNodes].map(n=>x.serializeToString(n)).join('\n');
}
const BOOK_CSS=`body{font-family:serif;line-height:1.8;margin:5%;text-align:justify}
h1,h2{line-height:1.35;text-align:left}h1{font-size:1.6em;margin:1.2em 0 .8em}h2{font-size:1.3em}
blockquote{margin:1em 0;padding-left:1em;border-left:3px solid #888;font-style:italic}
img{max-width:100%}.cover{text-align:center;margin:0}.cover img{height:100%;max-width:100%}
figure{display:block;margin:1.2em auto;text-align:center;page-break-inside:avoid}
figure.fig-left{margin-left:0;margin-right:auto}figure.fig-right{margin-left:auto;margin-right:0}
figure img{width:100%;height:auto;display:block}
figcaption{font-size:.85em;color:#555;margin-top:.4em;text-align:center}
ol.toc{list-style:none;padding:0}ol.toc li{margin:.6em 0}ol.toc a{text-decoration:none;color:inherit}`;
const page=(t,b,l,extra='')=>`<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" ${extra} lang="${l}" xml:lang="${l}"><head><meta charset="utf-8"/><title>${esc(t)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${b}</body></html>`;
const tocLinks=()=>`<ol class="toc">${S.chapters.map((c,i)=>`<li><a href="ch${i+1}.xhtml">${esc(c.title||'অধ্যায় '+(i+1))}</a></li>`).join('')}</ol>`;

/* --- Advanced Preview Logic --- */
$('#btnPreview').onclick=()=>{
  commit(); const m=S.meta;
  let chsHtml = '';
  const limit = S.previewLimit || 3;
  
  // Generate limited chapters
  for(let i=0; i<Math.min(S.chapters.length, limit); i++){
    const c = S.chapters[i];
    chsHtml += `<div class="chapter-section"><h1>${esc(c.title)}</h1>${toXhtml(ch2html(c))}</div><hr>`;
  }
  
  // Add Unlock CTA if there are more chapters
  if(S.chapters.length > limit){
    chsHtml += `<div class="unlock-cta">
      <h2>প্রিভিউ শেষ!</h2>
      <p>সম্পূর্ণ বইটি পড়তে আনলক করুন বা কিনুন।</p>
      <button class="primary-btn">সম্পূর্ণ বই আনলক করুন</button>
    </div>`;
  }

  const front=`<div class="preview-cover" style="text-align:center;margin:12vh 0">${S.cover?`<img src="${S.cover}" style="max-height:60vh;max-width:90%"><br>`:''}<h1 style="text-align:center">${esc(m.title||'নামহীন বই')}</h1><p style="text-align:center">${esc(m.author)}</p></div><hr>`;
  const toc=S.toc.on?`<h1>${esc(S.toc.title)}</h1>${S.toc.auto?tocLinks().replace(/href="[^"]*"/g,''):toXhtml(S.toc.html)}<hr>`:'';
  
  const doc = `<!DOCTYPE html><html lang="${m.lang}"><head><meta charset="utf-8">
  <style>
    ${BOOK_CSS}
    body{max-width:46em;margin:0 auto;padding:20px;font-family:"Noto Serif Bengali",Georgia,serif;font-size:${prevFontSize}%; transition: background 0.3s, color 0.3s;}
    .chapter-section { user-select: none; -webkit-user-select: none; }
    .unlock-cta { text-align:center; padding: 40px 20px; background: #f0f0f0; border-radius: 8px; margin-top: 30px; }
    .primary-btn { background: #1f6f5c; color: white; border: none; padding: 12px 24px; font-size: 18px; border-radius: 6px; cursor: pointer; margin-top: 15px; }
    .primary-btn:hover { background: #175646; }
    body.theme-dark { background: #12161d; color: #e6eaf0; }
    body.theme-dark .unlock-cta { background: #1a2029; }
    body.theme-sepia { background: #f4ecd8; color: #3b2f1e; }
    body.theme-sepia .unlock-cta { background: #eaddc5; }
  </style>
  </head><body class="theme-${prevThemeMode === 0 ? 'light' : prevThemeMode === 1 ? 'dark' : 'sepia'}">${front}${toc}${chsHtml}</body></html>`;
  
  const frame = $('#frame');
  frame.srcdoc = doc;
  $('#modal').hidden = false;
  
  // Progress Bar Logic
  frame.onload = () => {
    const iDoc = frame.contentDocument;
    const win = frame.contentWindow;
    
    // Disable Copy/Right Click
    iDoc.addEventListener('copy', e => e.preventDefault());
    iDoc.addEventListener('contextmenu', e => e.preventDefault());
    
    win.onscroll = () => {
      const scrollTop = win.scrollY || iDoc.documentElement.scrollTop;
      const scrollHeight = iDoc.documentElement.scrollHeight - win.innerHeight;
      const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
      $('#prevProgressBar').style.width = progress + '%';
    };

    // Unlock button action (example)
    const btn = iDoc.querySelector('.primary-btn');
    if(btn) {
      btn.onclick = () => {
        alert('এটি একটি ডেমো প্রিভিউ। সম্পূর্ণ বই আনলক করতে আপনার পেমেন্ট গেটওয়ে বা ডাউনলোড লিংক যুক্ত করুন।');
      };
    }
  };
};

$('#prevFontPlus').onclick = () => { prevFontSize = Math.min(200, prevFontSize + 10); $('#btnPreview').click(); };
$('#prevFontMinus').onclick = () => { prevFontSize = Math.max(70, prevFontSize - 10); $('#btnPreview').click(); };
$('#prevTheme').onclick = () => { prevThemeMode = (prevThemeMode + 1) % 3; $('#btnPreview').click(); };
$('#btnClose').onclick=()=>$('#modal').hidden=true;
document.addEventListener('keydown',e=>{ if(e.key==='Escape') $('#modal').hidden=true; });

$('#btnEpub').onclick=async()=>{
  commit(); await save();
  const m=S.meta;
  if(!m.title.trim()) return toast('বইয়ের নাম লিখুন');
  if(!m.author.trim()) return toast('লেখকের নাম লিখুন');
  if(typeof JSZip==='undefined') return toast('JSZip লোড হয়নি — ইন্টারনেট সংযোগ দেখুন');
  try{
    const zip=new JSZip(), id='urn:uuid:'+crypto.randomUUID(), L=m.lang, ctx={map:new Map(),list:[]};
    zip.file('mimetype','application/epub+zip',{compression:'STORE'});
    zip.file('META-INF/container.xml','<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    const o=zip.folder('OEBPS'); o.file('style.css',BOOK_CSS);
    let manifest='<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>', spine='', navItems='';
    if(S.cover){
      const [head,b64]=S.cover.split(','), mime=head.match(/data:(.*?);/)[1], ext=mime.includes('png')?'png':'jpg';
      o.file('cover.'+ext,b64,{base64:true});
      o.file('cover.xhtml',page('কভার',`<div class="cover"><img src="cover.${ext}" alt="কভার"/></div>`,L));
      manifest+=`<item id="coverimg" href="cover.${ext}" media-type="${mime}" properties="cover-image"/><item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>`;
      spine+='<itemref idref="cover"/>';
    }
    if(S.toc.on){
      const inner=S.toc.auto?tocLinks():toXhtml(S.toc.html,ctx), tt=S.toc.title||'সূচিপত্র';
      o.file('toc.xhtml',page(tt,`<h1>${esc(tt)}</h1>\n${inner}`,L));
      manifest+='<item id="tocpage" href="toc.xhtml" media-type="application/xhtml+xml"/>'; spine+='<itemref idref="tocpage"/>';
      navItems+=`<li><a href="toc.xhtml">${esc(tt)}</a></li>`;
    }
    S.chapters.forEach((c,i)=>{
      const f=`ch${i+1}.xhtml`;
      o.file(f,page(c.title,`<h1>${esc(c.title)}</h1>\n${toXhtml(ch2html(c),ctx)}`,L));
      manifest+=`<item id="ch${i+1}" href="${f}" media-type="application/xhtml+xml"/>`;
      spine+=`<itemref idref="ch${i+1}"/>`;
      navItems+=`<li><a href="${f}">${esc(c.title||'অধ্যায় '+(i+1))}</a></li>`;
    });
    ctx.list.forEach((f,i)=>{ o.file(f.name,f.b64,{base64:true}); manifest+=`<item id="im${i+1}" href="${f.name}" media-type="${f.mime}"/>`; });
    o.file('nav.xhtml',page('সূচিপত্র',`<nav epub:type="toc" id="toc"><h1>সূচিপত্র</h1><ol>${navItems}</ol></nav>`,L,'xmlns:epub="http://www.idpf.org/2007/ops"'));
    const now=new Date().toISOString().replace(/\.\d+Z$/,'Z');
    o.file('content.opf',`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${L}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">${id}</dc:identifier><dc:title>${esc(m.title)}</dc:title><dc:creator>${esc(m.author)}</dc:creator><dc:language>${L}</dc:language>${m.desc.trim()?`<dc:description>${esc(m.desc)}</dc:description>`:''}<meta property="dcterms:modified">${now}</meta></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`);
    const blob=await zip.generateAsync({type:'blob',mimeType:'application/epub+zip',compression:'DEFLATE'});
    download(blob,fileName()+'.epub'); toast('EPUB তৈরি হয়েছে');
  }catch(err){ console.error(err); toast('EPUB তৈরি করতে সমস্যা হয়েছে'); }
};

window.addEventListener('beforeunload',save);
document.addEventListener('visibilitychange',()=>{ if(document.hidden) save(); });
(async()=>{
  let d=null;
  try{ d=await idb.get('project'); }catch(e){}
  if(!d){ try{ d=JSON.parse(localStorage.getItem(OLD_KEY)); }catch(e){} }
  load(d);
})();
})();
