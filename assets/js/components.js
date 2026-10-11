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
     `page` is matched against <body data-page="…">. The case-study pages carry
     data-page="project", which matches nothing: the pill means "you are on
     this page", and inside a case study you are not on /portfolio. */
  var NAV = [
    { page: 'home',      href: '/',          label: 'home' },
    { page: 'portfolio', href: '/portfolio', label: 'portfolio' },
    { page: 'bio',       href: '/bio',       label: 'bio & cv' }
  ];

  /* Values come from assets/js/site.config.js, loaded just before this file.
     The fallbacks are what shows if that script is ever missing — they are not
     a second source of truth, so leave them alone and edit the config. */
  var SITE      = window.SITE || {};
  var LAST_EDIT = SITE.lastEdit || '10/2026';
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

  /* On the home the header starts without its brand — see dock() below.
     Until the brand arrives, a meta label holds its place and points down at
     the originals in the page. It uses the #arrow symbol from the page's own
     sprite, which index.html defines. */
  var DOCK_LABEL =
    '<span class="brand__label mono meta__label" aria-hidden="true">' +
      '<span>brand<span class="brand__label-more"> mark</span></span> ' +
      '<svg class="arrow arrow--down"><use href="#arrow"/></svg>' +
    '</span>';

  /* On a case study the name folds down to its initials to make room for the
     project's title — see dock() below. The letters after each initial sit in
     a .brand__fold, which collapses to zero width. The title's text is copied
     from the page's <h1> once the page has been parsed. */
  var FOLDING_NAME =
    'F<span class="brand__fold"><span>rancesco&nbsp;</span></span>' +
    'L<span class="brand__fold"><span>auriola</span></span>';

  var CASE_TITLE =
    '<span class="case-title" aria-hidden="true">' +
      '<span class="case-title__sep">—</span>' +
      '<span class="case-title__text"></span>' +
    '</span>';

  function headerHTML() {
    var page = document.body ? document.body.getAttribute('data-page') : null;
    var home = page === 'home';
    var project = page === 'project';
    var brand = '' +
      '<a class="brand" href="/" aria-label="Francesco Lauriola — home">' +
        '<img class="brand__mark" src="/favicon.svg" width="22" height="22" alt="">' +
        '<span class="brand__name">' +
          '<span class="brand__full">' + (project ? FOLDING_NAME : 'Francesco Lauriola') + '</span>' +
          '<span class="brand__initials">FL</span>' +
        '</span>' +
        (home ? DOCK_LABEL : '') +
      '</a>';
    return '' +
      '<header class="site-header' + (home ? ' site-header--dock' : project ? ' site-header--case' : '') + '">' +
        '<div class="container site-header__inner">' +
          (project ? '<div class="site-header__lead">' + brand + CASE_TITLE + '</div>' : brand) +
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
            '<a class="out" href="/privacy">' +
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

  /* The home already shows the name and the portrait, which are the brand
     name and mark at full size. So there the brand waits for them: the name
     enters the bar once the <h1> has scrolled completely under it, the mark
     once the portrait has. Scroll back up and they leave again.
     Hooks: data-dock="name|mark" in index.html. Motion: site.css § 7.4c.
     A missing hook counts as passed, so the brand can never get stuck hidden.

     A case study does the same with its title: once the <h1> is under the bar,
     the name folds to "FL" and the title takes the room it frees.
     Hook: data-dock="title" on the <h1>. Motion: site.css § 7.4d. Here a
     missing hook means no title at all, so the name stays whole. */
  function dock() {
    var header = document.querySelector('.site-header--dock, .site-header--case');
    if (!header) return;

    var keys = ['name', 'mark'];
    if (header.classList.contains('site-header--case')) {
      var h1 = document.querySelector('[data-dock="title"]');
      if (!h1) return;
      header.querySelector('.case-title__text').textContent = h1.textContent.trim();
      keys = ['title'];
    }

    var parts = keys.map(function (key) {
      return { key: key, el: document.querySelector('[data-dock="' + key + '"]') };
    });
    /* Browsers fire scroll at most once per frame, so no rAF throttle. */
    function update() {
      var line = header.getBoundingClientRect().bottom;
      parts.forEach(function (p) {
        header.classList.toggle('has-' + p.key, !p.el || p.el.getBoundingClientRect().bottom <= line);
      });
    }

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  define('site-header', headerHTML);
  define('site-footer', footerHTML);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', dock);
  } else {
    dock();
  }
})();
