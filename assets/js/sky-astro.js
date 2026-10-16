/* Francesco Lauriola — "looking up": where things are in the sky
 *
 * Low precision on purpose: everything here is good to a fraction of a
 * degree, far finer than a phone compass (±5–10°) can show.
 *
 *   Stars    J2000 catalogue, precessed to the date (0.36° by 2026)
 *   Planets  JPL's Keplerian elements, table 1 (E. M. Standish), valid 1800–2050
 *            https://ssd.jpl.nasa.gov/planets/approx_pos.html
 *   Sun      the Earth's orbit from the same table, seen from the other side
 *   Moon     P. Schlyter's method, "How to compute planetary positions",
 *            main perturbations included, plus parallax
 *            https://stjarnhimlen.se/comp/ppcomp.html
 *   Precession and sidereal time: the standard IAU 1976 / Meeus expressions
 *
 * Methods and published coefficients only; the code is written from scratch.
 *
 * All vectors are unit vectors in J2000 equatorial coordinates unless named
 * otherwise. ENU = local East, North, Up.
 */
(function (root) {
  'use strict';

  var RAD = Math.PI / 180;
  var OBLIQ_J2000 = 23.43928 * RAD;

  function mod(a, b) { return ((a % b) + b) % b; }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  function daysSinceJ2000(date) { return date.getTime() / 86400000 + 2440587.5 - 2451545.0; }

  function eqVec(raDeg, decDeg) {
    var a = raDeg * RAD, d = decDeg * RAD, c = Math.cos(d);
    return [c * Math.cos(a), c * Math.sin(a), Math.sin(d)];
  }

  function toRaDec(v) {
    return { ra: mod(Math.atan2(v[1], v[0]) / RAD, 360), dec: Math.asin(v[2]) / RAD };
  }

  // 3×3 matrices as flat row-major arrays
  function mul(A, B) {
    var C = new Array(9);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
      C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    }
    return C;
  }
  function apply(M, v) {
    return [M[0] * v[0] + M[1] * v[1] + M[2] * v[2],
            M[3] * v[0] + M[4] * v[1] + M[5] * v[2],
            M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
  }
  function transpose(M) { return [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]]; }

  /* J2000 → equator and equinox of date (IAU 1976, leading terms). */
  function precession(date) {
    var T = daysSinceJ2000(date) / 36525;
    var zeta = 2306.2181 * T / 3600 * RAD, z = 2306.2181 * T / 3600 * RAD, th = 2004.3109 * T / 3600 * RAD;
    var cz = Math.cos(zeta), sz = Math.sin(zeta), cZ = Math.cos(z), sZ = Math.sin(z), ct = Math.cos(th), st = Math.sin(th);
    return [
      cz * cZ * ct - sz * sZ, -sz * cZ * ct - cz * sZ, -cZ * st,
      cz * sZ * ct + sz * cZ, -sz * sZ * ct + cz * cZ, -sZ * st,
      cz * st,                -sz * st,                 ct
    ];
  }

  /* Greenwich mean sidereal time + longitude, degrees. */
  function localSiderealTime(date, lonDeg) {
    return mod(280.46061837 + 360.98564736629 * daysSinceJ2000(date) + lonDeg, 360);
  }

  /* Equatorial of date → ENU at a place. */
  function eqDateToEnu(date, latDeg, lonDeg) {
    var L = localSiderealTime(date, lonDeg) * RAD, p = latDeg * RAD;
    var sL = Math.sin(L), cL = Math.cos(L), sp = Math.sin(p), cp = Math.cos(p);
    return [
      -sL,       cL,       0,
      -sp * cL, -sp * sL,  cp,
       cp * cL,  cp * sL,  sp
    ];
  }

  /* The one matrix the renderer needs: J2000 catalogue vector → ENU. */
  function j2000ToEnu(date, latDeg, lonDeg) {
    return mul(eqDateToEnu(date, latDeg, lonDeg), precession(date));
  }

  /* --- planets ------------------------------------------------------------
     [a, ȧ, e, ė, I, İ, L, L̇, ϖ, ϖ̇, Ω, Ω̇] — AU and degrees, rates per century. */
  var ELEMENTS = {
    mercury: [0.38709927, 0.00000037, 0.20563593, 0.00001906, 7.00497902, -0.00594749, 252.25032350, 149472.67411175, 77.45779628, 0.16047689, 48.33076593, -0.12534081],
    venus:   [0.72333566, 0.00000390, 0.00677672, -0.00004107, 3.39467605, -0.00078890, 181.97909950, 58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418],
    earth:   [1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0, 0],
    mars:    [1.52371034, 0.00001847, 0.09339410, 0.00007882, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343],
    jupiter: [5.20288700, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714, 34.39644051, 3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106],
    saturn:  [9.53667594, -0.00125060, 0.05386179, -0.00050991, 2.48599187, 0.00193609, 49.95424423, 1222.49362201, 92.59887831, -0.41897216, 113.66242448, -0.28867794]
  };

  // Heliocentric position, J2000 ecliptic, AU.
  function helio(el, T) {
    var a = el[0] + el[1] * T, e = el[2] + el[3] * T, I = (el[4] + el[5] * T) * RAD;
    var L = el[6] + el[7] * T, peri = el[8] + el[9] * T, node = el[10] + el[11] * T;
    var w = (peri - node) * RAD, O = node * RAD;
    var M = (mod(L - peri + 180, 360) - 180) * RAD;
    var E = M + e * Math.sin(M);
    for (var k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    var xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    var cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
    return [
      (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
      (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
      (sw * sI) * xp + (cw * sI) * yp
    ];
  }

  function eclToEq(v, eps) {
    var c = Math.cos(eps), s = Math.sin(eps);
    return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]];
  }

  /* Sun and planets, geocentric J2000 unit vectors (+ distance in AU). */
  function planets(date) {
    var T = daysSinceJ2000(date) / 36525;
    var earth = helio(ELEMENTS.earth, T);
    var out = { sun: { v: norm(eclToEq([-earth[0], -earth[1], -earth[2]], OBLIQ_J2000)) } };
    ['mercury', 'venus', 'mars', 'jupiter', 'saturn'].forEach(function (name) {
      var p = helio(ELEMENTS[name], T);
      var g = [p[0] - earth[0], p[1] - earth[1], p[2] - earth[2]];
      out[name] = { v: norm(eclToEq(g, OBLIQ_J2000)), dist: Math.hypot(g[0], g[1], g[2]) };
    });
    return out;
  }

  /* --- moon -----------------------------------------------------------------
     Schlyter, "How to compute planetary positions": ecliptic of date.
     Returns the geocentric J2000 unit vector and the distance in Earth radii. */
  function moon(date) {
    var d = daysSinceJ2000(date) + 1.5;            // Schlyter counts from 2000 Jan 0.0
    var N = (125.1228 - 0.0529538083 * d) * RAD;
    var i = 5.1454 * RAD;
    var w = (318.0634 + 0.1643573223 * d) * RAD;
    var a = 60.2666, e = 0.054900;
    var M = mod(115.3654 + 13.0649929509 * d, 360) * RAD;
    var E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
    for (var k = 0; k < 6; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    var xv = a * (Math.cos(E) - e), yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
    var v = Math.atan2(yv, xv), r = Math.hypot(xv, yv);
    var xh = r * (Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i));
    var yh = r * (Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i));
    var zh = r * (Math.sin(v + w) * Math.sin(i));
    var lon = Math.atan2(yh, xh) / RAD, lat = Math.atan2(zh, Math.hypot(xh, yh)) / RAD;

    // perturbations, degrees
    var Ms = mod(356.0470 + 0.9856002585 * d, 360);
    var ws = 282.9404 + 4.70935e-5 * d;
    var Ls = Ms + ws, Mm = M / RAD, Lm = N / RAD + w / RAD + Mm;
    var D = Lm - Ls, F = Lm - N / RAD;
    function s(x) { return Math.sin(x * RAD); }
    function c(x) { return Math.cos(x * RAD); }
    lon += -1.274 * s(Mm - 2 * D) + 0.658 * s(2 * D) - 0.186 * s(Ms)
           - 0.059 * s(2 * Mm - 2 * D) - 0.057 * s(Mm - 2 * D + Ms) + 0.053 * s(Mm + 2 * D)
           + 0.046 * s(2 * D - Ms) + 0.041 * s(Mm - Ms) - 0.035 * s(D)
           - 0.031 * s(Mm + Ms) - 0.015 * s(2 * F - 2 * D) + 0.011 * s(Mm - 4 * D);
    lat += -0.173 * s(F - 2 * D) - 0.055 * s(Mm - F - 2 * D) - 0.046 * s(Mm + F - 2 * D)
           + 0.033 * s(F + 2 * D) + 0.017 * s(2 * Mm + F);
    r += -0.58 * c(Mm - 2 * D) - 0.46 * c(2 * D);

    var eps = (23.4393 - 3.563e-7 * d) * RAD;
    var cb = Math.cos(lat * RAD);
    var ofDate = eclToEq([cb * Math.cos(lon * RAD), cb * Math.sin(lon * RAD), Math.sin(lat * RAD)], eps);
    return { v: norm(apply(transpose(precession(date)), ofDate)), dist: r };
  }

  /* Everything that moves, for one moment at one place. Vectors are ENU.
     The moon is shifted for parallax (up to 1° near the horizon). */
  function bodies(date, latDeg, lonDeg) {
    var M = j2000ToEnu(date, latDeg, lonDeg);
    var p = planets(date), m = moon(date), out = {};
    Object.keys(p).forEach(function (k) { out[k] = { enu: apply(M, p[k].v) }; });
    var g = apply(M, m.v);
    var topo = norm([g[0] * m.dist, g[1] * m.dist, g[2] * m.dist - 1]);
    // illuminated fraction from the geocentric elongation
    var cosElong = dot(m.v, p.sun.v);
    out.moon = { enu: topo, lit: (1 - cosElong) / 2, waxing: isWaxing(m.v, p.sun.v) };
    return out;
  }

  // Waxing when the moon is east of the sun along the ecliptic.
  function isWaxing(moonV, sunV) {
    var e = OBLIQ_J2000, toEcl = [1, 0, 0, 0, Math.cos(e), Math.sin(e), 0, -Math.sin(e), Math.cos(e)];
    var a = apply(toEcl, moonV), b = apply(toEcl, sunV);
    return mod(Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]), 2 * Math.PI) < Math.PI;
  }

  root.SkyAstro = {
    RAD: RAD, eqVec: eqVec, toRaDec: toRaDec, apply: apply, mul: mul,
    precession: precession, localSiderealTime: localSiderealTime,
    j2000ToEnu: j2000ToEnu, planets: planets, moon: moon, bodies: bodies
  };
})(typeof window !== 'undefined' ? window : this);
