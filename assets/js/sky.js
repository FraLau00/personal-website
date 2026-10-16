/* Francesco Lauriola — "looking up": the sky over my hometown, right now
 *
 * 1. The "looking up" label in the bio's random facts is a button. On a phone
 *    a tap asks for the motion sensors (Safari needs that tap; elsewhere it
 *    costs nothing) and turns the label into the instruction.
 * 2. Raise the phone in front of you, like a camera — its back above −5° —
 *    and the sky opens. Back down to reading (under −35°) and the page comes
 *    back. The phone is a window: what is behind it is what you see.
 * 3. No sensors (a computer, or a "no" on the iPhone): the sky opens at once
 *    and the pointer looks around.
 * 4. On the phone, a finger drag lets go of the phone: the view stays where
 *    the finger puts it, and "reset position" hands it back. Two fingers
 *    pinch to zoom (the wheel, on a computer).
 *
 * The sky is Latina's at this minute, with the daylight left out. North comes
 * from the visitor's own compass: you stand where you are, under Latina's sky.
 * Nothing is stored and nothing leaves the page — the privacy page says so.
 *
 * Hooks in bio.html: data-sky-ask on the label, data-sky on the overlay (and
 * data-sky-* inside it). Needs sky-data.js and sky-astro.js loaded first.
 * Styles: site.css § 7.29. Progressive enhancement: the label's moving
 * underline starts only once this script has run (.is-live), so with JS off it
 * reads as the plain label it was.
 *
 * URL switches for testing: ?t=2026-10-16T22:00 (any moment), ?view=230,15
 * (where the pointer view starts: azimuth, altitude), ?debug (sensor numbers —
 * the way the iPhone's compass flip was found).
 */
(function () {
  'use strict';

  var A = window.SkyAstro, DATA = window.SKY_DATA;
  // Latina, the city — rounded to ~1 km, nowhere more precise. The sky is the
  // same to well under a degree anywhere in town.
  var PLACE = { lat: 41.47, lon: 12.90, tz: 'Europe/Rome' };
  var RAD = Math.PI / 180;

  // Where the back of the phone points, degrees. Wide apart on purpose: once
  // open, the sky stays open anywhere short of the reading position.
  var OPEN_ALT = -5, CLOSE_ALT = -35;
  var OPEN_HOLD = 250, CLOSE_HOLD = 600;  // ms it has to stay there
  var FOV = 50;                           // degrees across the shorter side of the screen

  var params = new URLSearchParams(location.search);
  var DEBUG = params.has('debug');
  var timeShift = 0;
  if (params.get('t')) {
    var t0 = Date.parse(params.get('t'));
    if (!isNaN(t0)) timeShift = t0 - Date.now();
  }
  function now() { return new Date(Date.now() + timeShift); }

  var REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var COLOR = {
    star: '#FFFBF3',          // warm-50
    line: 'rgba(239, 231, 216, 0.18)',
    lineSel: 'rgba(239, 231, 216, 0.6)',
    label: '#A99F91',         // warm-400
    labelStrong: '#EFE7D8',   // warm-200
    ground: 'rgba(27, 22, 17, 0.94)',  // warm-850
    horizon: '#4A443A',       // warm-700
    moonDark: '#1B1611',
    select: '#5B7FA6',
    heart: '#F28B82',         // red-300, the dark theme's own red
    handle: '#FFFFFF'
  };
  var MONO = '"Roboto Mono", ui-monospace, Menlo, monospace';

  /* --- small vector helpers ---------------------------------------------- */

  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function neg(v) { return [-v[0], -v[1], -v[2]]; }
  function mix(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
  function lin(a, ka, b, kb) { return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb]; }
  function wrap180(d) { return ((d % 360) + 540) % 360 - 180; }

  // Turn an ENU vector clockwise (seen from above) by h radians: its compass heading grows by h.
  function turn(v, h) {
    var c = Math.cos(h), s = Math.sin(h);
    return [v[0] * c + v[1] * s, -v[0] * s + v[1] * c, v[2]];
  }
  function headingDeg(v) { return (Math.atan2(v[0], v[1]) / RAD + 360) % 360; }

  /* --- the catalogue, as unit vectors ------------------------------------ */

  var NS = DATA.STARS.length / 3;
  var SV = new Float64Array(NS * 3), SM = new Float32Array(NS);
  for (var i = 0; i < NS; i++) {
    var v = A.eqVec(DATA.STARS[i * 3], DATA.STARS[i * 3 + 1]);
    SV[i * 3] = v[0]; SV[i * 3 + 1] = v[1]; SV[i * 3 + 2] = v[2];
    SM[i] = DATA.STARS[i * 3 + 2];
  }

  var CONS = DATA.LINES.map(function (c) {
    var seen = {}, sum = [0, 0, 0];
    var polys = c[2].map(function (flat) {
      var pts = [];
      for (var j = 0; j < flat.length; j += 2) {
        var p = A.eqVec(flat[j], flat[j + 1]);
        pts.push(p);
        var key = flat[j] + ',' + flat[j + 1];
        if (!seen[key]) { seen[key] = 1; sum = lin(sum, 1, p, 1); }
      }
      return pts;
    });
    return { name: c[1].toLowerCase(), polys: polys, centroid: norm(sum) };
  });

  // Clusters — the Pleiades — select like a constellation but draw no lines.
  (DATA.CLUSTERS || []).forEach(function (c) {
    var pts = [], sum = [0, 0, 0];
    for (var j = 0; j < c[1].length; j += 2) {
      var p = A.eqVec(c[1][j], c[1][j + 1]);
      pts.push(p); sum = lin(sum, 1, p, 1);
    }
    CONS.push({ name: c[0], polys: [pts], centroid: norm(sum), noLines: true, heart: c[0] === 'pleiades' });
  });

  var BODIES = [
    { key: 'venus', r: 3.2 }, { key: 'jupiter', r: 3 }, { key: 'mars', r: 2.4 },
    { key: 'saturn', r: 2.4 }, { key: 'mercury', r: 2 }
  ];

  /* --- DOM ---------------------------------------------------------------- */

  var ask = document.querySelector('[data-sky-ask]');
  var sky = document.querySelector('[data-sky]');
  if (!ask || !sky) return;
  var askText = ask.querySelector('[data-sky-text]');
  ask.classList.add('is-live');
  var askIdle = askText.textContent;
  var canvas = sky.querySelector('canvas');
  var ctx = canvas.getContext('2d');
  var timeEl = sky.querySelector('[data-sky-time]');
  var noteEl = sky.querySelector('[data-sky-note]');
  var hintEl = sky.querySelector('[data-sky-hint]');
  var headingEl = sky.querySelector('[data-sky-heading]');
  var altEl = sky.querySelector('[data-sky-alt]');
  var foot = sky.querySelector('.sky__foot');
  var closeBtn = sky.querySelector('[data-sky-close]');
  var debugEl = sky.querySelector('[data-sky-debug]');
  var resetBtn = sky.querySelector('[data-sky-reset]');
  var hud = sky.querySelector('.sky__hud');
  var credits = sky.querySelector('[data-sky-credits]');
  var creditsOpenBtn = sky.querySelector('[data-sky-credits-open]');
  var creditsCloseBtn = sky.querySelector('[data-sky-credits-close]');
  var creditsOpen = false;
  // Labels on the canvas stay between the heading and time above and the foot below.
  var hudBottom = 90, footTop = 700;
  function measureHud() {
    var r = hud.getBoundingClientRect(); if (r.height) hudBottom = r.bottom;
    r = foot.getBoundingClientRect(); if (r.height) footTop = r.top;
  }
  // The pointer gets a hint; the phone needs none. "reset position" only once a finger took over.
  function updateFoot() {
    hintEl.hidden = mode !== 'drag';
    resetBtn.hidden = !detached;
    measureHud();
  }
  if (debugEl) debugEl.hidden = !DEBUG;

  var W = 0, H = 0, DPR = 1, K = 1, zoom = 1;
  var ZOOM_MIN = 0.6, ZOOM_MAX = 8;       // 8× is ~6° across: the Pleiades fill the box
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 3);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    setZoom(zoom);
  }
  // stereographic: a point θ from the centre lands at K·tan(θ/2)
  function setZoom(z) {
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    K = (Math.min(W, H) / 2) / Math.tan(FOV / 4 * RAD) * zoom;
  }

  /* --- state -------------------------------------------------------------- */

  var state = 'idle';            // idle → armed (tapped) → open
  var mode = 'drag';             // 'sensor' when the phone steers, 'drag' when the pointer does
  var detached = false;          // sensor mode, but a finger has taken over
  var view = { az: 180, alt: 40, roll: 0 };   // drag mode: looking south, 40° up
  if (params.get('view')) {              // ?view=230,15 — azimuth, altitude
    var vv = params.get('view').split(',').map(Number);
    if (vv.length === 2 && !isNaN(vv[0]) && !isNaN(vv[1])) view = { az: vv[0], alt: vv[1], roll: 0 };
  }
  var cam = null;                // { r, u, f } in ENU
  var sensor = { last: 0, absolute: false, offset: null, target: null, alt: -90, upSince: 0, downSince: 0 };
  var sel = null, box = null, boxAlpha = 0;
  var raf = 0, lastFrame = 0;

  /* --- 1. the tap ------------------------------------------------------- */

  // Phones and tablets get the gesture; a computer opens straight to the pointer,
  // without asking for sensors it doesn't have or showing a phone instruction.
  var HANDHELD = window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches;

  ask.addEventListener('click', function () {
    if (state !== 'idle') return;
    if (!HANDHELD) { openSky('drag'); return; }
    // Whatever the answer, listen: arm() waits for the sensors to speak and
    // falls back to the pointer if they don't (a "no", or a computer that
    // implements the question but has nothing to give).
    var DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') DOE.requestPermission().then(arm, arm);
    else arm();
  });

  var listening = false;
  function listen() {
    if (listening) return;
    listening = true;
    window.addEventListener('deviceorientationabsolute', onOrientation);
    window.addEventListener('deviceorientation', onOrientation);
  }

  function arm() {
    state = 'armed';
    listen();
    askText.textContent = ask.getAttribute('data-sky-then');
    ask.classList.add('is-armed');
    // Nothing answered: a computer. Open now and let the pointer look around.
    setTimeout(function () {
      if (state === 'armed' && !sensor.last) openSky('drag');
    }, 700);
  }

  /* --- 2. the phone ------------------------------------------------------- */

  /* Device axes in ENU, from the W3C angles: R = Rz(α)·Rx(β)·Ry(γ).
     x = right edge, y = top edge, z = out of the screen, towards the face. */
  function deviceAxes(alpha, beta, gamma) {
    var a = alpha * RAD, b = beta * RAD, g = gamma * RAD;
    var cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
    return {
      x: [cA * cG - sA * sB * sG, sA * cG + cA * sB * sG, -cB * sG],
      y: [-sA * cB, cA * cB, sB],
      z: [cA * sG + sA * sB * cG, sA * sG - cA * sB * cG, cB * cG]
    };
  }

  function screenAngle() {
    if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
    return typeof window.orientation === 'number' ? window.orientation : 0;
  }

  function onOrientation(e) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    var absolute = e.type === 'deviceorientationabsolute' || e.absolute === true;
    if (sensor.absolute && !absolute) return;       // once the absolute stream shows up, it wins
    if (absolute) sensor.absolute = true;

    var ax = deviceAxes(e.alpha, e.beta, e.gamma);

    /* Safari's alpha is not tied to north; its compass is webkitCompassHeading,
       the heading of whichever is nearer the horizontal — the top edge or the
       back — flipping between them at 45° (seen on the iPhone, 2026-10-16:
       reading the wrong one there made the sky jump by up to 170°). The gap
       between compass and alpha is a constant, so: learn it from readings well
       clear of that 45° switch, then let only small corrections through. The
       gyro keeps the motion smooth; the compass only keeps it true. */
    var offset = 0;
    if (!absolute) {
      var wch = e.webkitCompassHeading;
      if (typeof wch === 'number' && wch >= 0 && e.webkitCompassAccuracy !== -1) {
        sensor.wch = wch;
        var ty = Math.abs(ax.y[2]), tz = Math.abs(ax.z[2]);
        if (Math.abs(ty - tz) > 0.2) compassSample(wrap180(wch - headingDeg(ty < tz ? ax.y : neg(ax.z))));
      }
      offset = sensor.offset || 0;
    }

    var a = screenAngle() * RAD, ca = Math.cos(a), sa = Math.sin(a);
    var right = lin(ax.x, ca, ax.y, -sa);
    var up = lin(ax.x, sa, ax.y, ca);
    var fwd = neg(ax.z);                             // you look through the phone
    var h = offset * RAD;
    sensor.target = { r: turn(right, h), u: turn(up, h), f: turn(fwd, h) };
    sensor.alt = Math.asin(Math.max(-1, Math.min(1, fwd[2]))) / RAD;
    sensor.last = performance.now();
    sensor.raw = [e.alpha, e.beta, e.gamma];
    gesture();
  }

  // First 30 readings: learn quickly. After that: drift slowly, ignore jumps.
  // Two seconds of nothing but jumps means the first guess was wrong — relearn.
  function compassSample(sample) {
    if (sensor.offset == null) { sensor.offset = sample; sensor.samples = 1; sensor.rejected = 0; return; }
    var diff = wrap180(sample - sensor.offset);
    if (sensor.samples < 30) {
      sensor.offset = wrap180(sensor.offset + diff * 0.1); sensor.samples++;
    } else if (Math.abs(diff) < 20) {
      sensor.offset = wrap180(sensor.offset + diff * 0.01); sensor.rejected = 0;
    } else if (++sensor.rejected > 120) {
      sensor.offset = sample; sensor.samples = 1; sensor.rejected = 0;
    }
  }

  function gesture() {
    var t = performance.now();
    if (state === 'armed') {
      if (sensor.alt > OPEN_ALT) {
        if (!sensor.upSince) sensor.upSince = t;
        if (t - sensor.upSince > OPEN_HOLD) openSky('sensor');
      } else sensor.upSince = 0;
    } else if (state === 'open' && mode === 'sensor' && !detached) {
      // Lowering closes only once the phone has been up since the last hand-back:
      // "reset position" pressed while reading must not shut the sky.
      if (sensor.alt > OPEN_ALT) sensor.closeReady = true;
      // Reading the credits means lowering the phone: that must not shut the sky.
      if (sensor.closeReady && !creditsOpen && sensor.alt < CLOSE_ALT) {
        if (!sensor.downSince) sensor.downSince = t;
        if (t - sensor.downSince > CLOSE_HOLD) closeSky(true);
      } else sensor.downSince = 0;
    }
  }

  /* --- open / close ------------------------------------------------------- */

  function openSky(m) {
    mode = m;
    state = 'open';
    detached = false;
    sensor.upSince = sensor.downSince = 0;
    sensor.closeReady = m === 'sensor';
    cam = null; sel = null; box = null; boxAlpha = 0;
    zoom = 1;                                   // every opening starts at the full view
    hintEl.textContent = HANDHELD ? 'drag to look around' : 'drag to look around · esc to close';
    lastReadout = '';
    resize();
    sky.hidden = false;
    updateFoot();
    document.documentElement.classList.add('sky-open');
    sky.getBoundingClientRect();
    sky.classList.add('is-open');
    lastFrame = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  // stayArmed: lowered the phone — raising it again reopens. Otherwise back to the start.
  function closeSky(stayArmed) {
    if (state !== 'open') return;
    state = stayArmed ? 'armed' : 'idle';
    sensor.upSince = sensor.downSince = 0;
    if (!stayArmed) {
      askText.textContent = askIdle;
      ask.classList.remove('is-armed');
    } else {
      askText.textContent = askIdle;            // seen once: the label goes quiet again
    }
    hideCredits();
    sky.classList.remove('is-open');
    document.documentElement.classList.remove('sky-open');
    setTimeout(function () {
      if (state !== 'open') { sky.hidden = true; cancelAnimationFrame(raf); }
    }, REDUCED ? 0 : 450);
  }

  closeBtn.addEventListener('click', function () { closeSky(false); });
  // Esc closes the innermost thing: the credits first, then the sky.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (creditsOpen) closeCredits(); else closeSky(false);
  });

  /* --- credits ------------------------------------------------------------ */

  function openCredits() {
    creditsOpen = true;
    credits.hidden = false;
    sensor.downSince = 0;
    creditsCloseBtn.focus();
  }
  function hideCredits() { creditsOpen = false; credits.hidden = true; }
  // Back to the sky with the phone probably still low: as after "reset position",
  // lowering only closes once the phone has been up again.
  function closeCredits() {
    if (!creditsOpen) return;
    hideCredits();
    sensor.closeReady = false;
    creditsOpenBtn.focus();
  }
  creditsOpenBtn.addEventListener('click', openCredits);
  creditsCloseBtn.addEventListener('click', closeCredits);
  credits.addEventListener('click', function (e) { if (e.target === credits) closeCredits(); });
  window.addEventListener('resize', function () { if (state === 'open') resize(); });

  /* --- 3. fingers and pointer --------------------------------------------- */

  var pointers = {}, nPointers = 0, drag = null, pinch = null, pinched = false;
  var DETACH_SLOP = 6;        // px a finger travels before it counts as a drag, not a tap

  function spread() {
    var p = Object.keys(pointers).map(function (k) { return pointers[k]; });
    return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
  }

  canvas.addEventListener('pointerdown', function (e) {
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    nPointers++;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    if (nPointers === 2) {
      pinch = { d: spread(), zoom: zoom }; drag = null; pinched = true;
    } else if (nPointers === 1) {
      pinched = false;
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: 0 };
      sky.classList.add('is-dragging');
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    var p = pointers[e.pointerId];
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pinch && nPointers >= 2) { setZoom(pinch.zoom * spread() / pinch.d); return; }
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    if (mode === 'sensor' && !detached) {
      if (!cam) return;
      drag.moved += Math.hypot(dx, dy);
      if (drag.moved < DETACH_SLOP) return;
      detach();
    }
    // grab the sky: it follows the finger, so the view turns the other way
    view.az = (view.az - 2 * dx / K / RAD + 360) % 360;
    view.alt = Math.max(-30, Math.min(90, view.alt + 2 * dy / K / RAD));
  });

  // After a pinch, the finger left on the glass does nothing until all are up:
  // fingers never leave at the same instant, and that must not read as a drag.
  function pointerGone(e) {
    if (!pointers[e.pointerId]) return;
    delete pointers[e.pointerId];
    nPointers--;
    if (nPointers < 2) pinch = null;
    if (nPointers === 0 || pinched) { drag = null; sky.classList.remove('is-dragging'); }
  }
  canvas.addEventListener('pointerup', pointerGone);
  canvas.addEventListener('pointercancel', pointerGone);
  sky.addEventListener('gesturestart', function (e) { e.preventDefault(); });   // older Safari's page zoom

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    setZoom(zoom * Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  /* The finger takes over from where the phone was pointing — same direction,
     same tilt of the horizon, which then levels itself out. */
  function detach() {
    detached = true;
    var f = cam.f, alt = Math.asin(Math.max(-1, Math.min(1, f[2]))) / RAD;
    // straight up there is no heading to read from the view: the screen's top gives it
    var az = Math.abs(f[2]) > 0.995 ? headingDeg(cam.u) - 180 : headingDeg(f);
    var level = basisFromAzAlt(az, alt, 0);
    view = { az: (az + 360) % 360, alt: Math.max(-30, alt),
             roll: Math.atan2(dot(cam.r, level.u), dot(cam.r, level.r)) / RAD };
    sensor.downSince = 0;
    updateFoot();
  }

  resetBtn.addEventListener('click', function () {
    detached = false;
    sensor.closeReady = false;
    sensor.returnUntil = performance.now() + 700;   // glide back to the phone, don't jump
    updateFoot();
  });

  /* --- the camera --------------------------------------------------------- */

  function basisFromAzAlt(az, alt, roll) {
    var a = az * RAD, h = alt * RAD;
    var f = [Math.cos(h) * Math.sin(a), Math.cos(h) * Math.cos(a), Math.sin(h)];
    var r = [Math.cos(a), -Math.sin(a), 0], u = cross(r, f);
    if (!roll) return { r: r, u: u, f: f };
    var c = Math.cos(roll * RAD), sn = Math.sin(roll * RAD);
    return { r: lin(r, c, u, sn), u: lin(r, -sn, u, c), f: f };
  }

  function updateCamera(dt) {
    if (mode === 'drag' || detached) {
      if (view.roll) view.roll = REDUCED || Math.abs(view.roll) < 0.05 ? 0 : view.roll * Math.exp(-dt / 250);
      cam = basisFromAzAlt(view.az, view.alt, view.roll);
      return;
    }
    var tg = sensor.target;
    if (!tg) return;
    // first frame, or too far apart to blend (a blend through opposite vectors spins wildly)
    if (!cam || dot(cam.f, tg.f) < 0 || dot(cam.u, tg.u) < -0.5) { cam = { r: tg.r, u: tg.u, f: tg.f }; return; }
    var returning = sensor.returnUntil && performance.now() < sensor.returnUntil;
    // sensor noise, not animation: smoothed even with reduced motion; the hand-back glide is not
    var k = returning && !REDUCED ? 1 - Math.exp(-dt / 160) : 1 - Math.exp(-dt / 70);
    var f = norm(mix(cam.f, tg.f, k)), u = mix(cam.u, tg.u, k);
    var r = norm(cross(f, u));
    cam = { r: r, u: cross(r, f), f: f };
  }

  /* --- drawing -------------------------------------------------------------- */

  var timeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: PLACE.tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  });
  var lastMinute = '';

  function frame(ts) {
    if (state !== 'open') return;
    var dt = Math.min(100, ts - lastFrame); lastFrame = ts;
    updateCamera(dt);
    if (cam) draw(dt);
    raf = requestAnimationFrame(frame);
  }

  function draw(dt) {
    var date = now();
    var M = A.j2000ToEnu(date, PLACE.lat, PLACE.lon);
    var C = A.mul([cam.r[0], cam.r[1], cam.r[2], cam.u[0], cam.u[1], cam.u[2], cam.f[0], cam.f[1], cam.f[2]], M);
    var cx = W / 2, cy = H / 2;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // J2000 vector → screen; false when it is behind you or under the horizon
    var P = { x: 0, y: 0, z: 0 };
    function projJ(v, p) {
      var Z = C[6] * v[0] + C[7] * v[1] + C[8] * v[2];
      if (Z < 0) return false;
      var s = K / (1 + Z);
      p.x = cx + (C[0] * v[0] + C[1] * v[1] + C[2] * v[2]) * s;
      p.y = cy - (C[3] * v[0] + C[4] * v[1] + C[5] * v[2]) * s;
      p.z = Z;
      return true;
    }
    function upJ(v) { return M[6] * v[0] + M[7] * v[1] + M[8] * v[2]; }
    function projE(e, p) {
      var Z = dot(e, cam.f);
      if (Z < 0) return false;
      var s = K / (1 + Z);
      p.x = cx + dot(e, cam.r) * s; p.y = cy - dot(e, cam.u) * s; p.z = Z;
      return true;
    }

    /* which constellation is in the middle of the view */
    var best = null, bestZ = Math.cos(32 * RAD), selZ = -2;
    for (var c = 0; c < CONS.length; c++) {
      var cen = CONS[c].centroid;
      if (upJ(cen) < 0.05) continue;
      var z = C[6] * cen[0] + C[7] * cen[1] + C[8] * cen[2];
      if (CONS[c] === sel) selZ = z;
      if (z > bestZ) { best = CONS[c]; bestZ = z; }
    }
    if (sel && best !== sel && selZ > bestZ - 0.01 && selZ > Math.cos(32 * RAD)) best = sel;
    sel = best;

    /* constellation lines */
    var a = { x: 0, y: 0, z: 0 }, b = { x: 0, y: 0, z: 0 };
    ctx.lineWidth = 1;
    for (var pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? COLOR.lineSel : COLOR.line;
      ctx.beginPath();
      for (c = 0; c < CONS.length; c++) {
        if (CONS[c].noLines || (CONS[c] === sel) !== !!pass) continue;
        var polys = CONS[c].polys;
        for (var q = 0; q < polys.length; q++) {
          var pts = polys[q];
          for (var j = 1; j < pts.length; j++) {
            if (upJ(pts[j - 1]) < 0 && upJ(pts[j]) < 0) continue;
            if (!projJ(pts[j - 1], a) || !projJ(pts[j], b)) continue;
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          }
        }
      }
      ctx.stroke();
    }

    /* stars */
    ctx.fillStyle = COLOR.star;
    var v3 = [0, 0, 0];
    for (i = 0; i < NS; i++) {
      v3[0] = SV[i * 3]; v3[1] = SV[i * 3 + 1]; v3[2] = SV[i * 3 + 2];
      if (upJ(v3) < 0 || !projJ(v3, P)) continue;
      if (P.x < -4 || P.x > W + 4 || P.y < -4 || P.y > H + 4) continue;
      var m = SM[i];
      var r = Math.max(0.7, (5.6 - m) * 0.5);
      ctx.globalAlpha = m < 3 ? 1 : 1 - (m - 3) * 0.27;
      ctx.beginPath(); ctx.arc(P.x, P.y, r, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* sun, moon, planets */
    var bod = A.bodies(date, PLACE.lat, PLACE.lon);
    ctx.font = '400 11px ' + MONO;
    ctx.textBaseline = 'middle';
    BODIES.forEach(function (o) {
      var e = bod[o.key].enu;
      if (e[2] < 0 || !projE(e, P)) return;
      ctx.fillStyle = COLOR.star;
      ctx.beginPath(); ctx.arc(P.x, P.y, o.r, 0, 2 * Math.PI); ctx.fill();
      label(o.key, P.x + o.r + 6, P.y, COLOR.label);
    });
    if (bod.sun.enu[2] > -0.01 && projE(bod.sun.enu, P)) {
      ctx.fillStyle = COLOR.star;
      ctx.beginPath(); ctx.arc(P.x, P.y, 8, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = 'rgba(255, 251, 243, 0.3)';
      ctx.beginPath(); ctx.arc(P.x, P.y, 13, 0, 2 * Math.PI); ctx.stroke();
      label('sun', P.x + 19, P.y, COLOR.label);
    }
    if (bod.moon.enu[2] > -0.01 && projE(bod.moon.enu, P)) {
      drawMoon(P.x, P.y, 9, bod.moon, bod.sun.enu);
      label('moon', P.x + 15, P.y, COLOR.label);
    }

    /* the ground, the horizon, the four directions */
    drawGround(cx, cy);
    var DIRS = [['north', 0], ['east', 90], ['south', 180], ['west', 270]];
    ctx.textAlign = 'center';
    for (var d = 0; d < 360; d += 45) {
      var e = [Math.sin(d * RAD), Math.cos(d * RAD), 0];
      if (!projE(e, P) || P.x < -40 || P.x > W + 40 || P.y < -20 || P.y > H + 20) continue;
      ctx.strokeStyle = COLOR.label;
      ctx.beginPath(); ctx.moveTo(P.x, P.y - 4); ctx.lineTo(P.x, P.y + 4); ctx.stroke();
      if (d % 90 === 0) label(DIRS[d / 90][0], P.x, P.y + 16, COLOR.label);
    }
    ctx.textAlign = 'left';

    /* the selection box */
    drawSelection(dt, projJ);

    readout();

    /* the time, once a minute */
    var parts = {};
    timeFmt.formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
    var minute = parts.weekday + ' ' + parts.day + ' ' + parts.month + ', ' + parts.hour + ':' + parts.minute;
    if (minute !== lastMinute) {
      lastMinute = minute;
      timeEl.textContent = minute;
    }
    var day = bod.sun.enu[2] >= -0.1;         // civil twilight and day: the stars are only on paper
    if (noteEl.hidden === day) { noteEl.hidden = !day; measureHud(); }

    if (DEBUG) debug(bod);
  }

  /* Where the view points: compass heading and how far above the horizon.
     Straight up there is no heading to read from the view, so the screen's
     top gives it. Written to the page only when a whole degree changes. */
  var POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], lastReadout = '';
  function readout() {
    var f = cam.f;
    var hdg = Math.round(Math.abs(f[2]) > 0.99 ? (headingDeg(cam.u) + 180) % 360 : headingDeg(f)) % 360;
    var alt = Math.round(Math.asin(Math.max(-1, Math.min(1, f[2]))) / RAD);
    var key = hdg + ',' + alt;
    if (key === lastReadout) return;
    lastReadout = key;
    headingEl.textContent = hdg + '° ' + POINTS[Math.round(hdg / 45) % 8];
    altEl.textContent = (alt < 0 ? '\u2212' + (-alt) : alt) + '°';
  }

  function label(text, x, y, color) {
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  /* The horizon is a great circle, and a stereographic projection draws a
     great circle as a circle. Its pole is "up": with up = (nx, ny, nz) in
     camera space the circle is centred at K·(nx, ny)/nz with radius K/|nz|.
     Looking above the horizon (nz > 0) the ground is outside it. */
  function drawGround(cx, cy) {
    var nx = cam.r[2], ny = cam.u[2], nz = cam.f[2];
    ctx.fillStyle = COLOR.ground;
    ctx.strokeStyle = COLOR.horizon;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (Math.abs(nz) < 0.004) {
      // practically a straight line through the centre: fill the half below it
      var t = norm([-ny, nx, 0]), g = norm([-nx, -ny, 0]), B = 4 * (W + H);
      var pts = [[t[0] * B, t[1] * B], [-t[0] * B, -t[1] * B], [-t[0] * B + g[0] * B, -t[1] * B + g[1] * B], [t[0] * B + g[0] * B, t[1] * B + g[1] * B]];
      ctx.moveTo(cx + pts[0][0], cy - pts[0][1]);
      for (var i = 1; i < 4; i++) ctx.lineTo(cx + pts[i][0], cy - pts[i][1]);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx + pts[0][0], cy - pts[0][1]); ctx.lineTo(cx + pts[1][0], cy - pts[1][1]); ctx.stroke();
      return;
    }
    var hx = cx + K * nx / nz, hy = cy - K * ny / nz, R = K / Math.abs(nz);
    if (nz > 0) { ctx.rect(-10, -10, W + 20, H + 20); }
    ctx.moveTo(hx + R, hy);
    ctx.arc(hx, hy, R, 0, 2 * Math.PI, nz > 0);
    ctx.fill(nz > 0 ? 'evenodd' : 'nonzero');
    ctx.beginPath(); ctx.arc(hx, hy, R, 0, 2 * Math.PI); ctx.stroke();
  }

  /* Lit side towards the sun. lit = illuminated fraction: the terminator is
     a half-ellipse 1 − 2·lit wide, bulging away from the sun past half. */
  function drawMoon(x, y, R, moon, sunEnu) {
    var m = moon.enu;
    var t = lin(sunEnu, 1, m, -dot(sunEnu, m));
    var P = { x: 0, y: 0 }, ang = 0;
    if (Math.hypot(t[0], t[1], t[2]) > 1e-6 && projEnu(norm(lin(m, 1, norm(t), 0.05)), P)) {
      ang = Math.atan2(P.y - y, P.x - x);
    }
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = COLOR.moonDark;
    ctx.strokeStyle = COLOR.horizon;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    var k = moon.lit, rx = R * Math.abs(1 - 2 * k);
    ctx.fillStyle = COLOR.star;
    ctx.beginPath();
    ctx.arc(0, 0, R, -Math.PI / 2, Math.PI / 2, false);
    if (k >= 0.5) ctx.ellipse(0, 0, rx, R, 0, Math.PI / 2, 3 * Math.PI / 2, false);
    else ctx.ellipse(0, 0, rx, R, 0, Math.PI / 2, -Math.PI / 2, true);
    ctx.fill();
    ctx.restore();
  }
  function projEnu(e, p) {
    var Z = dot(e, cam.f);
    if (Z < 0) return false;
    var s = K / (1 + Z);
    p.x = W / 2 + dot(e, cam.r) * s; p.y = H / 2 - dot(e, cam.u) * s;
    return true;
  }

  /* Figma's selection: a 2px frame, four handles, the name above the top-left
     corner and the size in a pill underneath — here in degrees of sky. The
     frame glides from one constellation to the next. */
  function drawSelection(dt, projJ) {
    var target = null;
    if (sel) {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, P = { x: 0, y: 0, z: 0 };
      sel.polys.forEach(function (pts) {
        pts.forEach(function (p) {
          if (!projJ(p, P)) return;
          x0 = Math.min(x0, P.x); y0 = Math.min(y0, P.y); x1 = Math.max(x1, P.x); y1 = Math.max(y1, P.y);
        });
      });
      if (x0 < Infinity) {
        var pad = 12;
        target = { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad, name: sel.name, heart: sel.heart,
                   dw: 4 * Math.atan((x1 - x0) / 2 / K) / RAD, dh: 4 * Math.atan((y1 - y0) / 2 / K) / RAD };
      }
    }
    var k = REDUCED ? 1 : 1 - Math.exp(-dt / 90);
    if (target) {
      if (!box || boxAlpha < 0.05) box = { x: target.x, y: target.y, w: target.w, h: target.h };
      box.x += (target.x - box.x) * k; box.y += (target.y - box.y) * k;
      box.w += (target.w - box.w) * k; box.h += (target.h - box.h) * k;
      box.name = target.name; box.heart = target.heart; box.dw = target.dw; box.dh = target.dh;
    }
    boxAlpha += ((target ? 1 : 0) - boxAlpha) * (REDUCED ? 1 : 1 - Math.exp(-dt / 120));
    if (!box || boxAlpha < 0.02) return;

    ctx.globalAlpha = boxAlpha;
    ctx.strokeStyle = COLOR.select;
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]].forEach(function (h) {
      ctx.fillStyle = COLOR.select; ctx.fillRect(h[0] - 5, h[1] - 5, 10, 10);
      ctx.fillStyle = COLOR.handle; ctx.fillRect(h[0] - 3, h[1] - 3, 6, 6);
    });

    // name, with the site's arrow pointing into the frame
    ctx.font = '400 12px ' + MONO;
    ctx.textBaseline = 'alphabetic';
    var lx = clamp(box.x, 12, W - 12 - ctx.measureText(box.name).width - 14);
    var ly = clamp(box.y - 12, hudBottom + 30, footTop - 40);
    label(box.name, lx, ly, COLOR.labelStrong);
    if (box.heart) heart(lx + ctx.measureText(box.name).width + 5, ly - 8.5, 9, COLOR.heart);
    else arrowDown(lx + ctx.measureText(box.name).width + 5, ly - 8.5, 8.5, COLOR.labelStrong);

    // size pill
    var size = deg(box.dw) + ' × ' + deg(box.dh);
    ctx.font = '400 11px ' + MONO;
    var tw = ctx.measureText(size).width, pw = tw + 12, ph = 18;
    var px = clamp(box.x + box.w / 2 - pw / 2, 12, W - 12 - pw), py = clamp(box.y + box.h + 8, hudBottom + 42, footTop - 30);
    ctx.fillStyle = COLOR.select;
    roundRect(px, py, pw, ph, 3); ctx.fill();
    ctx.textBaseline = 'middle';
    label(size, px + 6, py + ph / 2 + 0.5, COLOR.handle);
    ctx.globalAlpha = 1;
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  // whole degrees, one decimal under ten (the Pleiades are 2° × 1°)
  function deg(d) { return (d < 9.95 ? d.toFixed(1) : Math.round(d)) + '°'; }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // The site's #arrow (M3 9 9 3 M4.5 3H9v4.5 on a 12-unit grid), flipped like .arrow--down
  function arrowDown(x, y, s, color) {
    var u = s / 12;
    ctx.save();
    ctx.translate(x, y + s); ctx.scale(u, -u);
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(3, 9); ctx.lineTo(9, 3); ctx.moveTo(4.5, 3); ctx.lineTo(9, 3); ctx.lineTo(9, 7.5); ctx.stroke();
    ctx.restore();
  }

  // A heart in the arrow's place, drawn on the same 12-unit grid.
  function heart(x, y, s, color) {
    var u = s / 12;
    ctx.save();
    ctx.translate(x, y); ctx.scale(u, u);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(6, 10.5);
    ctx.bezierCurveTo(2.5, 8, 0.5, 6, 0.5, 3.8);
    ctx.bezierCurveTo(0.5, 2, 1.9, 0.8, 3.4, 0.8);
    ctx.bezierCurveTo(4.6, 0.8, 5.5, 1.5, 6, 2.5);
    ctx.bezierCurveTo(6.5, 1.5, 7.4, 0.8, 8.6, 0.8);
    ctx.bezierCurveTo(10.1, 0.8, 11.5, 2, 11.5, 3.8);
    ctx.bezierCurveTo(11.5, 6, 9.5, 8, 6, 10.5);
    ctx.fill();
    ctx.restore();
  }

  function debug(bod) {
    var f = cam.f, lines = [
      'mode ' + mode + (detached ? ' · finger' : '') + (sensor.absolute ? ' · absolute' : '') + ' · zoom ' + zoom.toFixed(1),
      'view az ' + headingDeg(f).toFixed(1) + ' alt ' + (Math.asin(f[2]) / RAD).toFixed(1),
      sensor.raw ? 'α ' + sensor.raw[0].toFixed(1) + ' β ' + sensor.raw[1].toFixed(1) + ' γ ' + sensor.raw[2].toFixed(1) : 'no sensor',
      'compass ' + (sensor.wch != null ? sensor.wch.toFixed(1) : '–') + ' offset ' + (sensor.offset != null ? sensor.offset.toFixed(1) : '–') + (sensor.rejected ? ' · rejected ' + sensor.rejected : ''),
      'screen ' + screenAngle() + '° · sun alt ' + (Math.asin(bod.sun.enu[2]) / RAD).toFixed(1),
      'selected ' + (sel ? sel.name : '–')
    ];
    debugEl.textContent = lines.join('\n');
  }

  // Canvas text needs the font loaded before the first frame draws with it.
  if (document.fonts && document.fonts.load) document.fonts.load('12px "Roboto Mono"');
})();
