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
      if (mod.style) flags[mod.style] = true;
      if (mod.tint) tints.push(mod.tint);
    });
    tints.forEach(function (tint) {
      Object.keys(tint).forEach(function (k) {
        var op = tint[k];
        if (!look[k]) return;
        look[k] = op[0] === 'lighten' ? lighten(look[k], op[1]) : op[0] === 'darken' ? darken(look[k], op[1]) : mix(look[k], op[1], op[2]);
      });
    });
    if (!look.spot) look.spot = darken(look.base, 0.35);
    if (!look.head) look.head = flags.clown ? look.pattern : look.base;
    look.flags = flags;
    return look;
  };

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
  function rot(fr, i, c) {
    return ' transform="rotate(' + f1(Math.atan2(fr.T[i][1], fr.T[i][0]) * 180 / Math.PI) + ' ' + f1(c[0]) + ' ' + f1(c[1]) + ')"';
  }
  function ell(c, rx, ry, fill, extra) {
    return '<ellipse cx="' + f1(c[0]) + '" cy="' + f1(c[1]) + '" rx="' + f1(rx) + '" ry="' + f1(ry) + '" fill="' + fill + '"' + (extra || '') + '/>';
  }

  function patternLayer(fr, look, rand, maxW) {
    var items = [];
    var F = look.flags;
    var spacing = maxW * 2.15;
    var total = fr.s[fr.n - 1];

    if (F.plain) {
      // Leucistic: almost patternless, a faint mottling only.
      for (var p = spacing * 0.7; p < total; p += spacing * 1.6) {
        var ip = indexAtLength(fr, p);
        items.push(mark(ip, ell(at(fr, ip, 0), fr.w[ip] * 0.9, fr.w[ip] * 0.5, look.pattern, ' opacity=".5"')));
      }
      return items;
    }

    if (F.clown) {
      // Clean sides with a bold, slightly wavy dark dorsal stripe and a few side ticks.
      var stripe = darken(look.base, 0.05);
      items.push(strip(function (i0, i1) {
        return '<path d="' + band(fr, function (i) { return -(0.24 + 0.07 * Math.sin(fr.s[i] / 5)); }, function (i) { return 0.24 + 0.07 * Math.cos(fr.s[i] / 6); }, i0, i1) + '" fill="' + stripe + '"/>';
      }));
      for (var c = spacing; c < total; c += spacing * 2.4) {
        var ic = indexAtLength(fr, c), side = rand() < 0.5 ? 1 : -1, pc = at(fr, ic, side * fr.w[ic] * 0.72);
        items.push(mark(ic, ell(pc, fr.w[ic] * 0.32, fr.w[ic] * 0.2, stripe, ' opacity=".75"' + rot(fr, ic, pc))));
      }
      return items;
    }

    if (F.pin) {
      // Fine dorsal pinstripe with faint, reduced side markings.
      items.push(strip(function (i0, i1) {
        return '<path d="' + band(fr, function () { return -0.09; }, function () { return 0.09; }, i0, i1) + '" fill="' + look.pattern + '"/>';
      }));
      for (var q = spacing * 0.5; q < total; q += spacing) {
        var iq = indexAtLength(fr, q);
        [-1, 1].forEach(function (sd) {
          var pq = at(fr, iq, sd * fr.w[iq] * 0.62);
          items.push(mark(iq, ell(pq, spacing * 0.24, fr.w[iq] * 0.08, look.pattern, ' opacity=".55"' + rot(fr, iq, pq))));
        });
      }
      return items;
    }

    if (F.ivory) {
      items.push(strip(function (i0, i1) {
        return '<path d="' + band(fr, function () { return -0.22; }, function () { return 0.22; }, i0, i1) + '" fill="' + mix(look.pattern, '#f2c94c', 0.35) + '" opacity=".75"/>';
      }));
      return items;
    }

    // Classic ball python blotches: rounded lateral saddles, alternating sides,
    // each with a dark eyespot near the flank ("alien heads" appear between them).
    var k = 0;
    for (var b = spacing * 0.5; b < total; b += spacing * (0.5 + rand() * 0.12), k++) {
      var i = indexAtLength(fr, b);
      if (i >= fr.n - 1) break;
      var w = fr.w[i];
      if (w < maxW * 0.28) continue;
      var sd = k % 2 ? 1 : -1;
      var cxy = at(fr, i, sd * w * (0.38 + rand() * 0.1));
      var rx = spacing * (0.34 + rand() * 0.08), ry = w * (0.62 + rand() * 0.12);
      var svg = '';
      if (look.edge) svg += ell(cxy, rx * 1.16, ry * 1.14, look.edge, rot(fr, i, cxy));
      svg += ell(cxy, rx, ry, look.pattern, rot(fr, i, cxy));
      // A second, offset lobe makes the blotch organic rather than a perfect oval.
      var lobe = at(fr, i, sd * w * 0.12);
      lobe = [lobe[0] + fr.T[i][0] * rx * 0.35, lobe[1] + fr.T[i][1] * rx * 0.35];
      svg += ell(lobe, rx * 0.55, ry * 0.5, look.pattern, rot(fr, i, lobe));
      if (F.keyhole) {
        // Mojave: dark "keyhole" in the middle of each pale blotch.
        svg += ell(cxy, rx * 0.38, ry * 0.3, look.spot, rot(fr, i, cxy));
      } else {
        var eye = at(fr, i, sd * w * 0.8), er = w * (F.cleanSides ? 0.1 : 0.17);
        svg += ell(eye, er * 1.3, er, look.spot, rot(fr, i, eye));
      }
      items.push(mark(i, svg));
      // Small dorsal accent between blotches.
      if (k % 2 && rand() < 0.7) {
        var di = indexAtLength(fr, b + spacing * 0.25);
        items.push(mark(di, ell(at(fr, di, 0), fr.w[di] * 0.2, fr.w[di] * 0.14, look.edge || look.pattern, ' opacity=".9"')));
      }
    }
    return items;
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
    var fill = look.flags.clown ? look.pattern : look.base;
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

    if (F.plain || F.ivory) {
      marks += '<ellipse cx="' + f1(L * 0.45) + '" cy="0" rx="' + f1(L * 0.4) + '" ry="' + f1(hw * 0.5) + '" fill="' + (look.headWash || mix(look.pattern, '#f2c94c', 0.3)) + '" opacity=".7"/>';
    } else if (F.clown) {
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
      marks += '<path d="M' + f1(L * 0.12) + ' 0 L' + f1(L * 0.34) + ' 0" stroke="' + look.pattern + '" stroke-width="' + f1(hw * 0.14) + '" stroke-linecap="round" opacity=".7"/>';
    }
    if (F.pied && !F.plain) {
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
    var look = art.lookFor(snake.genotype || {});
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
    var items = patternLayer(fr, look, rand, pose.maxW)
      .concat(look.flags.pied ? piedLayer(fr, patches) : [])
      .concat(shadingLayer(fr, look));
    var body = pose.split
      ? piece(fr, 0, pose.split, look, uid, 'a', items) + piece(fr, pose.split - 1, fr.n - 1, look, uid, 'b', items, 5)
      : piece(fr, 0, fr.n - 1, look, uid, 'a', items);

    var curious = /Curious|Inquisitive/.test(snake.temperament || '');
    var bodyFill = look.flags.clown ? look.pattern : look.base;
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
