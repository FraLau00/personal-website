/* =============================================================================
   Francesco Lauriola — shared page chrome
   -----------------------------------------------------------------------------
   The header and the footer are identical on every page. They used to be copied
   into every HTML file; they now live here, once, as two custom elements:

       <site-header></site-header>      <site-footer></site-footer>

   Still no build step — this is plain HTML5. The markup is written into the
   LIGHT DOM (no shadow root) on purpose, so every rule in site.css keeps
   applying to .site-header / .site-footer exactly as before.

   The tag is loaded from <head> WITHOUT defer: the element upgrades the instant
   the parser meets it, so the bar paints with the page and nothing jumps.

   Trade-off: with JavaScript off there is no nav and no footer. Everything else
   on the site still reads fine.
   ========================================================================== */

(function () {
  'use strict';

  /* The nav. One entry per top-level page — this list is the whole menu.
     `page` is matched against <body data-page="…">; the case-study pages carry
     data-page="portfolio", so the portfolio pill stays lit inside them. */
  var NAV = [
    { page: 'home',      href: 'index.html',     label: 'home' },
    { page: 'portfolio', href: 'portfolio.html', label: 'portfolio' },
    { page: 'bio',       href: 'bio.html',       label: 'bio / cv' }
  ];

  /* Values come from assets/js/site.config.js, loaded just before this file.
     The fallbacks are what shows if that script is ever missing — they are not
     a second source of truth, so leave them alone and edit the config. */
  var SITE      = window.SITE || {};
  var LAST_EDIT = SITE.lastEdit || '09/2026';
  var ROLE      = (SITE.name || 'Francesco Lauriola') + ' | ' +
                  (SITE.role || 'Senior UX Designer');

  function navHTML() {
    var here = document.body ? document.body.getAttribute('data-page') : null;
    var out = '';
    for (var i = 0; i < NAV.length; i++) {
      var item = NAV[i];
      out += '<a class="nav__link" data-page="' + item.page + '" href="' + item.href + '"' +
             (item.page === here ? ' aria-current="page"' : '') +
             '>' + item.label + '</a>';
    }
    return out;
  }

  function headerHTML() {
    return '' +
      '<header class="site-header">' +
        '<div class="container site-header__inner">' +
          '<a class="brand" href="index.html" aria-label="Francesco Lauriola — home">' +
            '<svg class="brand__mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">' +
              '<rect width="32" height="32" rx="7" fill="currentColor"/>' +
              '<g fill="var(--on-strong)">' +
                '<rect x="9" y="7"  width="5"  height="18"/>' +
                '<rect x="9" y="7"  width="14" height="5"/>' +
                '<rect x="9" y="15" width="11" height="5"/>' +
              '</g>' +
            '</svg>' +
            '<span class="brand__name">francesco lauriola</span>' +
          '</a>' +
          '<nav class="nav" aria-label="Main">' + navHTML() + '</nav>' +
        '</div>' +
      '</header>';
  }

  function footerHTML() {
    return '' +
      '<footer class="site-footer">' +
        '<div class="container site-footer__inner">' +
          '<div class="site-footer__left">' +
            '<span class="mono">' + ROLE + '</span>' +
            '<a class="out" href="privacy.html">' +
              'privacy <svg class="arrow" aria-hidden="true"><use href="#arrow"/></svg>' +
            '</a>' +
          '</div>' +
          '<div class="meta meta--reverse">' +
            '<span class="mono meta__label">' +
              'last edit <svg class="arrow" aria-hidden="true"><use href="#arrow"/></svg>' +
            '</span>' +
            '<span class="meta__value">' + LAST_EDIT + '</span>' +
          '</div>' +
        '</div>' +
      '</footer>';
  }

  /* Both elements are display:contents (site.css § 7), so the wrapper adds no
     box of its own — .site-header keeps sticking to the viewport the way it did
     when it was a direct child of <body>. */
  function define(tag, render) {
    if (window.customElements && !customElements.get(tag)) {
      customElements.define(tag, class extends HTMLElement {
        connectedCallback() {
          if (!this.firstElementChild) this.innerHTML = render();
        }
      });
    }
  }

  define('site-header', headerHTML);
  define('site-footer', footerHTML);
})();
