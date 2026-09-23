/* Francesco Lauriola — lightbox
 *
 * Case-study pages only. Click an image — or the ⤢ badge on a video — and it
 * opens larger over the page, with a properties panel beside it: caption,
 * type, pixel size, alt text. Styles in site.css § 7.23.
 *
 * Progressive enhancement, like site.js: with JS off every image is still an
 * image, and nothing on the page depends on this running.
 *
 * 1. Collects the media on the page, in document order, into one gallery
 * 2. Opens it in a <dialog> — top layer, Esc and a focus trap for free
 * 3. Moves with the arrows, ← →, Home / End, or a swipe
 * 4. Holds the place of a slow file with a skeleton, so it never opens empty
 * 5. Makes every item on the page openable
 *
 * Chosen from six prototyped variants, where it was D ("inspector").
 */
(function () {
  'use strict';

  /* What counts as project media. These four classes exist only on the case
     study pages, so nothing on home, portfolio or bio is picked up by
     accident — the portrait is .portrait img and stays out. An element inside
     [data-lb-skip] is left alone. */
  var MEDIA = '.figure img, .figure video, .polaroid img, .shots__item img';
  var CAPTION = '.figure__caption, .polaroid__caption, .shots__caption';

  var SVG = {
    prev:  'M15 18l-6-6 6-6',
    next:  'M9 6l6 6-6 6',
    close: 'M6 6l12 12M18 6L6 18',
    zoom:  'M9 3H3v6M3 3l7 7M15 21h6v-6M21 21l-7-7'
  };

  function icon(d) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
  }

  function text(el) { return el ? el.textContent.trim() : ''; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* --- 1. the gallery ----------------------------------------------------- */

  function collect(root) {
    var nodes = root.querySelectorAll(MEDIA);
    var items = [];
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.closest('[data-lb-skip]')) continue;
      var host = node.closest('figure') || node.parentElement;
      var video = node.tagName === 'VIDEO';
      items.push({
        node: node,
        host: host,
        video: video,
        caption: text(host && host.querySelector(CAPTION)),
        alt: node.getAttribute('alt') || '',
        /* data-lb-full on an <img> points the overlay at a bigger file than
           the one on the page, when there is one */
        src: video ? '' : (node.getAttribute('data-lb-full') || node.currentSrc || node.src)
      });
    }
    return items;
  }

  /* Rebuild the media for the stage rather than moving the original: moving
     a node out of the page and back reflows the article underneath, and a
     <video> loses its playback position on reparenting. */
  function render(item) {
    if (item.video) {
      var v = document.createElement('video');
      v.controls = true;
      v.playsInline = true;
      v.preload = 'metadata';
      if (item.node.getAttribute('poster')) v.poster = item.node.getAttribute('poster');
      var sources = item.node.querySelectorAll('source');
      for (var i = 0; i < sources.length; i++) v.appendChild(sources[i].cloneNode(false));
      if (!sources.length && item.node.src) v.src = item.node.src;
      return v;
    }
    var img = document.createElement('img');
    img.src = item.src;
    img.alt = item.alt;
    if (item.node.naturalWidth) {
      img.width = item.node.naturalWidth;
      img.height = item.node.naturalHeight;
    }
    return img;
  }

  /* --- 2. the dialog ------------------------------------------------------ */

  function build() {
    var dlg = document.createElement('dialog');
    dlg.className = 'lb';
    dlg.setAttribute('aria-label', 'Media viewer');
    dlg.innerHTML =
      '<div class="lb__inner">' +
        '<div class="lb__bar">' +
          '<button class="lb__btn" type="button" data-lb-close aria-label="Close (Esc)">' + icon(SVG.close) + '</button>' +
        '</div>' +
        '<div class="lb__stage" data-lb-stage>' +
          '<figure class="lb__figure" data-lb-figure>' +
            '<div class="lb__frame" data-lb-frame></div>' +
          '</figure>' +
          '<aside class="lb__panel" data-lb-panel aria-label="Properties"></aside>' +
        '</div>' +
        '<div class="lb__rail">' +
          '<button class="lb__btn" type="button" data-lb-prev aria-label="Previous">' + icon(SVG.prev) + '</button>' +
          '<span class="mono lb__counter" data-lb-count aria-hidden="true"></span>' +
          '<button class="lb__btn" type="button" data-lb-next aria-label="Next">' + icon(SVG.next) + '</button>' +
        '</div>' +
        '<p class="sr-only" role="status" aria-live="polite" data-lb-live></p>' +
      '</div>';
    document.body.appendChild(dlg);
    return dlg;
  }

  function setUp(root) {
    var items = collect(root);
    if (!items.length || !window.HTMLDialogElement) return;

    var dlg = build();
    var q = function (sel) { return dlg.querySelector(sel); };
    var stage = q('[data-lb-stage]');
    var figure = q('[data-lb-figure]');
    var frame = q('[data-lb-frame]');
    var panel = q('[data-lb-panel]');
    var counter = q('[data-lb-count]');
    var live = q('[data-lb-live]');
    var single = items.length === 1;

    var index = 0;
    var opener = null;

    /* A lone item has nowhere to go: no arrows, no counter. */
    if (single) q('.lb__rail').hidden = true;

    /* The properties panel. Caption first, then what the file is, then the
       alt text last — the longest row, and on a narrow screen the one that
       takes a full line, so it closes the panel instead of splitting the
       short facts apart. A row with nothing to say is skipped. No position
       row: the counter in the rail already says "02 / 12". */
    function row(label, value, rowClass) {
      return '<div class="meta' + (rowClass ? ' ' + rowClass : '') + '">' +
               '<span class="mono meta__label">' + label + '</span>' +
               '<span class="meta__value">' + escapeHtml(value) + '</span>' +
             '</div>';
    }

    function paintPanel(item) {
      var node = item.node;
      var html = '<p class="mono lb__panel-head">properties</p>';
      if (item.caption) html += row('caption', item.caption);
      html += row('type', item.video ? 'video'
                                     : (/\.gif(?:[?#]|$)/i.test(item.src) ? 'animated gif' : 'image'));
      /* an <img> knows its real size once loaded; a <video> does not until
         its metadata arrives, so its width/height attributes stand in */
      html += row('size', node.naturalWidth
        ? node.naturalWidth + ' × ' + node.naturalHeight + ' px'
        : (node.videoWidth || node.getAttribute('width') || '—') + ' × ' +
          (node.videoHeight || node.getAttribute('height') || '—') + ' px');
      if (item.alt) html += row('alt text', item.alt, 'lb__panel-row--alt');
      panel.innerHTML = html;
    }

    /* --- 4. the loading skeleton ------------------------------------------
       Until the file arrives an <img> has no size of its own, so a slow one —
       the 3 000px GIF on the LED Matrix page — opened the overlay on an empty
       stage. Hold its place instead, at the size the picture will most likely
       land at. The page's width/height attributes give the ratio and an upper
       bound; the stage gives the room, measured by letting the figure take
       the full width of its cell for one layout read. Videos are left alone:
       their poster is the placeholder. */
    function holdPlace(img, item) {
      if (img.complete && img.naturalWidth) return;

      function done() {
        if (img.parentNode !== frame) return;      // already moved on to another item
        frame.classList.remove('is-loading');
        img.style.width = '';
        img.style.height = '';
      }
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
      frame.classList.add('is-loading');

      var w0 = +item.node.getAttribute('width') || item.node.naturalWidth || 0;
      var h0 = +item.node.getAttribute('height') || item.node.naturalHeight || 0;
      if (!w0 || !h0) return;

      var ratio = w0 / h0;
      figure.style.width = '100%';
      var roomW = figure.clientWidth;
      figure.style.width = '';
      var roomH = parseFloat(getComputedStyle(img).maxHeight) || Infinity;
      var w = Math.min(w0, roomW, roomH * ratio);
      img.style.width = w + 'px';
      img.style.height = (w / ratio) + 'px';
    }

    function preload(i) {
      var item = items[(i + items.length) % items.length];
      if (!item || item.video || !item.src) return;
      var img = new Image();
      img.src = item.src;
    }

    /* --- 3. moving ---------------------------------------------------------- */

    function go(i) {
      index = (i + items.length) % items.length;
      var item = items[index];
      var label = pad(index + 1) + ' / ' + pad(items.length);

      var media = render(item);
      frame.classList.remove('is-loading');
      frame.replaceChildren(media);
      if (!item.video) holdPlace(media, item);
      paintPanel(item);
      counter.textContent = label;

      /* restart the cross-fade */
      figure.style.animation = 'none';
      figure.offsetHeight;
      figure.style.animation = '';

      live.textContent = (single ? '' : label + ' — ') + (item.caption || item.alt);
      if (!single) { preload(index + 1); preload(index - 1); }
    }

    function open(i, from) {
      opener = from || null;
      dlg.showModal();
      document.documentElement.classList.add('lb-open');
      go(i);
    }

    function close() { dlg.close(); }

    dlg.addEventListener('close', function () {
      document.documentElement.classList.remove('lb-open');
      frame.replaceChildren();               // clearing the stage stops a playing video
      frame.classList.remove('is-loading');
      if (opener && opener.focus) opener.focus();
      opener = null;
    });

    q('[data-lb-close]').addEventListener('click', close);
    q('[data-lb-prev]').addEventListener('click', function () { go(index - 1); });
    q('[data-lb-next]').addEventListener('click', function () { go(index + 1); });

    /* the empty canvas closes; the media and the panel do not */
    stage.addEventListener('click', function (e) {
      if (e.target === stage || e.target === figure) close();
    });

    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        /* <dialog> closes itself on Escape; this is here so the overlay also
           closes where the native close watcher does not fire */
        e.preventDefault(); close();
        return;
      }
      if (single) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
      else if (e.key === 'Home') { e.preventDefault(); go(0); }
      else if (e.key === 'End') { e.preventDefault(); go(items.length - 1); }
    });

    /* swipe — only a clearly horizontal drag, so a vertical scroll of the
       panel is left alone */
    var swipe = null;
    stage.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' || single) return;
      swipe = { x: e.clientX, y: e.clientY };
    });
    stage.addEventListener('pointerup', function (e) {
      if (!swipe) return;
      var dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      swipe = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
    });
    stage.addEventListener('pointercancel', function () { swipe = null; });

    /* --- 5. the triggers on the page -------------------------------------- */

    items.forEach(function (item, i) {
      var name = item.caption || item.alt || (item.video ? 'video ' : 'image ') + (i + 1);
      if (item.host) item.host.classList.add('lb-host', item.video ? 'lb-host--video' : 'lb-host--image');

      /* images take the click whole; a video keeps its own controls, so
         clicking it still plays it */
      if (!item.video) {
        item.node.classList.add('lb-thumb');
        item.node.setAttribute('role', 'button');
        item.node.setAttribute('tabindex', '0');
        item.node.setAttribute('aria-label', 'Open larger: ' + name);
        item.node.addEventListener('click', function () { open(i, item.node); });
        item.node.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i, item.node); }
        });
      }

      /* Every item also gets the ⤢ badge: on a video it is the only way in,
         on an image it is the hint that the click does something. */
      if (item.host) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'lb-zoom';
        b.innerHTML = icon(SVG.zoom);
        b.setAttribute('aria-label', 'Open larger: ' + name);
        if (!item.video) b.setAttribute('tabindex', '-1');   // the image itself is already in the tab order
        b.addEventListener('click', function (e) { e.stopPropagation(); open(i, b); });
        item.host.appendChild(b);
      }
    });
  }

  function init() { setUp(document.querySelector('main') || document.body); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
