(() => {
const $ = s => document.querySelector(s);
const KEY = 'ebook-maker-v1';
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fresh = () => ({ meta:{title:'',author:'',lang:'bn',desc:''}, cover:null, cur:0,
  chapters:[{id:uid(), title:'অধ্যায় ১', html:'<p><br></p>'}] });

let S = (() => { try { const d = JSON.parse(localStorage.getItem(KEY)); return d && d.chapters && d.chapters.length ? d : fresh(); } catch(e){ return fresh(); } })();
let timer;
const body = $('#body');

function toast(msg){ const t=$('#toast'); t.textContent=msg; t.hidden=false; clearTimeout(t._t); t._t=setTimeout(()=>t.hidden=true,3200); }
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); $('#saved').textContent='সেভ হয়েছে'; }catch(e){ $('#saved').textContent='অটো-সেভ ব্যর্থ — "প্রজেক্ট সেভ" দিয়ে ফাইল রাখুন'; } }
function queueSave(){ $('#saved').textContent='সেভ হচ্ছে…'; clearTimeout(timer); timer=setTimeout(save,500); }
function words(){ const t=body.innerText.trim(); return t ? t.split(/\s+/).length : 0; }
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
const fileName = () => (S.meta.title.trim() || 'ebook').replace(/[\\/:*?"<>|]+/g,'').replace(/\s+/g,'-');

/* ---------- render ---------- */
function renderMeta(){
  $('#mTitle').value=S.meta.title; $('#mAuthor').value=S.meta.author; $('#mLang').value=S.meta.lang; $('#mDesc').value=S.meta.desc;
  const box=$('#coverBox'); box.innerHTML='';
  if(S.cover){ const i=new Image(); i.alt='কভার'; i.src=S.cover; box.appendChild(i); } else box.textContent='কভার নেই';
}
function renderList(){
  const ol=$('#chapters'); ol.innerHTML='';
  S.chapters.forEach((c,i)=>{
    const li=document.createElement('li'); if(i===S.cur) li.className='on';
    li.innerHTML=`<button class="name"></button><button class="mini" data-a="up" title="উপরে">↑</button><button class="mini" data-a="down" title="নিচে">↓</button><button class="mini del" data-a="del" title="মুছুন">✕</button>`;
    li.querySelector('.name').textContent=c.title||'(নামহীন)';
    li.querySelector('.name').onclick=()=>select(i);
    li.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>act(i,b.dataset.a));
    ol.appendChild(li);
  });
}
function select(i){ commit(); S.cur=i; const c=S.chapters[i]; $('#cTitle').value=c.title; body.innerHTML=c.html; renderList(); stat(); }
function commit(){ const c=S.chapters[S.cur]; if(c) c.html=body.innerHTML; }
function stat(){ $('#stat').textContent=`${S.chapters.length}টি অধ্যায় · এই অধ্যায়ে ${words()} শব্দ`; }
function act(i,a){
  commit();
  if(a==='del'){
    if(S.chapters.length===1) return toast('অন্তত একটি অধ্যায় থাকতে হবে');
    if(!confirm(`"${S.chapters[i].title}" মুছে ফেলবেন?`)) return;
    S.chapters.splice(i,1); S.cur=Math.min(S.cur,S.chapters.length-1);
  } else {
    const j=a==='up'?i-1:i+1; if(j<0||j>=S.chapters.length) return;
    [S.chapters[i],S.chapters[j]]=[S.chapters[j],S.chapters[i]]; S.cur=j;
  }
  select(S.cur); save();
}

/* ---------- events ---------- */
$('#btnAdd').onclick=()=>{ commit(); S.chapters.push({id:uid(),title:`অধ্যায় ${S.chapters.length+1}`,html:'<p><br></p>'}); select(S.chapters.length-1); save(); $('#cTitle').focus(); };
$('#cTitle').oninput=e=>{ S.chapters[S.cur].title=e.target.value; renderList(); queueSave(); };
body.oninput=()=>{ commit(); stat(); queueSave(); };
body.addEventListener('paste',e=>{ e.preventDefault(); const t=(e.clipboardData||window.clipboardData).getData('text/plain'); document.execCommand('insertText',false,t); });
[['#mTitle','title'],['#mAuthor','author'],['#mLang','lang'],['#mDesc','desc']].forEach(([s,k])=>$(s).addEventListener('input',e=>{ S.meta[k]=e.target.value; queueSave(); }));
document.querySelectorAll('.toolbar button').forEach(b=>{
  b.onmousedown=e=>e.preventDefault();
  b.onclick=()=>{ body.focus(); document.execCommand(b.dataset.cmd,false,b.dataset.val||null); commit(); queueSave(); };
});
$('#btnCover').onclick=()=>$('#fileCover').click();
$('#btnCoverDel').onclick=()=>{ S.cover=null; renderMeta(); save(); };
$('#fileCover').onchange=e=>{
  const f=e.target.files[0]; if(!f) return;
  const img=new Image(); img.onload=()=>{
    const k=Math.min(1,1600/img.height), c=document.createElement('canvas');
    c.width=Math.round(img.width*k); c.height=Math.round(img.height*k);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    S.cover=c.toDataURL('image/jpeg',0.85); renderMeta(); save(); URL.revokeObjectURL(img.src);
  };
  img.onerror=()=>toast('ছবিটি পড়া যায়নি'); img.src=URL.createObjectURL(f); e.target.value='';
};
$('#btnNew').onclick=()=>{ if(!confirm('বর্তমান বইটি মুছে নতুন বই শুরু করবেন? আগে প্রজেক্ট সেভ করে রাখুন।')) return; S=fresh(); renderMeta(); select(0); save(); };
$('#btnSave').onclick=()=>{ commit(); download(new Blob([JSON.stringify(S)],{type:'application/json'}),fileName()+'.ebook.json'); toast('প্রজেক্ট ফাইল নামানো হয়েছে'); };
$('#btnOpen').onclick=()=>$('#fileOpen').click();
$('#fileOpen').onchange=e=>{
  const f=e.target.files[0]; if(!f) return; const r=new FileReader();
  r.onload=()=>{ try{ const d=JSON.parse(r.result); if(!d.meta||!Array.isArray(d.chapters)||!d.chapters.length) throw 0; S={...fresh(),...d,cur:0}; renderMeta(); select(0); save(); toast('প্রজেক্ট খোলা হয়েছে'); }catch(_){ toast('ফাইলটি সঠিক প্রজেক্ট ফাইল নয়'); } };
  r.readAsText(f); e.target.value='';
};

/* ---------- XHTML helpers ---------- */
function toXhtml(html){
  const d=new DOMParser().parseFromString('<body>'+html+'</body>','text/html'), x=new XMLSerializer();
  return [...d.body.childNodes].map(n=>x.serializeToString(n)).join('\n');
}
const BOOK_CSS=`body{font-family:serif;line-height:1.8;margin:5%;text-align:justify}
h1,h2{line-height:1.35;text-align:left}h1{font-size:1.6em;margin:1.2em 0 .8em}h2{font-size:1.3em}
blockquote{margin:1em 0;padding-left:1em;border-left:3px solid #888;font-style:italic}
img{max-width:100%}.cover{text-align:center;margin:0}.cover img{height:100%;max-width:100%}.title{text-align:center;margin-top:30%}`;
const page=(t,b,l,extra='')=>`<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" ${extra} lang="${l}" xml:lang="${l}"><head><meta charset="utf-8"/><title>${esc(t)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${b}</body></html>`;

/* ---------- preview ---------- */
$('#btnPreview').onclick=()=>{
  commit();
  const m=S.meta;
  const front=`<div style="text-align:center;margin:12vh 0">${S.cover?`<img src="${S.cover}" style="max-height:60vh;max-width:90%"><br>`:''}<h1 style="text-align:center">${esc(m.title||'নামহীন বই')}</h1><p style="text-align:center">${esc(m.author)}</p></div><hr>`;
  const chs=S.chapters.map(c=>`<h1>${esc(c.title)}</h1>${toXhtml(c.html)}<hr>`).join('');
  $('#frame').srcdoc=`<!DOCTYPE html><html lang="${m.lang}"><head><meta charset="utf-8"><style>${BOOK_CSS}body{max-width:46em;margin:0 auto;padding:20px;font-family:"Noto Serif Bengali",Georgia,serif;font-size:19px}</style></head><body>${front}${chs}</body></html>`;
  $('#modal').hidden=false;
};
$('#btnClose').onclick=()=>$('#modal').hidden=true;
document.addEventListener('keydown',e=>{ if(e.key==='Escape') $('#modal').hidden=true; });

/* ---------- EPUB export ---------- */
$('#btnEpub').onclick=async()=>{
  commit(); save();
  const m=S.meta;
  if(!m.title.trim()) return toast('বইয়ের নাম লিখুন');
  if(!m.author.trim()) return toast('লেখকের নাম লিখুন');
  if(typeof JSZip==='undefined') return toast('JSZip লোড হয়নি — ইন্টারনেট সংযোগ দেখুন');
  try{
    const zip=new JSZip(), id='urn:uuid:'+crypto.randomUUID(), L=m.lang;
    zip.file('mimetype','application/epub+zip',{compression:'STORE'});
    zip.file('META-INF/container.xml','<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    const o=zip.folder('OEBPS'); o.file('style.css',BOOK_CSS);
    let manifest='<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>', spine='';
    if(S.cover){
      const [head,b64]=S.cover.split(','), mime=head.match(/data:(.*?);/)[1], ext=mime.includes('png')?'png':'jpg';
      o.file('cover.'+ext,b64,{base64:true});
      o.file('cover.xhtml',page('কভার',`<div class="cover"><img src="cover.${ext}" alt="কভার"/></div>`,L));
      manifest+=`<item id="coverimg" href="cover.${ext}" media-type="${mime}" properties="cover-image"/><item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>`;
      spine+='<itemref idref="cover"/>';
    }
    let navItems='';
    S.chapters.forEach((c,i)=>{
      const f=`ch${i+1}.xhtml`;
      o.file(f,page(c.title,`<h1>${esc(c.title)}</h1>\n${toXhtml(c.html)}`,L));
      manifest+=`<item id="ch${i+1}" href="${f}" media-type="application/xhtml+xml"/>`;
      spine+=`<itemref idref="ch${i+1}"/>`;
      navItems+=`<li><a href="${f}">${esc(c.title||'অধ্যায় '+(i+1))}</a></li>`;
    });
    o.file('nav.xhtml',page('সূচিপত্র',`<nav epub:type="toc" id="toc"><h1>সূচিপত্র</h1><ol>${navItems}</ol></nav>`,L,'xmlns:epub="http://www.idpf.org/2007/ops"'));
    const now=new Date().toISOString().replace(/\.\d+Z$/,'Z');
    o.file('content.opf',`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${L}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">${id}</dc:identifier><dc:title>${esc(m.title)}</dc:title><dc:creator>${esc(m.author)}</dc:creator><dc:language>${L}</dc:language>${m.desc.trim()?`<dc:description>${esc(m.desc)}</dc:description>`:''}<meta property="dcterms:modified">${now}</meta></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`);
    const blob=await zip.generateAsync({type:'blob',mimeType:'application/epub+zip',compression:'DEFLATE'});
    download(blob,fileName()+'.epub'); toast('EPUB তৈরি হয়েছে');
  }catch(err){ console.error(err); toast('EPUB তৈরি করতে সমস্যা হয়েছে'); }
};

window.addEventListener('beforeunload',()=>{ commit(); save(); });
renderMeta(); select(Math.min(S.cur||0,S.chapters.length-1));
})();
