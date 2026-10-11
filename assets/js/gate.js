/* Francesco Lauriola — password gate
 *
 * Case studies of work that isn't public (the Arduino Cloud ones) are
 * published ENCRYPTED: the body of the page and its images are AES-GCM
 * ciphertext, and only the password turns them back into the page. The
 * encryption happens before publishing, with the lock tool kept with the
 * project notes; this file is only the reading half. Styles in site.css § 7.27.
 *
 * In the source files the protected stretch sits between two comments,
 *
 *     <!-- locked:start -->  …sections…  <!-- locked:end -->
 *
 * and the page reads normally — locally nothing is locked and this script
 * does nothing. The lock tool replaces that stretch with
 *
 *     <div class="gate" data-gate></div>
 *     <script type="application/json" data-gate-payload>{…}</script>
 *
 * and every <img src> inside it with data-locked-src, pointing at an
 * encrypted copy in assets/locked/.
 *
 * 1. Draws the password form in [data-gate], alone in the middle of the
 *    page: the case head and the prev/next row step aside until it opens
 * 2. Derives the key (PBKDF2-SHA256) and decrypts the sections in place
 * 3. Decrypts the images into blob: URLs
 * 4. Remembers the key for the session, so the other locked pages open
 *    straight away, and tells site.js / lightbox.js the content is there
 *
 * The password is forgiving on purpose: case, surrounding spaces, and
 * spaces vs hyphens between the words don't matter ("Copper Otter Lantern"
 * = "copper-otter-lantern"). The lock tool normalises it the same way.
 */
(function () {
  'use strict';

  var gate = document.querySelector('[data-gate]');
  var payloadEl = document.querySelector('[data-gate-payload]');
  if (!gate || !payloadEl) return;

  var STORE = 'site:gate-key';
  var payload;
  try { payload = JSON.parse(payloadEl.textContent); } catch (_) { return; }

  var subtle = window.crypto && window.crypto.subtle;

  /* --- helpers ------------------------------------------------------------ */

  function b64ToBytes(s) {
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToB64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function normalise(pw) {
    return pw.normalize('NFC').trim().toLowerCase().replace(/[\s_-]+/g, '-');
  }

  // iv (12 bytes) ‖ ciphertext ‖ tag — CryptoKit's "combined" layout
  function decrypt(key, bytes) {
    return subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, key, bytes.subarray(12));
  }

  function importAes(raw) {
    return subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  }

  function derive(password) {
    var enc = new TextEncoder();
    return subtle.importKey('raw', enc.encode(normalise(password)), 'PBKDF2', false, ['deriveBits'])
      .then(function (base) {
        return subtle.deriveBits({
          name: 'PBKDF2', hash: 'SHA-256',
          salt: b64ToBytes(payload.salt), iterations: payload.iter
        }, base, 256);
      })
      .then(function (bits) { return new Uint8Array(bits); });
  }

  /* The key is kept per tab, for the session only. It is tied to the salt it
     came from, so after a password change the old key is simply ignored. */
  function remembered() {
    try {
      var s = JSON.parse(sessionStorage.getItem(STORE) || 'null');
      return s && s.salt === payload.salt && s.iter === payload.iter ? b64ToBytes(s.key) : null;
    } catch (_) { return null; }
  }

  function remember(raw) {
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ salt: payload.salt, iter: payload.iter, key: bytesToB64(raw) }));
    } catch (_) {}
  }

  function forget() {
    try { sessionStorage.removeItem(STORE); } catch (_) {}
  }

  /* --- 1. the form ---------------------------------------------------------- */

  var ARROW_DOWN = '<svg class="arrow arrow--down" aria-hidden="true"><use href="#arrow"/></svg>';
  var ARROW_BACK = '<svg class="arrow" aria-hidden="true" style="transform:scaleX(-1)"><use href="#arrow"/></svg>';
  var EYE =
    '<svg class="gate__eye-on" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>' +
    '<svg class="gate__eye-off" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.9 3.9M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.9 9.9 0 0 0 5.4-1.6"/>' +
      '<path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/></svg>';

  /* "Arduino Cloud — Dark mode UI", from the case head the gate hides */
  function projectName() {
    var title = document.querySelector('.case-head__title');
    var sub = document.querySelector('.case-head__sub');
    return (sub ? sub.textContent.trim() + ' — ' : '') + (title ? title.textContent.trim() : '');
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function drawForm() {
    gate.innerHTML =
      '<div class="gate__stage">' +
        '<div class="gate__box" role="group" aria-labelledby="gate-title">' +
          '<span class="mono meta__label">' + escapeHtml(projectName()) + ' ' + ARROW_DOWN + '</span>' +
          '<h2 class="h3 gate__title" id="gate-title">This case study requires a password</h2>' +
          '<form class="gate__form" data-gate-form novalidate>' +
            '<div class="gate__field">' +
              '<label class="sr-only" for="gate-password">Password</label>' +
              '<input class="gate__input" id="gate-password" name="password" type="password" ' +
                'autocomplete="current-password" autocapitalize="none" autocorrect="off" spellcheck="false" ' +
                'placeholder="password" aria-describedby="gate-msg" required>' +
              '<button class="gate__eye" type="button" aria-pressed="false" aria-controls="gate-password" ' +
                'aria-label="Show password">' + EYE + '</button>' +
            '</div>' +
            '<button class="btn" type="submit">unlock</button>' +
          '</form>' +
          '<p class="mono gate__msg" id="gate-msg" role="status" aria-live="polite" data-gate-msg></p>' +
          '<a class="out gate__back" href="/portfolio">' + ARROW_BACK + ' all projects</a>' +
        '</div>' +
      '</div>';

    var form = gate.querySelector('[data-gate-form]');
    var input = gate.querySelector('.gate__input');
    var eye = gate.querySelector('.gate__eye');
    var button = form.querySelector('[type="submit"]');
    var msg = gate.querySelector('[data-gate-msg]');

    function busy(on) {
      button.disabled = on;
      input.readOnly = on;
      gate.classList.toggle('is-busy', on);
    }

    function say(text, error) {
      msg.textContent = text;
      msg.classList.toggle('is-error', !!error);
      if (error) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }

    /* The label stays "Show password"; aria-pressed says whether it is on. */
    eye.addEventListener('click', function () {
      var show = eye.getAttribute('aria-pressed') !== 'true';
      eye.setAttribute('aria-pressed', String(show));
      input.type = show ? 'text' : 'password';
    });

    /* the red goes as soon as the visitor starts correcting */
    input.addEventListener('input', function () {
      if (msg.classList.contains('is-error')) say('');
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!input.value.trim()) { input.focus(); return; }
      busy(true);
      say('unlocking…');

      var raw;
      derive(input.value)
        .then(function (r) { raw = r; return open(raw); })
        .then(function () { remember(raw); })
        .catch(function () {
          busy(false);
          say('wrong password — try again', true);
          input.focus();
          input.select();
        });
    });
  }

  /* --- 2. the sections -------------------------------------------------------- */

  function open(raw) {
    return importAes(raw).then(function (key) {
      return decrypt(key, b64ToBytes(payload.data)).then(function (plain) {
        var html = new TextDecoder().decode(plain);
        var frag = document.createRange().createContextualFragment(html);
        var images = frag.querySelectorAll('[data-locked-src]');

        /* hold each picture's place until its bytes are in */
        for (var i = 0; i < images.length; i++) {
          var w = images[i].getAttribute('width'), h = images[i].getAttribute('height');
          if (w && h) images[i].style.aspectRatio = w + ' / ' + h;
        }

        var hadFocus = gate.contains(document.activeElement);
        gate.replaceWith(frag);
        payloadEl.remove();
        document.documentElement.classList.remove('is-gated');
        document.documentElement.classList.add('is-unlocked');

        /* keyboard and screen-reader users land on the page's title */
        if (hadFocus) {
          var first = document.querySelector('.case-head__title');
          if (first) {
            first.setAttribute('tabindex', '-1');
            first.classList.add('gate-landing');
            first.focus({ preventScroll: true });
          }
        }

        document.dispatchEvent(new CustomEvent('site:unlocked'));
        loadImages(key, images);
      });
    });
  }

  /* --- 3. the images ------------------------------------------------------------ */

  function loadImages(key, images) {
    Array.prototype.forEach.call(images, function (img) {
      var url = img.getAttribute('data-locked-src');
      var type = img.getAttribute('data-locked-type') || 'application/octet-stream';
      fetch(url)
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(function (buf) { return decrypt(key, new Uint8Array(buf)); })
        .then(function (plain) {
          img.addEventListener('load', function () { img.style.aspectRatio = ''; }, { once: true });
          img.src = URL.createObjectURL(new Blob([plain], { type: type }));
          img.removeAttribute('data-locked-src');
        })
        .catch(function () { img.classList.add('is-broken'); });
    });
  }

  /* --- 4. start ------------------------------------------------------------------ */

  if (!subtle) {
    // WebCrypto needs a secure context (https or localhost) and a recent browser
    gate.innerHTML = '<div class="gate__stage"><div class="gate__box"><p class="gate__text">' +
      'This case study requires a password, and this browser can’t open it. ' +
      'Try a recent version of Safari, Chrome or Firefox.</p></div></div>';
    return;
  }

  document.documentElement.classList.add('is-gated');   // see site.css § 7.27

  var saved = remembered();
  if (saved) {
    gate.classList.add('is-busy');
    open(saved).catch(function () { forget(); gate.classList.remove('is-busy'); drawForm(); });
  } else {
    drawForm();
  }
})();
