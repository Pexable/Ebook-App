(() => {
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const OLD_KEY = 'ebook-maker-v1';
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const withAssets = h => String(h).replace(/asset:([\w.\-]+)/g, (m, n) => (S && S.assets && S.assets[n]) || m);
const looksLikeCode = s => /<(style|script)\b|<!doctype|<html[\s>]/i.test(s);
const CODE_HEAD = '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>html{background:#fff;color:#1d2733}body{font-family:"Noto Serif Bengali","Kalpurush","SolaimanLipi",serif;line-height:1.8;margin:12px}img{max-width:100%;height:auto}</style>';
const codeDoc = (src, extra = '') => '<!DOCTYPE html><html><head>' + CODE_HEAD + '</head><body>' + withAssets(src) + extra + '</body></html>';
const codeFrame = src => '<iframe class="codeFrame" sandbox="allow-scripts allow-popups" srcdoc="' + esc(codeDoc(src)) + '"></iframe>';
const fresh = () => ({
  meta: { title:'', author:'', lang:'bn', desc:'' },
  cover: null,
  assets: {},
  cur: 0,
  preview: { limitOn: false, limitType: 'chapters', limitVal: 2, buyUrl: '', ctaText: 'সম্পূর্ণ বইটি পড়তে আনলক করুন বা কিনুন' },
  toc: { on:true, title:'সূচিপত্র', auto:true, html:'' },
  chapters: [{ id:uid(), title:'অধ্যায় ১', html:'<p><br></p>', mode:'html' }]
});
const norm = d => {
  const f = fresh();
  if (!d || !d.meta || !Array.isArray(d.chapters) || !d.chapters.length) return f;
  const s = {
    ...f,
    ...d,
    toc: { ...f.toc, ...(d.toc || {}) },
    preview: { ...f.preview, ...(d.preview || {}) }
  };
  if (s.cur >= s.chapters.length || s.cur < -1) s.cur = 0;
  return s;
};

let S = null, timer, selFig = null, lastRange = null;
const body = $('#body'), plain = $('#plain'), srcBox = $('#srcBox'), codeBox = $('#codeBox'), codeLive = $('#codeLive');
let srcOn = false;

/* ---------- storage (IndexedDB: large enough for images) ---------- */
const idb = {
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('ebook-maker', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async get(k) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const q = db.transaction('kv').objectStore('kv').get(k);
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
  },
  async set(k, v) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('kv', 'readwrite');
      t.objectStore('kv').put(v, k);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  }
};
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => t.hidden = true, 3200); }
async function save() { if (!S) return; commit(); try { await idb.set('project', S); $('#saved').textContent = 'সেভ হয়েছে'; } catch (e) { $('#saved').textContent = 'অটো-সেভ ব্যর্থ — "প্রজেক্ট সেভ" দিয়ে ফাইল রাখুন'; } }
function queueSave() { $('#saved').textContent = 'সেভ হচ্ছে…'; clearTimeout(timer); timer = setTimeout(save, 500); }
const clean = h => h.replace(/ sel(?=")/g, '');
function commit() {
  if (!S) return;
  if (S.cur === -1) { if (!S.toc.auto) S.toc.html = clean(body.innerHTML); return; }
  const c = S.chapters[S.cur]; if (c) c.html = c.mode === 'text' ? plain.value : c.mode === 'code' ? codeBox.value : clean(body.innerHTML);
}
const tocAuto = () => '<ol>' + S.chapters.map((c, i) => `<li>${esc(c.title || 'অধ্যায় ' + (i + 1))}</li>`).join('') + '</ol>';
const isCode = () => S && S.cur !== -1 && S.chapters[S.cur] && S.chapters[S.cur].mode === 'code';
const isText = () => S && S.cur !== -1 && S.chapters[S.cur] && S.chapters[S.cur].mode === 'text';
function words() { const t = (isText() ? plain.value : isCode() ? codeBox.value.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ') : body.innerText).trim(); return t ? t.split(/\s+/).length : 0; }

/* ---------- HTML sanitiser / text <-> HTML ---------- */
const SAFE = new Set('B STRONG I EM U S SPAN P BR H1 H2 H3 BLOCKQUOTE UL OL LI DIV A SUB SUP HR TABLE THEAD TBODY TR TH TD'.split(' '));
const SAFE_IMG = new Set([...SAFE, 'FIGURE', 'FIGCAPTION', 'IMG']);
const KEEP_CSS = ['color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-align', 'width', 'border', 'border-left', 'border-bottom', 'padding', 'padding-left', 'padding-bottom', 'border-collapse'];
const DROP = /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|LINK|META|TITLE|NOSCRIPT|TEMPLATE|SVG|MATH|FORM|INPUT|BUTTON|TEXTAREA|SELECT)$/;

function looksLikeEscapedHtml(str) {
  return /&lt;(h1|h2|h3|p|div|strong|em|u|span|ul|ol|li|table|blockquote)\b/i.test(str);
}

function unescapeHtmlEntities(str) {
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}

function sanitize(h, imgs) {
  h = withAssets(h);
  const d = new DOMParser().parseFromString('<body>' + h + '</body>', 'text/html'), ok = imgs ? SAFE_IMG : SAFE;
  (function walk(n) {
    [...n.childNodes].forEach(c => {
      if (c.nodeType === 3) return;
      if (c.nodeType !== 1) return c.remove();
      if (DROP.test(c.tagName)) return c.remove();
      if (c.tagName === 'FONT') { const s = d.createElement('span'); if (c.getAttribute('color')) s.style.color = c.getAttribute('color'); s.append(...c.childNodes); c.replaceWith(s); c = s; }
      walk(c);
      if (!ok.has(c.tagName)) return c.replaceWith(...c.childNodes);
      const css = KEEP_CSS.filter(p => c.style.getPropertyValue(p) && (p !== 'width' || imgs || c.tagName === 'TABLE')).map(p => [p, c.style.getPropertyValue(p)]);
      const g = k => c.getAttribute(k), cls = g('class'), sv = g('src'), alt = g('alt'), href = g('href'), ce = g('contenteditable');
      [...c.attributes].forEach(a => c.removeAttribute(a.name));
      css.forEach(([p, v]) => c.style.setProperty(p, v));
      if (imgs) { if (cls) c.setAttribute('class', cls.replace(/[^\w\- ]/g, '')); if (ce !== null) c.setAttribute('contenteditable', ce); }
      if (c.tagName === 'IMG') { if (sv && /^(data:image\/|https?:\/\/)/i.test(sv)) { c.setAttribute('src', sv); c.setAttribute('alt', alt || ''); } else c.remove(); }
      if (c.tagName === 'A' && href && /^(https?:|mailto:|#)/i.test(href)) c.setAttribute('href', href);
    });
  })(d.body);
  return d.body.innerHTML;
}

function textToHtml(t) {
  const ps = String(t).replace(/\r\n?/g, '\n').split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
  return ps.length ? ps.map(p => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join('') : '<p><br></p>';
}
function htmlToText(h) {
  const d = new DOMParser().parseFromString('<body>' + h + '</body>', 'text/html');
  d.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
  d.querySelectorAll('li').forEach(l => l.append('\n'));
  const out = []; d.body.childNodes.forEach(n => { const t = (n.textContent || '').replace(/\u00a0/g, ' ').trim(); if (t) out.push(t); });
  return out.join('\n\n');
}
const ch2html = (c, h = c.html) => {
  if (c.mode === 'text') return textToHtml(h);
  // Auto-fix if user previously pasted raw HTML tags into visual editor
  if (looksLikeEscapedHtml(h)) {
    return sanitize(unescapeHtmlEntities(h), true);
  }
  return withAssets(h);
};
const fileName = () => (S.meta.title.trim() || 'ebook').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-');

async function download(blob, name) {
  const cap = window.Capacitor;
  if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
    try {
      const { Filesystem, Share } = cap.Plugins, i = name.lastIndexOf('.');
      const base = name.slice(0, i).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'ebook';
      const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
      const f = await Filesystem.writeFile({ path: base + name.slice(i), data, directory: 'CACHE' });
      await Share.share({ title: name, dialogTitle: 'ফাইলটি সেভ বা শেয়ার করুন', url: f.uri });
    } catch (e) { if (!/cancel/i.test(String(e && e.message))) toast('ফাইল সেভ করা যায়নি'); }
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- render ---------- */
function renderMeta() {
  $('#mTitle').value = S.meta.title; $('#mAuthor').value = S.meta.author; $('#mLang').value = S.meta.lang; $('#mDesc').value = S.meta.desc;
  const box = $('#coverBox'); box.innerHTML = '';
  if (S.cover) { const i = new Image(); i.alt = 'কভার'; i.src = S.cover; box.appendChild(i); } else box.textContent = 'কভার নেই';

  // Preview limit settings
  $('#pvLimitOn').checked = !!S.preview.limitOn;
  $('#pvLimitFields').hidden = !S.preview.limitOn;
  $('#pvLimitType').value = S.preview.limitType || 'chapters';
  $('#pvLimitVal').value = S.preview.limitVal || 2;
  $('#pvLimitValLabel').textContent = S.preview.limitType === 'percent' ? 'ফ্রি শতাংশ (১-১০০%)' : 'ফ্রি অধ্যায়/পৃষ্ঠা সংখ্যা';
  $('#pvBuyUrl').value = S.preview.buyUrl || '';
  $('#pvCtaText').value = S.preview.ctaText || 'সম্পূর্ণ বইটি পড়তে আনলক করুন বা কিনুন';
}
function renderList() {
  const ol = $('#chapters'); ol.innerHTML = '';
  const t = document.createElement('li'); t.className = 'tocRow' + (S.cur === -1 ? ' on' : '');
  t.innerHTML = '<button class="name"></button>';
  t.firstChild.textContent = (S.toc.title || 'সূচিপত্র') + (S.toc.on ? (S.toc.auto ? ' (স্বয়ংক্রিয়)' : '') : ' (বন্ধ)');
  t.firstChild.onclick = () => { select(-1); goEditor(); };
  ol.appendChild(t);
  S.chapters.forEach((c, i) => {
    const li = document.createElement('li'); if (i === S.cur) li.className = 'on';
    li.innerHTML = `<button class="name"></button><button class="mini" data-a="up" title="উপরে">↑</button><button class="mini" data-a="down" title="নিচে">↓</button><button class="mini del" data-a="del" title="মুছুন">✕</button>`;
    li.querySelector('.name').textContent = c.title || '(নামহীন)';
    li.querySelector('.name').onclick = () => { select(i); goEditor(); };
    li.querySelectorAll('[data-a]').forEach(b => b.onclick = () => act(i, b.dataset.a));
    ol.appendChild(li);
  });
}
function renderPane() {
  const toc = S.cur === -1; lastRange = null; deselect(); srcOn = false;
  $('#tocBar').hidden = !toc;
  if (toc) {
    $('#cTitle').value = S.toc.title; $('#tocOn').checked = S.toc.on; $('#tocMode').value = S.toc.auto ? 'auto' : 'manual';
    body.innerHTML = S.toc.auto ? tocAuto() : (S.toc.html || '<p><br></p>'); body.contentEditable = S.toc.auto ? 'false' : 'true';
  } else {
    const c = S.chapters[S.cur]; $('#cTitle').value = c.title; body.contentEditable = 'true';
    if (c.mode === 'text') plain.value = c.html; else if (c.mode === 'code') { codeBox.value = c.html; liveRender(); renderAssets(); } else body.innerHTML = c.html;
  }
  showMode();
}
function select(i) { commit(); S.cur = i; renderPane(); renderList(); stat(); }
function goEditor() { if (window.innerWidth <= 820) $('.editor').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function stat() { $('#stat').textContent = `${S.chapters.length}টি অধ্যায় · ${S.cur === -1 ? 'সূচিপত্রে' : 'এই অধ্যায়ে'} ${words()} শব্দ`; }
function act(i, a) {
  commit();
  if (a === 'del') {
    if (S.chapters.length === 1) return toast('অন্তত একটি অধ্যায় থাকতে হবে');
    if (!confirm(`"${S.chapters[i].title}" মুছে ফেলবেন?`)) return;
    S.chapters.splice(i, 1); S.cur = Math.min(Math.max(S.cur, 0), S.chapters.length - 1);
  } else {
    const j = a === 'up' ? i - 1 : i + 1; if (j < 0 || j >= S.chapters.length) return;
    [S.chapters[i], S.chapters[j]] = [S.chapters[j], S.chapters[i]]; S.cur = j;
  }
  renderPane(); renderList(); stat(); save();
}

/* ---------- events ---------- */
$('#btnAdd').onclick = () => { commit(); S.chapters.push({ id: uid(), title: `অধ্যায় ${S.chapters.length + 1}`, html: '<p><br></p>', mode: 'html' }); select(S.chapters.length - 1); save(); $('#cTitle').focus(); };
$('#cTitle').oninput = e => { if (S.cur === -1) S.toc.title = e.target.value; else S.chapters[S.cur].title = e.target.value; renderList(); queueSave(); };
$('#tocOn').onchange = e => { S.toc.on = e.target.checked; renderList(); queueSave(); };
$('#tocMode').onchange = e => { const auto = e.target.value === 'auto'; if (auto === S.toc.auto) return; commit(); if (!auto && !S.toc.html) S.toc.html = tocAuto(); S.toc.auto = auto; renderPane(); renderList(); queueSave(); };

// Preview config events
$('#pvLimitOn').onchange = e => { S.preview.limitOn = e.target.checked; $('#pvLimitFields').hidden = !e.target.checked; queueSave(); };
$('#pvLimitType').onchange = e => {
  S.preview.limitType = e.target.value;
  $('#pvLimitValLabel').textContent = e.target.value === 'percent' ? 'ফ্রি শতাংশ (১-১০০%)' : 'ফ্রি অধ্যায়/পৃষ্ঠা সংখ্যা';
  queueSave();
};
$('#pvLimitVal').oninput = e => { S.preview.limitVal = Math.max(1, parseInt(e.target.value, 10) || 1); queueSave(); };
$('#pvBuyUrl').oninput = e => { S.preview.buyUrl = e.target.value.trim(); queueSave(); };
$('#pvCtaText').oninput = e => { S.preview.ctaText = e.target.value; queueSave(); };

body.oninput = () => { commit(); stat(); queueSave(); };
body.addEventListener('paste', e => {
  e.preventDefault(); const cd = e.clipboardData || window.clipboardData;
  const img = [...(cd.files || [])].find(f => f.type.startsWith('image/'));
  if (img) return addImage(img);
  const h = cd.getData('text/html');
  const txt = cd.getData('text/plain');
  if (txt && /<(style|script)\b|<!doctype|<html[\s>]/i.test(txt) && S.cur !== -1 && confirm('এই লেখায় CSS/JavaScript আছে। কোড মোডে নিয়ে পূর্ণ সমর্থন চালু করবেন?')) return toCode(txt);
  if (h && body.contentEditable === 'true') {
    document.execCommand('insertHTML', false, sanitize(h, true));
  } else if (txt && /<(h1|h2|h3|p|div|strong|em|u|span|ul|ol|li|table|blockquote)\b/i.test(txt) && body.contentEditable === 'true') {
    // Smart HTML paste: if user pasted raw HTML code into the visual editor, render it cleanly!
    document.execCommand('insertHTML', false, sanitize(txt, true));
    toast('HTML ফরম্যাট স্বয়ংক্রিয়ভাবে রেন্ডার করা হয়েছে');
  } else {
    document.execCommand('insertText', false, txt);
  }
});
[['#mTitle', 'title'], ['#mAuthor', 'author'], ['#mLang', 'lang'], ['#mDesc', 'desc']].forEach(([s, k]) => $(s).addEventListener('input', e => { S.meta[k] = e.target.value; queueSave(); }));
$$('.toolbar button[data-cmd]').forEach(b => {
  b.onmousedown = e => e.preventDefault();
  b.onclick = () => { body.focus(); document.execCommand(b.dataset.cmd, false, b.dataset.val || null); commit(); queueSave(); };
});

/* ---------- writing mode (HTML / plain text), colour, HTML source ---------- */
function showMode() {
  const toc = S.cur === -1, text = isText(), code = isCode(), tb = $('#toolbar');
  $('#modeBar').hidden = toc;
  $('#codeBar').hidden = !code; codeBox.hidden = !code; codeLive.hidden = !code;
  $$('#modeBar [data-mode]').forEach(b => { const on = b.dataset.mode === (text ? 'text' : code ? 'code' : 'html'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  tb.hidden = text || code; tb.classList.toggle('off', body.contentEditable === 'false'); tb.classList.toggle('srcmode', srcOn);
  $('#btnSrc').classList.toggle('on', srcOn);
  body.hidden = text || code || srcOn; plain.hidden = !text; srcBox.hidden = text || code || !srcOn;
}
$$('#modeBar [data-mode]').forEach(b => b.onclick = () => {
  if (S.cur === -1) return;
  commit(); const c = S.chapters[S.cur], to = b.dataset.mode;
  const from = c.mode || 'html';
  if (from === to) return;
  if (from === 'code' && to !== 'code' && looksLikeCode(c.html) && !confirm('কোড মোড থেকে বের হলে CSS ও JavaScript বাদ যাবে। চালিয়ে যাবেন?')) return;
  if (to === 'text') {
    if (from === 'html' && /<(?!\/?(p|br|div)\b)[a-z]/i.test(c.html) && !confirm('সাধারণ টেক্সটে গেলে রং, বোল্ড, ছবি ইত্যাদি ফরম্যাট বাদ যাবে। চালিয়ে যাবেন?')) return;
    c.html = htmlToText(from === 'code' ? sanitize(c.html, true) : c.html);
  } else if (to === 'html') c.html = from === 'text' ? textToHtml(c.html) : sanitize(c.html, true);
  else c.html = from === 'text' ? textToHtml(c.html) : c.html;
  c.mode = to; renderPane(); renderList(); stat(); save();
  (to === 'text' ? plain : to === 'code' ? codeBox : body).focus();
});
plain.oninput = () => { commit(); stat(); queueSave(); };
$('#btnSrc').onclick = () => {
  if (isText() || body.contentEditable !== 'true') return;
  commit(); srcOn = !srcOn; srcBox._ask = 0; deselect();
  if (srcOn) srcBox.value = clean(body.innerHTML).replace(/<\/(p|h1|h2|h3|blockquote|ul|ol|li|figure|div|table)>/g, '</$1>\n').trim();
  showMode(); (srcOn ? srcBox : body).focus();
};
srcBox.oninput = () => { if (/<(style|script)\b/i.test(srcBox.value) && !srcBox._ask) { srcBox._ask = 1; if (confirm('এই কোডে CSS/JavaScript আছে। কোড মোডে নিয়ে পূর্ণ সমর্থন চালু করবেন?')) return toCode(srcBox.value); } body.innerHTML = sanitize(srcBox.value, true); commit(); stat(); queueSave(); };
function applyColor(col) {
  if (isText() || srcOn || body.contentEditable !== 'true') return;
  body.focus();
  if (lastRange && body.contains(lastRange.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(lastRange); }
  document.execCommand('styleWithCSS', false, true);
  document.execCommand('foreColor', false, col);
  document.execCommand('styleWithCSS', false, false);
  commit(); queueSave();
}
$$('#toolbar [data-color]').forEach(b => { b.onmousedown = e => e.preventDefault(); b.onclick = () => applyColor(b.dataset.color); });
$('#fgColor').onchange = e => applyColor(e.target.value);

/* ---------- images ---------- */
function readImg(file, max, byH, alpha) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, max / (byH ? im.height : im.width)), c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      const g = c.getContext('2d'), png = alpha && /png|gif|webp|svg/.test(file.type);
      if (!png) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
      g.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(im.src);
      res(c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.85));
    };
    im.onerror = () => rej(new Error('img')); im.src = URL.createObjectURL(file);
  });
}
document.addEventListener('selectionchange', () => { const s = getSelection(); if (s.rangeCount && body.contains(s.anchorNode)) lastRange = s.getRangeAt(0).cloneRange(); });
async function addImage(file) {
  if (isCode()) return addAsset(file);
  if (S.cur === -1 && S.toc.auto) return toast('স্বয়ংক্রিয় সূচিপত্রে ছবি দেওয়া যায় না');
  try {
    const src = await readImg(file, 1200, false, true);
    body.focus();
    if (lastRange && body.contains(lastRange.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(lastRange); }
    document.execCommand('insertHTML', false, `<figure class="fig fig-center" style="width:66%" contenteditable="false"><img src="${src}" alt=""></figure><p><br></p>`);
    commit(); queueSave(); stat();
  } catch (e) { toast('ছবিটি যোগ করা যায়নি'); }
}
$('#btnImg').onclick = () => { if (S.cur === -1 && S.toc.auto) return toast('ছবি দিতে সূচিপত্রের ধরন "নিজে লিখব" করুন'); $('#fileImg').click(); };
$('#fileImg').onchange = async e => { for (const f of e.target.files) await addImage(f); e.target.value = ''; };
/* ---------- code mode: live preview, image assets, file upload ---------- */
let liveT;
function liveRender() { codeLive.srcdoc = codeDoc(codeBox.value); }
function toCode(html) { const c = S.chapters[S.cur]; c.mode = 'code'; c.html = html; srcOn = false; renderPane(); renderList(); stat(); save(); toast('কোড মোড চালু হয়েছে'); }
function insertAt(ta, t) { const s = ta.selectionStart, e = ta.selectionEnd; ta.setRangeText(t, s, e, 'end'); ta.focus(); commit(); queueSave(); stat(); clearTimeout(liveT); liveT = setTimeout(liveRender, 300); }
function renderAssets() {
  const box = $('#assetList'); box.innerHTML = '';
  Object.keys(S.assets || {}).forEach(n => {
    const d = document.createElement('span'); d.className = 'as';
    d.innerHTML = '<img alt=""><span></span><button type="button" title="মুছুন">✕</button>';
    d.querySelector('img').src = S.assets[n]; d.querySelector('span').textContent = n;
    d.querySelector('img').onclick = () => insertAt(codeBox, `<img src="asset:${n}" alt="" style="max-width:100%">`);
    d.querySelector('button').onclick = () => { if (confirm(`"${n}" ছবিটি তালিকা থেকে মুছবেন?`)) { delete S.assets[n]; renderAssets(); liveRender(); save(); } };
    box.appendChild(d);
  });
}
async function addAsset(file) {
  try {
    const src = await readImg(file, 1200, false, true); let k = 1; while (S.assets['img' + k]) k++;
    const n = 'img' + k; S.assets[n] = src; renderAssets();
    insertAt(codeBox, `<img src="asset:${n}" alt="" style="max-width:100%">\n`); save();
  } catch (e) { toast('ছবিটি যোগ করা যায়নি'); }
}
codeBox.oninput = () => { commit(); stat(); queueSave(); clearTimeout(liveT); liveT = setTimeout(liveRender, 700); };
codeBox.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); insertAt(codeBox, '  '); } });
codeBox.addEventListener('paste', e => { const f = [...((e.clipboardData || {}).files || [])].find(x => x.type.startsWith('image/')); if (f) { e.preventDefault(); addAsset(f); } });
$('#btnCodeRun').onclick = liveRender;
$('#btnCodeImg').onclick = () => $('#fileImg').click();
$$('.btnFile').forEach(b => b.onclick = () => $('#fileAny').click());
const rdText = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsText(f); });
async function newChapter(title, html, mode) { commit(); S.chapters.push({ id: uid(), title, html, mode }); select(S.chapters.length - 1); await save(); }
async function handleFiles(files) {
  for (const f of files) {
    const n = f.name, ext = (n.split('.').pop() || '').toLowerCase(), base = n.replace(/\.[^.]+$/, '');
    try {
      if (f.type.startsWith('image/')) await addImage(f);
      else if (ext === 'html' || ext === 'htm') { const t = await rdText(f), m = /<title[^>]*>([^<]+)<\/title>/i.exec(t); await newChapter((m && m[1].trim()) || base, t, 'code'); toast('HTML ফাইল নতুন অধ্যায় হিসেবে যোগ হয়েছে'); }
      else if (ext === 'txt' || ext === 'md') { await newChapter(base, await rdText(f), 'text'); toast('টেক্সট ফাইল নতুন অধ্যায় হিসেবে যোগ হয়েছে'); }
      else if (ext === 'css' || ext === 'js') {
        if (!isCode()) { toast('CSS/JS যোগ করতে আগে কোড মোড নির্বাচন করুন'); continue; }
        const t = await rdText(f); insertAt(codeBox, ext === 'css' ? `\n<style>\n${t}\n</style>\n` : `\n<script>\n${t}\n<\/script>\n`); liveRender();
      } else if (ext === 'json') {
        if (!confirm('প্রজেক্ট ফাইল খুললে বর্তমান বইটি বদলে যাবে। চালিয়ে যাবেন?')) continue;
        const dt = new DataTransfer(); dt.items.add(f); $('#fileOpen').files = dt.files; $('#fileOpen').onchange({ target: $('#fileOpen') });
      } else toast(`"${n}" ফাইলের ধরন সমর্থিত নয়`);
    } catch (e) { toast(`"${n}" ফাইল পড়া যায়নি`); }
  }
}
$('#fileAny').onchange = async e => { await handleFiles([...e.target.files]); e.target.value = ''; };
const edSec = $('.editor');
edSec.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
edSec.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); handleFiles([...e.dataTransfer.files]); } });
async function inlineRemote(h, fail) {
  const urls = [...new Set([...h.matchAll(/src="(https?:\/\/[^"]+)"/g)].map(m => m[1]))];
  for (const u of urls) {
    try {
      const r = await fetch(u); if (!r.ok) throw 0; const b = await r.blob(); if (!/^image\//.test(b.type)) throw 0;
      const d = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
      h = h.split('src="' + u + '"').join('src="' + d + '"');
    } catch (e) { fail.push(u); }
  }
  return h;
}
function snapshot(src) {
  return new Promise(res => {
    const f = document.createElement('iframe'), id = uid(); let done = false;
    f.sandbox = 'allow-scripts'; f.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:600px;border:0';
    const fin = v => { if (done) return; done = true; removeEventListener('message', on); f.remove(); res(v); };
    const on = e => { if (e.source === f.contentWindow && e.data && e.data.snap === id) fin(e.data); };
    addEventListener('message', on);
    const sc = `<script>addEventListener('load',function(){setTimeout(function(){var s=[].map.call(document.querySelectorAll('style'),function(x){return x.textContent}).join('\\n');document.querySelectorAll('script,style,link,base').forEach(function(x){x.remove()});parent.postMessage({snap:'${id}',css:s,body:document.body.innerHTML},'*')},800)})<\/script>`;
    f.srcdoc = codeDoc(src, sc); document.body.appendChild(f); setTimeout(() => fin(null), 7000);
  });
}
function pick(f) { deselect(); selFig = f; f.classList.add('sel'); $('#imgBar').hidden = false; }
function deselect() { if (selFig) selFig.classList.remove('sel'); selFig = null; $('#imgBar').hidden = true; }
body.addEventListener('click', e => { const f = e.target.closest && e.target.closest('figure'); if (f && body.contains(f) && body.contentEditable === 'true') pick(f); else deselect(); });
$$('#imgBar [data-img]').forEach(b => {
  b.onmousedown = e => e.preventDefault();
  b.onclick = () => {
    if (!selFig) return; const a = b.dataset.img, v = b.dataset.v;
    if (a === 'w') selFig.style.width = v;
    else if (a === 'al') { selFig.classList.remove('fig-left', 'fig-center', 'fig-right'); selFig.classList.add('fig-' + v); }
    else if (a === 'cap') {
      let fc = selFig.querySelector('figcaption'); const t = prompt('ছবির ক্যাপশন (খালি রাখলে মুছে যাবে)', fc ? fc.textContent : ''); if (t === null) return;
      if (t.trim()) { if (!fc) { fc = document.createElement('figcaption'); selFig.appendChild(fc); } fc.textContent = t.trim(); } else if (fc) fc.remove();
    } else if (a === 'alt') {
      const im = selFig.querySelector('img'), t = prompt('ছবির বিকল্প বর্ণনা (স্ক্রিন রিডারের জন্য)', im.alt); if (t === null) return; im.alt = t.trim();
    } else if (a === 'del') { selFig.remove(); deselect(); }
    commit(); queueSave(); stat();
  };
});

/* ---------- cover / project ---------- */
$('#btnCover').onclick = () => $('#fileCover').click();
$('#btnCoverDel').onclick = () => { S.cover = null; renderMeta(); save(); };
$('#fileCover').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { S.cover = await readImg(f, 1600, true, false); renderMeta(); save(); } catch (_) { toast('ছবিটি পড়া যায়নি'); }
  e.target.value = '';
};
function load(d) { S = norm(d); renderMeta(); renderPane(); renderList(); stat(); }
$('#btnNew').onclick = () => { if (!confirm('বর্তমান বইটি মুছে নতুন বই শুরু করবেন? আগে প্রজেক্ট সেভ করে রাখুন।')) return; load(null); save(); };
$('#btnSave').onclick = () => { commit(); download(new Blob([JSON.stringify(S)], { type: 'application/json' }), fileName() + '.ebook.json'); toast('প্রজেক্ট ফাইল নামানো হয়েছে'); };
$('#btnOpen').onclick = () => $('#fileOpen').click();
$('#fileOpen').onchange = e => {
  const f = e.target.files[0]; if (!f) return; const r = new FileReader();
  r.onload = () => { try { const d = JSON.parse(r.result); if (!d.meta || !Array.isArray(d.chapters) || !d.chapters.length) throw 0; d.cur = 0; load(d); save(); toast('প্রজেক্ট খোলা হয়েছে'); } catch (_) { toast('ফাইলটি সঠিক প্রজেক্ট ফাইল নয়'); } };
  r.readAsText(f); e.target.value = '';
};

/* ---------- XHTML helpers ---------- */
function toXhtml(html, ctx) {
  const d = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html'), x = new XMLSerializer();
  d.querySelectorAll('[contenteditable]').forEach(n => n.removeAttribute('contenteditable'));
  d.querySelectorAll('.sel').forEach(n => n.classList.remove('sel'));
  if (ctx) d.querySelectorAll('img').forEach(im => {
    const src = im.getAttribute('src') || '', m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(src);
    if (!m) return im.remove();
    let f = ctx.map.get(src);
    if (!f) { f = { name: `images/img${ctx.list.length + 1}.${m[1].includes('png') ? 'png' : 'jpg'}`, mime: m[1], b64: m[2] }; ctx.map.set(src, f); ctx.list.push(f); }
    im.setAttribute('src', f.name); if (!im.hasAttribute('alt')) im.setAttribute('alt', '');
  });
  return [...d.body.childNodes].map(n => x.serializeToString(n)).join('\n');
}
const BOOK_CSS = `body{font-family:serif;line-height:1.8;margin:5%;text-align:justify}
h1,h2,h3{line-height:1.35;text-align:left}h1{font-size:1.6em;margin:1.2em 0 .8em}h2{font-size:1.3em}
blockquote{margin:1em 0;padding-left:1em;border-left:3px solid #888;font-style:italic}
table{width:100%;border-collapse:collapse;margin:1em 0}th,td{border:1px solid #888;padding:6px 8px;text-align:left}
img{max-width:100%}.cover{text-align:center;margin:0}.cover img{height:100%;max-width:100%}
figure{display:block;margin:1.2em auto;text-align:center;page-break-inside:avoid}
figure.fig-left{margin-left:0;margin-right:auto}figure.fig-right{margin-left:auto;margin-right:0}
figure img{width:100%;height:auto;display:block}
figcaption{font-size:.85em;color:#555;margin-top:.4em;text-align:center}
ol.toc{list-style:none;padding:0}ol.toc li{margin:.6em 0}ol.toc a{text-decoration:none;color:inherit}`;
const page = (t, b, l, extra = '', css = '') => `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" ${extra} lang="${l}" xml:lang="${l}"><head><meta charset="utf-8"/><title>${esc(t)}</title><link rel="stylesheet" type="text/css" href="style.css"/>${css ? `<style type="text/css">/*<![CDATA[*/${css.replace(/\]\]>/g, '')}/*]]>*/</style>` : ''}</head><body>${b}</body></html>`;
const tocLinks = () => `<ol class="toc">${S.chapters.map((c, i) => `<li><a href="ch${i + 1}.xhtml">${esc(c.title || 'অধ্যায় ' + (i + 1))}</a></li>`).join('')}</ol>`;

/* ---------- Interactive Preview ---------- */
$('#btnPreview').onclick = () => {
  commit();
  const sections = [];
  if (S.cover || S.meta.title.trim()) {
    sections.push({
      id: 'cover',
      title: S.meta.title || 'কভার',
      html: `<div style="text-align:center;padding:8vh 0">${S.cover ? `<img src="${S.cover}" style="max-height:55vh;max-width:90%;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.2)"><br>` : ''}<h1 style="text-align:center;margin-top:16px">${esc(S.meta.title || 'নামহীন বই')}</h1><p style="text-align:center;opacity:0.8">${esc(S.meta.author)}</p>${S.meta.desc ? `<p style="max-width:34em;margin:16px auto;font-size:0.95em;opacity:0.85">${esc(S.meta.desc)}</p>` : ''}</div>`,
      isFront: true
    });
  }
  if (S.toc.on) {
    const inner = S.toc.auto
      ? `<ol class="toc">${S.chapters.map((c, idx) => `<li><a href="#ch-${idx}" data-goto-ch="${idx}">${esc(c.title || 'অধ্যায় ' + (idx + 1))}</a></li>`).join('')}</ol>`
      : sanitize(S.toc.html, true);
    sections.push({
      id: 'toc',
      title: S.toc.title || 'সূচিপত্র',
      html: `<h1>${esc(S.toc.title || 'সূচিপত্র')}</h1>${inner}`,
      isFront: true
    });
  }
  S.chapters.forEach((c, idx) => {
    sections.push({
      id: 'ch-' + idx,
      chIndex: idx,
      title: c.title || ('অধ্যায় ' + (idx + 1)),
      html: c.mode === 'code' ? codeFrame(c.html) : `<h1>${esc(c.title || ('অধ্যায় ' + (idx + 1)))}</h1>${ch2html(c)}`
    });
  });

  if (window.openProjectPreview) {
    window.openProjectPreview({
      title: S.meta.title || 'প্রিভিউ',
      lang: S.meta.lang || 'bn',
      sections,
      totalChapters: S.chapters.length,
      previewConfig: { ...S.preview }
    });
  } else {
    toast('প্রিভিউ মডিউল লোড হয়নি');
  }
};

/* ---------- EPUB export ---------- */
$('#btnEpub').onclick = async () => {
  commit(); await save();
  const m = S.meta;
  if (!m.title.trim()) return toast('বইয়ের নাম লিখুন');
  if (!m.author.trim()) return toast('লেখকের নাম লিখুন');
  if (typeof JSZip === 'undefined') return toast('JSZip লোড হয়নি — ইন্টারনেট সংযোগ দেখুন');
  try {
    toast('EPUB প্রস্তুত হচ্ছে…');
    const fail = [], srcs = [], snaps = [];
    for (const c of S.chapters) {
      let h = c.mode === 'text' ? c.html : await inlineRemote(withAssets(c.html), fail);
      srcs.push(h); snaps.push(c.mode === 'code' ? await snapshot(h) : null);
    }
    const zip = new JSZip(), id = 'urn:uuid:' + crypto.randomUUID(), L = m.lang, ctx = { map: new Map(), list: [] };
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    zip.file('META-INF/container.xml', '<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    const o = zip.folder('OEBPS'); o.file('style.css', BOOK_CSS);
    let manifest = '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>', spine = '', navItems = '';
    if (S.cover) {
      const [head, b64] = S.cover.split(','), mime = head.match(/data:(.*?);/)[1], ext = mime.includes('png') ? 'png' : 'jpg';
      o.file('cover.' + ext, b64, { base64: true });
      o.file('cover.xhtml', page('কভার', `<div class="cover"><img src="cover.${ext}" alt="কভার"/></div>`, L));
      manifest += `<item id="coverimg" href="cover.${ext}" media-type="${mime}" properties="cover-image"/><item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>`;
      spine += '<itemref idref="cover"/>';
    }
    if (S.toc.on) {
      const inner = S.toc.auto ? tocLinks() : toXhtml(S.toc.html, ctx), tt = S.toc.title || 'সূচিপত্র';
      o.file('toc.xhtml', page(tt, `<h1>${esc(tt)}</h1>\n${inner}`, L));
      manifest += '<item id="tocpage" href="toc.xhtml" media-type="application/xhtml+xml"/>'; spine += '<itemref idref="tocpage"/>';
      navItems += `<li><a href="toc.xhtml">${esc(tt)}</a></li>`;
    }
    S.chapters.forEach((c, i) => {
      const f = `ch${i + 1}.xhtml`;
      if (c.mode === 'code') { const sn = snaps[i]; o.file(f, page(c.title, toXhtml(sn ? sn.body : sanitize(srcs[i], true), ctx), L, '', sn ? sn.css : '')); }
      else o.file(f, page(c.title, `<h1>${esc(c.title)}</h1>\n${toXhtml(ch2html(c, srcs[i]), ctx)}`, L));
      manifest += `<item id="ch${i + 1}" href="${f}" media-type="application/xhtml+xml"/>`;
      spine += `<itemref idref="ch${i + 1}"/>`;
      navItems += `<li><a href="${f}">${esc(c.title || 'অধ্যায় ' + (i + 1))}</a></li>`;
    });
    ctx.list.forEach((f, i) => { o.file(f.name, f.b64, { base64: true }); manifest += `<item id="im${i + 1}" href="${f.name}" media-type="${f.mime}"/>`; });
    o.file('nav.xhtml', page('সূচিপত্র', `<nav epub:type="toc" id="toc"><h1>সূচিপত্র</h1><ol>${navItems}</ol></nav>`, L, 'xmlns:epub="http://www.idpf.org/2007/ops"'));
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    o.file('content.opf', `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${L}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">${id}</dc:identifier><dc:title>${esc(m.title)}</dc:title><dc:creator>${esc(m.author)}</dc:creator><dc:language>${L}</dc:language>${m.desc.trim() ? `<dc:description>${esc(m.desc)}</dc:description>` : ''}<meta property="dcterms:modified">${now}</meta></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`);
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' });
    download(blob, fileName() + '.epub'); toast(fail.length ? `EPUB তৈরি হয়েছে। ${fail.length}টি অনলাইন ছবি আনা যায়নি, সেগুলো বাদ গেছে` : 'EPUB তৈরি হয়েছে');
  } catch (err) { console.error(err); toast('EPUB তৈরি করতে সমস্যা হয়েছে'); }
};

window.addEventListener('beforeunload', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
(async () => {
  let d = null;
  try { d = await idb.get('project'); } catch (e) { }
  if (!d) { try { d = JSON.parse(localStorage.getItem(OLD_KEY)); } catch (e) { } }
  load(d);
})();
})();
