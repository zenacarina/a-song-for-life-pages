import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const CONTENT = path.join(ROOT, 'memorials');
const STATIC = path.join(ROOT, 'static');
const DIST = path.join(ROOT, 'dist');
const BASE_URL = 'https://remembering.asongforlife.co.uk';
const checkOnly = process.argv.includes('--check');

const escapeHtml = value =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const escapeJs = value => JSON.stringify(String(value));

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });

  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const a = path.join(src, entry.name);
    const b = path.join(dest, entry.name);

    entry.isDirectory()
      ? await copyDir(a, b)
      : await fs.copyFile(a, b);
  }
}

function validate(d, dir) {
  const required = [
    'slug',
    'name',
    'shortName',
    'possessiveName',
    'dates',
    'heroImage',
    'heroAlt',
    'tributeHtml',
    'songTitle',
    'audioUrl',
    'shareImage',
    'shareDescription',
    'lyrics',
    'rememberingTitle',
    'rememberingParagraphs',
    'closingLine',
  ];

  const missing = required.filter(
    key => d[key] === undefined || d[key] === ''
  );

  if (missing.length) {
    throw new Error(`${dir}: missing ${missing.join(', ')}`);
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug)) {
    throw new Error(`${dir}: invalid slug`);
  }

  if (d.slug !== dir) {
    throw new Error(`${dir}: slug must match folder name`);
  }

  if (
    !Array.isArray(d.rememberingParagraphs) ||
    !d.rememberingParagraphs.length
  ) {
    throw new Error(
      `${dir}: rememberingParagraphs must be a non-empty array`
    );
  }

  if (
    d.lyrics
      .trim()
      .split(/\n/)
      .filter(Boolean).length < 5
  ) {
    throw new Error(`${dir}: lyrics are unexpectedly short`);
  }

  if (
    d.pageType !== undefined &&
    !['example', 'client'].includes(d.pageType)
  ) {
    throw new Error(
      `${dir}: pageType must be "example" or "client"`
    );
  }

  if (d.storyParagraphs !== undefined) {
    if (
      !Array.isArray(d.storyParagraphs) ||
      !d.storyParagraphs.length ||
      d.storyParagraphs.some(p => !String(p).trim())
    ) {
      throw new Error(
        `${dir}: storyParagraphs must be a non-empty array of paragraphs`
      );
    }

    if (!d.storyTitle || !String(d.storyTitle).trim()) {
      throw new Error(
        `${dir}: storyTitle is required when storyParagraphs are supplied`
      );
    }
  }

  if (d.galleryPhotos !== undefined) {
    if (
      !Array.isArray(d.galleryPhotos) ||
      d.galleryPhotos.length < 1 ||
      d.galleryPhotos.length > 20 ||
      d.galleryPhotos.some(photo => !String(photo).trim())
    ) {
      throw new Error(
        `${dir}: galleryPhotos must contain between 1 and 20 image filenames`
      );
    }
  }
}

function lyricParts(lyrics) {
  const lines = lyrics.trim().split(/\r?\n/);
  const preview = [];
  let i = 0;

  while (i < lines.length && preview.length < 4) {
    if (lines[i].trim()) {
      preview.push(lines[i].trim());
    }

    i++;
  }

  while (i < lines.length && !lines[i].trim()) {
    i++;
  }

  return {
    preview,
    remainder: lines.slice(i).join('\n').trim(),
  };
}

function getDownloadUrl(d) {
  if (d.downloadUrl) {
    return d.downloadUrl;
  }

  const audioBase =
    'https://audio.asongforlife.co.uk/';

  const downloadBase =
    'https://a-song-for-life-downloads.zenacarinas.workers.dev/';

  if (!d.audioUrl.startsWith(audioBase)) {
    throw new Error(
      `${d.slug}: audioUrl must begin with ${audioBase}`
    );
  }

  return downloadBase + d.audioUrl.slice(audioBase.length);
}

function renderPage(d, css) {
  const downloadUrl = getDownloadUrl(d);
  const isExample = d.pageType === 'example';

  const exampleNav = isExample
    ? `
<nav class="example-nav" aria-label="Example memorial navigation">
  <span class="example-nav__brand">
    Memorial Page Example
  </span>

  <a class="example-nav__return" href="https://asongforlife.co.uk/">
    <span aria-hidden="true">←</span>
    Return to A Song for Life
  </a>
</nav>`
    : '';

  const footerCredit = isExample
    ? `
    Example memorial
    <span aria-hidden="true">·</span>
    Created with care by
    <a href="https://asongforlife.co.uk/">A Song for Life</a>
    <span aria-hidden="true">·</span>
    <a href="https://asongforlife.co.uk/">Return to website</a>`
    : `
    Created with care by Zena Carina
    <span aria-hidden="true">·</span>
    <a
      href="https://asongforlife.co.uk"
      target="_blank"
      rel="noopener"
    >
      Visit A Song for Life
    </a>`;

  const url = `${BASE_URL}/${d.slug}/`;

  const imageUrl =
    `${BASE_URL}/${d.slug}/` +
    encodeURIComponent(d.shareImage);

  const { preview, remainder } = lyricParts(d.lyrics);

  const paragraphs = d.rememberingParagraphs
    .map(p => `        <p>${escapeHtml(p)}</p>`)
    .join('\n');

  const storyParagraphs = Array.isArray(d.storyParagraphs)
    ? d.storyParagraphs
        .map(p => `        <p>${escapeHtml(p)}</p>`)
        .join('\n')
    : '';

  const storySection = storyParagraphs
    ? `
<section class="panel story-panel">
  <button
    id="storyToggle"
    class="story-toggle"
    type="button"
    aria-expanded="false"
    aria-controls="storyContent"
  >
    <span id="storyLabel" class="story-label">
      ${escapeHtml(d.storyTitle)}
    </span>

    <span class="chev" aria-hidden="true"></span>
  </button>

  <div
    id="storyContent"
    class="story-content"
    aria-hidden="true"
  >
    <div class="story-inner">
      <div class="story-copy">
${storyParagraphs}
      </div>
    </div>
  </div>
</section>`
    : '';

  const galleryPhotos = Array.isArray(d.galleryPhotos)
    ? d.galleryPhotos
    : [];

  const visibleGalleryPhotos = galleryPhotos.slice(0, 5);

  const galleryPhotoData = galleryPhotos.map((photo, index) => ({
    src: photo,
    alt: `${d.name} memorial photograph ${index + 1}`,
  }));

  const galleryPhotoJson = JSON.stringify(galleryPhotoData)
    .replaceAll('<', '\\u003c');

  const galleryItems = visibleGalleryPhotos
    .map((photo, index) => {
      return `      <figure class="memory-photo">
        <button
          class="gallery-open"
          type="button"
          data-gallery-index="${index}"
          aria-label="Enlarge ${escapeHtml(d.name)} memorial photograph ${index + 1}"
        >
          <img
            src="${escapeHtml(photo)}"
            alt="${escapeHtml(d.name)} memorial photograph ${index + 1}"
            loading="lazy"
          >
        </button>
      </figure>`;
    })
    .join('\n');

  const gallerySection = visibleGalleryPhotos.length
    ? `
<section class="section-card section-card--gallery">
  <div class="content content--gallery">
    <section
      class="panel gallery-panel"
      aria-labelledby="gallery-title"
    >
      <h2 id="gallery-title" class="gallery-title">
        Gallery
      </h2>

      <div class="panel-rule" aria-hidden="true">♥</div>

      <div class="gallery-grid gallery-grid--${visibleGalleryPhotos.length}">
${galleryItems}
      </div>
    </section>
  </div>
</section>

<div
  id="galleryLightbox"
  class="gallery-lightbox"
  role="dialog"
  aria-modal="true"
  aria-label="${escapeHtml(d.name)} photo gallery"
  aria-hidden="true"
>
  <button
    id="galleryClose"
    class="gallery-lightbox__close"
    type="button"
    aria-label="Close photo viewer"
  >
    ×
  </button>

  <button
    id="galleryPrev"
    class="gallery-lightbox__nav gallery-lightbox__nav--prev"
    type="button"
    aria-label="Previous photograph"
  >
    ‹
  </button>

  <div class="gallery-lightbox__stage">
    <img
      id="galleryLightboxImage"
      class="gallery-lightbox__image"
      src=""
      alt=""
    >

    <div
      id="galleryCounter"
      class="gallery-lightbox__counter"
      aria-live="polite"
    ></div>
  </div>

  <button
    id="galleryNext"
    class="gallery-lightbox__nav gallery-lightbox__nav--next"
    type="button"
    aria-label="Next photograph"
  >
    ›
  </button>
</div>`
    : '';

  const shareText =
    `Listen to ${d.name}’s personal memorial song.`;

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="${escapeHtml(d.name)} — a personal memorial song and private keepsake page.">
<meta name="robots" content="noindex,nofollow,noarchive">

<meta property="og:title" content="Remembering ${escapeHtml(d.name)}">
<meta property="og:description" content="${escapeHtml(d.shareDescription)}">
<meta property="og:image" content="${imageUrl}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Remembering ${escapeHtml(d.name)} — a personal memorial song by A Song for Life">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Remembering ${escapeHtml(d.name)}">
<meta name="twitter:description" content="${escapeHtml(d.shareDescription)}">
<meta name="twitter:image" content="${imageUrl}">

<title>${escapeHtml(d.name)} | A Song for Life</title>

<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">

<meta name="theme-color" content="#08243a">

<style>
${css}

/* POLISHED NATURAL-PROPORTION MEMORIAL GALLERY */

.gallery-panel{
  padding:30px 34px 34px;
}

.gallery-title{
  margin:0 0 10px;
  color:var(--navy);
  font:28px Georgia,serif;
  text-align:center;
  letter-spacing:.01em;
}

.gallery-grid{
  display:grid;
  gap:14px;
  margin-top:12px;
  align-items:start;
}

.memory-photo{
  position:relative;
  min-width:0;
  min-height:0;
  margin:0;
  overflow:hidden;
  padding:6px;
  background:
    linear-gradient(
      145deg,
      #f3ebdf,
      #fffdfa
    );
  border:1px solid rgba(184,120,36,.16);
  border-radius:13px;
  box-shadow:
    0 7px 20px rgba(46,32,20,.07);
  aspect-ratio:auto!important;
}

.memory-photo img{
  display:block;
  width:100%;
  height:auto!important;
  max-width:100%;
  object-fit:contain!important;
  object-position:center;
  border-radius:8px;
}

.gallery-grid--1{
  max-width:760px;
  margin-left:auto;
  margin-right:auto;
}

.gallery-grid--2{
  grid-template-columns:
    repeat(2,minmax(0,1fr));
}

.gallery-grid--3{
  grid-template-columns:
    repeat(2,minmax(0,1fr));
  grid-template-rows:none!important;
}

.gallery-grid--3 .memory-photo:first-child{
  grid-column:1 / -1;
  grid-row:auto!important;
}

.gallery-grid--4{
  grid-template-columns:
    repeat(2,minmax(0,1fr));
}

.gallery-grid--5{
  grid-template-columns:
    repeat(4,minmax(0,1fr));
  grid-template-rows:none!important;
}

.gallery-grid--5 .memory-photo:first-child{
  grid-column:1 / -1;
  grid-row:auto!important;
}


/* CLICK-TO-ENLARGE GALLERY */

.gallery-open{
  width:100%;
  height:100%;
  display:block;
  padding:0;
  border:0;
  border-radius:inherit;
  background:transparent;
  cursor:zoom-in;
}

.gallery-open:focus-visible{
  outline:3px solid rgba(213,160,78,.72);
  outline-offset:3px;
}

.gallery-open img{
  transition:transform .22s ease,filter .22s ease;
}

@media(hover:hover){
  .gallery-open:hover img{
    transform:scale(1.012);
    filter:brightness(1.02);
  }
}


/* LIGHTBOX */

.gallery-lightbox{
  position:fixed;
  inset:0;
  z-index:9999;
  display:none;
  align-items:center;
  justify-content:center;
  padding:28px 74px;
  background:rgba(3,14,24,.94);
  backdrop-filter:blur(8px);
}

.gallery-lightbox.is-open{
  display:flex;
}

.gallery-lightbox__stage{
  position:relative;
  width:min(1180px,100%);
  height:min(86vh,900px);
  display:flex;
  align-items:center;
  justify-content:center;
}

.gallery-lightbox__image{
  display:block;
  max-width:100%;
  max-height:100%;
  width:auto;
  height:auto;
  object-fit:contain;
  border-radius:10px;
  box-shadow:0 24px 80px rgba(0,0,0,.5);
}

.gallery-lightbox__close,
.gallery-lightbox__nav{
  position:absolute;
  z-index:2;
  display:flex;
  align-items:center;
  justify-content:center;
  border:1px solid rgba(255,255,255,.26);
  color:#fff;
  background:rgba(8,36,58,.72);
  box-shadow:0 8px 24px rgba(0,0,0,.24);
  cursor:pointer;
  -webkit-tap-highlight-color:transparent;
}

.gallery-lightbox__close:hover,
.gallery-lightbox__nav:hover{
  background:rgba(16,55,82,.95);
}

.gallery-lightbox__close{
  top:18px;
  right:20px;
  width:46px;
  height:46px;
  border-radius:50%;
  font:300 34px/1 Arial,sans-serif;
}

.gallery-lightbox__nav{
  top:50%;
  width:52px;
  height:72px;
  margin-top:-36px;
  border-radius:16px;
  font:300 48px/1 Georgia,serif;
}

.gallery-lightbox__nav--prev{
  left:18px;
}

.gallery-lightbox__nav--next{
  right:18px;
}

.gallery-lightbox__counter{
  position:absolute;
  left:50%;
  bottom:-38px;
  transform:translateX(-50%);
  min-width:64px;
  padding:7px 11px;
  color:#fff7e8;
  background:rgba(8,36,58,.78);
  border:1px solid rgba(255,255,255,.18);
  border-radius:999px;
  font-size:13px;
  text-align:center;
  letter-spacing:.04em;
}

body.gallery-lightbox-open{
  overflow:hidden;
}

@media(max-width:620px){
  .gallery-lightbox{
    padding:58px 10px 70px;
  }

  .gallery-lightbox__stage{
    height:calc(100vh - 138px);
  }

  .gallery-lightbox__close{
    top:10px;
    right:10px;
    width:42px;
    height:42px;
    font-size:30px;
  }

  .gallery-lightbox__nav{
    top:auto;
    bottom:12px;
    width:48px;
    height:48px;
    margin:0;
    border-radius:50%;
    font-size:38px;
  }

  .gallery-lightbox__nav--prev{
    left:calc(50% - 70px);
  }

  .gallery-lightbox__nav--next{
    right:calc(50% - 70px);
  }

  .gallery-lightbox__counter{
    bottom:-44px;
  }
}

@media(max-width:900px){
  .gallery-panel{
    padding:24px 22px 26px;
  }

  .gallery-grid--5{
    grid-template-columns:
      repeat(2,minmax(0,1fr));
  }

  .gallery-grid--5 .memory-photo:first-child{
    grid-column:1 / -1;
  }
}

@media(max-width:620px){

  /* MOBILE HERO — COPY FIRST, IMAGE SECOND */

  .hero{
    display:flex!important;
    flex-direction:column!important;
    min-height:0!important;
    padding-top:0!important;
  }

  .hero-copy{
    order:1!important;
    position:relative!important;
    z-index:2!important;
    width:100%!important;
    padding:24px 14px 28px!important;
    text-align:center!important;
    background:
      linear-gradient(
        180deg,
        #fffdf9,
        var(--cream)
      )!important;
  }

  .hero picture{
    order:2!important;
    position:relative!important;
    display:block!important;
    width:100%!important;
    aspect-ratio:16/11!important;
    overflow:hidden!important;
  }

  .hero-image{
    position:absolute!important;
    inset:0!important;
    width:100%!important;
    height:100%!important;
    aspect-ratio:auto!important;
    object-fit:cover!important;
    object-position:
      var(--hero-position-mobile,75% 34%)!important;
  }

  .hero-shade{
    display:none!important;
  }

  .gallery-panel{
    padding:19px 15px 20px;
  }

  .gallery-title{
    font-size:23px;
    margin-bottom:8px;
  }

  .gallery-grid{
    gap:9px;
    margin-top:8px;
  }

  .gallery-grid--1,
  .gallery-grid--2{
    grid-template-columns:1fr;
  }

  .gallery-grid--3,
  .gallery-grid--4,
  .gallery-grid--5{
    grid-template-columns:
      repeat(2,minmax(0,1fr));
    grid-template-rows:none!important;
  }

  .gallery-grid--3 .memory-photo:first-child,
  .gallery-grid--4 .memory-photo:first-child,
  .gallery-grid--5 .memory-photo:first-child{
    grid-column:1 / -1;
    grid-row:auto!important;
  }

  .gallery-grid .memory-photo{
    aspect-ratio:auto!important;
  }

  .gallery-grid .memory-photo img{
    width:100%;
    height:auto!important;
    object-fit:contain!important;
  }
}

</style>
</head>

<body>
${exampleNav}

<main class="shell">
<article class="page">

<section class="section-card section-card--top">

<section class="hero" aria-labelledby="memorial-name">
  <picture>
    ${d.heroImageMobile ? `<source media="(max-width:620px) and (orientation:portrait)" srcset="${escapeHtml(d.heroImageMobile)}">` : ''}

    <img
      class="hero-image"
      src="${escapeHtml(d.heroImage)}"
      alt="${escapeHtml(d.heroAlt)}"
      style="--hero-position-mobile:${
        escapeHtml(d.heroPositionMobile || '75% 34%')
      }"
    >
  </picture>

  <div class="hero-shade" aria-hidden="true"></div>

  <div class="hero-copy">
    <p class="kicker">In loving memory of</p>

    <h1 id="memorial-name">
      ${escapeHtml(d.name)}
    </h1>

    <p class="dates">
      ${escapeHtml(d.dates)}
    </p>

    <div class="rule" aria-hidden="true">♥</div>

    <p class="tribute">
      ${d.tributeHtml}
    </p>
  </div>
</section>

<section
  class="player-card"
  aria-label="${escapeHtml(d.possessiveName)} memorial song player"
>
  <audio
    id="audio"
    preload="metadata"
    src="${escapeHtml(d.audioUrl)}"
  ></audio>

  <button
    id="play"
    class="play"
    type="button"
    aria-label="Play ${escapeHtml(d.songTitle)}"
  >
    <span class="triangle" aria-hidden="true"></span>

    <span class="pause" aria-hidden="true">
      <span></span>
      <span></span>
    </span>
  </button>

  <div>
    <p id="playerTitle" class="song-title">
      ${escapeHtml(d.songTitle)}
    </p>

    <p class="song-sub">
      A personal song created in ${
        escapeHtml(d.pronouns?.possessive || 'their')
      } honour
    </p>

    <input
      id="seek"
      class="seek"
      type="range"
      min="0"
      max="100"
      value="0"
      step=".1"
      aria-label="Song progress"
    >

    <div class="times">
      <span id="current">0:00</span>
      <span id="duration">0:00</span>
    </div>
  </div>

  <div class="player-actions">
    <button
      id="share"
      class="icon-btn primary"
      type="button"
    >
      Share
    </button>

    <button
      id="download"
      class="icon-btn"
      type="button"
    >
      Download song
    </button>
  </div>
</section>

<div class="content content--top">

<section class="panel lyrics-panel">
  <h2 class="lyrics-heading">Lyrics</h2>

  <div
    class="lyrics-preview"
    aria-label="Lyrics preview"
  >
    <p>${preview.map(escapeHtml).join('<br>')}</p>
  </div>

  <button
    id="lyricsToggle"
    class="lyrics-toggle"
    type="button"
    aria-expanded="false"
    aria-controls="lyricsContent"
  >
    <span class="lyrics-label">
      <span id="lyricsLabel">
        View remaining lyrics
      </span>
    </span>

    <span class="chev" aria-hidden="true"></span>
  </button>

  <div
    id="lyricsContent"
    class="lyrics-content"
    aria-hidden="true"
  >
    <div class="lyrics-inner">
      <div class="lyrics">${escapeHtml(remainder)}</div>
    </div>
  </div>
</section>

</div>
</section>

<section class="section-card section-card--middle">

<div class="content content--middle">

<section
  class="panel remembrance"
  aria-labelledby="story-title"
>
  <div class="remembrance-copy">
    <h2 id="story-title" class="panel-title">
      ${escapeHtml(d.rememberingTitle)}
    </h2>

    <div class="panel-rule" aria-hidden="true">♥</div>

${paragraphs}

    <p>
      <em>${escapeHtml(d.closingLine)}</em>
    </p>
  </div>
</section>

${storySection}

</div>
</section>

${gallerySection}

<section class="section-card section-card--bottom">

<div class="content content--bottom">

<section
  class="panel share-grid"
  aria-label="Share ${escapeHtml(d.possessiveName)} memorial"
>
  <div class="qr-wrap">
    <button
      id="qrToggle"
      class="qr-toggle"
      type="button"
      aria-expanded="false"
      aria-controls="qrPanel"
    >
      <span>Show QR code</span>
      <span class="chev" aria-hidden="true"></span>
    </button>

    <div
      id="qrPanel"
      class="qr-panel"
      aria-hidden="true"
    >
      <div class="qr-panel-inner">
        <div id="qr"></div>

        <p class="qr-help">
          Let someone nearby scan this code to open the memorial.
        </p>
      </div>
    </div>
  </div>

  <div class="share-copy">
    <h2>Share this memorial</h2>

    <p>
      Share the page directly, copy its link,
      or show the QR code to someone nearby.
    </p>

    <button
      id="copyLink"
      class="copy-link"
      type="button"
    >
      Copy page link
    </button>
  </div>

  <div class="privacy">
    <h2>Shared privately by link</h2>

    <p>
      This page is not listed in internet search results,
      but is available to anyone who receives its direct
      link or QR code.
    </p>
  </div>
</section>

<p
  id="status"
  class="status"
  role="status"
  aria-live="polite"
></p>

</div>

<footer class="footer">
  <div class="brand">A Song for Life</div>

  <p class="footer-note">
    A personal song created from a life remembered
  </p>

  <p class="footer-credit">
${footerCredit}
  </p>
</footer>

</section>

</article>
</main>

<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>

<script>
(function () {
  const audio = document.getElementById('audio');
  const play = document.getElementById('play');
  const title = document.getElementById('playerTitle');
  const seek = document.getElementById('seek');
  const current = document.getElementById('current');
  const duration = document.getElementById('duration');

  const lyricsToggle =
    document.getElementById('lyricsToggle');

  const lyricsLabel =
    document.getElementById('lyricsLabel');

  const lyricsContent =
    document.getElementById('lyricsContent');

  const storyToggle =
    document.getElementById('storyToggle');

  const storyContent =
    document.getElementById('storyContent');

  const share =
    document.getElementById('share');

  const copyLink =
    document.getElementById('copyLink');

  const qrToggle =
    document.getElementById('qrToggle');

  const qrPanel =
    document.getElementById('qrPanel');

  const download =
    document.getElementById('download');

  const status =
    document.getElementById('status');

  const galleryTriggers =
    Array.from(document.querySelectorAll('.gallery-open'));

  const galleryLightbox =
    document.getElementById('galleryLightbox');

  const galleryLightboxImage =
    document.getElementById('galleryLightboxImage');

  const galleryClose =
    document.getElementById('galleryClose');

  const galleryPrev =
    document.getElementById('galleryPrev');

  const galleryNext =
    document.getElementById('galleryNext');

  const galleryCounter =
    document.getElementById('galleryCounter');

  const songTitle = ${escapeJs(d.songTitle)};
  const downloadUrl = ${escapeJs(downloadUrl)};

  const shareTitle = ${escapeJs(
    `${d.name} | A Song for Life`
  )};

  const shareText = ${escapeJs(shareText)};
  const galleryPhotoData = ${galleryPhotoJson};

  const fmt = seconds =>
    !Number.isFinite(seconds)
      ? '0:00'
      : Math.floor(seconds / 60) +
        ':' +
        Math.floor(seconds % 60)
          .toString()
          .padStart(2, '0');

  const setStatus = message => {
    status.textContent = message;

    clearTimeout(setStatus.timer);

    setStatus.timer = setTimeout(() => {
      status.textContent = '';
    }, 3500);
  };

  function state(on) {
    play.classList.toggle('is-playing', on);

    play.setAttribute(
      'aria-label',
      (on ? 'Pause ' : 'Play ') + songTitle
    );

    title.textContent =
      on
        ? songTitle + ' — playing'
        : songTitle;
  }

  function progress() {
    const percentage =
      audio.duration
        ? (audio.currentTime / audio.duration) * 100
        : 0;

    seek.value = percentage;
    seek.style.setProperty('--p', percentage + '%');

    current.textContent =
      fmt(audio.currentTime);
  }

  play.addEventListener('click', () => {
    audio.paused
      ? audio.play()
      : audio.pause();
  });

  audio.addEventListener('play', () => state(true));
  audio.addEventListener('pause', () => state(false));

  audio.addEventListener('ended', () => {
    audio.currentTime = 0;
    state(false);
    progress();
  });

  audio.addEventListener('loadedmetadata', () => {
    duration.textContent = fmt(audio.duration);
    progress();
  });

  audio.addEventListener('timeupdate', progress);

  seek.addEventListener('input', () => {
    if (audio.duration) {
      audio.currentTime =
        (seek.value / 100) * audio.duration;
    }
  });

  lyricsToggle.addEventListener('click', () => {
    const open =
      lyricsToggle.getAttribute('aria-expanded') === 'true';

    lyricsToggle.setAttribute(
      'aria-expanded',
      String(!open)
    );

    lyricsContent.classList.toggle('open', !open);

    lyricsContent.setAttribute(
      'aria-hidden',
      String(open)
    );

    lyricsLabel.textContent =
      !open
        ? 'Hide remaining lyrics'
        : 'View remaining lyrics';
  });

  if (storyToggle && storyContent) {
    storyToggle.addEventListener('click', () => {
      const open =
        storyToggle.getAttribute('aria-expanded') === 'true';

      storyToggle.setAttribute(
        'aria-expanded',
        String(!open)
      );

      storyContent.classList.toggle('open', !open);

      storyContent.setAttribute(
        'aria-hidden',
        String(open)
      );
    });
  }

  async function copyPageLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      setStatus('Page link copied.');
    } catch {
      setStatus(
        'Copy the page address from your browser.'
      );
    }
  }

  copyLink.addEventListener(
    'click',
    copyPageLink
  );

  qrToggle.addEventListener('click', () => {
    const open =
      qrToggle.getAttribute('aria-expanded') === 'true';

    qrToggle.setAttribute(
      'aria-expanded',
      String(!open)
    );

    qrPanel.classList.toggle('open', !open);

    qrPanel.setAttribute(
      'aria-hidden',
      String(open)
    );

    qrToggle.querySelector(
      'span:first-child'
    ).textContent =
      !open
        ? 'Hide QR code'
        : 'Show QR code';
  });

  share.addEventListener('click', async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: location.href,
        });
      } else {
        await copyPageLink();
      }
    } catch {}
  });

  download.addEventListener('click', () => {
    location.href = downloadUrl;
  });

  if (
    galleryTriggers.length &&
    galleryPhotoData.length &&
    galleryLightbox &&
    galleryLightboxImage &&
    galleryClose &&
    galleryPrev &&
    galleryNext &&
    galleryCounter
  ) {
    let galleryIndex = 0;
    let lastGalleryTrigger = null;
    let touchStartX = 0;
    let touchStartY = 0;

    const renderGalleryImage = () => {
      const photo = galleryPhotoData[galleryIndex];

      galleryLightboxImage.src = photo.src;
      galleryLightboxImage.alt = photo.alt;
      galleryCounter.textContent =
        (galleryIndex + 1) + ' / ' + galleryPhotoData.length;

      const onlyOne = galleryPhotoData.length < 2;
      galleryPrev.hidden = onlyOne;
      galleryNext.hidden = onlyOne;
    };

    const openGallery = index => {
      galleryIndex = index;
      lastGalleryTrigger = galleryTriggers[index];
      renderGalleryImage();

      galleryLightbox.classList.add('is-open');
      galleryLightbox.setAttribute('aria-hidden', 'false');
      document.body.classList.add('gallery-lightbox-open');

      requestAnimationFrame(() => {
        galleryClose.focus();
      });
    };

    const closeGallery = () => {
      galleryLightbox.classList.remove('is-open');
      galleryLightbox.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('gallery-lightbox-open');

      galleryLightboxImage.removeAttribute('src');

      if (lastGalleryTrigger) {
        lastGalleryTrigger.focus();
      }
    };

    const moveGallery = direction => {
      galleryIndex =
        (
          galleryIndex +
          direction +
          galleryPhotoData.length
        ) % galleryPhotoData.length;

      renderGalleryImage();
    };

    galleryTriggers.forEach((trigger, index) => {
      trigger.addEventListener('click', () => {
        openGallery(index);
      });
    });

    galleryClose.addEventListener('click', closeGallery);

    galleryPrev.addEventListener('click', () => {
      moveGallery(-1);
    });

    galleryNext.addEventListener('click', () => {
      moveGallery(1);
    });

    galleryLightbox.addEventListener('click', event => {
      if (event.target === galleryLightbox) {
        closeGallery();
      }
    });

    galleryLightbox.addEventListener(
      'touchstart',
      event => {
        const touch = event.changedTouches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
      },
      { passive: true }
    );

    galleryLightbox.addEventListener(
      'touchend',
      event => {
        const touch = event.changedTouches[0];
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;

        if (
          Math.abs(dx) > 48 &&
          Math.abs(dx) > Math.abs(dy)
        ) {
          moveGallery(dx < 0 ? 1 : -1);
        }
      },
      { passive: true }
    );

    document.addEventListener('keydown', event => {
      if (!galleryLightbox.classList.contains('is-open')) {
        return;
      }

      if (event.key === 'Escape') {
        closeGallery();
      }

      if (event.key === 'ArrowLeft') {
        moveGallery(-1);
      }

      if (event.key === 'ArrowRight') {
        moveGallery(1);
      }

      if (event.key === 'Tab') {
        const controls = [
          galleryClose,
          galleryPrev,
          galleryNext,
        ].filter(control => !control.hidden);

        const first = controls[0];
        const last = controls[controls.length - 1];

        if (
          event.shiftKey &&
          document.activeElement === first
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === last
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  }

  function syncQrLayout() {
    const mobile =
      matchMedia('(max-width:620px)').matches;

    if (mobile) {
      qrPanel.classList.remove('open');
      qrPanel.setAttribute('aria-hidden', 'true');

      qrToggle.setAttribute(
        'aria-expanded',
        'false'
      );

      qrToggle.querySelector(
        'span:first-child'
      ).textContent = 'Show QR code';
    } else {
      qrPanel.classList.add('open');
      qrPanel.setAttribute('aria-hidden', 'false');
    }
  }

  syncQrLayout();

  addEventListener(
    'resize',
    syncQrLayout
  );

  new QRCode(
    document.getElementById('qr'),
    {
      text: location.href,
      width: innerWidth <= 620 ? 132 : 142,
      height: innerWidth <= 620 ? 132 : 142,
      colorDark: '#08243A',
      colorLight: '#FFFFFF',
      correctLevel: QRCode.CorrectLevel.H,
    }
  );
})();
</script>

</body>
</html>`;
}

const css = await fs.readFile(
  path.join(ROOT, 'template', 'styles.css'),
  'utf8'
);

const dirs = (
  await fs.readdir(CONTENT, {
    withFileTypes: true,
  })
)
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort();

const pages = [];

for (const dir of dirs) {
  const folder = path.join(CONTENT, dir);

  const data = JSON.parse(
    await fs.readFile(
      path.join(folder, 'data.json'),
      'utf8'
    )
  );

  validate(data, dir);

  for (const asset of [
    data.heroImage,
    data.heroImageMobile,
    data.shareImage,
    ...(Array.isArray(data.galleryPhotos)
      ? data.galleryPhotos
      : []),
  ].filter(Boolean)) {
    if (!(await exists(path.join(folder, asset)))) {
      throw new Error(
        `${dir}: missing asset ${asset}`
      );
    }
  }

  pages.push({
    dir,
    data,
    folder,
  });
}

console.log(
  `Validated ${pages.length} memorial page(s): ` +
  pages.map(page => page.dir).join(', ')
);

if (checkOnly) {
  process.exit(0);
}

await fs.rm(DIST, {
  recursive: true,
  force: true,
});

await fs.mkdir(DIST, {
  recursive: true,
});

await copyDir(STATIC, DIST);

const root = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>A Song for Life</title>
<link rel="icon" href="/favicon.ico">

<style>
body{
  margin:0;
  min-height:100vh;
  display:grid;
  place-items:center;
  background:#08243a;
  color:#fbf6ee;
  font-family:Georgia,serif
}

main{
  text-align:center;
  padding:2rem
}

.heart{
  color:#d5a04e
}

p{
  opacity:.82
}
</style>
</head>

<body>
<main>
  <div class="heart">♥</div>

  <h1>A Song for Life</h1>

  <p>
    Private memorial pages are shared by direct link.
  </p>
</main>
</body>
</html>`;

await fs.writeFile(
  path.join(DIST, 'index.html'),
  root
);

await fs.writeFile(
  path.join(DIST, '_headers'),
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/*.html
  Cache-Control: no-cache

/*.png
  Cache-Control: public, max-age=31536000, immutable

/*.jpg
  Cache-Control: public, max-age=31536000, immutable
`
);

for (const { dir, data, folder } of pages) {
  const out = path.join(DIST, dir);

  await fs.mkdir(out, {
    recursive: true,
  });

  await fs.writeFile(
    path.join(out, 'index.html'),
    renderPage(data, css)
  );

  await fs.copyFile(
    path.join(folder, data.heroImage),
    path.join(out, data.heroImage)
  );

  if (data.heroImageMobile) {
    await fs.copyFile(
      path.join(folder, data.heroImageMobile),
      path.join(out, data.heroImageMobile)
    );
  }

  if (
    data.shareImage !== data.heroImage &&
    data.shareImage !== data.heroImageMobile
  ) {
    await fs.copyFile(
      path.join(folder, data.shareImage),
      path.join(out, data.shareImage)
    );
  }

  for (const photo of (
    Array.isArray(data.galleryPhotos)
      ? data.galleryPhotos
      : []
  )) {
    await fs.copyFile(
      path.join(folder, photo),
      path.join(out, photo)
    );
  }
}

console.log(`Built site in ${DIST}`);
