/* Ebook Maker — Interactive Preview & Multi-Format Ebook Reader (EPUB, PDF, HTML, TXT) */
(() => {
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const note = msg => { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => t.hidden = true, 3200); };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const R = {
  mode: '', // 'epub' | 'pdf' | 'project' | 'text'
  key: '',
  zip: null,
  spine: [],
  toc: [],
  sections: [],
  i: 0,
  tk: 0,
  urls: new Map(),
  css: new Map(),
  fs: +localStorage.getItem('rfs') || 100,
  lh: +localStorage.getItem('rlh') || 1.85,
  theme: +localStorage.getItem('rth') || 0,
  // Preview range & unlock state
  limitOn: false,
  limitType: 'chapters', // 'chapters' | 'percent'
  limitVal: 2,
  buyUrl: '',
  ctaText: 'সম্পূর্ণ বইটি পড়তে আনলক করুন বা কিনুন',
  unlocked: false,
  bookmarks: []
};

const P = { pdf: null, zoom: 1, vp: null, divs: [], io: null, cur: 1, raf: 0, w: 0 };

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', css: 'text/css',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2'
};

const THEMES = [
  'html,body{background:#ffffff!important;color:#1c222b!important}',
  'html,body{background:#f4ecd8!important;color:#3b2f1e!important}',
  'html,body{background:#14181f!important;color:#d8dde6!important}a{color:#8ab4f8!important}table,th,td{border-color:#444!important}'
];

const BASE_CSS = `
  body {
    font-family: "Noto Serif Bengali", "Hind Siliguri", Georgia, serif;
    padding: 20px 18px 60px;
    max-width: 46em;
    margin: 0 auto;
    overflow-wrap: anywhere;
    -webkit-user-select: none;
    user-select: none;
  }
  h1, h2, h3 { line-height: 1.35; }
  table { width: 100%; border-collapse: collapse; margin: 1em 0; }
  th, td { border: 1px solid #bbb; padding: 6px 8px; text-align: left; }
  img, svg, video { max-width: 100%; height: auto; pointer-events: none; }
  ol.toc { list-style: none; padding: 0; }
  ol.toc li { margin: 0.65em 0; border-bottom: 1px dashed rgba(128,128,128,0.25); padding-bottom: 4px; }
  ol.toc a { text-decoration: none; color: inherit; font-weight: 500; }
`;

/* ---------- Helpers ---------- */
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s);
  });
}
let pdfReady = null;
function loadPdfLib() {
  if (window.pdfjsLib) return Promise.resolve();
  return pdfReady || (pdfReady = (async () => {
    const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
    try { await loadScript('lib/pdf.min.js'); pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js'; }
    catch (e) {
      await loadScript(CDN + 'pdf.min.js');
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([`importScripts("${CDN}pdf.worker.min.js");`], { type: 'text/javascript' }));
    }
  })().catch(e => { pdfReady = null; throw e; }));
}
const xml = s => new DOMParser().parseFromString(s, 'application/xml');
const zipText = async p => { const f = R.zip.file(p); if (!f) throw new Error('missing ' + p); return f.async('string'); };
function resolve(from, rel) {
  const u = new URL(rel, 'http://x/' + encodeURI(from)); let p = u.pathname.slice(1);
  try { p = decodeURIComponent(p); } catch (e) { } return p;
}
async function blobUrl(path) {
  if (R.urls.has(path)) return R.urls.get(path);
  const f = R.zip && R.zip.file(path); if (!f) return '';
  const b = await f.async('blob'), u = URL.createObjectURL(new Blob([b], { type: MIME[path.split('.').pop().toLowerCase()] || '' }));
  R.urls.set(path, u); return u;
}
async function cssText(path) {
  if (R.css.has(path)) return R.css.get(path);
  let css = ''; try { css = await zipText(path); } catch (e) { return ''; }
  for (const m of [...css.matchAll(/url\(\s*['"]?(?!data:|https?:|#)([^'")]+?)['"]?\s*\)/g)]) {
    const u = await blobUrl(resolve(path, m[1])); if (u) css = css.split(m[0]).join(`url("${u}")`);
  }
  R.css.set(path, css); return css;
}
const userCss = () => `html{font-size:${R.fs}%!important}body{line-height:${R.lh}!important}${THEMES[R.theme]}`;

/* ---------- Content Protection ---------- */
function attachContentProtection(doc) {
  if (!doc) return;
  doc.addEventListener('contextmenu', e => e.preventDefault());
  doc.addEventListener('copy', e => { e.preventDefault(); note('প্রিভিউ মোডে লেখা কপি করা সীমাবদ্ধ'); });
  doc.addEventListener('cut', e => e.preventDefault());
  doc.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && ['c', 's', 'p', 'u', 'a'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      note('কনটেন্ট সুরক্ষার জন্য এই শর্টকাটটি বন্ধ রাখা হয়েছে');
    }
  });
}
attachContentProtection(document);

/* ---------- Preview Range Calculation ---------- */
function getTotalUnits() {
  if (R.mode === 'pdf') return P.pdf ? P.pdf.numPages : 1;
  if (R.mode === 'epub') return R.spine.length || 1;
  return R.sections.length || 1;
}

function getAllowedMaxIndex() {
  const total = getTotalUnits();
  if (!R.limitOn || R.unlocked) return total - 1;
  if (R.limitType === 'percent') {
    const pct = Math.min(100, Math.max(1, R.limitVal));
    const allowedCount = Math.max(1, Math.ceil((total * pct) / 100));
    return Math.min(total - 1, allowedCount - 1);
  }
  // chapters / pages count (for project mode, front-matter doesn't penalize chapter count)
  if (R.mode === 'project') {
    let chSeen = 0;
    for (let idx = 0; idx < R.sections.length; idx++) {
      if (!R.sections[idx].isFront) chSeen++;
      if (chSeen > R.limitVal) return Math.max(0, idx - 1);
    }
    return total - 1;
  }
  return Math.min(total - 1, Math.max(0, R.limitVal - 1));
}

function isLockedIndex(idx) {
  if (!R.limitOn || R.unlocked) return false;
  return idx > getAllowedMaxIndex();
}

function showPaywall(targetIdx) {
  const total = getTotalUnits();
  const allowed = getAllowedMaxIndex() + 1;
  $('#rPaywallMsg').textContent = R.ctaText || 'আপনি এই বইটির ফ্রি স্যাম্পল অংশটুকু পড়ে ফেলেছেন। বাকি অংশ পড়তে সম্পূর্ণ বইটি আনলক করুন।';
  $('#rPaywallStats').textContent = `ফ্রি প্রিভিউ: ${allowed} / ${total} ${R.mode === 'pdf' ? 'পৃষ্ঠা' : 'অংশ'} (${Math.round((allowed / total) * 100)}%)`;
  $('#rPaywall').hidden = false;
  $('#rPaywall').dataset.target = targetIdx;
}

function hidePaywall() {
  $('#rPaywall').hidden = true;
}

/* ---------- Bookmarks & Progress ---------- */
function loadBookmarks() {
  try { R.bookmarks = JSON.parse(localStorage.getItem('rbm:' + R.key) || '[]'); } catch (e) { R.bookmarks = []; }
  updateBookmarkUI();
}
function saveBookmarks() {
  try { localStorage.setItem('rbm:' + R.key, JSON.stringify(R.bookmarks)); } catch (e) { }
  updateBookmarkUI();
}
function currentUnitIndex() {
  return R.mode === 'pdf' ? P.cur - 1 : R.i;
}
function currentUnitLabel() {
  if (R.mode === 'pdf') return `পৃষ্ঠা ${P.cur}`;
  if (R.mode === 'epub') {
    const t = R.toc.find(x => R.spine[R.i] && x.path === R.spine[R.i].path);
    return t ? t.label : `অংশ ${R.i + 1}`;
  }
  return R.sections[R.i] ? R.sections[R.i].title : `অংশ ${R.i + 1}`;
}
function updateBookmarkUI() {
  const cur = currentUnitIndex();
  const exists = R.bookmarks.some(b => b.idx === cur);
  const btn = $('#rBookmarkBtn');
  btn.textContent = exists ? '★' : '☆';
  btn.classList.toggle('active-bm', exists);
  $('#bmCount').textContent = R.bookmarks.length;

  const list = $('#rBmList');
  list.innerHTML = '';
  if (!R.bookmarks.length) {
    list.innerHTML = '<li style="padding:16px;text-align:center;color:#777">কোনো বুকমার্ক নেই</li>';
    return;
  }
  R.bookmarks.forEach((bm, i) => {
    const li = document.createElement('li');
    li.className = 'rBmItem';
    li.innerHTML = `<button class="bmGo">🔖 ${esc(bm.label)}</button><button class="bmDel" title="মুছুন">✕</button>`;
    li.querySelector('.bmGo').onclick = () => {
      $('#rDrawer').hidden = true;
      jumpToUnit(bm.idx);
    };
    li.querySelector('.bmDel').onclick = () => {
      R.bookmarks.splice(i, 1);
      saveBookmarks();
    };
    list.appendChild(li);
  });
}

function updateProgress() {
  const total = getTotalUnits();
  const cur = currentUnitIndex() + 1;
  const pct = Math.min(100, Math.max(1, Math.round((cur / total) * 100)));
  $('#rProgressFill').style.width = pct + '%';
  $('#rProgressText').textContent = `${pct}% পড়া হয়েছে (${cur}/${total})`;
  $('#rPrev').disabled = cur <= 1;
  $('#rNext').disabled = cur >= total && !isLockedIndex(cur);
  updateBookmarkUI();
}

function jumpToUnit(idx) {
  if (isLockedIndex(idx)) {
    showPaywall(idx);
    return;
  }
  hidePaywall();
  if (R.mode === 'pdf') goPdf(idx + 1);
  else if (R.mode === 'epub') renderEpubChapter(idx);
  else renderProjectSection(idx);
}

/* ---------- Reader Shell ---------- */
function setMode(m) {
  R.mode = m;
  const isPdf = m === 'pdf';
  $('#rFrame').hidden = isPdf;
  $('#rPdf').hidden = !isPdf;
  $('#rLineHeightRow').hidden = isPdf;
  $('#rThemeRow').hidden = isPdf;
  $('#rDrawer').hidden = true;
  $('#rSettingsPanel').hidden = true;
  hidePaywall();
  $('#rToc').textContent = isPdf ? 'পৃষ্ঠা / বুকমার্ক' : 'সূচি';
  syncSettingsUI();
}

function syncSettingsUI() {
  $('#rFsLabel').textContent = R.mode === 'pdf' ? Math.round(P.zoom * 100) + '%' : R.fs + '%';
  $$('.lh-btn').forEach(b => b.classList.toggle('active', +b.dataset.lh === R.lh));
  $$('.th-btn').forEach(b => b.classList.toggle('active', +b.dataset.th === R.theme));
  // Sync quick limit selector
  if (!R.limitOn) $('#rQuickLimit').value = '0';
  else if (R.limitType === 'percent' && (R.limitVal === 20 || R.limitVal === 30)) $('#rQuickLimit').value = R.limitVal + 'p';
  else if (R.limitType === 'chapters' && [1, 2, 3].includes(R.limitVal)) $('#rQuickLimit').value = String(R.limitVal);
}

function closeReader() {
  R.tk++; R.zip = null; R.spine = []; R.toc = []; R.sections = [];
  R.urls.forEach(u => URL.revokeObjectURL(u)); R.urls.clear(); R.css.clear();
  if (P.io) P.io.disconnect();
  if (P.pdf) { try { P.pdf.destroy(); } catch (e) { } P.pdf = null; }
  P.divs = [];
  $('#rPdf').innerHTML = '';
  const d = $('#rFrame').contentDocument;
  if (d) { d.open(); d.write(''); d.close(); }
  $('#reader').hidden = true;
  $('#rSettingsPanel').hidden = true;
  hidePaywall();
  document.body.style.overflow = '';
}

/* ---------- Open Project Preview (from Ebook Maker) ---------- */
window.openProjectPreview = function ({ title, lang, sections, previewConfig }) {
  closeReader();
  $('#reader').hidden = false;
  document.body.style.overflow = 'hidden';
  R.key = 'project:' + title;
  R.sections = sections;
  R.i = 0;
  R.unlocked = false;
  R.limitOn = !!(previewConfig && previewConfig.limitOn);
  R.limitType = (previewConfig && previewConfig.limitType) || 'chapters';
  R.limitVal = (previewConfig && previewConfig.limitVal) || 2;
  R.buyUrl = (previewConfig && previewConfig.buyUrl) || '';
  R.ctaText = (previewConfig && previewConfig.ctaText) || 'সম্পূর্ণ বইটি পড়তে আনলক করুন বা কিনুন';

  $('#rTitle').textContent = title || 'বইয়ের প্রিভিউ';
  setMode('project');
  loadBookmarks();
  renderProjectToc();
  renderProjectSection(0);
};

function renderProjectToc() {
  const ol = $('#rTocList');
  ol.innerHTML = '';
  R.sections.forEach((sec, idx) => {
    const locked = isLockedIndex(idx);
    const li = document.createElement('li');
    if (locked) li.className = 'locked';
    const b = document.createElement('button');
    b.innerHTML = `<span>${esc(sec.title)}</span>${locked ? '<span>🔒</span>' : ''}`;
    b.onclick = () => {
      $('#rDrawer').hidden = true;
      jumpToUnit(idx);
    };
    li.appendChild(b);
    ol.appendChild(li);
  });
}

function renderProjectSection(idx) {
  if (isLockedIndex(idx)) {
    showPaywall(idx);
    return;
  }
  hidePaywall();
  const sec = R.sections[idx];
  if (!sec) return;
  R.i = idx;
  const idoc = $('#rFrame').contentDocument;
  idoc.open();
  idoc.write('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>');
  idoc.close();

  const st = (css, id) => { const e = idoc.createElement('style'); if (id) e.id = id; e.textContent = css; idoc.head.appendChild(e); };
  st(BASE_CSS);
  st(userCss(), 'rs');
  idoc.body.innerHTML = sec.html;
  attachContentProtection(idoc);

  // Internal TOC link navigation inside iframe
  idoc.querySelectorAll('a[data-goto-ch]').forEach(a => {
    a.onclick = e => {
      e.preventDefault();
      const chIdx = +a.dataset.gotoCh;
      const targetSecIdx = R.sections.findIndex(s => s.chIndex === chIdx);
      if (targetSecIdx >= 0) jumpToUnit(targetSecIdx);
    };
  });

  // Swipe gestures
  let sx = 0, sy = 0;
  idoc.addEventListener('touchstart', e => { sx = e.changedTouches[0].clientX; sy = e.changedTouches[0].clientY; }, { passive: true });
  idoc.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 100 && Math.abs(dy) < 50) (dx < 0 ? next : prev)();
  }, { passive: true });

  $('#rFrame').style.background = R.theme === 1 ? '#f4ecd8' : R.theme === 2 ? '#14181f' : '#fff';
  $('#rPos').textContent = `${sec.title} (${idx + 1} / ${R.sections.length})`;
  updateProgress();
}

/* ---------- Open External File (EPUB / PDF / HTML / TXT) ---------- */
async function openBook(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['epub', 'pdf', 'txt', 'html', 'htm'].includes(ext)) return note('শুধু .epub, .pdf, .html বা .txt ফাইল খোলা যাবে');
  closeReader();
  $('#reader').hidden = false;
  document.body.style.overflow = 'hidden';
  R.unlocked = false;
  // Inherit preview limit config from editor UI if enabled
  R.limitOn = $('#pvLimitOn') ? $('#pvLimitOn').checked : false;
  R.limitType = $('#pvLimitType') ? $('#pvLimitType').value : 'chapters';
  R.limitVal = $('#pvLimitVal') ? (+$('#pvLimitVal').value || 2) : 2;
  R.buyUrl = $('#pvBuyUrl') ? $('#pvBuyUrl').value.trim() : '';
  R.ctaText = $('#pvCtaText') ? $('#pvCtaText').value : 'সম্পূর্ণ বইটি পড়তে আনলক করুন বা কিনুন';

  $('#rTitle').textContent = file.name;
  $('#rPos').textContent = 'লোড হচ্ছে…';
  R.key = file.name + ':' + file.size;
  loadBookmarks();

  try {
    if (ext === 'pdf') {
      setMode('pdf');
      const buf = await file.arrayBuffer();
      await openPdf(buf);
    } else if (ext === 'epub') {
      setMode('epub');
      const buf = await file.arrayBuffer();
      await openEpub(buf);
    } else {
      setMode('project');
      const raw = await file.text();
      openTextOrHtml(file.name, raw, ext === 'txt');
    }
  } catch (e) {
    console.error(e);
    note('ফাইলটি খোলা যায়নি');
    closeReader();
  }
}

function openTextOrHtml(name, raw, isPlain) {
  const html = isPlain
    ? raw.split(/\n{2,}/).map(p => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('')
    : raw;
  // Split into sections by <h1> if multiple chapters exist, otherwise paginate into readable chunks
  const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
  doc.querySelectorAll('script,iframe,object,embed').forEach(n => n.remove());
  const h1s = [...doc.querySelectorAll('h1')];
  const sections = [];
  if (h1s.length > 1) {
    let curTitle = name, curHtml = '';
    [...doc.body.childNodes].forEach(node => {
      if (node.nodeType === 1 && node.tagName === 'H1') {
        if (curHtml.trim()) sections.push({ title: curTitle, html: curHtml });
        curTitle = node.textContent.trim() || 'অধ্যায়';
        curHtml = node.outerHTML;
      } else {
        curHtml += node.outerHTML || esc(node.textContent);
      }
    });
    if (curHtml.trim()) sections.push({ title: curTitle, html: curHtml });
  } else {
    const blocks = [...doc.body.children];
    const perPage = 18;
    for (let i = 0; i < blocks.length; i += perPage) {
      const slice = blocks.slice(i, i + perPage).map(el => el.outerHTML).join('');
      sections.push({ title: `পৃষ্ঠা ${sections.length + 1}`, html: slice });
    }
    if (!sections.length) sections.push({ title: name, html: doc.body.innerHTML || '<p>খালি ফাইল</p>' });
  }
  R.sections = sections;
  renderProjectToc();
  renderProjectSection(0);
}

/* ---------- EPUB ---------- */
async function openEpub(buf) {
  if (typeof JSZip === 'undefined') throw new Error('JSZip');
  R.zip = await JSZip.loadAsync(buf);
  const opfPath = xml(await zipText('META-INF/container.xml')).getElementsByTagName('rootfile')[0].getAttribute('full-path');
  const opf = xml(await zipText(opfPath)), man = {};
  for (const it of opf.getElementsByTagName('item')) man[it.getAttribute('id')] = { path: resolve(opfPath, it.getAttribute('href')), type: it.getAttribute('media-type') || '', props: it.getAttribute('properties') || '' };
  R.spine = [...opf.getElementsByTagName('itemref')].map(r => man[r.getAttribute('idref')]).filter(m => m && /html|xml/.test(m.type) && !/ncx/.test(m.type));
  if (!R.spine.length) throw new Error('empty spine');
  const t = opf.getElementsByTagName('dc:title')[0]; if (t && t.textContent.trim()) $('#rTitle').textContent = t.textContent.trim();
  await buildToc(man); renderEpubToc();
  const saved = +localStorage.getItem('rp:' + R.key) || 0;
  const startIdx = isLockedIndex(saved) ? 0 : Math.min(saved, R.spine.length - 1);
  await renderEpubChapter(startIdx);
}

async function buildToc(man) {
  R.toc = []; const all = Object.values(man), nav = all.find(m => /\bnav\b/.test(m.props)), ncx = all.find(m => /ncx/.test(m.type));
  try {
    if (nav) {
      const d = new DOMParser().parseFromString(await zipText(nav.path), 'text/html');
      const n = [...d.querySelectorAll('nav')].find(x => /toc/.test(x.getAttribute('epub:type') || '')) || d.querySelector('nav');
      if (n) n.querySelectorAll('a[href]').forEach(a => {
        let lv = 0; for (let p = a.parentElement; p && p !== n; p = p.parentElement) if (/^(OL|UL)$/.test(p.tagName)) lv++;
        const [h, hash] = a.getAttribute('href').split('#');
        R.toc.push({ label: a.textContent.trim().replace(/\s+/g, ' '), path: h ? resolve(nav.path, h) : nav.path, hash, lv: Math.max(0, lv - 1) });
      });
    } else if (ncx) {
      const d = xml(await zipText(ncx.path));
      for (const np of d.getElementsByTagName('navPoint')) {
        let lv = 0; for (let p = np.parentNode; p; p = p.parentNode) if (p.nodeName === 'navPoint') lv++;
        const [h, hash] = np.getElementsByTagName('content')[0].getAttribute('src').split('#');
        R.toc.push({ label: np.getElementsByTagName('text')[0].textContent.trim(), path: resolve(ncx.path, h), hash, lv });
      }
    }
  } catch (e) { console.warn(e); }
  if (!R.toc.length) R.toc = R.spine.map((s, i) => ({ label: 'অংশ ' + (i + 1), path: s.path, hash: '', lv: 0 }));
}

function renderEpubToc() {
  const ol = $('#rTocList'); ol.innerHTML = '';
  R.toc.forEach(e => {
    const spineIdx = R.spine.findIndex(s => s.path === e.path);
    const locked = spineIdx >= 0 && isLockedIndex(spineIdx);
    const li = document.createElement('li');
    if (locked) li.className = 'locked';
    const b = document.createElement('button');
    b.innerHTML = `<span>${esc(e.label || '(নামহীন)')}</span>${locked ? '<span>🔒</span>' : ''}`;
    b.style.paddingLeft = (12 + e.lv * 14) + 'px';
    b.onclick = () => {
      if (spineIdx >= 0) {
        $('#rDrawer').hidden = true;
        if (isLockedIndex(spineIdx)) showPaywall(spineIdx);
        else renderEpubChapter(spineIdx, e.hash);
      }
    };
    li.appendChild(b); ol.appendChild(li);
  });
}

async function renderEpubChapter(i, hash) {
  if (isLockedIndex(i)) { showPaywall(i); return; }
  hidePaywall();
  const it = R.spine[i]; if (!it) return; const tk = ++R.tk;
  const raw = await zipText(it.path);
  let doc = new DOMParser().parseFromString(raw, 'application/xhtml+xml');
  if (doc.getElementsByTagName('parsererror').length) doc = new DOMParser().parseFromString(raw, 'text/html');
  doc.querySelectorAll('script,iframe,object,embed,audio,video').forEach(n => n.remove());
  const styles = [];
  for (const l of [...doc.querySelectorAll('link[href]')]) { if (/stylesheet/i.test(l.getAttribute('rel') || '')) styles.push(await cssText(resolve(it.path, l.getAttribute('href')))); l.remove(); }
  doc.querySelectorAll('style').forEach(s => styles.push(s.textContent));
  for (const im of doc.querySelectorAll('img[src]')) { const u = await blobUrl(resolve(it.path, im.getAttribute('src'))); if (u) im.setAttribute('src', u); }
  for (const im of doc.querySelectorAll('image')) { const a = im.getAttribute('xlink:href') ? 'xlink:href' : 'href', v = im.getAttribute(a); if (v) { const u = await blobUrl(resolve(it.path, v)); if (u) im.setAttribute(a, u); } }
  if (tk !== R.tk) return;
  R.i = i; const idoc = $('#rFrame').contentDocument;
  idoc.open(); idoc.write('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>'); idoc.close();
  const st = (css, id) => { const e = idoc.createElement('style'); if (id) e.id = id; e.textContent = css; idoc.head.appendChild(e); };
  st(BASE_CSS); styles.forEach(c => st(c)); st(userCss(), 'rs');
  [...doc.body.childNodes].forEach(n => idoc.body.appendChild(idoc.importNode(n, true)));
  if (doc.body.getAttribute('class')) idoc.body.className = doc.body.getAttribute('class');
  attachContentProtection(idoc);

  const toId = id => { const el = id && idoc.getElementById(id); if (el) el.scrollIntoView(); };
  idoc.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]'); if (!a) return; e.preventDefault();
    const h = a.getAttribute('href'); if (h.startsWith('#')) return toId(decodeURIComponent(h.slice(1)));
    if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return;
    const [p, hh] = h.split('#'), k = R.spine.findIndex(s => s.path === resolve(it.path, p));
    if (k >= 0) renderEpubChapter(k, hh);
  });
  let sx = 0, sy = 0;
  idoc.addEventListener('touchstart', e => { sx = e.changedTouches[0].clientX; sy = e.changedTouches[0].clientY; }, { passive: true });
  idoc.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; if (Math.abs(dx) > 100 && Math.abs(dy) < 50) (dx < 0 ? next : prev)(); }, { passive: true });
  if (hash) toId(hash); else idoc.defaultView.scrollTo(0, 0);
  $('#rFrame').style.background = R.theme === 1 ? '#f4ecd8' : R.theme === 2 ? '#14181f' : '#fff';
  $('#rPos').textContent = `অংশ ${i + 1} / ${R.spine.length}`;
  updateProgress();
  try { localStorage.setItem('rp:' + R.key, i); } catch (e) { }
}

function applyStyle() {
  const d = $('#rFrame').contentDocument, s = d && d.getElementById('rs');
  if (s) s.textContent = userCss();
  $('#rFrame').style.background = R.theme === 1 ? '#f4ecd8' : R.theme === 2 ? '#14181f' : '#fff';
  syncSettingsUI();
}

/* ---------- PDF ---------- */
const pbox = () => $('#rPdf');
const pScale = () => Math.max(.3, (pbox().clientWidth - 20) / P.vp.width) * P.zoom;
async function openPdf(buf) {
  await loadPdfLib();
  const task = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
  task.onPassword = cb => { const p = prompt('পিডিএফটির পাসওয়ার্ড দিন'); if (p === null) task.destroy(); else cb(p); };
  P.pdf = await task.promise; P.zoom = 1; P.w = pbox().clientWidth;
  P.vp = (await P.pdf.getPage(1)).getViewport({ scale: 1 });
  buildPdfToc();
  buildPages();
  const saved = +localStorage.getItem('rp:' + R.key) || 1;
  goPdf(isLockedIndex(saved - 1) ? 1 : saved);
  posText();
}
function buildPdfToc() {
  const ol = $('#rTocList'); ol.innerHTML = '';
  for (let n = 1; n <= P.pdf.numPages; n++) {
    const locked = isLockedIndex(n - 1);
    const li = document.createElement('li');
    if (locked) li.className = 'locked';
    const b = document.createElement('button');
    b.innerHTML = `<span>পৃষ্ঠা ${n}</span>${locked ? '<span>🔒</span>' : ''}`;
    b.onclick = () => { $('#rDrawer').hidden = true; jumpToUnit(n - 1); };
    li.appendChild(b); ol.appendChild(li);
  }
}
function buildPages() {
  const box = pbox(); box.innerHTML = ''; if (P.io) P.io.disconnect(); P.divs = [];
  const s = pScale();
  const maxPage = R.limitOn && !R.unlocked ? getAllowedMaxIndex() + 1 : P.pdf.numPages;
  P.io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) renderPage(e.target);
    else if (e.target._s) { e.target.replaceChildren(); e.target._s = 0; }
  }), { root: box, rootMargin: '900px 0px' });

  for (let n = 1; n <= maxPage; n++) {
    const d = document.createElement('div'); d.className = 'pdfPage'; d.dataset.n = n;
    d.style.width = P.vp.width * s + 'px'; d.style.height = P.vp.height * s + 'px';
    box.appendChild(d); P.divs.push(d); P.io.observe(d);
  }
  // If preview limit is active, add a teaser card at the bottom of scroll
  if (maxPage < P.pdf.numPages) {
    const lockCard = document.createElement('div');
    lockCard.style.cssText = 'background:#fff;padding:24px;border-radius:10px;text-align:center;max-width:90%;margin:12px auto;box-shadow:0 4px 16px rgba(0,0,0,0.3)';
    lockCard.innerHTML = `<div style="font-size:2rem">🔒</div><h3 style="margin:6px 0;color:#1a6b54">ফ্রি প্রিভিউ শেষ (${maxPage}/${P.pdf.numPages} পৃষ্ঠা)</h3><p style="margin:0 0 12px;color:#555">${esc(R.ctaText)}</p><button class="primary" id="pdfInlineUnlock">সম্পূর্ণ বই আনলক করুন</button>`;
    lockCard.querySelector('#pdfInlineUnlock').onclick = () => showPaywall(maxPage);
    box.appendChild(lockCard);
  }
}
async function renderPage(d) {
  const s = pScale(); if (d._busy || d._s === s) return; d._busy = true;
  try {
    const page = await P.pdf.getPage(+d.dataset.n), vp = page.getViewport({ scale: s }), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const c = document.createElement('canvas'); c.width = Math.floor(vp.width * dpr); c.height = Math.floor(vp.height * dpr);
    c.style.width = vp.width + 'px'; c.style.height = vp.height + 'px';
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
    d.style.width = vp.width + 'px'; d.style.height = vp.height + 'px'; d.replaceChildren(c); d._s = s;
  } catch (e) { } finally { d._busy = false; }
}
function goPdf(n) {
  if (!P.pdf) return;
  if (isLockedIndex(n - 1)) { showPaywall(n - 1); return; }
  hidePaywall();
  n = Math.min(Math.max(1, n), P.divs.length);
  P.cur = n;
  if (P.divs[n - 1]) pbox().scrollTop = P.divs[n - 1].offsetTop - 8;
  posText();
}
function posText() {
  if (P.pdf) {
    $('#rPos').textContent = `পৃষ্ঠা ${P.cur} / ${P.pdf.numPages}`;
    updateProgress();
  }
}
function zoomPdf(d) {
  if (!P.pdf) return;
  const n = P.cur;
  P.zoom = Math.min(3, Math.max(.5, P.zoom + d));
  buildPages();
  goPdf(n);
  syncSettingsUI();
}
pbox().addEventListener('scroll', () => {
  if (P.raf || !P.pdf) return;
  P.raf = requestAnimationFrame(() => {
    P.raf = 0; const box = pbox(), y = box.scrollTop + box.clientHeight / 3; let n = 1;
    for (const d of P.divs) { if (d.offsetTop <= y) n = +d.dataset.n; else break; }
    P.cur = n; posText(); try { localStorage.setItem('rp:' + R.key, n); } catch (e) { }
  });
});
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (P.pdf && pbox().clientWidth !== P.w) { P.w = pbox().clientWidth; const n = P.cur; buildPages(); goPdf(n); } }, 250); });

/* ---------- Controls & Navigation ---------- */
function next() {
  const cur = currentUnitIndex();
  const total = getTotalUnits();
  if (cur + 1 >= total) return;
  jumpToUnit(cur + 1);
}
function prev() {
  const cur = currentUnitIndex();
  if (cur <= 0) return;
  jumpToUnit(cur - 1);
}

$('#btnRead').onclick = () => $('#fileRead').click();
$('#fileRead').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) openBook(f); };
$('#rClose').onclick = closeReader;
$('#rNext').onclick = next;
$('#rPrev').onclick = prev;

// Settings popover toggle
$('#rSettingsBtn').onclick = e => {
  e.stopPropagation();
  $('#rDrawer').hidden = true;
  $('#rSettingsPanel').hidden = !$('#rSettingsPanel').hidden;
  syncSettingsUI();
};

// Drawer (TOC & Bookmarks)
$('#rToc').onclick = e => {
  e.stopPropagation();
  $('#rSettingsPanel').hidden = true;
  $('#rDrawer').hidden = !$('#rDrawer').hidden;
};
$('#tabToc').onclick = () => {
  $('#tabToc').classList.add('active'); $('#tabBookmarks').classList.remove('active');
  $('#paneToc').hidden = false; $('#paneBookmarks').hidden = true;
};
$('#tabBookmarks').onclick = () => {
  $('#tabBookmarks').classList.add('active'); $('#tabToc').classList.remove('active');
  $('#paneBookmarks').hidden = false; $('#paneToc').hidden = true;
  updateBookmarkUI();
};

// Bookmark toggle
$('#rBookmarkBtn').onclick = () => {
  const idx = currentUnitIndex();
  const existing = R.bookmarks.findIndex(b => b.idx === idx);
  if (existing >= 0) {
    R.bookmarks.splice(existing, 1);
    note('বুকমার্ক সরানো হয়েছে');
  } else {
    R.bookmarks.push({ idx, label: currentUnitLabel() });
    note('বুকমার্ক যুক্ত হয়েছে');
  }
  saveBookmarks();
};

// Font size, line spacing, themes & quick limit
const setFs = d => {
  R.fs = Math.min(220, Math.max(70, R.fs + d));
  try { localStorage.setItem('rfs', R.fs); } catch (e) { }
  applyStyle();
};
$('#rMinus').onclick = () => R.mode === 'pdf' ? zoomPdf(-.25) : setFs(-10);
$('#rPlus').onclick = () => R.mode === 'pdf' ? zoomPdf(.25) : setFs(10);

$$('.lh-btn').forEach(b => b.onclick = () => {
  R.lh = +b.dataset.lh;
  try { localStorage.setItem('rlh', R.lh); } catch (e) { }
  applyStyle();
});

$$('.th-btn').forEach(b => b.onclick = () => {
  R.theme = +b.dataset.th;
  try { localStorage.setItem('rth', R.theme); } catch (e) { }
  applyStyle();
});

$('#rQuickLimit').onchange = e => {
  const v = e.target.value;
  R.unlocked = false;
  if (v === '0') {
    R.limitOn = false;
  } else if (v.endsWith('p')) {
    R.limitOn = true; R.limitType = 'percent'; R.limitVal = parseInt(v, 10);
  } else {
    R.limitOn = true; R.limitType = 'chapters'; R.limitVal = parseInt(v, 10);
  }
  if (R.mode === 'pdf') { buildPdfToc(); buildPages(); goPdf(Math.min(P.cur, getAllowedMaxIndex() + 1)); }
  else if (R.mode === 'epub') { renderEpubToc(); renderEpubChapter(Math.min(R.i, getAllowedMaxIndex())); }
  else { renderProjectToc(); renderProjectSection(Math.min(R.i, getAllowedMaxIndex())); }
};

// Paywall / Unlock actions
$('#rUnlockBtn').onclick = () => {
  if (R.buyUrl) {
    window.open(R.buyUrl, '_blank', 'noopener');
    return;
  }
  R.unlocked = true;
  hidePaywall();
  note('সম্পূর্ণ বই আনলক করা হয়েছে!');
  const target = +$('#rPaywall').dataset.target || (getAllowedMaxIndex() + 1);
  if (R.mode === 'pdf') { buildPdfToc(); buildPages(); goPdf(target + 1); }
  else if (R.mode === 'epub') { renderEpubToc(); renderEpubChapter(target); }
  else { renderProjectToc(); renderProjectSection(target); }
};
$('#rPaywallBackBtn').onclick = () => {
  hidePaywall();
  jumpToUnit(getAllowedMaxIndex());
};

document.addEventListener('click', e => {
  if (!$('#rSettingsPanel').hidden && !$('#rSettingsPanel').contains(e.target) && e.target !== $('#rSettingsBtn')) {
    $('#rSettingsPanel').hidden = true;
  }
});

document.addEventListener('keydown', e => {
  if ($('#reader').hidden) return;
  if (e.key === 'Escape') {
    if (!$('#rSettingsPanel').hidden) $('#rSettingsPanel').hidden = true;
    else if (!$('#rDrawer').hidden) $('#rDrawer').hidden = true;
    else closeReader();
  } else if (e.key === 'ArrowRight') next();
  else if (e.key === 'ArrowLeft') prev();
});

/* ---------- Android: "Open with" / file-manager / WhatsApp support ---------- */
const cap = window.Capacitor, AppPlugin = cap && cap.Plugins && cap.Plugins.App;
let lastUri = '', lastAt = 0;
function b64ToBytes(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
async function openFromUri(uri) {
  if (!uri || !cap || !cap.Plugins || !cap.Plugins.Filesystem) return;
  if (uri === lastUri && Date.now() - lastAt < 4000) return;
  lastUri = uri; lastAt = Date.now();
  try {
    note('ফাইল খোলা হচ্ছে…');
    const { data } = await cap.Plugins.Filesystem.readFile({ path: uri });
    const b = b64ToBytes(data);
    const isPdf = b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
    const isZip = b[0] === 0x50 && b[1] === 0x4B;
    if (!isPdf && !isZip) return note('শুধু .epub বা .pdf ফাইল খোলা যাবে');
    const ext = isPdf ? 'pdf' : 'epub';
    let name = ''; try { name = decodeURIComponent(uri.split('?')[0].split('/').pop()); } catch (e) { }
    if (!name.toLowerCase().endsWith('.' + ext)) name = (name.replace(/[^\w.\u0980-\u09FF-]+/g, '_') || 'book') + '.' + ext;
    await openBook(new File([b], name));
  } catch (e) { console.error(e); note('ফাইলটি খোলা যায়নি'); }
}
if (AppPlugin) {
  AppPlugin.addListener('appUrlOpen', e => openFromUri(e && e.url));
  AppPlugin.getLaunchUrl().then(r => { if (r && r.url) openFromUri(r.url); }).catch(() => { });
  AppPlugin.addListener('backButton', () => {
    if (!$('#rPaywall').hidden) hidePaywall();
    else if (!$('#rDrawer').hidden) $('#rDrawer').hidden = true;
    else if (!$('#rSettingsPanel').hidden) $('#rSettingsPanel').hidden = true;
    else if (!$('#reader').hidden) closeReader();
    else AppPlugin.exitApp();
  });
}
})();
