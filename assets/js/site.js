/* Francesco Lauriola — personal site
 *
 * Progressive enhancement only. Everything here is optional: with JS blocked
 * or broken the site is fully readable and navigable.
 *
 * 1. Marks the current page in the nav (so the three HTML files can stay identical)
 * 2. Fades sections in on scroll, unless the visitor prefers reduced motion
 * 3. Makes the name's selection box resizable — the name scales to fit the box
 * 4. Lets the home's project cards, portrait and facts be dragged into a new order
 */
(function () {
  'use strict';

  /* --- 1. current page in the nav ---------------------------------------- */

  function markCurrentPage() {
    var here = document.body.getAttribute('data-page');
    if (!here) return;
    var links = document.querySelectorAll('.nav__link[data-page]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('data-page') === here) {
        links[i].setAttribute('aria-current', 'page');
      } else {
        links[i].removeAttribute('aria-current');
      }
    }
  }

  /* --- 2. reveal on scroll ------------------------------------------------ */

  function setUpReveal() {
    var targets = document.querySelectorAll('.reveal');
    if (!targets.length) return;

    var reduced = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // No IntersectionObserver, or motion is unwelcome: leave everything visible.
    if (reduced || !('IntersectionObserver' in window)) return;

    // Only now do we let the CSS hide anything.
    document.documentElement.classList.add('js-reveal');

    function show(el) { el.classList.add('is-visible'); }

    var observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          show(entries[i].target);
          observer.unobserve(entries[i].target);
        }
      }
    }, { rootMargin: '0px 0px 12% 0px', threshold: 0 });

    for (var j = 0; j < targets.length; j++) observer.observe(targets[j]);

    // Safety net: whatever happens, nothing stays hidden for long.
    setTimeout(function () {
      for (var k = 0; k < targets.length; k++) show(targets[k]);
      observer.disconnect();
    }, 2500);
  }

  /* --- 3. resizable selection box ----------------------------------------
   *
   * The box's width and the name's font-size are locked together: at any
   * font-size the box is exactly K times wider than the font-size (K comes
   * from measuring the box once at 100px, padding included, and letter-
   * spacing is in em so it scales along). So font = width / K, and setting
   * both keeps the name filling the box on one line while the box height —
   * and everything below it — follows naturally.
   *
   * Limits: min font 20px; max width = the container's content box, i.e.
   * the page grid without its side padding.
   */

  function setUpSelectionBox() {
    var box = document.querySelector('[data-selbox]');
    if (!box || !('PointerEvent' in window)) return;

    var container = box.parentElement;
    var handles = box.querySelectorAll('.selbox__handle');
    var slider = box.querySelector('[role="slider"]');
    var MIN_FONT = 20;
    var K = 0;
    var userWidth = null;   // null = follow the CSS default; a number = the visitor's choice

    function maxWidth() {
      var cs = getComputedStyle(container);
      return container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    }

    function measure() {
      // Let the box take its natural single-line width, unconstrained,
      // for one synchronous layout pass.
      var w = box.style.width, f = box.style.fontSize, m = box.style.maxWidth;
      box.style.width = '';
      box.style.maxWidth = 'none';
      box.style.fontSize = '100px';
      K = box.getBoundingClientRect().width / 100;
      box.style.width = w;
      box.style.maxWidth = m;
      box.style.fontSize = f;
    }

    function defaultWidth() {
      var f = box.style.fontSize;
      box.style.fontSize = '';
      var css = parseFloat(getComputedStyle(box).fontSize);
      box.style.fontSize = f;
      return css * K;
    }

    function apply(w) {
      var max = maxWidth(), min = MIN_FONT * K;
      if (max < min) max = min;
      w = Math.max(min, Math.min(max, w));
      box.style.width = w + 'px';
      box.style.fontSize = (w / K) + 'px';
      if (slider) {
        var pct = max === min ? 100 : Math.round((w - min) / (max - min) * 100);
        slider.setAttribute('aria-valuenow', String(pct));
      }
      return w;
    }

    function layout() {
      apply(userWidth === null ? defaultWidth() : userWidth);
    }

    // Drag any handle. Left-side handles grow the box when pulled left.
    function onPointerDown(e) {
      if (e.button !== undefined && e.button !== 0) return;
      var handle = e.currentTarget;
      var side = parseInt(handle.getAttribute('data-side'), 10) || 1;
      var startX = e.clientX;
      var startW = box.getBoundingClientRect().width;
      e.preventDefault();
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
      box.classList.add('is-resizing');
      document.body.classList.add('is-resizing');

      function move(ev) { userWidth = apply(startW + (ev.clientX - startX) * side); }
      function up(ev) {
        try { handle.releasePointerCapture(ev.pointerId); } catch (_) {}
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        box.classList.remove('is-resizing');
        document.body.classList.remove('is-resizing');
      }
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    }

    for (var i = 0; i < handles.length; i++) {
      handles[i].addEventListener('pointerdown', onPointerDown);
    }

    // Keyboard on the focusable handle: arrows nudge, Home/End hit the limits.
    if (slider) {
      slider.addEventListener('keydown', function (e) {
        var w = box.getBoundingClientRect().width, step = 16, next = null;
        switch (e.key) {
          case 'ArrowRight': case 'ArrowUp':   next = w + step; break;
          case 'ArrowLeft':  case 'ArrowDown': next = w - step; break;
          case 'Home': next = 0; break;
          case 'End':  next = Infinity; break;
          default: return;
        }
        e.preventDefault();
        userWidth = apply(next);
      });
    }

    // Double-click the box to go back to the default size.
    box.addEventListener('dblclick', function () { userWidth = null; layout(); });

    // Keep inside the grid when the viewport changes; re-measure once fonts land.
    var raf = 0;
    window.addEventListener('resize', function () {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(layout);
    });

    function init() {
      box.classList.add('is-ready');   // enables single-line scaling in CSS
      measure();
      layout();
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { init(); });
      document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', function () {
        measure();
        layout();
      });
    } else {
      init();
    }
  }


  /* --- 4. sortable blocks --------------------------------------------------
   *
   * Reorder the children of any [data-sortable] container by dragging.
   * Mouse / pen: press anywhere on a block and move 6px. Touch: long-press
   * (320ms) anywhere, or press the ⋮⋮ grip and drag straight away — so a
   * plain tap still scrolls the page. Links inside blocks keep working.
   *
   * While dragging, the block follows the pointer; when it crosses the
   * middle of a neighbour the DOM order changes and every other block
   * FLIP-animates into its new slot. The grip buttons also take the arrow
   * keys, and each move is announced to assistive tech.
   */

  var LONG_PRESS_MS = 320, MOUSE_SLOP = 6, TOUCH_SLOP = 8, FLIP_MS = 220;
  var activeSortable = null;

  // Non-passive so preventDefault works: once a touch drag has begun (the
  // finger held still through the long-press), the page must not scroll.
  document.addEventListener('touchmove', function (e) {
    if (activeSortable) e.preventDefault();
  }, { passive: false });

  function announce(text) {
    var region = document.querySelector('[data-announce]');
    if (!region) return;
    region.textContent = '';
    setTimeout(function () { region.textContent = text; }, 30);
  }

  function makeSortable(container, options) {
    var onChange = options.onChange || function () {};
    var initial = children();
    var pending = null;       // { item, x, y, timer, pointerId }
    var drag = null;          // { item, grab, layout, pointerId }
    var settleUntil = 0;
    var suppressClickUntil = 0;

    function children() {
      return Array.prototype.filter.call(container.children, function (el) {
        return el.nodeType === 1 && !el.hasAttribute('data-announce');
      });
    }

    function isGrip(t) { return !!(t.closest && t.closest('.grip')); }
    function isInteractive(t) {
      // .project-card__link is the card's own stretched link: it covers the
      // whole card, so treating it as interactive would mean no card on the
      // home page could ever be dragged. A drag that does start swallows the
      // click on release (suppressClickUntil, below), so it never navigates.
      return !!(t.closest && t.closest(
        'a:not(.project-card__link), button:not(.grip), video, input, select, textarea'));
    }

    function rects(list) {
      return list.map(function (el) { return el.getBoundingClientRect(); });
    }

    // Move things in the DOM, then animate every block from where it was
    // to where it is now. The dragged block is excluded — it follows the pointer.
    function flip(mutate) {
      var before = children(), b = rects(before);
      mutate();
      var after = children(), a = rects(after);
      after.forEach(function (el) {
        if (drag && el === drag.item) return;
        var i = before.indexOf(el);
        if (i < 0) return;
        var dx = b[i].left - a[after.indexOf(el)].left;
        var dy = b[i].top - a[after.indexOf(el)].top;
        if (!dx && !dy) return;
        el.style.transition = 'none';
        el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        el.getBoundingClientRect();           // commit the inverse position
        el.style.transition = '';
        el.style.transform = '';
      });
      settleUntil = Date.now() + FLIP_MS;
    }

    function layoutRect(el) {
      var t = el.style.transform;
      el.style.transform = 'none';
      var r = el.getBoundingClientRect();
      el.style.transform = t;
      return r;
    }

    function follow(x, y) {
      var tx = x - drag.grab.x - drag.layout.left;
      var ty = y - drag.grab.y - drag.layout.top;
      drag.item.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(1.02)';
    }

    function begin(item, x, y, pointerId) {
      clearPending();
      drag = { item: item, pointerId: pointerId, layout: item.getBoundingClientRect() };
      drag.grab = { x: x - drag.layout.left, y: y - drag.layout.top };
      activeSortable = container;
      container.classList.add('is-sorting');
      item.classList.add('is-dragging');
      document.body.classList.add('is-grabbing');
      try { item.setPointerCapture(pointerId); } catch (_) {}
      if (navigator.vibrate) navigator.vibrate(12);
      follow(x, y);
    }

    function hitTest(x, y) {
      if (Date.now() < settleUntil) return;
      var list = children();
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (el === drag.item) continue;
        var r = el.getBoundingClientRect();
        if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
        var sameRow = Math.abs(r.top - drag.layout.top) < r.height / 2;
        var after = sameRow ? x > r.left + r.width / 2 : y > r.top + r.height / 2;
        var ref = after ? el.nextElementSibling : el;
        if (ref === drag.item || (after && el.nextElementSibling === drag.item) ||
            (!after && el.previousElementSibling === drag.item)) return;
        flip(function () { container.insertBefore(drag.item, ref); });
        drag.layout = layoutRect(drag.item);
        follow(x, y);
        return;
      }
    }

    function end() {
      if (!drag) { clearPending(); return; }
      var item = drag.item;
      try { item.releasePointerCapture(drag.pointerId); } catch (_) {}
      item.style.transition = 'transform ' + FLIP_MS + 'ms ease, box-shadow ' + FLIP_MS + 'ms ease';
      item.style.transform = '';
      setTimeout(function () {
        item.style.transition = '';
        item.classList.remove('is-dragging');
        container.classList.remove('is-sorting');
      }, FLIP_MS);
      document.body.classList.remove('is-grabbing');
      activeSortable = null;
      drag = null;
      suppressClickUntil = Date.now() + 400;
      onChange(isChanged());
    }

    function clearPending() {
      if (pending && pending.timer) clearTimeout(pending.timer);
      pending = null;
    }

    function onPointerDown(e) {
      if (e.button !== undefined && e.button !== 0) return;
      var item = e.target.closest && e.target.closest('[data-sortable] > *');
      if (!item || item.parentNode !== container) return;
      var grip = isGrip(e.target);
      if (!grip && isInteractive(e.target)) return;
      if (grip) e.preventDefault();          // no focus jump, no text selection
      pending = { item: item, x: e.clientX, y: e.clientY, pointerId: e.pointerId, touch: e.pointerType === 'touch' };
      if (pending.touch) {
        if (grip) { begin(item, e.clientX, e.clientY, e.pointerId); }
        else {
          pending.timer = setTimeout(function () {
            if (pending) begin(pending.item, pending.x, pending.y, pending.pointerId);
          }, LONG_PRESS_MS);
        }
      }
    }

    function onPointerMove(e) {
      if (drag) {
        if (e.pointerId !== drag.pointerId) return;
        follow(e.clientX, e.clientY);
        hitTest(e.clientX, e.clientY);
        return;
      }
      if (!pending || e.pointerId !== pending.pointerId) return;
      var dist = Math.hypot(e.clientX - pending.x, e.clientY - pending.y);
      if (pending.touch) {
        if (dist > TOUCH_SLOP) clearPending();       // the finger is scrolling
      } else if (dist > MOUSE_SLOP) {
        begin(pending.item, pending.x, pending.y, pending.pointerId);
        follow(e.clientX, e.clientY);
      }
    }

    function onPointerUp(e) {
      if (drag && e.pointerId !== drag.pointerId) return;
      if (!drag && pending && e.pointerId !== pending.pointerId) return;
      end();
    }

    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    container.addEventListener('contextmenu', function (e) { if (drag || pending) e.preventDefault(); });
    container.addEventListener('click', function (e) {
      if (Date.now() < suppressClickUntil) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    // Keyboard: arrows on a grip move its block one slot.
    container.addEventListener('keydown', function (e) {
      if (!isGrip(e.target)) return;
      var item = e.target.closest('[data-sortable] > *');
      var dir = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 :
                (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : 0;
      if (!dir) return;
      e.preventDefault();
      var sib = dir < 0 ? item.previousElementSibling : item.nextElementSibling;
      if (!sib) return;
      flip(function () { container.insertBefore(item, dir < 0 ? sib : sib.nextElementSibling); });
      e.target.focus();
      var list = children();
      announce((options.label || 'Block') + ' moved to position ' + (list.indexOf(item) + 1) + ' of ' + list.length);
      onChange(isChanged());
    });

    function isChanged() {
      var now = children();
      for (var i = 0; i < now.length; i++) if (now[i] !== initial[i]) return true;
      return false;
    }

    function reset() {
      flip(function () { initial.forEach(function (el) { container.appendChild(el); }); });
      announce('Original order restored');
      onChange(false);
    }

    return { reset: reset, isChanged: isChanged };
  }

  function setUpSortables() {
    if (!('PointerEvent' in window)) return;

    var cards = document.querySelector('[data-sortable="cards"]');
    var resetBtn = document.querySelector('[data-reset-order]');
    if (cards) {
      var api = makeSortable(cards, {
        label: 'Project',
        onChange: function (changed) { if (resetBtn) resetBtn.hidden = !changed; }
      });
      if (resetBtn) resetBtn.addEventListener('click', function () { api.reset(); resetBtn.hidden = true; });
    }

    var split = document.querySelector('[data-sortable="split"]');
    if (split) makeSortable(split, { label: 'Block' });
  }

  function init() {
    markCurrentPage();
    setUpReveal();
    setUpSelectionBox();
    setUpSortables();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
