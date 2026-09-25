/*
 * Original SVG placeholder illustrations of ball pythons.
 *
 * A snake is built from a centreline (a snug coil plus a neck that either
 * rests the head on top of the coil or lets it peek out to the side). The
 * centreline is turned into a tapered body outline, and every layer —
 * pattern, belly edge, shading, scale texture — is generated along it and
 * clipped to the body. Colours and pattern style come from each visual gene's
 * `art` data (see SB.NORMAL_ART), so new morphs get artwork automatically and
 * combinations like "Pastel Clown" stack naturally.
 *
 * Pipeline: lookFor (gene palette: sets, then tint ops in gene order) →
 * resolveStyle (winning layout, body fill, reduction, GHI darkening) → layers
 * (flame washes, pattern layout, overlays, pied/ringer, shading) and the head.
 * README.md lists every style flag and tint op.
 */
(function (SB) {
  'use strict';

  var art = {};
  var cache = {}, cacheKeys = [];

  /* ---------- Small helpers ---------- */

  function hashString(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* Deterministic PRNG so each snake always looks the same. */
  function seeded(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rgb(c) {
    c = c.replace('#', '');
    if (c.length === 3) c = c.split('').map(function (x) { return x + x; }).join('');
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  }
  function hex(v) {
    return '#' + v.map(function (x) { var h = Math.round(Math.max(0, Math.min(255, x))).toString(16); return h.length < 2 ? '0' + h : h; }).join('');
  }
  function mix(a, b, t) {
    var x = rgb(a), y = rgb(b);
    return hex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; }));
  }
  function lighten(c, t) { return mix(c, '#ffffff', t); }
  function darken(c, t) { return mix(c, '#000000', t); }
  art.mix = mix;

  /* Perceived brightness (0..255), used to pull colours toward grey. */
  function luma(x) { return x[0] * 0.3 + x[1] * 0.59 + x[2] * 0.11; }
  function desaturate(c, t) { var x = rgb(c), g = luma(x); return hex(x.map(function (v) { return v + (g - v) * t; })); }
  function saturate(c, t) { var x = rgb(c), g = luma(x); return hex(x.map(function (v) { return v + (v - g) * t; })); }
  function toHsl(c) {
    var x = rgb(c).map(function (v) { return v / 255; });
    var mx = Math.max(x[0], x[1], x[2]), mn = Math.min(x[0], x[1], x[2]), l = (mx + mn) / 2, d = mx - mn, h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      h = mx === x[0] ? ((x[1] - x[2]) / d) % 6 : mx === x[1] ? (x[2] - x[0]) / d + 2 : (x[0] - x[1]) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function fromHsl(h, s, l) {
    var c = (1 - Math.abs(2 * l - 1)) * s, hp = (((h % 360) + 360) % 360) / 60;
    var x = c * (1 - Math.abs(hp % 2 - 1)), m = l - c / 2;
    var v = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
    return hex(v.map(function (u) { return (u + m) * 255; }));
  }
  function hueShift(c, deg) { var q = toHsl(c); return fromHsl(q[0] + deg, q[1], q[2]); }
  /* Warm/cool casts; dark colours shift less so a black base doesn't turn red or blue. */
  function warm(c, t) { var x = rgb(c), k = t * (0.35 + 0.65 * luma(x) / 255); return hex([x[0] + 70 * k, x[1] + 14 * k, x[2] - 60 * k]); }
  function cool(c, t) { var x = rgb(c), k = t * (0.35 + 0.65 * luma(x) / 255); return hex([x[0] - 50 * k, x[1] + 4 * k, x[2] + 60 * k]); }

  /* ---------- Tint ops ---------- */

  /*
   * A gene's `tint` maps a palette slot to an op, or to a list of ops applied in
   * order, e.g. { base: ['lighten', 0.2] } or { all: [['desaturate', 0.8], ['cool', 0.2]] }.
   * Ops (t is 0..1 unless noted):
   *   ['lighten', t]  ['darken', t]  ['mix', '#hex', t]
   *   ['desaturate', t] toward grey/silver    ['saturate', t] richer colour
   *   ['hue', degrees] rotate the hue         ['warm', t] / ['cool', t] orange or blue cast
   */
  var TINTS = {
    lighten: lighten, darken: darken, desaturate: desaturate, saturate: saturate,
    mix: function (c, to, t) { return mix(c, to, t); },
    hue: hueShift, warm: warm, cool: cool
  };
  var SLOTS = ['base', 'pattern', 'belly', 'spot', 'edge', 'head', 'headWash']; // `all` (never the eye)

  function tintColor(c, op) {
    if (!c || !op) return c;
    if (Array.isArray(op[0])) return op.reduce(tintColor, c);
    var fn = TINTS[op[0]];
    return fn ? fn(c, op[1], op[2]) : c;
  }
  art.tint = tintColor;
  art.TINT_OPS = Object.keys(TINTS);

  /*
   * Apply one gene's tint to the palette. A tint aimed at a derived slot (spot,
   * head, headWash) that no gene has set first fills it from the current palette;
   * a removed edge (null) stays removed. `all` only touches slots already present,
   * so derived slots are still derived from the final, tinted colours.
   */
  function applyTint(look, tint, flags) {
    Object.keys(tint).forEach(function (k) {
      (k === 'all' ? SLOTS : [k]).forEach(function (key) {
        if (!look[key] && k !== 'all') look[key] = derived(look, key, flags);
        if (look[key]) look[key] = tintColor(look[key], tint[k]);
      });
    });
  }
  function derived(look, key, flags) {
    if (key === 'spot') return darken(look.base, 0.35);
    if (key === 'head') return defaultHead(look, flags);
    if (key === 'headWash') return mix(look.pattern, '#f2c94c', 0.3);
    return null;
  }

  /* Style flags from a gene form: one name or a list, e.g. 'spider' or ['enchi', 'blushed']. */
  function addStyles(flags, style) {
    [].concat(style).forEach(function (s) { if (s) flags[s === 'tail' ? 'ringer' : s] = true; });
  }

  function f1(n) { return (Math.round(n * 10) / 10).toString(); }
  function pathFrom(pts, close) {
    var d = '';
    for (var i = 0; i < pts.length; i++) d += (i ? 'L' : 'M') + f1(pts[i][0]) + ' ' + f1(pts[i][1]);
    return d + (close ? 'Z' : '');
  }
  function smooth(t) { return t * t * (3 - 2 * t); }

  /* ---------- Colours from genes ---------- */

  art.lookFor = function (genotype) {
    var look = Object.assign({}, SB.NORMAL_ART);
    var flags = {};
    var tints = [];
    SB.GENES.forEach(function (gene) {
      var cls = SB.genetics.visualClass(gene, genotype[gene.id] || 0);
      if (cls === 'none' || !gene.art) return;
      var mod = gene.art[cls] || gene.art.visual;
      if (!mod) return;
      if (mod.set) Object.keys(mod.set).forEach(function (k) { look[k] = mod.set[k]; });
      if (mod.style) addStyles(flags, mod.style);
      if (mod.tint) tints.push(mod.tint);
    });
    tints.forEach(function (tint) { applyTint(look, tint, flags); });
    if (!look.spot) look.spot = darken(look.base, 0.35);
    if (!look.head) look.head = defaultHead(look, flags);
    look.flags = flags;
    return look;
  };

  /* ---------- Styles ---------- */

  /*
   * Style flags come in two kinds.
   *
   * Layouts decide the body's base pattern. Only one can draw, so when genes
   * disagree the first match in LAYOUTS wins (most pattern-erasing first):
   *   plain > patternless > ivory > clown > stripe > champagne > spider > pin > banded > granite > classic
   * e.g. Spider Clown draws the clown stripe, Spinner (spider + pin) draws spider webbing.
   *
   * Modifiers stack on top of whichever layout won:
   *   reducers (reduced, dinker, spider, pin, champagne, enchi) add up to `look.reduce`,
   *     thinning stripes/webs and shrinking eyespots, so a losing layout still counts;
   *   enchi, reduced, dinker, keyhole, cleanSides, aberrant reshape blotches (classic,
   *     granite and banded; aberrant also breaks stripes and webs);
   *   flames, blushed, ghi, leopard, speckledHead, pied, ringer are washes and overlays.
   * plain and patternless suppress every pattern overlay except pied and ringer
   * (and keep colour washes on patternless); ivory keeps washes only.
   */
  var LAYOUTS = ['plain', 'patternless', 'ivory', 'clown', 'stripe', 'champagne', 'spider', 'pin', 'banded', 'granite'];
  function layoutOf(flags) {
    for (var j = 0; j < LAYOUTS.length; j++) if (flags[LAYOUTS[j]]) return LAYOUTS[j];
    return 'classic';
  }

  /* The colour the body is filled with before any pattern is drawn. */
  function bodyFillFor(look, flags) {
    var lay = layoutOf(flags);
    if (lay === 'clown' || lay === 'stripe' || lay === 'spider') return look.pattern;
    if (lay === 'patternless') return mix(look.base, look.pattern, 0.32); // ground colour, warmed by the lost pattern
    if (lay === 'champagne') return mix(lighten(look.pattern, 0.12), look.base, 0.24);
    // Reduced/dinker: lighter, muddier "alien heads" between the blotches.
    var lift = (flags.reduced ? 0.3 : 0) + (flags.dinker ? 0.14 : 0);
    return lift && lay !== 'plain' && lay !== 'ivory' ? mix(look.base, look.pattern, lift) : look.base;
  }

  function defaultHead(look, flags) {
    var lay = layoutOf(flags);
    if (lay === 'clown' || lay === 'patternless' || lay === 'champagne') return bodyFillFor(look, flags);
    if (lay === 'spider') return lighten(look.pattern, 0.3); // bright spider head
    return bodyFillFor(look, flags) === look.base ? look.base : mix(look.base, look.pattern, 0.2);
  }

  /*
   * Everything the drawing code needs beyond the gene palette: the winning layout,
   * the body fill, how reduced the pattern is, and GHI's palette-wide darkening.
   * Works on a copy so lookFor's result stays the plain gene palette.
   */
  function resolveStyle(look0) {
    var look = Object.assign({}, look0), F = look.flags;
    look.layout = layoutOf(F);
    look.reduce = Math.min(0.9, (F.reduced ? 0.35 : 0) + (F.dinker ? 0.25 : 0) + (F.spider ? 0.45 : 0) +
      (F.pin ? 0.35 : 0) + (F.champagne ? 0.5 : 0) + (F.enchi ? 0.15 : 0));
    if (F.ghi && look.layout !== 'plain') {
      // GHI: a heavy, smoky darkening of the ground colour and a muted pattern.
      look.base = darken(look.base, 0.45);
      look.pattern = desaturate(mix(look.pattern, look.base, 0.28), 0.25);
      look.spot = darken(look.spot, 0.4);
      look.head = darken(look.head, 0.35);
      if (look.edge) look.edge = mix(look.edge, look.pattern, 0.5);
    }
    look.fill = bodyFillFor(look, F);
    return look;
  }
  art.resolveStyle = resolveStyle;
  art.LAYOUTS = LAYOUTS.concat('classic');

  /* ---------- Geometry ---------- */

  /* Turn a list of points into frames: tangents, normals, arc length and half-widths. */
  function frames(pts, widths) {
    var n = pts.length, T = [], N = [], s = [0], w = widths;
    for (var i = 0; i < n; i++) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      T.push([dx / len, dy / len]);
      N.push([-dy / len, dx / len]);
      if (i) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    return { P: pts, T: T, N: N, s: s, w: w, n: n };
  }

  function at(fr, i, off) { return [fr.P[i][0] + fr.N[i][0] * off, fr.P[i][1] + fr.N[i][1] * off]; }

  /* Closed band between offsets fa(i) and fb(i) (in half-widths) over indices i0..i1. */
  function band(fr, fa, fb, i0, i1) {
    i0 = i0 == null ? 0 : i0; i1 = i1 == null ? fr.n - 1 : i1;
    var left = [], right = [];
    for (var i = i0; i <= i1; i++) {
      left.push(at(fr, i, fb(i) * fr.w[i]));
      right.push(at(fr, i, fa(i) * fr.w[i]));
    }
    return pathFrom(left.concat(right.reverse()), true);
  }
  function outline(fr) { return band(fr, function () { return -1; }, function () { return 1; }); }

  function indexAtLength(fr, len) {
    for (var i = 1; i < fr.n; i++) if (fr.s[i] >= len) return i;
    return fr.n - 1;
  }

  function buildPose(rand, juvenile) {
    var cx = 100, cy = 90;
    var maxW = juvenile ? 8.2 : 11;
    var r0 = 8, r1 = juvenile ? 50 : 62;
    var turns = 1.62 + rand() * 0.22;
    var squash = 0.78;
    var dir = rand() < 0.5 ? 1 : -1;
    var start = rand() * Math.PI * 2;
    var coil = [];
    var steps = 100;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var th = start + dir * t * turns * Math.PI * 2;
      var r = r0 + (r1 - r0) * Math.pow(t, 0.92);
      coil.push([cx + Math.cos(th) * r, cy + Math.sin(th) * r * squash]);
    }
    var widths = coil.map(function (_, i) {
      var t = i / steps;
      if (t < 0.4) return maxW * (0.06 + 0.94 * smooth(t / 0.4));
      if (t > 0.9) return maxW * (1 - 0.14 * smooth((t - 0.9) / 0.1));
      return maxW;
    });

    // Neck: a bezier from the coil's end to where the head rests.
    var E = coil[steps];
    var TE = [E[0] - coil[steps - 1][0], E[1] - coil[steps - 1][1]];
    var tl = Math.hypot(TE[0], TE[1]) || 1; TE = [TE[0] / tl, TE[1] / tl];
    var headOnTop = rand() < 0.62;
    var H, C1, C2;
    if (headOnTop) {
      H = [cx + (rand() - 0.5) * 16, cy - 6 + (rand() - 0.5) * 10];
      var toH = [H[0] - E[0], H[1] - E[1]], d = Math.hypot(toH[0], toH[1]) || 1;
      var bend = dir * (0.5 + rand() * 0.3);
      var hd = [toH[0] / d, toH[1] / d];
      hd = [hd[0] * Math.cos(bend) - hd[1] * Math.sin(bend), hd[0] * Math.sin(bend) + hd[1] * Math.cos(bend)];
      C1 = [E[0] + TE[0] * 24, E[1] + TE[1] * 24];
      C2 = [H[0] - hd[0] * 20, H[1] - hd[1] * 20];
    } else {
      var ang = dir * (0.55 + rand() * 0.4);
      var od = [TE[0] * Math.cos(ang) - TE[1] * Math.sin(ang), TE[0] * Math.sin(ang) + TE[1] * Math.cos(ang)];
      H = [E[0] + od[0] * 34, E[1] + od[1] * 34];
      H[0] = Math.max(34, Math.min(166, H[0])); H[1] = Math.max(36, Math.min(146, H[1]));
      C1 = [E[0] + TE[0] * 14, E[1] + TE[1] * 14];
      C2 = [H[0] - od[0] * 12, H[1] - od[1] * 12];
    }
    var pts = coil.slice(), neckN = 26;
    for (var k = 1; k <= neckN; k++) {
      var u = k / neckN, v = 1 - u;
      pts.push([
        v * v * v * E[0] + 3 * v * v * u * C1[0] + 3 * v * u * u * C2[0] + u * u * u * H[0],
        v * v * v * E[1] + 3 * v * v * u * C1[1] + 3 * v * u * u * C2[1] + u * u * u * H[1]
      ]);
      widths.push(maxW * (0.86 - 0.22 * u));
    }
    // When the head rests on top, the neck crosses the coil, so it is drawn as a
    // second piece (split just after the coil) layered above the first.
    return { fr: frames(pts, widths), split: headOnTop ? steps + 2 : null, maxW: maxW };
  }

  /* ---------- Body layers ---------- */

  var LIGHT = [0.3, 0.95]; // light from above: shadows fall on the lower edge

  /*
   * Layers are lists of items. An item is either { i, svg } — a mark anchored at
   * centreline index i — or { band: fn(i0, i1) } — a strip along the body.
   * Rendering a piece keeps only what belongs to its index range, so where the
   * neck crosses the coil it never shows the coil's markings underneath.
   */
  function mark(i, svg) { return { i: i, svg: svg }; }
  function strip(fn) { return { band: fn }; }
  function renderItems(items, i0, i1) {
    var out = '';
    items.forEach(function (it) {
      if (it.band) out += it.band(i0, i1);
      else if (it.i >= i0 - 3 && it.i <= i1 + 3) out += it.svg;
    });
    return out;
  }
  /* Rotation that follows the body at index i, plus an optional extra tilt in degrees. */
  function rot(fr, i, c, tilt) {
    return ' transform="rotate(' + f1(Math.atan2(fr.T[i][1], fr.T[i][0]) * 180 / Math.PI + (tilt || 0)) + ' ' + f1(c[0]) + ' ' + f1(c[1]) + ')"';
  }
  function ell(c, rx, ry, fill, extra) {
    return '<ellipse cx="' + f1(c[0]) + '" cy="' + f1(c[1]) + '" rx="' + f1(rx) + '" ry="' + f1(ry) + '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function k(v) { return function () { return v; }; }
  function pt(p) { return f1(p[0]) + ' ' + f1(p[1]); }

  /* Point at arc length `len`, offset by f half-widths, interpolated between samples. */
  function atLen(fr, len, f) {
    len = Math.max(0, Math.min(fr.s[fr.n - 1], len));
    var i = indexAtLength(fr, len), j = Math.max(0, i - 1);
    var seg = fr.s[i] - fr.s[j], u = seg > 0 ? (len - fr.s[j]) / seg : 0;
    function lp(a, b) { return a + (b - a) * u; }
    var off = lp(fr.w[j], fr.w[i]) * f;
    return [lp(fr.P[j][0], fr.P[i][0]) + lp(fr.N[j][0], fr.N[i][0]) * off, lp(fr.P[j][1], fr.P[i][1]) + lp(fr.N[j][1], fr.N[i][1]) * off];
  }

  /* A strip drawn only over the given [from, to] arc-length ranges (broken stripes). */
  function segStrip(fr, ranges, fa, fb, fill) {
    var idx = ranges.map(function (r) { return [indexAtLength(fr, r[0]), indexAtLength(fr, r[1])]; });
    return strip(function (i0, i1) {
      var out = '';
      idx.forEach(function (r) {
        var a = Math.max(r[0], i0), b = Math.min(r[1], i1);
        if (b - a < 1) return;
        out += '<path d="' + band(fr, fa, fb, a, b) + '" fill="' + fill + '"/>';
        // Rounded ends where the run starts and stops.
        [r[0], r[1]].forEach(function (e) {
          if (e < i0 || e > i1 || e <= 0 || e >= fr.n - 1) return;
          var h = (fb(e) - fa(e)) / 2, p = at(fr, e, (fa(e) + fb(e)) / 2 * fr.w[e]);
          out += ell(p, Math.abs(h) * fr.w[e] * 1.2, Math.abs(h) * fr.w[e], fill, rot(fr, e, p));
        });
      });
      return out;
    });
  }
  /* Random on/off runs along the body, in multiples of the blotch spacing. */
  function brokenRanges(c, on, off) {
    var out = [], p = 0;
    while (p < c.total) {
      var len = c.spacing * (on[0] + c.r2() * (on[1] - on[0]));
      out.push([p, p + len]);
      p += len + c.spacing * (off[0] + c.r2() * (off[1] - off[0]));
    }
    return out;
  }

  /*
   * Pattern layouts. Each takes the drawing context
   *   c = { fr, look, F (flags), rand, r2, maxW, spacing, total }
   * and returns layer items. `rand` is the pose/pattern stream shared with the
   * original styles (so existing morphs keep their exact look); `r2` is a second
   * stream for everything the newer styles add.
   */
  var DRAW = {};

  DRAW.plain = function (c) {
    // Leucistic: almost patternless, a faint mottling only.
    var fr = c.fr, items = [];
    for (var p = c.spacing * 0.7; p < c.total; p += c.spacing * 1.6) {
      var ip = indexAtLength(fr, p);
      items.push(mark(ip, ell(at(fr, ip, 0), fr.w[ip] * 0.9, fr.w[ip] * 0.5, c.look.pattern, ' opacity=".5"')));
    }
    return items;
  };

  DRAW.patternless = function (c) {
    // Solid colour; only a faint darker spine keeps the body from looking flat.
    return [strip(function (i0, i1) {
      return '<path d="' + band(c.fr, k(-0.32), k(0.32), i0, i1) + '" fill="' + darken(c.look.fill, 0.18) + '" opacity=".16"/>';
    })];
  };

  DRAW.ivory = function (c) {
    return [strip(function (i0, i1) {
      return '<path d="' + band(c.fr, k(-0.22), k(0.22), i0, i1) + '" fill="' + mix(c.look.pattern, '#f2c94c', 0.35) + '" opacity=".75"/>';
    })];
  };

  DRAW.clown = function (c) {
    // Clean sides with a bold, slightly wavy dark dorsal stripe and a few side ticks.
    // Reducers (spider, pin, lesser...) thin the stripe and drop the ticks; aberrant breaks it.
    var fr = c.fr, items = [], rand = c.rand;
    var stripe = darken(c.look.base, 0.05), sw = 0.24 * (1 - 0.5 * c.look.reduce);
    var fa = function (i) { return -(sw + 0.07 * Math.sin(fr.s[i] / 5)); }, fb = function (i) { return sw + 0.07 * Math.cos(fr.s[i] / 6); };
    items.push(c.F.aberrant ? segStrip(fr, brokenRanges(c, [0.8, 2.2], [0.3, 0.7]), fa, fb, stripe) : strip(function (i0, i1) {
      return '<path d="' + band(fr, fa, fb, i0, i1) + '" fill="' + stripe + '"/>';
    }));
    for (var t = c.spacing; t < c.total; t += c.spacing * 2.4) {
      var ic = indexAtLength(fr, t), side = rand() < 0.5 ? 1 : -1, pc = at(fr, ic, side * fr.w[ic] * 0.72);
      if (c.look.reduce < 0.3) items.push(mark(ic, ell(pc, fr.w[ic] * 0.32, fr.w[ic] * 0.2, stripe, ' opacity=".75"' + rot(fr, ic, pc))));
    }
    return items;
  };

  DRAW.stripe = function (c) {
    // Genetic stripe: a dead-straight, near-black spine stripe with pale edging and
    // completely clean sides (clown's stripe is wavy, softer and has side ticks).
    var fr = c.fr, look = c.look, sw = 0.28 * (1 - 0.4 * look.reduce);
    var ranges = c.F.aberrant ? brokenRanges(c, [1.2, 3], [0.2, 0.45]) : [[0, c.total]];
    var items = [
      segStrip(fr, ranges, k(-(sw + 0.09)), k(sw + 0.09), lighten(look.pattern, 0.5)),
      segStrip(fr, ranges, k(-sw), k(sw), darken(look.base, 0.2))
    ];
    // A faint lateral line low on each flank.
    items.push(strip(function (i0, i1) {
      return [1, -1].map(function (s) {
        return '<path d="' + band(fr, k(s * 0.78), k(s * 0.84), i0, i1) + '" fill="' + darken(look.fill, 0.3) + '" opacity=".35"/>';
      }).join('');
    }));
    return items;
  };

  DRAW.champagne = function (c) {
    // Very reduced: a soft, blurry dorsal stripe (nested translucent bands) and a few ghost smudges.
    var fr = c.fr, items = [], dark = darken(c.look.fill, 0.32);
    [[0.3, 0.2], [0.19, 0.28], [0.09, 0.3]].forEach(function (b) {
      items.push(strip(function (i0, i1) {
        return '<path d="' + band(fr, function (i) { return -(b[0] + 0.05 * Math.sin(fr.s[i] / 7)); }, function (i) { return b[0] + 0.05 * Math.cos(fr.s[i] / 8); }, i0, i1) + '" fill="' + dark + '" opacity="' + b[1] + '"/>';
      }));
    });
    for (var q = c.spacing; q < c.total; q += c.spacing * (1.6 + c.r2())) {
      var i = indexAtLength(fr, q), s = c.r2() < 0.5 ? 1 : -1, p = at(fr, i, s * fr.w[i] * 0.6);
      items.push(mark(i, ell(p, c.spacing * 0.3, fr.w[i] * 0.22, dark, ' opacity=".2"' + rot(fr, i, p))));
    }
    return items;
  };

  DRAW.spider = function (c) {
    // A light body crossed by thin dark "webbing": a wavy spine line with strands that
    // loop down the flanks where a normal's blotches would be outlined. Extra reducers
    // (pin → spinner, lesser...) thin and space out the web; aberrant tears gaps in it.
    var fr = c.fr, look = c.look, F = c.F, items = [];
    var extra = Math.max(0, look.reduce - 0.45);
    var ink = look.base, op = f1(Math.max(0.3, 0.9 - extra * 1.5));
    var lw = function (w) { return f1(w * Math.max(0.035, 0.09 - extra * 0.07)); };
    items.push(strip(function (i0, i1) {
      return '<path d="' + band(fr, function (i) { return -0.05 + 0.05 * Math.sin(fr.s[i] / 4); }, function (i) { return 0.05 + 0.05 * Math.sin(fr.s[i] / 4); }, i0, i1) + '" fill="' + ink + '" opacity="' + op + '"/>';
    }));
    var step = c.spacing * 0.6 * (extra > 0.15 ? 1.8 : 1);
    [1, -1].forEach(function (s) {
      for (var b = step * (s > 0 ? 0.5 : 1); b < c.total; b += step * (0.92 + c.r2() * 0.16)) {
        var i = indexAtLength(fr, b), w = fr.w[i];
        if (i >= fr.n - 2 || w < c.maxW * 0.3) continue;
        if (F.aberrant && c.r2() < 0.35) continue;
        // Strand from the spine down and back, then a loop that meets the next strand.
        var d = 'M' + pt(atLen(fr, b, s * 0.05)) +
          ' Q' + pt(atLen(fr, b + step * 0.12, s * 0.4)) + ' ' + pt(atLen(fr, b + step * 0.3, s * 0.62)) +
          ' Q' + pt(atLen(fr, b + step * 0.5, s * 0.95)) + ' ' + pt(atLen(fr, b + step * 0.2, s * 1.05)) +
          ' M' + pt(atLen(fr, b + step * 0.3, s * 0.62)) +
          ' Q' + pt(atLen(fr, b + step * 0.75, s * 0.4)) + ' ' + pt(atLen(fr, b + step * 1.28, s * 0.62));
        items.push(mark(i, '<path d="' + d + '" stroke="' + ink + '" stroke-width="' + lw(w) + '" fill="none" stroke-linecap="round" opacity="' + op + '"/>'));
      }
    });
    return items;
  };

  DRAW.pin = function (c) {
    // Fine dorsal pinstripe with faint, reduced side markings.
    var fr = c.fr, look = c.look, items = [], rand = c.rand, spacing = c.spacing;
    var sideOp = f1(Math.max(0.15, 0.55 - (look.reduce - 0.35)));
    var ranges = c.F.aberrant ? brokenRanges(c, [1, 2.5], [0.25, 0.5]) : [[0, c.total]];
    items.push(segStrip(fr, ranges, k(-0.09), k(0.09), look.pattern));
    for (var q = spacing * 0.5; q < c.total; q += spacing) {
      var iq = indexAtLength(fr, q);
      [-1, 1].forEach(function (sd) {
        var pq = at(fr, iq, sd * fr.w[iq] * 0.62);
        items.push(mark(iq, ell(pq, spacing * 0.24, fr.w[iq] * 0.08, look.pattern, ' opacity="' + sideOp + '"' + rot(fr, iq, pq))));
      });
    }
    return items;
  };

  DRAW.banded = function (c) {
    // Woma-like banding: light bands cross the back, pinched over the spine (hourglass),
    // leaving dark saddles that read as rings. Aberrant makes them uneven and skewed.
    var fr = c.fr, look = c.look, F = c.F, items = [];
    var light = look.pattern, rim = look.edge || darken(look.base, 0.4);
    var period = c.spacing * 1.05;
    for (var b = period * 0.6; b < c.total - period * 0.15;) {
      var per = period * (F.aberrant ? 0.6 + c.r2() * 0.9 : 0.92 + c.r2() * 0.16);
      var i = indexAtLength(fr, b), w = fr.w[i];
      if (w >= c.maxW * 0.3) {
        var h = per * 0.26 * (1 + 0.5 * look.reduce);
        var skew = F.aberrant ? (c.r2() - 0.5) * per * 0.6 : 0;
        var left = [], right = [];
        for (var f = -1.3; f <= 1.31; f += 0.26) {
          var hw = h * (0.6 + 0.4 * Math.min(1, Math.abs(f)));
          left.push(atLen(fr, b - hw + skew * f, f));
          right.push(atLen(fr, b + hw + skew * f, f));
        }
        items.push(mark(i, '<path d="' + pathFrom(left.concat(right.reverse()), true) + '" fill="' + light + '" stroke="' + rim + '" stroke-width="' + f1(w * 0.12) + '" stroke-linejoin="round"/>'));
      }
      b += per;
    }
    return items;
  };

  DRAW.granite = function (c) {
    // Many small, broken alien-head fragments in staggered rows, each with a dark pupil.
    var fr = c.fr, look = c.look, F = c.F, items = [], r2 = c.r2;
    var step = c.spacing * 0.3, row = 0;
    for (var b = step * 0.5; b < c.total; b += step * (0.75 + r2() * 0.5), row++) {
      var i = indexAtLength(fr, b), w = fr.w[i];
      if (i >= fr.n - 1 || w < c.maxW * 0.25) continue;
      var off = [-0.62, 0.02, 0.62][row % 3] + (r2() - 0.5) * 0.28;
      var p = at(fr, i, off * w), tilt = (r2() - 0.5) * (F.aberrant ? 120 : 70);
      var rx = step * (0.32 + r2() * 0.28) * (F.aberrant ? 0.6 + r2() * 1.2 : 1), ry = w * (0.15 + r2() * 0.1);
      var svg = '';
      if (look.edge) svg += ell(p, rx * 1.25, ry * 1.3, look.edge, rot(fr, i, p, tilt));
      svg += ell(p, rx, ry, look.pattern, rot(fr, i, p, tilt));
      if (r2() < 0.5) {
        var q = at(fr, i, (off + (r2() - 0.5) * 0.3) * w);
        q = [q[0] + fr.T[i][0] * rx * 0.7, q[1] + fr.T[i][1] * rx * 0.7];
        svg += ell(q, rx * 0.55, ry * 0.8, look.pattern, rot(fr, i, q, -tilt));
      }
      if (look.reduce < 0.3 && r2() < 0.4) svg += ell(p, ry * 0.32, ry * 0.26, look.spot, rot(fr, i, p, tilt));
      items.push(mark(i, svg));
    }
    return items;
  };

  DRAW.classic = function (c) {
    // Classic ball python blotches: rounded lateral saddles, alternating sides,
    // each with a dark eyespot near the flank ("alien heads" appear between them).
    // enchi: fuller, smooth-edged blotches (rounder alien heads) and smaller eyespots.
    // reduced/dinker: blotches spread and eyespots fade; dinker also cleans the lower sides.
    // aberrant: blotches go missing, stretch across the spine or tilt.
    var fr = c.fr, look = c.look, F = c.F, rand = c.rand, r2 = c.r2, maxW = c.maxW, spacing = c.spacing;
    var items = [], heads = [], red = look.reduce, k2 = 0;
    for (var b = spacing * 0.5; b < c.total; b += spacing * (0.5 + rand() * 0.12), k2++) {
      var i = indexAtLength(fr, b);
      if (i >= fr.n - 1) break;
      var w = fr.w[i];
      if (w < maxW * 0.28) continue;
      var sd = k2 % 2 ? 1 : -1;
      var cxy = at(fr, i, sd * w * (0.38 + rand() * 0.1));
      var rx = spacing * (0.34 + rand() * 0.08), ry = w * (0.62 + rand() * 0.12), tilt = 0;
      rx *= 1 + 0.25 * red;
      if (F.enchi) { rx *= 1.14; ry *= 1.1; }
      if (F.aberrant) {
        var roll = r2();
        if (roll < 0.18) continue; // a missing blotch merges the dark areas either side
        if (roll < 0.45) { cxy = at(fr, i, sd * w * 0.08); rx *= 1.5 + r2(); ry *= 0.72; }
        else { rx *= 0.6 + r2() * 0.9; tilt = (r2() - 0.5) * 50; }
      }
      var svg = '';
      if (look.edge) svg += ell(cxy, rx * 1.16, ry * 1.14, look.edge, rot(fr, i, cxy, tilt));
      svg += ell(cxy, rx, ry, look.pattern, rot(fr, i, cxy, tilt));
      if (!F.enchi) {
        // A second, offset lobe makes the blotch organic rather than a perfect oval.
        var lobe = at(fr, i, sd * w * 0.12);
        lobe = [lobe[0] + fr.T[i][0] * rx * 0.35, lobe[1] + fr.T[i][1] * rx * 0.35];
        svg += ell(lobe, rx * 0.55, ry * 0.5, look.pattern, rot(fr, i, lobe, tilt));
      }
      if (F.keyhole) {
        // Mojave: dark "keyhole" in the middle of each pale blotch.
        svg += ell(cxy, rx * 0.38, ry * 0.3, look.spot, rot(fr, i, cxy));
      } else if (!F.dinker) {
        var eye = at(fr, i, sd * w * 0.8), er = w * (F.cleanSides ? 0.1 : 0.17) * (1 - 0.7 * red) * (F.enchi ? 0.6 : 1);
        if (er > w * 0.04) svg += ell(eye, er * 1.3, er, look.spot, rot(fr, i, eye));
      }
      items.push(mark(i, svg));
      if (F.enchi && !F.aberrant) {
        // Enchi: neat, rounded dark "alien heads" on the spine between the fuller blotches.
        var ai = indexAtLength(fr, b + spacing * 0.3), ac = at(fr, ai, 0), aw = fr.w[ai];
        heads.push(mark(ai, ell(ac, spacing * 0.2, aw * 0.3, darken(look.fill, 0.1), rot(fr, ai, ac)) +
          [-1, 1].map(function (s) { var e = at(fr, ai, s * aw * 0.12); return ell([e[0] + fr.T[ai][0] * spacing * 0.06, e[1] + fr.T[ai][1] * spacing * 0.06], aw * 0.07, aw * 0.07, look.pattern); }).join('')));
      }
      // Small dorsal accent between blotches.
      if (k2 % 2 && rand() < 0.7 && red < 0.3) {
        var di = indexAtLength(fr, b + spacing * 0.25);
        items.push(mark(di, ell(at(fr, di, 0), fr.w[di] * 0.2, fr.w[di] * 0.14, look.edge || look.pattern, ' opacity=".9"')));
      }
    }
    items = items.concat(heads); // alien heads sit on top of every blotch
    if (F.dinker) {
      // Clean, slightly muted lower sides under the blotches.
      var sideCol = mix(look.pattern, look.fill, 0.25);
      items.push(strip(function (i0, i1) {
        return [1, -1].map(function (s) {
          return '<path d="' + band(fr, function (i) { return s > 0 ? 0.76 + 0.06 * Math.sin(fr.s[i] / 6) : -1.3; }, function (i) { return s > 0 ? 1.3 : -0.76 - 0.06 * Math.cos(fr.s[i] / 7); }, i0, i1) + '" fill="' + sideCol + '"/>';
        }).join('');
      }));
    }
    return items;
  };

  function patternLayer(c) { return (DRAW[c.look.layout] || DRAW.classic)(c); }

  /* ---------- Washes and overlays (style modifiers) ---------- */

  var SOLID = { plain: true, patternless: true, ivory: true };

  /*
   * Flames: light tongues licking up the lower flanks between blotches (drawn under
   * the pattern) plus a pale fade along the bottom (over it). flames, enchi and
   * spider each add one level; enchi's are orange, spider's nearly white.
   */
  function flameLayers(c) {
    var F = c.F, lay = c.look.layout, fr = c.fr;
    var n = (F.flames ? 1 : 0) + (F.enchi ? 1 : 0) + (F.spider ? 1 : 0);
    if (!n || lay === 'plain' || lay === 'ivory') return { under: [], over: [] };
    var p = c.look.pattern;
    var col = F.enchi ? warm(lighten(p, 0.3), 0.8) : F.spider ? lighten(p, 0.62) : lighten(p, 0.45);
    // A continuous pale lower flank (`low`) with tongues reaching up to `top`.
    var top = Math.max(0.28, 0.6 - 0.12 * n), low = 0.84 - 0.07 * n;
    var period = c.spacing * 0.56, ph = [c.r2() * 6.28, c.r2() * 6.28];
    function inner(i, s) {
      var t = Math.max(0, Math.sin(fr.s[i] / period * 6.283 + ph[s > 0 ? 0 : 1]));
      return low - (low - top) * Math.pow(t, 1.4);
    }
    function sides(fn, opacity) {
      return strip(function (i0, i1) {
        return [1, -1].map(function (s) {
          return '<path d="' + band(fr, function (i) { return s > 0 ? fn(i, s) : -1.3; }, function (i) { return s > 0 ? 1.3 : -fn(i, s); }, i0, i1) + '" fill="' + col + '" opacity="' + opacity + '"/>';
        }).join('');
      });
    }
    return {
      under: [sides(function (i, s) { return inner(i, s) - 0.1; }, '.35'), sides(inner, '.9')],
      over: [sides(function (i, s) { return inner(i, s) + 0.06; }, f1(Math.min(0.7, 0.3 + 0.12 * n))), sides(k(0.9), '.45')]
    };
  }

  function overlays(c) {
    var fr = c.fr, look = c.look, F = c.F, lay = look.layout, items = [];
    if (F.ghi && !SOLID[lay]) {
      // GHI smoke: the spine and upper flanks look dusted with soot.
      items.push(strip(function (i0, i1) {
        return '<path d="' + band(fr, k(-0.62), k(0.62), i0, i1) + '" fill="' + look.base + '" opacity=".3"/>' +
          '<path d="' + band(fr, k(-0.28), k(0.28), i0, i1) + '" fill="' + look.base + '" opacity=".22"/>';
      }));
    }
    if (F.blushed && lay !== 'plain' && lay !== 'ivory') {
      // Dorsal fade: a pale wash along the spine that widens toward the head.
      var i0 = Math.floor(fr.n * 0.58), col = look.headWash || lighten(mix(look.fill, look.pattern, 0.65), 0.22);
      [1, 0.66, 0.36].forEach(function (m) {
        items.push(strip(function (a, b) {
          var s0 = Math.max(a, i0);
          if (b - s0 < 1) return '';
          var wf = function (i) { return m * (0.12 + 0.6 * smooth((i - i0) / (fr.n - 1 - i0))); };
          return '<path d="' + band(fr, function (i) { return -wf(i); }, wf, s0, b) + '" fill="' + col + '" opacity=".22"/>';
        }));
      });
    }
    if (F.leopard && lay !== 'plain' && lay !== 'patternless') {
      // Fine flecking: mostly dark specks, with a few pale ones that show on the dark ground.
      var pale = lighten(look.pattern, 0.2);
      for (var p = 3; p < c.total; p += 1.9 + c.r2() * 1.5) {
        var i = indexAtLength(fr, p), w = fr.w[i];
        if (w < c.maxW * 0.25) continue;
        var q = at(fr, i, (c.r2() * 2 - 1) * w * 0.95), r = w * (0.06 + c.r2() * 0.08);
        items.push(mark(i, ell(q, r * (1 + c.r2()), r, c.r2() < 0.22 ? pale : look.spot, ' opacity=".85"' + rot(fr, i, q, (c.r2() - 0.5) * 90))));
      }
    }
    return items;
  }

  /* Ringer: a small clean white patch on one side, a third of the way from the tail tip. */
  function ringerLayer(c) {
    var fr = c.fr, i = indexAtLength(fr, c.total * 0.34), w = fr.w[i], s = c.r2() < 0.5 ? 1 : -1;
    var p = at(fr, i, s * w * 0.45), q = atLen(fr, fr.s[i] + w * 0.9, s * 0.7);
    return [mark(i, ell(p, w * 1.25, w * 0.85, '#fdfbf5', rot(fr, i, p)) + ell(q, w * 0.7, w * 0.6, '#fdfbf5', rot(fr, i, q, 20)))];
  }

  /* Piebald: clean white patches with rounded ends. */
  function piedLayer(fr, patches) {
    var white = '#fdfbf5';
    return patches.map(function (p) {
      var a = indexAtLength(fr, p[0]), b = indexAtLength(fr, p[1]);
      return strip(function (i0, i1) {
        var s0 = Math.max(a, i0), s1 = Math.min(b, i1);
        if (s1 - s0 < 1) return '';
        var out = '<path d="' + band(fr, function () { return -1.3; }, function () { return 1.3; }, s0, s1) + '" fill="' + white + '"/>';
        [a, b].forEach(function (ii, idx) {
          if (ii < i0 || ii > i1) return;
          var sgn = idx ? 1 : -1, c = at(fr, ii, 0), w = fr.w[ii];
          c = [c[0] + fr.T[ii][0] * sgn * w * 0.1, c[1] + fr.T[ii][1] * sgn * w * 0.1];
          out += ell(c, w * 0.75, w * 1.25, white, rot(fr, ii, c));
        });
        return out;
      });
    });
  }

  function shadingLayer(fr, look) {
    function dotSide(i, s) { return s * (fr.N[i][0] * LIGHT[0] + fr.N[i][1] * LIGHT[1]); }
    return [strip(function (i0, i1) {
      var out = '';
      // Belly scales peek out on the lower edge.
      [1, -1].forEach(function (s) {
        out += '<path d="' + band(fr, function (i) { return s > 0 ? 1 - 0.3 * Math.max(0, dotSide(i, s)) : -1.2; }, function (i) { return s > 0 ? 1.2 : -1 + 0.3 * Math.max(0, dotSide(i, s)); }, i0, i1) + '" fill="' + look.belly + '" opacity=".95"/>';
      });
      // Rounded body: darker flanks, strongest on the side away from the light.
      [1, -1].forEach(function (s) {
        out += '<path d="' + band(fr, function (i) { var th = 0.2 + 0.35 * Math.max(0, dotSide(i, s)); return s > 0 ? 1 - th : -1.2; }, function (i) { var th = 0.2 + 0.35 * Math.max(0, dotSide(i, s)); return s > 0 ? 1.2 : -1 + th; }, i0, i1) + '" fill="#1b1006" opacity=".26"/>';
      });
      // Glossy dorsal highlight nudged toward the light.
      out += '<path d="' + band(fr, function (i) { return -0.2 * fr.N[i][1] - 0.2; }, function (i) { return -0.2 * fr.N[i][1] + 0.12; }, i0, i1) + '" fill="#fff" opacity=".13"/>';
      out += '<path d="' + band(fr, function (i) { return -0.3 * fr.N[i][1] - 0.06; }, function (i) { return -0.3 * fr.N[i][1] + 0.02; }, i0, i1) + '" fill="#fff" opacity=".22"/>';
      return out;
    })];
  }

  /* Sub-frames for an index range, sharing geometry with the full body. */
  function slice(fr, i0, i1) {
    return { P: fr.P.slice(i0, i1 + 1), T: fr.T.slice(i0, i1 + 1), N: fr.N.slice(i0, i1 + 1), s: fr.s.slice(i0, i1 + 1), w: fr.w.slice(i0, i1 + 1), n: i1 - i0 + 1 };
  }

  function edges(fr) {
    var l = [], r = [];
    for (var i = 0; i < fr.n; i++) { l.push(at(fr, i, fr.w[i])); r.push(at(fr, i, -fr.w[i])); }
    return pathFrom(l) + pathFrom(r);
  }

  /*
   * Draw one piece of the body. `inner` is the shared pattern/shading markup
   * (generated once for the whole body) so overlapping pieces match exactly.
   * `shadowFrom` skips the shadow at the start of a piece so joints stay seamless.
   */
  function piece(fr, i0, i1, look, uid, name, items, shadowFrom) {
    var sub = slice(fr, i0, i1);
    var inner = renderItems(items, i0, i1) + '<rect x="0" y="0" width="200" height="180" fill="url(#' + uid + 'sc)"/>';
    var d = outline(sub);
    var clip = uid + name;
    var fill = look.fill;
    var sh = shadowFrom ? outline(slice(sub, Math.min(shadowFrom, sub.n - 2), sub.n - 1)) : d;
    return '<path d="' + sh + '" fill="#2b1a08" opacity=".38" filter="url(#' + uid + 'bl)" transform="translate(0.6 2.8)"/>' +
      '<clipPath id="' + clip + '"><path d="' + d + '"/></clipPath>' +
      '<path d="' + d + '" fill="' + fill + '"/>' +
      '<g clip-path="url(#' + clip + ')">' + inner + '</g>' +
      '<path d="' + edges(sub) + '" fill="none" stroke="' + darken(fill, 0.55) + '" stroke-opacity=".5" stroke-width=".7"/>';
  }

  /* ---------- Head ---------- */

  function head(fr, look, maxW, juvenile, curious, uid) {
    var i = fr.n - 1, P = fr.P[i];
    var ang = Math.atan2(fr.T[i][1], fr.T[i][0]) * 180 / Math.PI;
    var nw = fr.w[i] * 1.02;
    var hw = maxW * (juvenile ? 1.22 : 1.06);
    var L = maxW * (juvenile ? 2.75 : 2.55);
    var F = look.flags;
    var shape = 'M-2 ' + f1(-nw) +
      ' C' + f1(L * 0.22) + ' ' + f1(-nw * 1.05) + ' ' + f1(L * 0.28) + ' ' + f1(-hw) + ' ' + f1(L * 0.52) + ' ' + f1(-hw * 0.96) +
      ' C' + f1(L * 0.8) + ' ' + f1(-hw * 0.86) + ' ' + f1(L) + ' ' + f1(-hw * 0.46) + ' ' + f1(L) + ' 0' +
      ' C' + f1(L) + ' ' + f1(hw * 0.46) + ' ' + f1(L * 0.8) + ' ' + f1(hw * 0.86) + ' ' + f1(L * 0.52) + ' ' + f1(hw * 0.96) +
      ' C' + f1(L * 0.28) + ' ' + f1(hw) + ' ' + f1(L * 0.22) + ' ' + f1(nw * 1.05) + ' -2 ' + f1(nw) + 'Z';
    var clip = uid + 'hd';
    var headFill = look.head;
    var marks = '';
    var lay = look.layout, solid = SOLID[lay];

    // Blushed crown (blushed, enchi, reduced): a soft pale wash that eats into the dark head pattern.
    if (!solid && lay !== 'champagne' && (F.blushed || F.enchi || F.reduced)) {
      var wash = look.headWash || lighten(mix(headFill, look.pattern, 0.65), 0.15), wo = F.blushed || F.enchi ? '.5' : '.3';
      marks += ell([L * 0.4, 0], L * 0.4, hw * 0.6, wash, ' opacity="' + wo + '"') + ell([L * 0.36, 0], L * 0.26, hw * 0.38, wash, ' opacity="' + wo + '"');
    }
    if (lay === 'patternless') {
      // Patternless: a plain head, the same solid colour as the body.
    } else if (solid) {
      marks += '<ellipse cx="' + f1(L * 0.45) + '" cy="0" rx="' + f1(L * 0.4) + '" ry="' + f1(hw * 0.5) + '" fill="' + (look.headWash || mix(look.pattern, '#f2c94c', 0.3)) + '" opacity=".7"/>';
    } else if (lay === 'spider') {
      // Spider: bright, clean head with a fine dark crown line and thin lines behind the eyes.
      marks += '<path d="M' + f1(L * 0.06) + ' 0 L' + f1(L * 0.44) + ' 0" stroke="' + look.base + '" stroke-width="' + f1(hw * 0.1) + '" stroke-linecap="round" opacity=".85"/>';
      [-1, 1].forEach(function (s) {
        marks += '<path d="M' + f1(L * 0.56) + ' ' + f1(s * hw * 0.72) + ' Q' + f1(L * 0.36) + ' ' + f1(s * hw * 0.92) + ' ' + f1(L * 0.04) + ' ' + f1(s * hw * 0.74) + '" stroke="' + look.base + '" stroke-width="' + f1(hw * 0.08) + '" fill="none" stroke-linecap="round" opacity=".8"/>';
      });
    } else if (lay === 'champagne') {
      // Champagne: a plain tan head with a darker, blushed crown.
      marks += ell([L * 0.4, 0], L * 0.34, hw * 0.5, darken(headFill, 0.35), ' opacity=".55"') + ell([L * 0.36, 0], L * 0.2, hw * 0.3, darken(headFill, 0.45), ' opacity=".45"');
    } else if (lay === 'clown') {
      // Clown: clean head with a dark crown spot and "teardrops" behind the eyes.
      var dark = darken(look.base, 0.05);
      marks += '<ellipse cx="' + f1(L * 0.3) + '" cy="0" rx="' + f1(L * 0.16) + '" ry="' + f1(hw * 0.2) + '" fill="' + dark + '"/>';
      [-1, 1].forEach(function (s) {
        marks += '<path d="M' + f1(L * 0.55) + ' ' + f1(s * hw * 0.62) + ' Q' + f1(L * 0.42) + ' ' + f1(s * hw * 0.95) + ' ' + f1(L * 0.3) + ' ' + f1(s * hw * 0.98) + '" stroke="' + dark + '" stroke-width="' + f1(hw * 0.16) + '" fill="none" stroke-linecap="round"/>';
      });
    } else {
      // Dark crown with light stripes running from the snout over each eye.
      [-1, 1].forEach(function (s) {
        marks += '<path d="M' + f1(L * 0.97) + ' ' + f1(s * hw * 0.22) + ' Q' + f1(L * 0.62) + ' ' + f1(s * hw * 0.62) + ' ' + f1(L * 0.08) + ' ' + f1(s * hw * 0.82) + '" stroke="' + (look.edge || look.pattern) + '" stroke-width="' + f1(hw * 0.26) + '" fill="none" stroke-linecap="round"/>';
      });
      if (lay === 'stripe') {
        // Genetic stripe: the spine stripe runs on up over the crown.
        marks += '<path d="M-2 0 L' + f1(L * 0.5) + ' 0" stroke="' + darken(look.base, 0.2) + '" stroke-width="' + f1(hw * 0.5) + '" stroke-linecap="round"/>';
      } else {
        marks += '<path d="M' + f1(L * 0.12) + ' 0 L' + f1(L * 0.34) + ' 0" stroke="' + look.pattern + '" stroke-width="' + f1(hw * 0.14) + '" stroke-linecap="round" opacity=".7"/>';
      }
    }
    if (F.speckledHead && lay !== 'plain') {
      // Dark speckles over the crown (pale ones instead if the head is too dark to show them).
      var hr = seeded(hashString(uid + 'hs'));
      var dot = luma(rgb(headFill)) > 70 ? darken(headFill, 0.62) : lighten(look.pattern, 0.1);
      for (var d = 0; d < 16; d++) {
        var dx = L * (0.1 + hr() * 0.72), dy = (hr() * 2 - 1) * hw * 0.6 * (1 - Math.abs(dx / L - 0.45) * 0.6);
        marks += ell([dx, dy], hw * (0.05 + hr() * 0.06), hw * (0.04 + hr() * 0.04), dot, ' opacity=".9"');
      }
    }
    if (F.pied && lay !== 'plain') {
      marks += '<ellipse cx="' + f1(L * 0.92) + '" cy="0" rx="' + f1(L * 0.22) + '" ry="' + f1(hw * 0.55) + '" fill="#fdfbf5"/>';
    }
    // Light lips along the head's edge and a gloss highlight.
    var rim = '<path d="' + shape + '" fill="none" stroke="' + look.belly + '" stroke-width="' + f1(hw * 0.22) + '" opacity=".85"/>' +
      '<ellipse cx="' + f1(L * 0.5) + '" cy="' + f1(-hw * 0.25) + '" rx="' + f1(L * 0.3) + '" ry="' + f1(hw * 0.28) + '" fill="#fff" opacity=".14"/>' +
      '<path d="' + shape + '" fill="none" stroke="#1b1006" stroke-width="' + f1(hw * 0.5) + '" opacity=".14" transform="translate(0 ' + f1(hw * 0.12) + ')"/>';
    var eyes = '';
    [-1, 1].forEach(function (s) {
      var ex = L * 0.64, ey = s * hw * 0.76;
      eyes += '<path d="M' + f1(ex - hw * 0.3) + ' ' + f1(ey - s * hw * 0.16) + ' Q' + f1(ex) + ' ' + f1(ey - s * hw * 0.34) + ' ' + f1(ex + hw * 0.3) + ' ' + f1(ey - s * hw * 0.12) + '" stroke="' + darken(headFill, 0.4) + '" stroke-width="' + f1(hw * 0.08) + '" fill="none" opacity=".6"/>';
      eyes += '<ellipse cx="' + f1(ex) + '" cy="' + f1(ey) + '" rx="' + f1(hw * 0.2) + '" ry="' + f1(hw * 0.15) + '" fill="' + look.eye + '" stroke="' + darken(headFill, 0.5) + '" stroke-width=".4"/>';
      eyes += '<circle cx="' + f1(ex + hw * 0.07) + '" cy="' + f1(ey - hw * 0.05) + '" r="' + f1(hw * 0.055) + '" fill="#fff" opacity=".9"/>';
      eyes += '<ellipse cx="' + f1(L * 0.93) + '" cy="' + f1(s * hw * 0.2) + '" rx="' + f1(hw * 0.07) + '" ry="' + f1(hw * 0.045) + '" fill="' + darken(headFill, 0.6) + '"/>';
    });
    var tongue = curious ? '<path class="sn-tongue" d="M' + f1(L - 1) + ' 0 L' + f1(L + 7) + ' 0 M' + f1(L + 7) + ' 0 L' + f1(L + 10.5) + ' -2.4 M' + f1(L + 7) + ' 0 L' + f1(L + 10.5) + ' 2.4" stroke="#c42d47" stroke-width="1.1" stroke-linecap="round" fill="none"/>' : '';

    return '<g transform="translate(' + f1(P[0]) + ' ' + f1(P[1]) + ') rotate(' + f1(ang) + ')">' +
      '<path d="' + shape + '" fill="#2b1a08" opacity=".38" filter="url(#' + uid + 'bl)" transform="translate(0.8 2.6)"/>' +
      tongue +
      '<clipPath id="' + clip + '"><path d="' + shape + '"/></clipPath>' +
      '<path d="' + shape + '" fill="' + headFill + '"/>' +
      '<g clip-path="url(#' + clip + ')">' + marks + rim + '<rect x="-5" y="-30" width="60" height="60" fill="url(#' + uid + 'sc)"/></g>' +
      '<path d="' + shape + '" fill="none" stroke="' + darken(headFill, 0.55) + '" stroke-opacity=".6" stroke-width=".7"/>' +
      eyes + '</g>';
  }

  /* ---------- Scene ---------- */

  function scenery(rand, uid) {
    var specks = '';
    var colors = ['#9c7a4b', '#7d5e36', '#b8966a', '#6f5431'];
    for (var i = 0; i < 34; i++) {
      var x = 8 + rand() * 184, y = 118 + rand() * 54;
      specks += '<ellipse cx="' + f1(x) + '" cy="' + f1(y) + '" rx="' + f1(1.5 + rand() * 3.5) + '" ry="' + f1(0.8 + rand() * 1.4) + '" fill="' + colors[i % 4] + '" opacity="' + f1(0.18 + rand() * 0.25) + '" transform="rotate(' + Math.round(rand() * 180) + ' ' + f1(x) + ' ' + f1(y) + ')"/>';
    }
    var leafX = rand() < 0.5 ? 22 : 178, flip = leafX > 100 ? -1 : 1;
    var leaf = '<g transform="translate(' + leafX + ' 26) scale(' + flip + ' 1)" opacity=".55">' +
      '<path d="M0 0 C 14 2 24 12 28 26" stroke="#5f7442" stroke-width="1.6" fill="none"/>' +
      '<path d="M8 3 C 16 -6 26 -2 24 6 C 18 8 12 7 8 3Z" fill="#7d9457"/>' +
      '<path d="M16 10 C 26 4 34 10 30 17 C 24 18 19 15 16 10Z" fill="#6e874a"/>' +
      '<path d="M22 19 C 32 16 38 24 32 30 C 27 29 23 25 22 19Z" fill="#7d9457"/></g>';
    return '<rect width="200" height="180" rx="16" fill="url(#' + uid + 'bg)"/>' +
      '<path d="M0 124 Q 100 108 200 124 L200 164 Q200 180 184 180 L16 180 Q0 180 0 164Z" fill="#cdb489" opacity=".45"/>' +
      specks + leaf;
  }

  /* Returns an SVG string. `opts.label` sets the accessible name ('' = decorative). */
  art.snakeSVG = function (snake, opts) {
    opts = opts || {};
    // The UI re-renders often, so reuse markup for an unchanged snake. The key also
    // gives stable, unique SVG ids (each snake/suffix appears at most once on screen).
    var key = [snake.id || snake.name, opts.suffix || '', (snake.ageWeeks || 0) < 40 ? 'j' : 'a', JSON.stringify(snake.genotype || {}), snake.temperament || '', opts.label == null ? snake.name : opts.label].join('|');
    if (cache[key]) return cache[key];
    var svg = render(snake, opts, 'sv' + hashString(key).toString(36));
    cache[key] = svg;
    cacheKeys.push(key);
    if (cacheKeys.length > 400) delete cache[cacheKeys.shift()];
    return svg;
  };

  function render(snake, opts, uid) {
    var seed = hashString(snake.id || snake.name || 'x');
    var rand = seeded(seed);
    var look = resolveStyle(art.lookFor(snake.genotype || {}));
    var juvenile = (snake.ageWeeks || 0) < 40;
    var pose = buildPose(rand, juvenile);
    var fr = pose.fr;

    // Piebald patches along the whole body.
    var patches = [];
    if (look.flags.pied) {
      var total = fr.s[fr.n - 1];
      for (var p = rand() * 20; p < total; p += 30 + rand() * 40) {
        var len = 14 + rand() * 26;
        patches.push([p, p + len]);
        p += len;
      }
    }
    // Layer order: flame washes, pattern layout, overlays (GHI smoke, dorsal blush,
    // leopard flecks), bottom flame fade, white skin (pied, ringer), then shading.
    var c = { fr: fr, look: look, F: look.flags, rand: rand, r2: seeded(seed ^ 0x5bd1e995), maxW: pose.maxW, spacing: pose.maxW * 2.15, total: fr.s[fr.n - 1] };
    var flames = flameLayers(c);
    var items = flames.under
      .concat(patternLayer(c))
      .concat(overlays(c))
      .concat(flames.over)
      .concat(look.flags.pied ? piedLayer(fr, patches) : [])
      .concat(look.flags.ringer ? ringerLayer(c) : [])
      .concat(shadingLayer(fr, look));
    var body = pose.split
      ? piece(fr, 0, pose.split, look, uid, 'a', items) + piece(fr, pose.split - 1, fr.n - 1, look, uid, 'b', items, 5)
      : piece(fr, 0, fr.n - 1, look, uid, 'a', items);

    var curious = /Curious|Inquisitive/.test(snake.temperament || '');
    var bodyFill = look.fill;
    var light = rgb(bodyFill).reduce(function (a, b) { return a + b; }, 0) > 560;
    var scaleStroke = darken(bodyFill, light ? 0.3 : 0.55);
    var scaleOpacity = light ? '.22' : '.35';
    var label = opts.label === '' ? '' : (opts.label || ('Illustration of ' + snake.name));

    return '<svg class="snake-art" viewBox="0 0 200 180" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" ' +
      (label ? 'role="img" aria-label="' + SB.util.esc(label) + '"' : 'aria-hidden="true" focusable="false"') + '>' +
      '<defs>' +
        '<radialGradient id="' + uid + 'bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#f7efdc"/><stop offset=".7" stop-color="#e8d8b4"/><stop offset="1" stop-color="#d6bf92"/></radialGradient>' +
        '<pattern id="' + uid + 'sc" width="3.4" height="3" patternUnits="userSpaceOnUse">' +
          '<path d="M0 1.5 Q1.7 -.3 3.4 1.5 M-1.7 3 Q0 1.2 1.7 3 M1.7 3 Q3.4 1.2 5.1 3" stroke="' + scaleStroke + '" stroke-width=".35" fill="none" opacity="' + scaleOpacity + '"/></pattern>' +
        '<filter id="' + uid + 'bl" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.8"/></filter>' +
      '</defs>' +
      scenery(rand, uid) +
      '<ellipse cx="100" cy="' + (juvenile ? 136 : 146) + '" rx="' + (juvenile ? 58 : 72) + '" ry="9" fill="#3b2710" opacity=".16"/>' +
      body +
      head(fr, look, pose.maxW, juvenile, curious, uid) +
      '<text x="12" y="156" font-size="8" fill="#6b5536" font-family="sans-serif" opacity=".7">illustration</text>' +
      '</svg>';
  }

  art.eggSVG = function (egg) {
    var h = egg.health;
    var fill = egg.status === 'failed' ? '#b9ad98' : h > 70 ? '#fbf6e8' : h > 40 ? '#f1e3bd' : '#e3cf9b';
    return '<svg viewBox="0 0 40 48" class="egg-art" aria-hidden="true"><ellipse cx="20" cy="25" rx="15" ry="20" fill="' + fill + '" stroke="#b69d6f" stroke-width="1.5"/>' +
      (egg.status === 'failed' ? '<path d="M12 18 L28 34 M28 18 L12 34" stroke="#8a7a60" stroke-width="2"/>' : '<ellipse cx="14" cy="17" rx="4" ry="6" fill="#fff" opacity=".6"/>') +
      '</svg>';
  };

  SB.art = art;
})(globalThis.SB = globalThis.SB || {});
