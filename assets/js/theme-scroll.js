/* Francesco Lauriola — dark mode on scroll (prototype, dark-mode.html only)
 *
 * The dark mode case study turns the page dark once the visitor reaches the
 * section marked [data-theme-trigger] ("Final Design"), so the dark
 * screenshots are seen on a dark page. Scrolling back above it brings the
 * light theme back; leaving the page resets it by itself, because nothing is
 * stored — the attribute lives on this document only.
 *
 * Visitors whose OS is already dark see no change: the script only ever sets
 * data-theme="dark" (site.css § 3) on a light page, and removes it again.
 *
 * The fade is CSS (site.css § 7.28): the colour tokens are registered here as
 * <color>s, so they can be transitioned like any colour. Where registering
 * isn't supported the switch is simply instant.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var osDark = window.matchMedia('(prefers-color-scheme: dark)');

  // the section's top has to climb above this share of the viewport
  var LINE = 0.5;

  // the address-bar colour follows the page: the meta without a media query
  // is the one a light OS uses
  var meta = document.querySelector('meta[name="theme-color"]:not([media])');
  var metaLight = meta && meta.getAttribute('content');
  var META_DARK = '#0A0805';

  var dark = false, ticking = false;

  var TOKENS = ['--bg-from', '--bg-to', '--surface', '--surface-alt', '--border',
    '--border-subtle', '--text-muted', '--text', '--text-strong', '--on-strong', '--error'];

  if (window.CSS && CSS.registerProperty) {
    TOKENS.forEach(function (name) {
      try {
        CSS.registerProperty({ name: name, syntax: '<color>', inherits: true, initialValue: 'transparent' });
      } catch (_) { /* already registered */ }
    });
    root.classList.add('theme-scroll');
  }

  function apply(next) {
    if (next === dark) return;
    dark = next;
    if (dark) root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    if (meta) meta.setAttribute('content', dark ? META_DARK : metaLight);
  }

  function update() {
    ticking = false;
    var trigger = document.querySelector('[data-theme-trigger]');
    if (!trigger || osDark.matches) { apply(false); return; }
    apply(trigger.getBoundingClientRect().top <= window.innerHeight * LINE);
  }

  function schedule() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('pageshow', update);       // back/forward cache
  document.addEventListener('site:unlocked', update); // gate.js: the section exists now
  if (osDark.addEventListener) osDark.addEventListener('change', update);
  update();
})();
