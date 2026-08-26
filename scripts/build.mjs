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

  const songTitle = ${escapeJs(d.songTitle)};
  const downloadUrl = ${escapeJs(downloadUrl)};

  const shareTitle = ${escapeJs(
    `${d.name} | A Song for Life`
  )};

  const shareText = ${escapeJs(shareText)};

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
}

console.log(`Built site in ${DIST}`);
