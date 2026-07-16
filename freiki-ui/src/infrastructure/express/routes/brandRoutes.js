const express = require('express');
const fs = require('fs');
const path = require('path');
const { config } = require('../../../shared/config');
const { getBrandConfig } = require('../../../shared/config/BrandConfig');

const router = express.Router();

const GIT_VERSION = (() => {
  try { return fs.readFileSync(path.join(config.PUBLIC_DIR, 'VERSION'), 'utf8').trim(); }
  catch { return 'dev'; }
})();

function getIndexHtml() {
  const brand = getBrandConfig();
  return fs.readFileSync(path.join(config.PUBLIC_DIR, 'index.html'), 'utf8')
    .replace(/\{\{APP_NAME\}\}/g,          brand.name)
    .replace(/\{\{APP_LOGO\}\}/g,          brand.logo)
    .replace(/\{\{APP_LOGO_SIDEBAR\}\}/g,  brand.logoSidebar)
    .replace(/\{\{APP_TAGLINE\}\}/g,       brand.tagline)
    .replace(/\{\{APP_COLOR\}\}/g,         brand.color)
    .replace(/\{\{PAPERLESS_URL\}\}/g,     brand.paperlessUrl)
    .replace(/\{\{PAPERLESS_ADMIN_URL\}\}/g, process.env.PAPERLESS_ADMIN_URL || brand.paperlessUrl)
    .replace(/\{\{MATTERMOST_URL\}\}/g,    brand.mattermostUrl)
    .replace(/\{\{DEMO_MODE\}\}/g,         brand.demoMode ? '' : 'display:none')
    .replace(/\{\{FOOTER_NOTE\}\}/g,       brand.footerNote || brand.name)
    .replace(/\{\{APP_VERSION\}\}/g,       GIT_VERSION)
    .replace(/\{\{AGPL_SOURCE_NOTICE\}\}/g,
      '<a href="https://github.com/FStefan1960/FreiKI" target="_blank" rel="noopener" style="color:inherit">Lizenz: AGPL-3.0-or-later</a>');
}

router.get('/', (_req, res) => res.type('html').send(getIndexHtml()));

// Dynamisch: Cache-Name + Assets richten sich nach der aktuellen Marke (Name, Logo, swVersion).
// (Im Original-server.js gab es hierfür zwei "/sw.js"-Routen, eine davon toter Code durch
// Doppelregistrierung – am 2026-07-05 auf FreiKI/KorKI/FrankKI/BonKI einheitlich gefixt.)
router.get('/sw.js', (_req, res) => {
  const brand = getBrandConfig();
  const cacheName = `${brand.name.toLowerCase().replace(/\s+/g, '-')}-v${brand.swVersion}`;
  const logoPath  = brand.logo.split('?')[0];
  res.type('application/javascript').send(`
const CACHE_NAME = '${cacheName}';
const STATIC_ASSETS = [
  '/style.css',
  '/brand.css',
  '${logoPath}',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/apple-touch-icon.png',
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok && STATIC_ASSETS.includes(url.pathname)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
`);
});

router.get('/brand.css', (_req, res) => {
  const brand = getBrandConfig();
  res.type('text/css').send(`
:root {
  --fk-primary:        ${brand.color};
  --fk-primary-hover:  ${brand.colorHover};
  --fk-primary-active: ${brand.colorActive};
  --fk-navy:           ${brand.navy};
}
`);
});

router.get('/manifest.json', (_req, res) => {
  const brand = getBrandConfig();
  res.json({
    name: `${brand.name} – ${brand.tagline}`,
    short_name: brand.name,
    description: 'DSGVO-konformer, quelloffener KI-Assistent',
    start_url: '/',
    display: 'standalone',
    background_color: '#f0f4f8',
    theme_color: brand.color,
    orientation: 'portrait-primary',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ]
  });
});

router.get('/api/brand', (_req, res) => {
  const brand = getBrandConfig();
  res.json({
    name: brand.name,
    logo: brand.logo,
    tagline: brand.tagline,
    color: brand.color,
    mattermost: brand.mattermostUrl,
    paperless: brand.paperlessUrl,
    supportEmail: brand.supportEmail,
  });
});

module.exports = { router };
