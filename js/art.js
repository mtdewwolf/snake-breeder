/*
 * Original SVG placeholder illustrations. A coiled snake is drawn from a
 * spiral path; colours and pattern style come from each visual gene's `art`
 * data, so new morphs get artwork automatically.
 */
(function (SB) {
  'use strict';

  function hashString(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  SB.art = {};

  SB.art.lookFor = function (genotype) {
    var look = Object.assign({}, SB.NORMAL_ART);
    SB.GENES.forEach(function (gene) {
      var cls = SB.genetics.visualClass(gene, genotype[gene.id] || 0);
      if (cls === 'none' || !gene.art) return;
      var mod = gene.art[cls] || gene.art.visual || gene.art.single;
      if (!mod) return;
      Object.keys(mod).forEach(function (k) {
        // Pattern-style genes combine instead of overwriting where it makes sense.
        if (k === 'style' && look.style !== 'normal' && look.style !== 'plain') {
          look.style = look.style + '+' + mod.style;
        } else {
          look[k] = mod[k];
        }
      });
    });
    return look;
  };

  function spiralPath(seed) {
    var pts = [];
    var cx = 60, cy = 62;
    var turns = 2.15 + (seed % 7) * 0.03;
    var start = (seed % 360) * Math.PI / 180;
    var steps = 90;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var theta = start + t * turns * Math.PI * 2;
      var r = 8 + t * 36;
      pts.push([cx + Math.cos(theta) * r, cy + Math.sin(theta) * r * 0.82]);
    }
    return pts;
  }

  function pathD(pts) {
    return pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
  }

  /* Returns an SVG string. `label` is used for the accessible name. */
  SB.art.snakeSVG = function (snake, opts) {
    opts = opts || {};
    var look = SB.art.lookFor(snake.genotype);
    var seed = hashString(snake.id || snake.name || 'x');
    var pts = spiralPath(seed);
    var d = pathD(pts);
    var head = pts[pts.length - 1];
    var prev = pts[pts.length - 4];
    var ang = Math.atan2(head[1] - prev[1], head[0] - prev[0]) * 180 / Math.PI;
    var styles = look.style.split('+');
    var bodyW = snake.ageWeeks < 30 ? 11 : 14;
    var uid = 's' + seed.toString(36) + (opts.suffix || '');
    var patternLayers = '';

    if (styles.indexOf('plain') >= 0) {
      patternLayers += '';
    } else if (styles.indexOf('pin') >= 0 || styles.indexOf('stripe') >= 0) {
      patternLayers += '<path d="' + d + '" stroke="' + look.pattern + '" stroke-width="' + (bodyW * 0.28) + '" fill="none" stroke-linecap="round"/>';
    } else if (styles.indexOf('clown') >= 0) {
      // Clown: clean golden sides, one bold dark dorsal stripe and a few sparse markings.
      patternLayers += '<path d="' + d + '" stroke="' + look.pattern + '" stroke-width="' + (bodyW * 0.3) + '" fill="none" stroke-linecap="round"/>';
      patternLayers += '<path d="' + d + '" stroke="' + look.pattern + '" stroke-width="' + (bodyW * 0.8) + '" fill="none" stroke-linecap="round" stroke-dasharray="3 ' + (38 + seed % 12) + '" opacity=".75"/>';
    } else {
      var dash = 7 + (seed % 4);
      patternLayers += '<path d="' + d + '" stroke="' + look.pattern + '" stroke-width="' + (bodyW * 0.78) + '" fill="none" stroke-linecap="round" stroke-dasharray="' + dash + ' ' + (dash * 0.7).toFixed(1) + '"/>';
      patternLayers += '<path d="' + d + '" stroke="' + look.base + '" stroke-width="' + (bodyW * 0.22) + '" fill="none" stroke-linecap="round" stroke-dasharray="2 ' + (dash * 1.7 - 2).toFixed(1) + '" stroke-dashoffset="-' + (dash / 2) + '" opacity=".55"/>';
    }
    if (styles.indexOf('pied') >= 0) {
      patternLayers += '<path d="' + d + '" stroke="#fdfbf4" stroke-width="' + (bodyW + 0.6) + '" fill="none" stroke-dasharray="' + (30 + seed % 20) + ' ' + (24 + seed % 9) + '" stroke-dashoffset="' + (seed % 40) + '"/>';
    }

    var svg = '' +
      '<svg class="snake-art" viewBox="0 0 120 124" role="img" aria-label="' + SB.util.esc(opts.label || ('Illustration of ' + snake.name)) + '" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><radialGradient id="bg' + uid + '" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#f5ecd6"/><stop offset="1" stop-color="#d9c7a0"/></radialGradient></defs>' +
      '<rect width="120" height="124" rx="14" fill="url(#bg' + uid + ')"/>' +
      '<ellipse cx="60" cy="108" rx="44" ry="7" fill="#b89f73" opacity=".35"/>' +
      '<path d="' + d + '" stroke="#1f160f" stroke-opacity=".25" stroke-width="' + (bodyW + 3) + '" fill="none" stroke-linecap="round" transform="translate(1.5 2.5)"/>' +
      '<path d="' + d + '" stroke="' + look.base + '" stroke-width="' + bodyW + '" fill="none" stroke-linecap="round"/>' +
      patternLayers +
      '<path d="' + d + '" stroke="#fff" stroke-opacity=".18" stroke-width="' + (bodyW * 0.25) + '" fill="none" stroke-linecap="round" transform="translate(-1.5 -2)"/>' +
      '<g transform="translate(' + head[0].toFixed(1) + ' ' + head[1].toFixed(1) + ') rotate(' + ang.toFixed(1) + ')">' +
      '<ellipse cx="4" cy="0" rx="' + (bodyW * 0.75) + '" ry="' + (bodyW * 0.58) + '" fill="' + look.base + '"/>' +
      '<ellipse cx="3" cy="0" rx="' + (bodyW * 0.45) + '" ry="' + (bodyW * 0.22) + '" fill="' + look.pattern + '" opacity=".8"/>' +
      '<circle cx="' + (bodyW * 0.45).toFixed(1) + '" cy="-' + (bodyW * 0.3).toFixed(1) + '" r="1.9" fill="' + look.eye + '"/>' +
      '<circle cx="' + (bodyW * 0.45).toFixed(1) + '" cy="' + (bodyW * 0.3).toFixed(1) + '" r="1.9" fill="' + look.eye + '"/>' +
      '</g>' +
      '<text x="6" y="118" font-size="6.5" fill="#6b5536" font-family="sans-serif" opacity=".8">illustration</text>' +
      '</svg>';
    return svg;
  };

  SB.art.eggSVG = function (egg) {
    var h = egg.health;
    var fill = egg.status === 'failed' ? '#b9ad98' : h > 70 ? '#fbf6e8' : h > 40 ? '#f1e3bd' : '#e3cf9b';
    return '<svg viewBox="0 0 40 48" class="egg-art" aria-hidden="true"><ellipse cx="20" cy="25" rx="15" ry="20" fill="' + fill + '" stroke="#b69d6f" stroke-width="1.5"/>' +
      (egg.status === 'failed' ? '<path d="M12 18 L28 34 M28 18 L12 34" stroke="#8a7a60" stroke-width="2"/>' : '<ellipse cx="14" cy="17" rx="4" ry="6" fill="#fff" opacity=".6"/>') +
      '</svg>';
  };
})(globalThis.SB = globalThis.SB || {});
