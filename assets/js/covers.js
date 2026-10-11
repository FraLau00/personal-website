/* Francesco Lauriola — covers that answer the phone
 *
 * Shake the phone and every project cover on the page acts out its project
 * for a couple of seconds, then settles back exactly as drawn:
 *
 *   nesso         the face gets nauseous, as the board does — and follows the tilt
 *   led-matrix    every LED flashes red and the pointer jolts
 *   dashboards    the widgets shuffle into new layouts, then back
 *   ciid          the hands come up and cover the face
 *   white-label   the hue slider wanders and the colour follows it
 *   dark-mode     the mask turns a full circle
 *
 * On a computer, shaking the cursor does the same: it is the gesture macOS
 * already answers, by growing the pointer. Shake a card while dragging it
 * on the home and only that card plays.
 *
 * Hooks: data-cover="<name>" on a .project-card__cover; data-motion-ask on the
 * button that, on an iPhone, asks for the motion sensors (index.html). Progressive
 * enhancement, like site.js — with JS off, with no motion sensor, or with
 * reduced motion asked for, the covers stay plain images and nothing here runs.
 *
 * 1. Inline covers   2. Shake, tilt and cursor   3. The iPhone's magic trick
 * 4. The scenes
 */
(function () {
  'use strict';

  var covers = document.querySelectorAll('[data-cover]');
  var reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!covers.length || reduced || !window.fetch || !window.DOMParser) return;

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var uid = 0;

  /* --- 1. inline covers ----------------------------------------------------
   *
   * As an <img>, an SVG is a sealed picture: nothing in it can be moved. So
   * each cover is fetched again (same file, from the cache) and put into the
   * page as markup, next to the <img>, which is hidden. Same viewBox, same
   * box (site.css § 7.9): the swap does not move a pixel.
   *
   * In an <img> the file is a document of its own; in the page it is not. Its
   * ids, classes and keyframe names would become global — two exports from
   * Figma both have a "clip0_…" — so every name gets a prefix of its own.
   */

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function scope(text, p) {
    var ids = [], names = [];
    text.replace(/\sid="([^"]+)"/g, function (m, id) { ids.push(id); });
    text.replace(/\sclass="([^"]+)"/g, function (m, list) { names = names.concat(list.split(/\s+/)); });
    text.replace(/@keyframes\s+([\w-]+)/g, function (m, name) { names.push(name); });

    ids.forEach(function (id) {
      text = text.replace(new RegExp('(\\sid="|#)' + escapeRe(id) + '(?=["\')])', 'g'), '$1' + p + id);
    });
    text = text.replace(/(\sclass=")([^"]+)"/g, function (m, attr, list) {
      return attr + list.split(/\s+/).map(function (n) { return p + n; }).join(' ') + '"';
    });
    // Classes and keyframes are only named again inside the file's <style>.
    return text.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g, function (m, open, css, close) {
      names.forEach(function (n) {
        css = css.replace(new RegExp('(^|[^\\w-])' + escapeRe(n) + '(?![\\w-])', 'g'), '$1' + p + n);
      });
      return open + css + close;
    });
  }

  // The file the <img> would show right now: a <picture> picks by media query.
  function sourceOf(cover) {
    var sources = cover.querySelectorAll('source[media][srcset]');
    for (var i = 0; i < sources.length; i++) {
      if (window.matchMedia(sources[i].media).matches) {
        return new URL(sources[i].getAttribute('srcset').trim().split(/\s+/)[0], document.baseURI).href;
      }
    }
    var img = cover.querySelector('img');
    return img && new URL(img.getAttribute('src'), document.baseURI).href;
  }

  function inline(cover) {
    var scene = SCENES[cover.getAttribute('data-cover')];
    var img = cover.querySelector('img');
    var url = sourceOf(cover);
    if (!scene || !img || !url) return;
    if (scene.file) url = new URL(scene.file, url).href;
    var holder = img.parentNode.nodeName === 'PICTURE' ? img.parentNode : img;

    fetch(url).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.text();
    }).then(function (text) {
      var p = 'cv' + (++uid) + '-';
      var doc = new DOMParser().parseFromString(scope(text, p), 'image/svg+xml');
      if (doc.documentElement.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) return;

      var svg = document.importNode(doc.documentElement, true);
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', img.alt);
      svg.setAttribute('focusable', 'false');

      var old = cover.__svg;
      if (old) old.parentNode.replaceChild(svg, old);
      else holder.parentNode.insertBefore(svg, holder.nextSibling);
      holder.style.display = 'none';   // inline style: the reset's display:block beats [hidden]

      var api = null;
      try { api = scene.setup(svg, p); } catch (_) {}
      if (!api) {                      // the export changed shape: keep the picture
        svg.parentNode.removeChild(svg);
        holder.style.display = '';
        cover.__svg = cover.__scene = null;
        return;
      }
      cover.__svg = svg;
      cover.__scene = api;
      if (tilt.seen) api.tilt && api.tilt(tilt.gaze[0], tilt.gaze[1]);
    }).catch(function () {});
  }

  /* --- 2. shake, tilt and cursor -------------------------------------------
   *
   * The numbers come from NessoFaceV2.ino, so the page and the board answer
   * the same hand the same way. The board samples its IMU at 25 Hz; phones
   * fire at 60 Hz or more, so readings are taken one every 40 ms — the change
   * between two samples is what counts, and it depends on their spacing.
   */

  var G = 9.81;
  var SAMPLE_MS    = 40;     // 25 Hz, as the board
  var SHAKE_G      = 0.85;   // g of change between two samples that counts as a jolt
  var SHAKE_JOLTS  = 4;      // jolts that make a shake…
  var SHAKE_WINDOW = 700;    // …within this many ms
  var TILT_FULL    = 0.30;   // g of tilt for the full glance
  var TILT_FILTER  = 0.25;   // 0..1, lower is smoother
  var TILT_STILL   = 0.05;   // g: below this the phone is still
  var TILT_GRACE   = 1500;   // ms still before the pose becomes the new rest

  // While a block is being dragged (site.js § 4), the shake belongs to the
  // block in your hand: only its cover plays — none, if it has no cover.
  function shake() {
    var held = document.body.classList.contains('is-grabbing') &&
               document.querySelector('[data-sortable] > .is-dragging');
    for (var i = 0; i < covers.length; i++) {
      if (held && !held.contains(covers[i])) continue;
      if (covers[i].__scene) covers[i].__scene.shake();
    }
    trickDone();
  }

  var jolt = { at: 0, prev: null, count: 0, first: 0 };

  function onMotion(e) {
    var a = e.accelerationIncludingGravity || e.acceleration;
    if (!a || a.x == null) return;
    var now = performance.now();
    if (now - jolt.at < SAMPLE_MS) return;
    jolt.at = now;
    // Only the size of the change matters, so the axes' signs — which iOS
    // and Android disagree on — never do.
    var v = [a.x / G, a.y / G, a.z / G], p = jolt.prev;
    jolt.prev = v;
    if (!p) return;
    if (Math.hypot(v[0] - p[0], v[1] - p[1], v[2] - p[2]) > SHAKE_G) {
      if (!jolt.count || now - jolt.first > SHAKE_WINDOW) {
        jolt.count = 1;
        jolt.first = now;
      } else if (++jolt.count >= SHAKE_JOLTS) {
        jolt.count = 0;
        shake();
      }
    } else if (jolt.count && now - jolt.first > SHAKE_WINDOW) {
      jolt.count = 0;
    }
  }

  function screenTurn() {
    var o = window.screen && screen.orientation;
    var a = o && typeof o.angle === 'number' ? o.angle : (window.orientation || 0);
    return ((a % 360) + 360) % 360;
  }

  // The tilt is read from the angles, not the accelerometer: beta and gamma
  // mean the same on every phone. What the eyes follow is where gravity
  // pulls along the screen — tip the right edge down and they slide right.
  var tilt = { at: 0, prev: null, rest: [0, 0], moved: 0, gaze: [0, 0], seen: false };

  function clamp(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }

  function onOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    var now = performance.now();
    if (now - tilt.at < SAMPLE_MS) return;
    tilt.at = now;

    var b = e.beta * Math.PI / 180, g = e.gamma * Math.PI / 180;
    var x = Math.cos(b) * Math.sin(g), y = Math.sin(b), z = Math.cos(b) * Math.cos(g), t;
    switch (screenTurn()) {             // landscape: the page turned, the phone's axes did not
      case 90:  t = x; x = y;  y = -t; break;
      case 180: x = -x; y = -y;        break;
      case 270: t = x; x = -y; y = t;  break;
    }

    var p = tilt.prev;
    if (p && Math.hypot(x - p[0], y - p[1], z - p[2]) > TILT_STILL) tilt.moved = now;
    tilt.prev = [x, y, z];
    // Held still for a moment, the pose becomes the new straight ahead: the
    // eyes drift back to the middle and the next tilt starts from there.
    if (!p || now - tilt.moved > TILT_GRACE) tilt.rest = [x, y];

    tilt.gaze[0] += (clamp((x - tilt.rest[0]) / TILT_FULL) - tilt.gaze[0]) * TILT_FILTER;
    tilt.gaze[1] += (clamp((y - tilt.rest[1]) / TILT_FULL) - tilt.gaze[1]) * TILT_FILTER;
    tilt.seen = true;
    for (var i = 0; i < covers.length; i++) {
      var s = covers[i].__scene;
      if (s && s.tilt) s.tilt(tilt.gaze[0], tilt.gaze[1]);
    }
  }


  // Cursor: a shake is four quick changes of direction, each after a stroke
  // of at least 40px. Reading, pointing and dragging never look like that.
  // Shaking a card while dragging it counts too (see shake()); resizing the
  // name does not — that drag is all back and forth by nature.
  var CURSOR_STROKE = 40, CURSOR_TURNS = 4, CURSOR_WINDOW = 800;
  var cursor = { x: null, dir: 0, run: 0, turns: [] };

  function onPointerMove(e) {
    if (e.pointerType !== 'mouse') return;
    if (document.body.classList.contains('is-resizing')) return;
    if (cursor.x === null) { cursor.x = e.clientX; return; }
    var dx = e.clientX - cursor.x;
    cursor.x = e.clientX;
    if (!dx) return;
    var dir = dx > 0 ? 1 : -1;
    if (dir === cursor.dir) { cursor.run += Math.abs(dx); return; }
    var now = performance.now();
    if (cursor.run >= CURSOR_STROKE) {
      cursor.turns.push(now);
      while (now - cursor.turns[0] > CURSOR_WINDOW) cursor.turns.shift();
      if (cursor.turns.length >= CURSOR_TURNS) { cursor.turns = []; shake(); }
    }
    cursor.dir = dir;
    cursor.run = Math.abs(dx);
  }

  /* --- 3. the iPhone's magic trick ------------------------------------------
   *
   * iOS sends motion to a page only after the visitor allows it, and shows
   * that dialog only in answer to a tap. So on an iPhone a line under "Recent
   * projects" offers a magic trick: the tap on it is the one Safari wants.
   *
   * Asked without a tap, the request never shows anything: it resolves if the
   * visitor already said yes to this site (no offer needed), and is refused
   * if a tap is still missing (make the offer). Only on touch screens: recent
   * desktop Chrome has requestPermission too, but no sensors to give.
   * The motion listeners are on from the start everywhere — on an iPhone
   * they stay silent until the yes, and are attached again after it, in case
   * Safari only starts the sensors for listeners added once allowed. On
   * Android the events never waited for any question.
   *
   * Safari asks only on https: over plain http the request is refused, the
   * dialog never shows and the trick just fades. To try it from the Mac on
   * the iPhone, serve the site over https on the local network.
   */

  var trick = { button: null, done: false };

  function listen() {
    window.removeEventListener('devicemotion', onMotion);
    window.removeEventListener('deviceorientation', onOrientation);
    window.addEventListener('devicemotion', onMotion);
    window.addEventListener('deviceorientation', onOrientation);
  }

  function offerTrick() {
    var button = document.querySelector('[data-motion-ask]');
    var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (!button || !touch) return;
    trick.button = button;
    button.hidden = false;
    button.addEventListener('click', function () {
      DeviceMotionEvent.requestPermission().then(function (state) {
        if (state !== 'granted') { trickDone(); return; }
        var text = button.querySelector('[data-motion-text]');
        if (text) text.textContent = button.getAttribute('data-motion-then');
        button.disabled = true;
        listen();
        // One permission on iOS: once motion is allowed, this resolves without asking.
        if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
          DeviceOrientationEvent.requestPermission().then(listen, function () {});
        }
      }, trickDone);
    });
  }

  // The first shake after the yes is the end of the trick; a no ends it too.
  function trickDone() {
    var button = trick.button;
    if (!button || trick.done) return;
    trick.done = true;
    button.classList.add('is-done');
    setTimeout(function () { button.hidden = true; }, 400);
  }

  /* --- 4. the scenes --------------------------------------------------------
   *
   * Each scene finds its parts in the exported SVG by shape, not by id — the
   * ids change at every export — and returns { shake, tilt? }, or null if the
   * file no longer has the parts it needs (then the <img> simply stays).
   * Shaking again while a scene plays is ignored, except by the Nesso: there,
   * as on the board, it keeps the nausea going.
   */

  function make(name, attrs) {
    var n = document.createElementNS(SVG_NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  // One <g> around nodes that move together. They are siblings in a row, so
  // the paint order does not change.
  function wrap(nodes) {
    var g = make('g', {});
    nodes[0].parentNode.insertBefore(g, nodes[0]);
    nodes.forEach(function (n) { g.appendChild(n); });
    return g;
  }

  // Bounding box in the SVG's own units, with the node's transform applied
  // (a widget exported as rotate(-90) still has to land on the grid).
  function boxOf(node) {
    var b = node.getBBox();
    var list = node.transform && node.transform.baseVal;
    var t = list && list.numberOfItems ? list.consolidate() : null;
    if (!t) return { x: b.x, y: b.y, w: b.width, h: b.height };
    var m = t.matrix, xs = [], ys = [];
    [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
      .forEach(function (c) {
        xs.push(m.a * c[0] + m.c * c[1] + m.e);
        ys.push(m.b * c[0] + m.d * c[1] + m.f);
      });
    var x = Math.min.apply(null, xs), y = Math.min.apply(null, ys);
    return { x: x, y: y, w: Math.max.apply(null, xs) - x, h: Math.max.apply(null, ys) - y };
  }

  // Move with a CSS transition; 0ms jumps. Lengths are the SVG's own units.
  function slideTo(node, x, y, ms, ease, delay) {
    node.style.transition = ms ? 'transform ' + ms + 'ms ' + ease + ' ' + (delay || 0) + 'ms' : 'none';
    node.style.transform = x || y ? 'translate(' + x + 'px,' + y + 'px)' : '';
  }

  function random(min, max) { return min + Math.random() * (max - min); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  // #rrggbb → [h, s, l], h in degrees, s and l in %.
  function hsl(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    var n = parseInt(m[1], 16);
    var r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min, h = 0;
    if (d) {
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    var s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    return [h, s * 100, l * 100];
  }

  var SCENES = {

    /* Nesso — the board's own face. Tilt: the face moves as one block, up to
       8px of the board's 240×135 screen, the eyes 2px further; shaken, it
       turns green for 2.5s, the eyes circle and the mouth waves. All of it in
       board pixels, scaled by the distance between the two eyes. */
    nesso: {
      setup: function (svg, p) {
        var EYE_LX = 78, EYE_RX = 162, EYE_Y = 54;   // the board's geometry
        var REACH = 8 + 2;                           // TESTA_MAX + SGUARDO_MAX
        var SICK_MS = 2500, SICK_R = 10, SICK_LOOP = 1000, MOUTH_LOOP = 560;
        var GREEN = '#00FC00';                       // COL_NAUSEA, 0x07E0, as the screen shows it

        var eyes = [].slice.call(svg.querySelectorAll('.' + p + 'eye'));
        var lids = [].slice.call(svg.querySelectorAll('.' + p + 'lid'));
        if (eyes.length !== 2) return null;
        var parts = eyes.concat(lids);
        var face = wrap(parts);
        var fills = parts.map(function (n) { return n.getAttribute('fill'); });

        var ex = +eyes[0].getAttribute('cx'), ey = +eyes[0].getAttribute('cy');
        var k = (+eyes[1].getAttribute('cx') - ex) / (EYE_RX - EYE_LX);
        function X(x) { return ex + (x - EYE_LX) * k; }
        function Y(y) { return ey + (y - EYE_Y) * k; }

        // The wavy mouth: eleven 6×5 blocks side by side, as disegnaBocca() draws it.
        var mouth = make('g', { fill: GREEN });
        var bricks = [];
        for (var i = 0; i <= 10; i++) {
          bricks.push(mouth.appendChild(make('rect', {
            x: X(87 + i * 6), y: Y(100), width: 6 * k + 0.1, height: 5 * k   // +0.1: no hairline seams
          })));
        }
        mouth.style.display = 'none';
        face.parentNode.insertBefore(mouth, face.nextSibling);

        var gaze = [0, 0], sickFrom = 0, sickUntil = 0;

        function look() {
          face.style.transition = 'transform 80ms linear';   // fills the 40ms between samples
          face.style.transform = 'translate(' + gaze[0] * REACH * k + 'px,' + gaze[1] * REACH * k + 'px)';
        }

        function frame(now) {
          if (now >= sickUntil) {
            sickUntil = 0;
            parts.forEach(function (n, j) { n.setAttribute('fill', fills[j]); n.style.animation = ''; });
            mouth.style.display = 'none';
            look();
            return;
          }
          var t = now - sickFrom;
          var f = t % SICK_LOOP / SICK_LOOP * 2 * Math.PI;
          face.style.transform = 'translate(' + Math.cos(f) * SICK_R * k + 'px,' + Math.sin(f) * SICK_R * k + 'px)';
          var m = t % MOUTH_LOOP / MOUTH_LOOP * 2 * Math.PI;
          bricks.forEach(function (b, j) { b.setAttribute('y', Y(100 + Math.sin(j * 0.9 + m) * 4)); });
          requestAnimationFrame(frame);
        }

        return {
          tilt: function (x, y) {
            gaze = [x, y];
            if (!sickUntil) look();          // nauseous, the board ignores the tilt
          },
          shake: function () {
            var now = performance.now();
            if (!sickUntil) {
              sickFrom = now;
              // No blinks or glances while sick: with the animation off the
              // eyes stay open and the lids, opacity 0 in the file, stay away.
              parts.forEach(function (n) { n.setAttribute('fill', GREEN); n.style.animation = 'none'; });
              face.style.transition = 'none';
              mouth.style.display = '';
              requestAnimationFrame(frame);
            }
            sickUntil = now + SICK_MS;         // shaking again keeps it sick, like the board
          }
        };
      }
    },

    /* LED matrix — the UNO R4's 12×8 matrix with a drawing on it, and the
       pointer that is drawing it. Shaken, every LED lights red and the whole
       matrix flashes; the pointer jolts left and right, a little less each
       time; then the drawing comes back. */
    'led-matrix': {
      setup: function (svg, p) {
        var FLASHES = 5, ON_MS = 220, OFF_MS = 160;
        var JOLT_MS = 900, JOLT_LOOP = 180, JOLT_REACH = 2.5;

        // The LEDs are the commonest shape in the drawing: identical dots. The
        // board's status LEDs are the same dot, so keep only the ones sitting
        // in a row with others — the matrix's rows have twelve.
        var bySize = {}, dots = [];
        [].forEach.call(svg.querySelectorAll('path'), function (n) {
          var b = boxOf(n), key = b.w.toFixed(1) + 'x' + b.h.toFixed(1);
          (bySize[key] = bySize[key] || []).push({ node: n, row: Math.round(b.y + b.h / 2) });
        });
        for (var key in bySize) if (bySize[key].length > dots.length) dots = bySize[key];
        var perRow = {};
        dots.forEach(function (d) { perRow[d.row] = (perRow[d.row] || 0) + 1; });
        var leds = dots.filter(function (d) { return perRow[d.row] >= 4; })
                       .map(function (d) { return d.node; });
        if (leds.length < 48) return null;

        // Off is the commonest colour among them, lit the next one.
        var count = {};
        leds.forEach(function (n) { var f = n.getAttribute('fill'); count[f] = (count[f] || 0) + 1; });
        var colours = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; });
        var OFF = colours[0], ON = colours[1];
        if (!ON) return null;
        var offOpacity = leds.filter(function (n) { return n.getAttribute('fill') === OFF; })[0]
                             .getAttribute('fill-opacity');
        var drawn = leds.map(function (n) {
          return { fill: n.getAttribute('fill'), opacity: n.getAttribute('fill-opacity') };
        });

        // A lit LED glows through a blur filter on a group of its own. While
        // the matrix flashes those are switched off and every LED gets a soft
        // disc behind it instead: 96 blurs, redrawn on every frame of the
        // pointer's jolt, made the page stutter; a radial gradient is nearly
        // free to draw. Same tint as the file's glow (#FFBABA), and the same
        // falloff — strongest at the LED's rim, gone about 4 units out. Kept
        // fainter than one LED's glow alone: with all 96 lit, the neighbours'
        // halos add up in the gaps.
        var halos = leds.map(function (n) { return n.parentNode; }).filter(function (g) {
          return g.localName === 'g' && g.hasAttribute('filter');
        });
        var r = boxOf(leds[0]).w / 2, R = r + 4.2;
        var shade = make('radialGradient', { id: p + 'led-halo' });
        [[0, 0.2], [r / R, 0.18], [(r + 1.2) / R, 0.09], [(r + 2.6) / R, 0.025], [1, 0]].forEach(function (s) {
          shade.appendChild(make('stop', { offset: s[0], 'stop-color': '#FFBABA', 'stop-opacity': s[1] }));
        });
        (svg.querySelector('defs') || svg.appendChild(make('defs', {}))).appendChild(shade);
        var glow = make('g', { fill: 'url(#' + shade.id + ')' });
        leds.forEach(function (n) {
          var b = boxOf(n);
          glow.appendChild(make('circle', { cx: b.x + b.w / 2, cy: b.y + b.h / 2, r: R }));
        });
        glow.style.display = 'none';
        var first = halos.indexOf(leds[0].parentNode) >= 0 ? leds[0].parentNode : leds[0];
        first.parentNode.insertBefore(glow, first);    // under every LED

        // The pointer: the last drop-shadowed group that is not a LED's glow.
        var others = [].filter.call(svg.querySelectorAll('g[filter]'), function (g) {
          return halos.indexOf(g) < 0;
        });
        var pointer = others[others.length - 1];

        function light(on) {
          leds.forEach(function (n) {
            n.setAttribute('fill', on ? ON : OFF);
            if (on || !offOpacity) n.removeAttribute('fill-opacity');
            else n.setAttribute('fill-opacity', offOpacity);
          });
          glow.style.display = on ? '' : 'none';
        }

        function restore() {
          leds.forEach(function (n, i) {
            n.setAttribute('fill', drawn[i].fill);
            if (drawn[i].opacity === null) n.removeAttribute('fill-opacity');
            else n.setAttribute('fill-opacity', drawn[i].opacity);
          });
          glow.style.display = 'none';
          halos.forEach(function (g) { g.style.filter = ''; });
        }

        var busy = false;
        return {
          shake: function () {
            if (busy) return;
            busy = true;
            halos.forEach(function (g) { g.style.filter = 'none'; });
            var step = 0;
            (function flash() {
              if (step === FLASHES * 2) { restore(); busy = false; return; }
              var on = step++ % 2 === 0;
              light(on);
              setTimeout(flash, on ? ON_MS : OFF_MS);
            })();

            if (!pointer) return;
            var t0 = performance.now();
            requestAnimationFrame(function jolt(now) {
              var t = (now - t0) / JOLT_MS;
              if (t >= 1) { pointer.style.transform = ''; return; }
              var x = Math.sin((now - t0) / JOLT_LOOP * 2 * Math.PI) * JOLT_REACH * (1 - t);
              pointer.style.transform = 'translateX(' + x + 'px)';
              requestAnimationFrame(jolt);
            });
          }
        };
      }
    },

    /* Dashboards — the widgets tile a grid. Every way the same widgets can
       tile it is worked out once; a shake plays two of them, each moving as
       many widgets as it can, then puts everything back. */
    dashboards: {
      setup: function (svg) {
        var MOVE_MS = 420, EVERY_MS = 700, STAGGER_MS = 30, EASE = 'cubic-bezier(.2,.8,.2,1)';

        var shapes = [].filter.call(svg.querySelectorAll('rect, path'), function (n) {
          return n.parentNode === svg;
        });
        // Rounded to whole units: the selected widget's outline is inset by a
        // quarter unit to keep its stroke inside, and that would skew the grid.
        var boxes = shapes.map(function (n) {
          var b = boxOf(n);
          return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) };
        });
        // The board is the biggest shape. Everything else lying on it is a
        // widget; shapes with the same box are layers of the same widget.
        var board = 0;
        boxes.forEach(function (b, i) { if (b.w * b.h > boxes[board].w * boxes[board].h) board = i; });
        var byBox = {}, pieces = [];
        shapes.forEach(function (n, i) {
          if (i === board) return;
          var b = boxes[i], key = [b.x, b.y, b.w, b.h].join();
          if (!byBox[key]) pieces.push(byBox[key] = { nodes: [], box: b });
          byBox[key].nodes.push(n);
        });
        if (pieces.length < 2) return null;

        // The grid: cell size from the smallest widget, pitch from the
        // smallest step between two widgets' edges.
        var size = Infinity, pitch = Infinity, ox = Infinity, oy = Infinity;
        pieces.forEach(function (a) {
          size = Math.min(size, a.box.w, a.box.h);
          ox = Math.min(ox, a.box.x);
          oy = Math.min(oy, a.box.y);
          pieces.forEach(function (b) {
            var dx = Math.abs(a.box.x - b.box.x), dy = Math.abs(a.box.y - b.box.y);
            if (dx > 1) pitch = Math.min(pitch, dx);
            if (dy > 1) pitch = Math.min(pitch, dy);
          });
        });
        if (!isFinite(pitch)) return null;
        var cols = 0, rows = 0;
        pieces.forEach(function (pc) {
          var b = pc.box;
          pc.col = Math.round((b.x - ox) / pitch);
          pc.row = Math.round((b.y - oy) / pitch);
          pc.w = Math.round((b.w + pitch - size) / pitch);
          pc.h = Math.round((b.h + pitch - size) / pitch);
          cols = Math.max(cols, pc.col + pc.w);
          rows = Math.max(rows, pc.row + pc.h);
          pc.g = wrap(pc.nodes);
        });

        // Every tiling, as a [col, row] per widget. Fill the first free cell,
        // try each widget left, recurse. A 3×3 board has about a hundred.
        var tilings = [], free = [], at = [];
        for (var c = 0; c < cols * rows; c++) free.push(true);
        (function fill() {
          var cell = free.indexOf(true);
          if (cell < 0) { tilings.push(at.slice()); return; }
          var col = cell % cols, row = Math.floor(cell / cols);
          pieces.forEach(function (pc, i) {
            if (at[i] || col + pc.w > cols || row + pc.h > rows) return;
            var cells = [];
            for (var y = row; y < row + pc.h; y++) {
              for (var x = col; x < col + pc.w; x++) {
                if (!free[y * cols + x]) return;
                cells.push(y * cols + x);
              }
            }
            cells.forEach(function (n) { free[n] = false; });
            at[i] = [col, row];
            fill();
            at[i] = undefined;
            cells.forEach(function (n) { free[n] = true; });
          });
        })();
        if (tilings.length < 2) return null;   // gaps, or nothing else fits: nothing to shuffle
        var home = pieces.map(function (pc) { return [pc.col, pc.row]; });

        // The tiling that moves the most widgets away from `from`, at random among equals.
        function shuffled(from) {
          var best = [], most = -1;
          tilings.forEach(function (t) {
            var moved = 0;
            t.forEach(function (pos, i) { if (pos[0] !== from[i][0] || pos[1] !== from[i][1]) moved++; });
            if (moved > most) { most = moved; best = []; }
            if (moved === most) best.push(t);
          });
          return best[Math.floor(Math.random() * best.length)];
        }

        function go(layout) {
          pieces.forEach(function (pc, i) {
            slideTo(pc.g, (layout[i][0] - pc.col) * pitch, (layout[i][1] - pc.row) * pitch,
                    MOVE_MS, EASE, i * STAGGER_MS);
          });
        }

        var busy = false;
        return {
          shake: function () {
            if (busy) return;
            busy = true;
            var a = shuffled(home), b = shuffled(a);
            go(a);
            setTimeout(function () { go(b); }, EVERY_MS);
            setTimeout(function () { go(home); }, EVERY_MS * 2);
            setTimeout(function () { busy = false; }, EVERY_MS * 2 + MOVE_MS + pieces.length * STAGGER_MS);
          }
        };
      }
    },

    /* CIID — the statue that covers its face. The cover is drawn from the
       version of the file with the hands (the <img> keeps the one without);
       at rest they wait just below the frame they come up through. */
    ciid: {
      file: 'CIID_withHands.svg',
      setup: function (svg) {
        var UP_MS = 450, HOLD_MS = 1100, DOWN_MS = 380, STAGGER_MS = 70;

        // The hands are the only shapes the export puts under a clip.
        var group = [].filter.call(svg.children, function (n) { return n.hasAttribute('clip-path'); })[0];
        var id = group && /url\(#([^)]+)\)/.exec(group.getAttribute('clip-path'));
        var frame = id && svg.querySelector('[id="' + id[1] + '"] rect');
        if (!frame || !group.children.length) return null;
        var shift = /translate\(\s*([-\d.]+)[\s,]+([-\d.]+)/.exec(frame.getAttribute('transform') || '');
        var bottom = (+frame.getAttribute('y') || 0) + (shift ? +shift[2] : 0) + +frame.getAttribute('height');

        var hands = [].slice.call(group.children).map(function (n) {
          var down = bottom - boxOf(n).y + 1;
          slideTo(n, 0, down, 0);
          return { node: n, down: down };
        });

        var busy = false;
        return {
          shake: function () {
            if (busy) return;
            busy = true;
            hands.forEach(function (h, i) {
              slideTo(h.node, 0, 0, UP_MS, 'cubic-bezier(.2,.9,.3,1)', i * STAGGER_MS);
            });
            var back = UP_MS + HOLD_MS;
            setTimeout(function () {
              hands.forEach(function (h, i) {
                slideTo(h.node, 0, h.down, DOWN_MS, 'cubic-bezier(.5,0,.75,0)', i * STAGGER_MS);
              });
            }, back);
            setTimeout(function () { busy = false; }, back + DOWN_MS + hands.length * STAGGER_MS);
          }
        };
      }
    },

    /* White label — a colour picker. The thumb of the hue slider (and the
       pointer holding it) wanders to a few random points; only the hue of
       the swatch and of the thumb's ring follows. Then it all goes home. */
    'white-label': {
      setup: function (svg) {
        var HOPS = 4, RETURN_MS = 420;

        // The slider: a bar filled with a many-stop gradient.
        var track = [].filter.call(svg.querySelectorAll('rect'), function (n) {
          var id = /url\(#([^)]+)\)/.exec(n.getAttribute('fill') || '');
          var grad = id && svg.querySelector('[id="' + id[1] + '"]');
          return grad && grad.querySelectorAll('stop').length >= 5;
        })[0];
        if (!track) return null;
        var tb = boxOf(track);
        // The thumb: the circles centred on the bar.
        var thumb = [].filter.call(svg.querySelectorAll('circle'), function (n) {
          var cx = +n.getAttribute('cx'), cy = +n.getAttribute('cy');
          return cx >= tb.x && cx <= tb.x + tb.w && Math.abs(cy - (tb.y + tb.h / 2)) < tb.h;
        });
        // Its coloured ring, and the swatch: the solid rect the blend layers sit on.
        var ring = thumb.filter(function (n) {
          var c = hsl(n.getAttribute('stroke'));
          return c && c[1] > 0;
        })[0];
        var swatch = [].filter.call(svg.querySelectorAll('rect'), function (n) {
          var next = n.nextElementSibling;
          return hsl(n.getAttribute('fill')) && next && /mix-blend-mode/.test(next.getAttribute('style') || '');
        })[0];
        if (!thumb.length || !swatch) return null;
        // The pointer: the last drop-shadowed group, unless that is the whole picker.
        var shadowed = svg.querySelectorAll('g[filter]');
        var pointer = shadowed[shadowed.length - 1];
        if (pointer && pointer.contains(track)) pointer = null;

        var x0 = +thumb[0].getAttribute('cx');
        var r = +thumb[0].getAttribute('r') + 1;
        var min = tb.x + r - x0, max = tb.x + tb.w - r - x0;
        var swatchFill = swatch.getAttribute('fill'), base = hsl(swatchFill);
        var ringStroke = ring && ring.getAttribute('stroke'), ringBase = ring && hsl(ringStroke);
        var movers = pointer ? thumb.concat(pointer) : thumb;
        var dx = 0, busy = false;

        // A full run of the bar is a full turn of the wheel, centred on the drawn colour.
        function set(d) {
          dx = d;
          movers.forEach(function (n) { n.style.transform = d ? 'translateX(' + d + 'px)' : ''; });
          var turn = d / tb.w * 360;
          swatch.setAttribute('fill', hslText(base, turn));
          if (ring) ring.setAttribute('stroke', hslText(ringBase, turn));
        }
        function hslText(c, turn) {
          return 'hsl(' + ((c[0] + turn) % 360 + 360) % 360 + ',' + c[1] + '%,' + c[2] + '%)';
        }

        function glide(to, ms, then) {
          var from = dx, t0 = performance.now();
          requestAnimationFrame(function step(now) {
            var t = Math.min(1, (now - t0) / ms);
            set(from + (to - from) * easeInOut(t));
            if (t < 1) requestAnimationFrame(step); else then();
          });
        }

        return {
          shake: function () {
            if (busy) return;
            busy = true;
            var hops = HOPS;
            (function hop() {
              if (!hops--) {
                glide(0, RETURN_MS, function () {
                  set(0);                                  // and the exact colours of the file
                  swatch.setAttribute('fill', swatchFill);
                  if (ring) ring.setAttribute('stroke', ringStroke);
                  busy = false;
                });
                return;
              }
              var to;
              do { to = random(min, max); } while (Math.abs(to - dx) < (max - min) / 5);
              glide(to, random(260, 420), function () { setTimeout(hop, random(60, 180)); });
            })();
          }
        };
      }
    },

    /* Dark mode — a light half and a dark half of the same mark, split by a
       diagonal. The dark half is a triangle under a mask; it turns a full
       circle around the point of the diagonal nearest the mark's centre,
       blown up 3× about that point so its far corners never come into view. */
    'dark-mode': {
      setup: function (svg) {
        var TURN_MS = 1600, EASE = 'cubic-bezier(.65,0,.35,1)';

        var masked = svg.querySelector('g[mask] > path');
        var mark = [].filter.call(svg.children, function (n) { return n.localName === 'path'; })[0];
        var pts = masked && (masked.getAttribute('d').match(/-?\d*\.?\d+/g) || []).map(Number);
        if (!mark || !pts || pts.length < 4) return null;

        // The diagonal is the triangle's first edge.
        var ax = pts[0], ay = pts[1], ux = pts[2] - ax, uy = pts[3] - ay;
        var mb = boxOf(mark), cx = mb.x + mb.w / 2, cy = mb.y + mb.h / 2;
        var t = ((cx - ax) * ux + (cy - ay) * uy) / (ux * ux + uy * uy);
        masked.style.transformBox = 'view-box';
        masked.style.transformOrigin = (ax + ux * t) + 'px ' + (ay + uy * t) + 'px';

        var busy = false;
        return {
          shake: function () {
            if (busy) return;
            busy = true;
            masked.style.transition = 'none';
            masked.style.transform = 'rotate(0deg) scale(3)';   // looks the same as at rest
            masked.getBoundingClientRect();
            masked.style.transition = 'transform ' + TURN_MS + 'ms ' + EASE;
            masked.style.transform = 'rotate(360deg) scale(3)';
            setTimeout(function () {
              masked.style.transition = 'none';
              masked.style.transform = '';
              busy = false;
            }, TURN_MS);
          }
        };
      }
    }
  };

  /* --- start ---------------------------------------------------------------- */

  function init() {
    [].forEach.call(covers, function (cover) {
      inline(cover);
      // A <picture> that swaps file with the theme: swap the inline copy too.
      [].forEach.call(cover.querySelectorAll('source[media]'), function (source) {
        var mq = window.matchMedia(source.media);
        var redo = function () { inline(cover); };
        if (mq.addEventListener) mq.addEventListener('change', redo); else mq.addListener(redo);
      });
    });

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    listen();

    if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
      // Already allowed on an earlier visit: start the sensors, no offer.
      DeviceMotionEvent.requestPermission().then(function (state) {
        if (state === 'granted') listen();
      }, offerTrick);
    }
  }

  // After the page has settled: the covers are a detail, not the content.
  if (window.requestIdleCallback) requestIdleCallback(init, { timeout: 2000 });
  else setTimeout(init, 300);
})();
