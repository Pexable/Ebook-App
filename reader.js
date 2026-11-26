/* Ebook Maker — Interactive Preview & Multi-Format Ebook Reader (EPUB, PDF, HTML, TXT) */
(() => {
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const note = msg => { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => t.hidden = true, 3200); };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const R = {
  mode: '', // 'epub' | 'pdf' | 'project'
  readMode: localStorage.getItem('rrmode') || 'paged', // 'paged' | 'scroll'
  key: '',
  zip: null,
  spine: [],
  toc: [],
  sections: [],
  i: 0,          // current chapter / section index
  subPage: 0,    // current sub-page inside current chapter (0-indexed)
  subTotal: 1,   // total sub-pages inside current chapter
  pageW: 0,
  pageGap: 32,
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
  // Bookmarks (pages & saved lines) + Last-read line marker
  bookmarks: [],
  lastRead: null, // { idx, subPage, blockIdx, snippet, label }
  selectedBlock: null // { blockIdx, snippet, el }
};

const P = { pdf: null, zoom: 1, vp: null, divs: [], io: null, cur: 1, raf: 0, w: 0 };

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', css: 'text/css',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2'
};

const THEME_BG = ['#ffffff', '#f4ecd8', '#14181f'];

const THEMES = [
  'html,body,#rPageWrap{background:#ffffff!important;color:#1c222b!important}',
  'html,body,#rPageWrap{background:#f4ecd8!important;color:#3b2f1e!important}',
  'html,body,#rPageWrap{background:#14181f!important;color:#d8dde6!important}a{color:#8ab4f8!important}table,th,td{border-color:#444!important}'
];

const BASE_CSS = `
  *, *::before, *::after {
    box-sizing: border-box !important;
  }
  html {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow-x: hidden !important;
  }
  body {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    font-family: "Noto Serif Bengali", "Hind Siliguri", Georgia, serif;
    overflow-wrap: anywhere;
    word-break: break-word;
    -webkit-user-select: text;
    user-select: text;
    -webkit-touch-callout: default;
  }
  #rPageWrap {
    width: 100%;
    max-width: 48em;
    margin: 0 auto;
    padding: 18px 18px 48px;
  }
  html.is-paged, html.is-paged body {
    height: 100% !important;
    width: 100% !important;
    overflow: hidden !important;
  }
  html.is-paged body {
    padding: 0 16px !important;
  }
  html.is-paged #rPageWrap {
    max-width: none !important;
    margin: 0 !important;
    padding: 14px 0 18px !important;
    column-fill: auto !important;
    will-change: transform;
  }
  html.is-paged #rPageWrap > * {
    max-width: 100% !important;
  }
  html.is-paged div,
  html.is-paged section,
  html.is-paged article,
  html.is-paged p,
  html.is-paged ul,
  html.is-paged ol,
  html.is-paged blockquote {
    break-inside: auto !important;
    page-break-inside: auto !important;
  }
  h1, h2, h3 { line-height: 1.35; break-after: avoid; page-break-after: avoid; }
  p, li, blockquote { orphans: 2; widows: 2; }
  pre, code { white-space: pre-wrap !important; word-break: break-word !important; max-width: 100% !important; }
  table { width: 100% !important; max-width: 100% !important; border-collapse: collapse; margin: 1em 0; table-layout: fixed; }
  th, td { border: 1px solid #bbb; padding: 6px 8px; text-align: left; overflow-wrap: anywhere; }
  img, svg, video, figure {
    max-width: 100% !important;
    max-height: 72vh !important;
    width: auto !important;
    height: auto !important;
    object-fit: contain;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
  figure img { width: 100% !important; }
  ol.toc { list-style: none; padding: 0; }
  ol.toc li { margin: 0.65em 0; border-bottom: 1px dashed rgba(128,128,128,0.25); padding-bottom: 4px; }
  ol.toc a { text-decoration: none; color: inherit; font-weight: 500; }
  .codeFrame { display: block; width: 100% !important; max-width: 100% !important; max-height: none !important; height: calc(100vh - 56px) !important; border: 0; background: #fff; }

  /* Markable blocks & visual markers */
  [data-bm-block] {
    border-radius: 4px;
    transition: background-color 0.18s ease, box-shadow 0.18s ease;
    cursor: pointer;
  }
  [data-bm-block].r-block-selected {
    background: rgba(255, 179, 0, 0.24) !important;
    box-shadow: -3px 0 0 #ffb300;
    padding-left: 6px;
  }
  [data-bm-block].r-block-saved {
    background: rgba(26, 107, 84, 0.14) !important;
    box-shadow: -3px 0 0 #1a6b54;
    padding-left: 6px;
  }
  [data-bm-block].r-block-lastread {
    background: rgba(255, 152, 0, 0.20) !important;
    border-bottom: 2px dashed #ef6c00 !important;
    position: relative;
  }
  [data-bm-block].r-block-lastread::after {
    content: "📍 এ পর্যন্ত পঠিত";
    display: inline-block;
    margin-left: 8px;
    font-size: 0.72em;
    font-family: "Hind Siliguri", sans-serif;
    background: #ef6c00;
    color: #fff;
    padding: 1px 7px;
    border-radius: 10px;
    vertical-align: middle;
  }
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
const userCss = () => `html{font-size:${R.fs}%!important}body,#rPageWrap{line-height:${R.lh}!important}${THEMES[R.theme]}`;

function syncThemeSurface() {
  const bg = R.mode === 'pdf' ? '#525659' : THEME_BG[R.theme];
  $('#rBody').style.background = bg;
  $('#rFrame').style.background = THEME_BG[R.theme];
}

/* ---------- Content Protection ---------- */
function attachContentProtection(doc) {
  if (!doc) return;
  // Allow full text selection, long-press handles, context menu, and copy/cut/paste
  doc.documentElement.style.webkitUserSelect = 'text';
  doc.documentElement.style.userSelect = 'text';
  doc.body.style.webkitUserSelect = 'text';
  doc.body.style.userSelect = 'text';
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

/* ---------- Bookmarks & Last-Read Line Marker Persistence ---------- */
function loadBookmarks() {
  try { R.bookmarks = JSON.parse(localStorage.getItem('rbm:' + R.key) || '[]'); } catch (e) { R.bookmarks = []; }
  try { R.lastRead = JSON.parse(localStorage.getItem('rlr:' + R.key) || 'null'); } catch (e) { R.lastRead = null; }
  updateLastReadHeaderBtn();
  updateBookmarkUI();
}
function saveBookmarks() {
  try { localStorage.setItem('rbm:' + R.key, JSON.stringify(R.bookmarks)); } catch (e) { }
  updateBookmarkUI();
}
function saveLastRead() {
  try {
    if (R.lastRead) localStorage.setItem('rlr:' + R.key, JSON.stringify(R.lastRead));
    else localStorage.removeItem('rlr:' + R.key);
  } catch (e) { }
  updateLastReadHeaderBtn();
  updateBookmarkUI();
}
function updateLastReadHeaderBtn() {
  const btn = $('#rJumpLastBtn');
  if (!btn) return;
  btn.hidden = !R.lastRead;
}

function currentUnitIndex() {
  return R.mode === 'pdf' ? P.cur - 1 : R.i;
}
function currentSubPage() {
  return R.mode === 'pdf' ? 0 : (R.readMode === 'paged' ? R.subPage : 0);
}
function currentUnitLabel() {
  if (R.mode === 'pdf') return `পৃষ্ঠা ${P.cur}`;
  const pageTag = R.readMode === 'paged' && R.subTotal > 1 ? ` · পৃষ্ঠা ${R.subPage + 1}/${R.subTotal}` : '';
  if (R.mode === 'epub') {
    const t = R.toc.find(x => R.spine[R.i] && x.path === R.spine[R.i].path);
    return (t ? t.label : `অংশ ${R.i + 1}`) + pageTag;
  }
  return (R.sections[R.i] ? R.sections[R.i].title : `অংশ ${R.i + 1}`) + pageTag;
}

function isCurrentPageBookmarked() {
  const idx = currentUnitIndex();
  const sp = currentSubPage();
  return R.bookmarks.some(b => b.type !== 'line' && b.idx === idx && (b.subPage || 0) === sp);
}

function updateBookmarkUI() {
  const exists = isCurrentPageBookmarked();
  const btn = $('#rBookmarkBtn');
  btn.textContent = exists ? '★' : '☆';
  btn.classList.toggle('active-bm', exists);
  $('#bmCount').textContent = R.bookmarks.length + (R.lastRead ? 1 : 0);

  // Render Last-Read Card in Drawer
  const lrCard = $('#rLastReadCard');
  if (R.lastRead) {
    lrCard.hidden = false;
    lrCard.innerHTML = `
      <strong>📍 সর্বশেষ পঠিত চিহ্ন (${esc(R.lastRead.label)})</strong>
      <p>"${esc(R.lastRead.snippet || 'নির্দিষ্ট স্থান')}"</p>
      <div class="lrActions">
        <button class="primary" id="btnGoLastRead">এখান থেকে পড়ুন</button>
        <button class="ghost danger" id="btnDelLastRead">মুছুন</button>
      </div>
    `;
    lrCard.querySelector('#btnGoLastRead').onclick = () => {
      $('#rDrawer').hidden = true;
      jumpToLocation(R.lastRead);
    };
    lrCard.querySelector('#btnDelLastRead').onclick = () => {
      R.lastRead = null;
      saveLastRead();
      refreshIframeMarkers();
      note('পঠিত চিহ্ন মুছে ফেলা হয়েছে');
    };
  } else {
    lrCard.hidden = true;
    lrCard.innerHTML = '';
  }

  // Render Saved Pages & Lines List
  const list = $('#rBmList');
  list.innerHTML = '';
  if (!R.bookmarks.length && !R.lastRead) {
    list.innerHTML = '<li style="padding:18px 14px;text-align:center;color:#777;font-size:0.86rem">কোনো পৃষ্ঠা বা লাইন মার্ক করা নেই।<br><br>পড়ার সময় উপরে <b>☆</b> চেপে পৃষ্ঠা মার্ক করুন অথবা যেকোনো লাইনে ট্যাপ করে চিহ্ন রাখুন।</li>';
    return;
  }
  R.bookmarks.forEach((bm, i) => {
    const li = document.createElement('li');
    li.className = 'rBmItem';
    const icon = bm.type === 'line' ? '🖍️' : '🔖';
    li.innerHTML = `
      <button class="bmGo">
        <span class="bmTitle">${icon} ${esc(bm.label)}</span>
        ${bm.snippet ? `<span class="bmQuote">"${esc(bm.snippet)}"</span>` : ''}
      </button>
      <button class="bmDel" title="মুছুন">✕</button>
    `;
    li.querySelector('.bmGo').onclick = () => {
      $('#rDrawer').hidden = true;
      jumpToLocation(bm);
    };
    li.querySelector('.bmDel').onclick = () => {
      R.bookmarks.splice(i, 1);
      saveBookmarks();
      refreshIframeMarkers();
    };
    list.appendChild(li);
  });
}

function jumpToLocation(loc) {
  if (!loc) return;
  if (isLockedIndex(loc.idx)) {
    showPaywall(loc.idx);
    return;
  }
  hidePaywall();
  const opts = {
    subPage: loc.subPage || 0,
    blockIdx: typeof loc.blockIdx === 'number' ? loc.blockIdx : null
  };
  if (R.mode === 'pdf') goPdf(loc.idx + 1);
  else if (R.mode === 'epub') renderEpubChapter(loc.idx, '', opts);
  else renderProjectSection(loc.idx, opts);
}

/* ---------- Pagination Engine (True Page-by-Page Reading) ---------- */
function applyPaginationLayout(opts = {}) {
  const idoc = $('#rFrame').contentDocument;
  if (!idoc || !idoc.body) return;
  const htmlEl = idoc.documentElement;
  const wrap = idoc.getElementById('rPageWrap');
  if (!wrap) return;

  if (R.readMode !== 'paged') {
    htmlEl.classList.remove('is-paged');
    wrap.style.width = '';
    wrap.style.height = '';
    wrap.style.columnWidth = '';
    wrap.style.columnGap = '';
    wrap.style.transform = '';
    R.subPage = 0;
    R.subTotal = 1;
    if (typeof opts.blockIdx === 'number') {
      const targetEl = wrap.querySelector(`[data-bm-block="${opts.blockIdx}"]`);
      if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    updatePosAndProgress();
    return;
  }

  htmlEl.classList.add('is-paged');
  const frameEl = $('#rFrame');
  const outerW = Math.max(240, frameEl.clientWidth || window.innerWidth);
  const outerH = Math.max(240, frameEl.clientHeight || (window.innerHeight - 100));
  // body has `padding: 0 16px` in paged mode, so exact inner column width is outerW - 32
  const sidePad = 16;
  const colW = Math.max(200, outerW - sidePad * 2);
  const gap = 32;

  R.pageW = colW;
  R.pageGap = gap;
  wrap.style.width = colW + 'px';
  wrap.style.height = outerH + 'px';
  wrap.style.columnWidth = colW + 'px';
  wrap.style.columnGap = gap + 'px';
  wrap.style.transform = 'translateX(0px)';

  // Force synchronous reflow so scrollWidth reflects exact column count
  const sw = wrap.scrollWidth;
  const stride = colW + gap;
  const totalPages = Math.max(1, Math.ceil((sw - 2) / stride));
  R.subTotal = totalPages;

  let targetPage = 0;
  if (opts.lastPage) {
    targetPage = totalPages - 1;
  } else if (typeof opts.blockIdx === 'number') {
    const targetEl = wrap.querySelector(`[data-bm-block="${opts.blockIdx}"]`);
    if (targetEl) {
      targetPage = Math.floor((targetEl.offsetLeft + 2) / stride);
    } else if (typeof opts.subPage === 'number') {
      targetPage = opts.subPage;
    }
  } else if (typeof opts.subPage === 'number') {
    targetPage = opts.subPage;
  } else if (opts.keepCurrent) {
    targetPage = Math.min(R.subPage, totalPages - 1);
  }

  goSubPage(targetPage, false);
}

function goSubPage(p, animate = true) {
  const idoc = $('#rFrame').contentDocument;
  const wrap = idoc && idoc.getElementById('rPageWrap');
  R.subPage = Math.min(Math.max(0, p), R.subTotal - 1);
  if (wrap && R.readMode === 'paged') {
    wrap.style.transition = animate ? 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
    const offset = R.subPage * (R.pageW + R.pageGap);
    wrap.style.transform = `translateX(-${offset}px)`;
  }
  hideLineActionBar();
  updatePosAndProgress();
}

function updatePosAndProgress() {
  if (R.mode === 'pdf') {
    posText();
    return;
  }
  const totalSec = getTotalUnits();
  const secTitle = R.mode === 'epub'
    ? (R.toc.find(x => R.spine[R.i] && x.path === R.spine[R.i].path)?.label || `অংশ ${R.i + 1}`)
    : (R.sections[R.i]?.title || `অংশ ${R.i + 1}`);

  if (R.readMode === 'paged') {
    $('#rPos').textContent = `পৃষ্ঠা ${R.subPage + 1} / ${R.subTotal} · ${secTitle} (${R.i + 1}/${totalSec})`;
  } else {
    $('#rPos').textContent = `${secTitle} (${R.i + 1} / ${totalSec})`;
  }

  const secFrac = R.readMode === 'paged' ? ((R.subPage + 1) / R.subTotal) : 1;
  const overall = ((R.i + secFrac) / totalSec) * 100;
  const pct = Math.min(100, Math.max(1, Math.round(overall)));
  $('#rProgressFill').style.width = pct + '%';
  $('#rProgressText').textContent = R.readMode === 'paged'
    ? `পৃষ্ঠা ${R.subPage + 1}/${R.subTotal} · মোট ${pct}%`
    : `${pct}% পড়া হয়েছে (${R.i + 1}/${totalSec})`;

  const atFirst = R.i <= 0 && (R.readMode !== 'paged' || R.subPage <= 0);
  const atLast = R.i >= totalSec - 1 && (R.readMode !== 'paged' || R.subPage >= R.subTotal - 1);
  $('#rPrev').disabled = atFirst;
  $('#rNext').disabled = atLast && !isLockedIndex(R.i + 1);
  updateBookmarkUI();
}

/* ---------- Line / Paragraph Marking Inside Iframe ---------- */
function hideLineActionBar() {
  $('#rLineActionBar').hidden = true;
  R.selectedBlock = null;
  const idoc = $('#rFrame').contentDocument;
  if (idoc) idoc.querySelectorAll('.r-block-selected').forEach(el => el.classList.remove('r-block-selected'));
}

function setupMarkableBlocks(idoc) {
  const wrap = idoc.getElementById('rPageWrap');
  if (!wrap) return;
  const candidates = [...wrap.querySelectorAll('p, li, blockquote, h1, h2, h3, td')].filter(el => el.textContent.trim().length > 0);
  candidates.forEach((el, idx) => {
    el.setAttribute('data-bm-block', idx);
  });
  refreshIframeMarkers();
}

function refreshIframeMarkers() {
  const idoc = $('#rFrame').contentDocument;
  if (!idoc) return;
  idoc.querySelectorAll('[data-bm-block]').forEach(el => {
    el.classList.remove('r-block-saved', 'r-block-lastread');
  });

  // Highlight last-read line if in current section
  if (R.lastRead && R.lastRead.idx === R.i && typeof R.lastRead.blockIdx === 'number') {
    const el = idoc.querySelector(`[data-bm-block="${R.lastRead.blockIdx}"]`);
    if (el) el.classList.add('r-block-lastread');
  }

  // Highlight any saved line bookmarks in current section
  R.bookmarks.forEach(bm => {
    if (bm.type === 'line' && bm.idx === R.i && typeof bm.blockIdx === 'number') {
      const el = idoc.querySelector(`[data-bm-block="${bm.blockIdx}"]`);
      if (el) el.classList.add('r-block-saved');
    }
  });
}

function handleBlockTap(el) {
  const blockIdx = +el.getAttribute('data-bm-block');
  const snippet = el.textContent.trim().replace(/\s+/g, ' ').slice(0, 120);
  const idoc = $('#rFrame').contentDocument;
  if (idoc) idoc.querySelectorAll('.r-block-selected').forEach(x => x.classList.remove('r-block-selected'));
  el.classList.add('r-block-selected');

  R.selectedBlock = { blockIdx, snippet, el };
  $('#rLinePreview').textContent = `"${snippet}"`;

  const hasExistingMark =
    (R.lastRead && R.lastRead.idx === R.i && R.lastRead.blockIdx === blockIdx) ||
    R.bookmarks.some(b => b.type === 'line' && b.idx === R.i && b.blockIdx === blockIdx);

  $('#btnClearLineMark').hidden = !hasExistingMark;
  $('#rLineActionBar').hidden = false;
}

$('#btnMarkLastRead').onclick = () => {
  if (!R.selectedBlock) return;
  R.lastRead = {
    idx: R.i,
    subPage: R.readMode === 'paged' ? R.subPage : 0,
    blockIdx: R.selectedBlock.blockIdx,
    snippet: R.selectedBlock.snippet,
    label: currentUnitLabel()
  };
  saveLastRead();
  refreshIframeMarkers();
  hideLineActionBar();
  note('এই লাইন পর্যন্ত পঠিত চিহ্ন সেভ হয়েছে');
};

$('#btnSaveLineNote').onclick = () => {
  if (!R.selectedBlock) return;
  const existsIdx = R.bookmarks.findIndex(b => b.type === 'line' && b.idx === R.i && b.blockIdx === R.selectedBlock.blockIdx);
  if (existsIdx >= 0) {
    note('এই লাইনটি আগেই মার্ক করা আছে');
  } else {
    R.bookmarks.unshift({
      type: 'line',
      idx: R.i,
      subPage: R.readMode === 'paged' ? R.subPage : 0,
      blockIdx: R.selectedBlock.blockIdx,
      snippet: R.selectedBlock.snippet,
      label: currentUnitLabel()
    });
    saveBookmarks();
    refreshIframeMarkers();
    note('লাইনটি বুকমার্কে সেভ হয়েছে');
  }
  hideLineActionBar();
};

$('#btnClearLineMark').onclick = () => {
  if (!R.selectedBlock) return;
  const bIdx = R.selectedBlock.blockIdx;
  if (R.lastRead && R.lastRead.idx === R.i && R.lastRead.blockIdx === bIdx) {
    R.lastRead = null;
    saveLastRead();
  }
  const bmPos = R.bookmarks.findIndex(b => b.type === 'line' && b.idx === R.i && b.blockIdx === bIdx);
  if (bmPos >= 0) {
    R.bookmarks.splice(bmPos, 1);
    saveBookmarks();
  }
  refreshIframeMarkers();
  hideLineActionBar();
  note('লাইন চিহ্ন মুছে ফেলা হয়েছে');
};

$('#btnCloseLineBar').onclick = hideLineActionBar;

/* ---------- Reader Shell ---------- */
function setMode(m) {
  R.mode = m;
  const isPdf = m === 'pdf';
  $('#rFrame').hidden = isPdf;
  $('#rPdf').hidden = !isPdf;
  $('#rReadModeRow').hidden = isPdf;
  $('#rLineHeightRow').hidden = isPdf;
  $('#rThemeRow').hidden = isPdf;
  $('#rDrawer').hidden = true;
  $('#rSettingsPanel').hidden = true;
  hideLineActionBar();
  hidePaywall();
  $('#rToc').textContent = isPdf ? 'পৃষ্ঠা / মার্ক' : 'সূচি';
  syncThemeSurface();
  syncSettingsUI();
}

function syncSettingsUI() {
  $('#rFsLabel').textContent = R.mode === 'pdf' ? Math.round(P.zoom * 100) + '%' : R.fs + '%';
  $$('.rmode-btn').forEach(b => b.classList.toggle('active', b.dataset.rmode === R.readMode));
  $$('.lh-btn').forEach(b => b.classList.toggle('active', +b.dataset.lh === R.lh));
  $$('.th-btn').forEach(b => b.classList.toggle('active', +b.dataset.th === R.theme));
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
  hideLineActionBar();
  hidePaywall();
  document.body.style.overflow = '';
}

function bindIframeInteractions(idoc) {
  attachContentProtection(idoc);
  setupMarkableBlocks(idoc);

  let sx = 0, sy = 0, st = 0, wasLongPress = false;
  idoc.addEventListener('touchstart', e => {
    sx = e.changedTouches[0].clientX;
    sy = e.changedTouches[0].clientY;
    st = Date.now();
    wasLongPress = false;
  }, { passive: true });

  idoc.addEventListener('touchmove', e => {
    const dx = Math.abs(e.changedTouches[0].clientX - sx);
    const dy = Math.abs(e.changedTouches[0].clientY - sy);
    if ((Date.now() - st > 380) && (dx < 14 && dy < 14)) {
      wasLongPress = true;
    }
  }, { passive: true });

  idoc.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    const dur = Date.now() - st;
    const selText = (idoc.getSelection && idoc.getSelection().toString().trim()) || '';
    if (selText.length > 0 || dur > 420 || wasLongPress) {
      return; // User is selecting text via long-press
    }
    if (Math.abs(dx) > 65 && Math.abs(dy) < 60) {
      if (dx < 0) next(); else prev();
    }
  }, { passive: true });

  idoc.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('a[href]')) return;
    const selText = (idoc.getSelection && idoc.getSelection().toString().trim()) || '';
    if (selText.length > 0) return; // Keep text selection intact

    const block = e.target.closest && e.target.closest('[data-bm-block]');
    if (block) {
      handleBlockTap(block);
      return;
    }
    if (R.readMode === 'paged') {
      const vw = idoc.documentElement.clientWidth || window.innerWidth;
      if (e.clientX < vw * 0.16) prev();
      else if (e.clientX > vw * 0.84) next();
      else hideLineActionBar();
    } else {
      hideLineActionBar();
    }
  });
}

/* ---------- Open Project Preview (from Ebook Maker) ---------- */
window.openProjectPreview = function ({ title, lang, sections, previewConfig }) {
  closeReader();
  $('#reader').hidden = false;
  document.body.style.overflow = 'hidden';
  R.key = 'project:' + title;
  R.sections = sections;
  R.i = 0;
  R.subPage = 0;
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

function buildSectionDetailHtml(htmlStr, locked, unitLabel) {
  const tmp = new DOMParser().parseFromString('<body>' + (htmlStr || '') + '</body>', 'text/html');
  const plainText = (tmp.body.textContent || '').trim().replace(/\s+/g, ' ');
  const words = plainText ? plainText.split(/\s+/).length : 0;
  const mins = Math.max(1, Math.ceil(words / 180));
  const subHeadings = [...tmp.body.querySelectorAll('h2, h3')].map(h => h.textContent.trim()).filter(Boolean).slice(0, 6);
  const excerpt = plainText.slice(0, 110);

  return `
    <div class="rTocMetaBadges">
      <span class="rTocBadge">📄 ${esc(unitLabel)}</span>
      <span class="rTocBadge">📝 ${words} শব্দ</span>
      <span class="rTocBadge">⏱️ ~${mins} মিনিট</span>
      <span class="rTocBadge">${locked ? '🔒 লক করা' : '🔓 উন্মুক্ত'}</span>
    </div>
    ${excerpt ? `<div class="rTocExcerpt">"${esc(excerpt)}${plainText.length > 110 ? '…' : ''}"</div>` : ''}
    ${subHeadings.length ? `<div style="font-weight:600;margin-top:4px">উপ-শিরোনামসমূহ:</div><ul class="rTocSubList">${subHeadings.map(s => `<li>• ${esc(s)}</li>`).join('')}</ul>` : ''}
  `;
}

function renderProjectToc() {
  const ol = $('#rTocList');
  ol.innerHTML = '';
  R.sections.forEach((sec, idx) => {
    const locked = isLockedIndex(idx);
    const li = document.createElement('li');
    li.className = 'rTocItem' + (locked ? ' locked' : '');

    const mainRow = document.createElement('div');
    mainRow.className = 'rTocMainRow';

    const b = document.createElement('button');
    b.className = 'rTocGoBtn';
    b.innerHTML = `<span>${idx + 1}. ${esc(sec.title)}</span>${locked ? '<span>🔒</span>' : ''}`;
    b.onclick = () => {
      $('#rDrawer').hidden = true;
      if (isLockedIndex(idx)) showPaywall(idx);
      else renderProjectSection(idx);
    };

    const infoBtn = document.createElement('button');
    infoBtn.type = 'button';
    infoBtn.className = 'rTocInfoBtn';
    infoBtn.textContent = 'বিস্তারিত ▾';

    const detailBox = document.createElement('div');
    detailBox.className = 'rTocDetailBox';
    detailBox.hidden = true;
    detailBox.innerHTML = buildSectionDetailHtml(sec.html, locked, `অংশ ${idx + 1}/${R.sections.length}`);

    infoBtn.onclick = e => {
      e.stopPropagation();
      const willOpen = detailBox.hidden;
      detailBox.hidden = !willOpen;
      infoBtn.classList.toggle('open', willOpen);
      infoBtn.textContent = willOpen ? 'বন্ধ ▴' : 'বিস্তারিত ▾';
    };

    mainRow.appendChild(b);
    mainRow.appendChild(infoBtn);
    li.appendChild(mainRow);
    li.appendChild(detailBox);
    ol.appendChild(li);
  });
}

function renderProjectSection(idx, opts = {}) {
  if (isLockedIndex(idx)) {
    showPaywall(idx);
    return;
  }
  hidePaywall();
  hideLineActionBar();
  const sec = R.sections[idx];
  if (!sec) return;
  R.i = idx;
  const idoc = $('#rFrame').contentDocument;
  idoc.open();
  idoc.write('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="rPageWrap"></div></body></html>');
  idoc.close();

  const st = (css, id) => { const e = idoc.createElement('style'); if (id) e.id = id; e.textContent = css; idoc.head.appendChild(e); };
  st(BASE_CSS);
  st(userCss(), 'rs');
  const wrap = idoc.getElementById('rPageWrap');
  wrap.innerHTML = sec.html;

  // Internal TOC link navigation inside iframe
  wrap.querySelectorAll('a[data-goto-ch]').forEach(a => {
    a.onclick = e => {
      e.preventDefault();
      const chIdx = +a.dataset.gotoCh;
      const targetSecIdx = R.sections.findIndex(s => s.chIndex === chIdx);
      if (targetSecIdx >= 0) {
        if (isLockedIndex(targetSecIdx)) showPaywall(targetSecIdx);
        else renderProjectSection(targetSecIdx);
      }
    };
  });

  bindIframeInteractions(idoc);
  syncThemeSurface();
  idoc.querySelectorAll('img').forEach(img => {
    if (!img.complete) img.addEventListener('load', () => applyPaginationLayout({ keepCurrent: true }), { once: true });
  });
  if (idoc.fonts && idoc.fonts.ready) {
    idoc.fonts.ready.then(() => applyPaginationLayout({ keepCurrent: true }));
  }
  requestAnimationFrame(() => applyPaginationLayout(opts));
}

/* ---------- Open External File (EPUB / PDF / HTML / TXT) ---------- */
async function openBook(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['epub', 'pdf', 'txt', 'html', 'htm'].includes(ext)) return note('শুধু .epub, .pdf, .html বা .txt ফাইল খোলা যাবে');
  closeReader();
  $('#reader').hidden = false;
  document.body.style.overflow = 'hidden';
  R.unlocked = false;
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
    sections.push({ title: name, html: doc.body.innerHTML || '<p>খালি ফাইল</p>' });
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
  R.toc.forEach((e, tIdx) => {
    const spineIdx = R.spine.findIndex(s => s.path === e.path);
    const locked = spineIdx >= 0 && isLockedIndex(spineIdx);
    const li = document.createElement('li');
    li.className = 'rTocItem' + (locked ? ' locked' : '');

    const mainRow = document.createElement('div');
    mainRow.className = 'rTocMainRow';

    const b = document.createElement('button');
    b.className = 'rTocGoBtn';
    b.style.paddingLeft = (6 + e.lv * 12) + 'px';
    b.innerHTML = `<span>${esc(e.label || '(নামহীন)')}</span>${locked ? '<span>🔒</span>' : ''}`;
    b.onclick = () => {
      if (spineIdx >= 0) {
        $('#rDrawer').hidden = true;
        if (isLockedIndex(spineIdx)) showPaywall(spineIdx);
        else renderEpubChapter(spineIdx, e.hash);
      }
    };

    const infoBtn = document.createElement('button');
    infoBtn.type = 'button';
    infoBtn.className = 'rTocInfoBtn';
    infoBtn.textContent = 'বিস্তারিত ▾';

    const detailBox = document.createElement('div');
    detailBox.className = 'rTocDetailBox';
    detailBox.hidden = true;

    infoBtn.onclick = async ev => {
      ev.stopPropagation();
      const willOpen = detailBox.hidden;
      detailBox.hidden = !willOpen;
      infoBtn.classList.toggle('open', willOpen);
      infoBtn.textContent = willOpen ? 'বন্ধ ▴' : 'বিস্তারিত ▾';
      if (willOpen && !detailBox.dataset.loaded) {
        detailBox.dataset.loaded = '1';
        detailBox.innerHTML = '<span style="color:#777">তথ্য লোড হচ্ছে…</span>';
        try {
          const raw = spineIdx >= 0 ? await zipText(R.spine[spineIdx].path) : '';
          const unitStr = spineIdx >= 0 ? `অংশ ${spineIdx + 1}/${R.spine.length}` : `সূচি #${tIdx + 1}`;
          detailBox.innerHTML = buildSectionDetailHtml(raw, locked, unitStr);
        } catch (_) {
          detailBox.innerHTML = `<div class="rTocMetaBadges"><span class="rTocBadge">${locked ? '🔒 লক করা' : '🔓 উন্মুক্ত'}</span><span class="rTocBadge">📍 #${tIdx + 1}</span></div>`;
        }
      }
    };

    mainRow.appendChild(b);
    mainRow.appendChild(infoBtn);
    li.appendChild(mainRow);
    li.appendChild(detailBox);
    ol.appendChild(li);
  });
}

async function renderEpubChapter(i, hash, opts = {}) {
  if (isLockedIndex(i)) { showPaywall(i); return; }
  hidePaywall();
  hideLineActionBar();
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
  idoc.open(); idoc.write('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="rPageWrap"></div></body></html>'); idoc.close();
  const st = (css, id) => { const e = idoc.createElement('style'); if (id) e.id = id; e.textContent = css; idoc.head.appendChild(e); };
  styles.forEach(c => st(c));
  st(BASE_CSS);
  st(userCss(), 'rs');
  const wrap = idoc.getElementById('rPageWrap');
  [...doc.body.childNodes].forEach(n => wrap.appendChild(idoc.importNode(n, true)));
  if (doc.body.getAttribute('class')) wrap.className = doc.body.getAttribute('class');

  const toId = id => {
    const el = id && idoc.getElementById(id);
    if (!el) return;
    if (R.readMode === 'paged') {
      const targetPage = Math.floor((el.offsetLeft + 4) / (R.pageW + R.pageGap));
      goSubPage(targetPage, false);
    } else {
      el.scrollIntoView();
    }
  };
  idoc.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]'); if (!a) return; e.preventDefault();
    const h = a.getAttribute('href'); if (h.startsWith('#')) return toId(decodeURIComponent(h.slice(1)));
    if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return;
    const [p, hh] = h.split('#'), k = R.spine.findIndex(s => s.path === resolve(it.path, p));
    if (k >= 0) renderEpubChapter(k, hh);
  });

  bindIframeInteractions(idoc);
  syncThemeSurface();
  idoc.querySelectorAll('img').forEach(img => {
    if (!img.complete) img.addEventListener('load', () => applyPaginationLayout({ keepCurrent: true }), { once: true });
  });
  if (idoc.fonts && idoc.fonts.ready) {
    idoc.fonts.ready.then(() => applyPaginationLayout({ keepCurrent: true }));
  }
  requestAnimationFrame(() => {
    applyPaginationLayout(opts);
    if (hash) toId(hash);
    else if (R.readMode !== 'paged') idoc.defaultView.scrollTo(0, 0);
  });
  try { localStorage.setItem('rp:' + R.key, i); } catch (e) { }
}

function applyStyle() {
  const d = $('#rFrame').contentDocument, s = d && d.getElementById('rs');
  if (s) s.textContent = userCss();
  syncThemeSurface();
  syncSettingsUI();
  if (R.mode !== 'pdf') {
    const keepRatio = R.subTotal > 1 ? (R.subPage / (R.subTotal - 1)) : 0;
    requestAnimationFrame(() => {
      applyPaginationLayout();
      if (R.readMode === 'paged' && R.subTotal > 1) {
        goSubPage(Math.round(keepRatio * (R.subTotal - 1)), false);
      }
    });
  }
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
    li.className = 'rTocItem' + (locked ? ' locked' : '');

    const mainRow = document.createElement('div');
    mainRow.className = 'rTocMainRow';

    const b = document.createElement('button');
    b.className = 'rTocGoBtn';
    b.innerHTML = `<span>পৃষ্ঠা ${n}</span>${locked ? '<span>🔒</span>' : ''}`;
    b.onclick = () => { $('#rDrawer').hidden = true; if (isLockedIndex(n - 1)) showPaywall(n - 1); else goPdf(n); };

    const infoBtn = document.createElement('button');
    infoBtn.type = 'button';
    infoBtn.className = 'rTocInfoBtn';
    infoBtn.textContent = 'বিস্তারিত ▾';

    const detailBox = document.createElement('div');
    detailBox.className = 'rTocDetailBox';
    detailBox.hidden = true;

    infoBtn.onclick = async ev => {
      ev.stopPropagation();
      const willOpen = detailBox.hidden;
      detailBox.hidden = !willOpen;
      infoBtn.classList.toggle('open', willOpen);
      infoBtn.textContent = willOpen ? 'বন্ধ ▴' : 'বিস্তারিত ▾';
      if (willOpen && !detailBox.dataset.loaded) {
        detailBox.dataset.loaded = '1';
        detailBox.innerHTML = '<span style="color:#777">পৃষ্ঠার তথ্য লোড হচ্ছে…</span>';
        try {
          const pdfPage = await P.pdf.getPage(n);
          const tc = await pdfPage.getTextContent();
          const txt = tc.items.map(it => it.str).join(' ').trim().replace(/\s+/g, ' ');
          const words = txt ? txt.split(/\s+/).length : 0;
          detailBox.innerHTML = `
            <div class="rTocMetaBadges">
              <span class="rTocBadge">📄 পৃষ্ঠা ${n}/${P.pdf.numPages}</span>
              <span class="rTocBadge">📝 ~${words} শব্দ</span>
              <span class="rTocBadge">${locked ? '🔒 লক করা' : '🔓 উন্মুক্ত'}</span>
            </div>
            ${txt ? `<div class="rTocExcerpt">"${esc(txt.slice(0, 110))}${txt.length > 110 ? '…' : ''}"</div>` : '<div style="color:#777">স্ক্যান করা বা ছবি-ভিত্তিক পৃষ্ঠা</div>'}
          `;
        } catch (_) {
          detailBox.innerHTML = `<div class="rTocMetaBadges"><span class="rTocBadge">📄 পৃষ্ঠা ${n}/${P.pdf.numPages}</span><span class="rTocBadge">${locked ? '🔒 লক করা' : '🔓 উন্মুক্ত'}</span></div>`;
        }
      }
    };

    mainRow.appendChild(b);
    mainRow.appendChild(infoBtn);
    li.appendChild(mainRow);
    li.appendChild(detailBox);
    ol.appendChild(li);
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
    const total = P.pdf.numPages;
    const pct = Math.min(100, Math.max(1, Math.round((P.cur / total) * 100)));
    $('#rPos').textContent = `পৃষ্ঠা ${P.cur} / ${total}`;
    $('#rProgressFill').style.width = pct + '%';
    $('#rProgressText').textContent = `${pct}% পড়া হয়েছে (${P.cur}/${total})`;
    $('#rPrev').disabled = P.cur <= 1;
    $('#rNext').disabled = P.cur >= total && !isLockedIndex(P.cur);
    updateBookmarkUI();
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

let rz;
window.addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => {
    if ($('#reader').hidden) return;
    if (R.mode === 'pdf' && P.pdf && pbox().clientWidth !== P.w) {
      P.w = pbox().clientWidth;
      const n = P.cur;
      buildPages();
      goPdf(n);
    } else if (R.mode !== 'pdf') {
      const keepRatio = R.subTotal > 1 ? (R.subPage / (R.subTotal - 1)) : 0;
      applyPaginationLayout();
      if (R.readMode === 'paged' && R.subTotal > 1) {
        goSubPage(Math.round(keepRatio * (R.subTotal - 1)), false);
      }
    }
  }, 220);
});

/* ---------- Controls & Page-by-Page Navigation ---------- */
function next() {
  if (R.mode === 'pdf') {
    if (P.cur < P.pdf.numPages) goPdf(P.cur + 1);
    return;
  }
  if (R.readMode === 'paged' && R.subPage + 1 < R.subTotal) {
    goSubPage(R.subPage + 1, true);
    return;
  }
  const total = getTotalUnits();
  if (R.i + 1 >= total) return;
  if (isLockedIndex(R.i + 1)) {
    showPaywall(R.i + 1);
    return;
  }
  if (R.mode === 'epub') renderEpubChapter(R.i + 1);
  else renderProjectSection(R.i + 1);
}

function prev() {
  if (R.mode === 'pdf') {
    if (P.cur > 1) goPdf(P.cur - 1);
    return;
  }
  if (R.readMode === 'paged' && R.subPage > 0) {
    goSubPage(R.subPage - 1, true);
    return;
  }
  if (R.i <= 0) return;
  const opts = R.readMode === 'paged' ? { lastPage: true } : {};
  if (R.mode === 'epub') renderEpubChapter(R.i - 1, '', opts);
  else renderProjectSection(R.i - 1, opts);
}

$('#btnRead').onclick = () => $('#fileRead').click();
$('#fileRead').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) openBook(f); };
$('#rClose').onclick = closeReader;
$('#rNext').onclick = next;
$('#rPrev').onclick = prev;

$('#rJumpLastBtn').onclick = () => {
  if (R.lastRead) jumpToLocation(R.lastRead);
};

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

// Page Bookmark toggle
$('#rBookmarkBtn').onclick = () => {
  const idx = currentUnitIndex();
  const sp = currentSubPage();
  const existing = R.bookmarks.findIndex(b => b.type !== 'line' && b.idx === idx && (b.subPage || 0) === sp);
  if (existing >= 0) {
    R.bookmarks.splice(existing, 1);
    note('পৃষ্ঠার মার্ক সরানো হয়েছে');
  } else {
    R.bookmarks.unshift({ type: 'page', idx, subPage: sp, label: currentUnitLabel() });
    note('এই পৃষ্ঠাটি মার্ক করা হয়েছে');
  }
  saveBookmarks();
};

// Read Mode (Paged vs Scroll), Font size, Line spacing, Themes & Quick limit
$$('.rmode-btn').forEach(b => b.onclick = () => {
  R.readMode = b.dataset.rmode;
  try { localStorage.setItem('rrmode', R.readMode); } catch (e) { }
  syncSettingsUI();
  applyPaginationLayout();
});

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
  const maxIdx = getAllowedMaxIndex();
  if (R.mode === 'pdf') goPdf(maxIdx + 1);
  else if (R.mode === 'epub') renderEpubChapter(maxIdx);
  else renderProjectSection(maxIdx);
};

document.addEventListener('click', e => {
  if (!$('#rSettingsPanel').hidden && !$('#rSettingsPanel').contains(e.target) && e.target !== $('#rSettingsBtn')) {
    $('#rSettingsPanel').hidden = true;
  }
});

document.addEventListener('keydown', e => {
  if ($('#reader').hidden) return;
  if (e.key === 'Escape') {
    if (!$('#rLineActionBar').hidden) hideLineActionBar();
    else if (!$('#rSettingsPanel').hidden) $('#rSettingsPanel').hidden = true;
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
    if (!$('#rLineActionBar').hidden) hideLineActionBar();
    else if (!$('#rPaywall').hidden) hidePaywall();
    else if (!$('#rDrawer').hidden) $('#rDrawer').hidden = true;
    else if (!$('#rSettingsPanel').hidden) $('#rSettingsPanel').hidden = true;
    else if (!$('#reader').hidden) closeReader();
    else AppPlugin.exitApp();
  });
}
})();
