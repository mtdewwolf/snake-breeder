/*
 * Mendelian genetics engine: allelic loci, lethal pairs, linkage (including
 * linkage to sex), gene-associated health flags and simple line-bred traits.
 * The full data schema is documented in README.md ("Genetics model").
 *
 * Each entry of SB.GENES is one mutant allele. Alleles that share a `locus`
 * compete for the same two slots (e.g. the BEL complex); a gene without a
 * `locus` is its own locus. A snake stores:
 *
 *   genotype:  { locusId: [sireAllele, damAllele] }  -- the hidden truth.
 *              Alleles are gene ids, or null for wild type. Wild-type loci are
 *              omitted. Index 0 came from the sire and index 1 from the dam, so
 *              phase is tracked for linked loci: in a male, index 0 of a
 *              sex-linked locus sits on his Y chromosome.
 *   knowledge: { locusId: { pairKey: prob } }         -- what the keeper can know.
 *              A pairKey is 'a/b' with '+' for wild type. Keys are sorted for
 *              unlinked loci and ordered sire/dam for linked ("phased") loci.
 *              A missing locus means certainly wild type ('+/+').
 *
 * Shorthand genotypes such as { pastel: 1, clown: 2 } or { mojave: 1, lesser: 1 }
 * (copies per gene) and legacy knowledge such as { clown: [p0, p1, p2] } are
 * accepted by every function and converted by G.norm / G.normKnowledge.
 *
 * Predictions use knowledge (so "possible hets" are handled honestly); eggs
 * are rolled from the true genotypes.
 */
(function (SB) {
  'use strict';

  var G = {};
  var WILD = '+';
  var WILD_KEY = WILD + '/' + WILD;

  G.WILD = WILD;
  G.LETHAL_LABEL = 'Non-viable egg (lethal combination)';
  G.OTHER_LABEL = 'Other combinations';
  G.SEVERITY_RANK = { mild: 1, moderate: 2, severe: 3 };

  /* Prediction pruning: outcomes rarer than minProb, or beyond maxStates while
     multiplying loci together, are folded into "Other combinations". */
  G.PREDICT = { minProb: 1e-7, maxStates: 2500 };

  G.rng = function () { return Math.random(); };

  function add(obj, key, v) { obj[key] = (obj[key] || 0) + v; }
  function floorPct(p) { return Math.floor(p * 100 + 1e-6); }

  /* ---------- Data index (built lazily, rebuilt when the data changes) ---------- */

  var IX = null;

  /* Call after editing SB.GENES / SB.ALLELE_COMBOS at runtime (tests, mods). */
  G.reindex = function () { IX = null; };

  function ix() {
    var combos = SB.ALLELE_COMBOS || [];
    if (IX && IX.src === SB.GENES && IX.len === SB.GENES.length && IX.csrc === combos && IX.clen === combos.length) return IX;
    var I = { src: SB.GENES, len: SB.GENES.length, csrc: combos, clen: combos.length, genes: {}, loci: {}, order: [], combos: {}, groups: [], groupOf: {}, singles: {} };
    SB.GENES.forEach(function (g, i) {
      if (!g.id || /[\/+|]/.test(g.id)) throw new Error('Gene ids may not contain "/", "+" or "|": ' + g.id);
      if (I.genes[g.id]) throw new Error('Duplicate gene id: ' + g.id);
      var L = g.locus || g.id;
      I.genes[g.id] = { gene: g, order: i, locus: L };
      var loc = I.loci[L];
      if (!loc) { loc = I.loci[L] = { id: L, order: I.order.length, alleles: [], linkage: null }; I.order.push(L); }
      loc.alleles.push(g);
      if (g.linkage) loc.linkage = g.linkage;
    });
    Object.keys(I.loci).forEach(function (L) {
      if (I.genes[L] && I.genes[L].locus !== L) throw new Error('Locus id "' + L + '" clashes with the id of a gene at another locus.');
    });
    combos.forEach(function (c) {
      var a = I.genes[c.pair[0]], b = I.genes[c.pair[1]];
      if (!a || !b || a.locus !== b.locus || c.pair[0] === c.pair[1]) throw new Error('ALLELE_COMBOS entry needs two different alleles of one locus: ' + c.name);
      if (c.locus && c.locus !== a.locus) throw new Error('ALLELE_COMBOS entry "' + c.name + '" names locus ' + c.locus + ' but its alleles are at ' + a.locus);
      I.combos[c.pair.slice().sort().join('/')] = c;
    });

    // Linkage groups: loci joined by `linkage.to` (a locus, a gene id or 'sex') form a tree.
    var parent = {}, rate = {}, children = {};
    I.order.forEach(function (L) {
      var lk = I.loci[L].linkage;
      if (!lk) return;
      var to = lk.to === 'sex' ? 'sex' : I.loci[lk.to] ? lk.to : I.genes[lk.to] ? I.genes[lk.to].locus : null;
      if (!to || to === L) throw new Error('Locus ' + L + ' is linked to an unknown locus: ' + lk.to);
      var r = lk.rate == null ? 0 : lk.rate;
      if (!(r >= 0 && r <= 0.5)) throw new Error('Linkage rate for ' + L + ' must be a recombination fraction between 0 and 0.5.');
      parent[L] = to; rate[L] = r;
      (children[to] = children[to] || []).push(L);
    });
    var roots = Object.keys(children).filter(function (n) { return !parent[n]; });
    roots.sort(function (a, b) { return a === 'sex' ? -1 : b === 'sex' ? 1 : I.loci[a].order - I.loci[b].order; });
    roots.forEach(function (root) {
      var nodes = [root];
      for (var i = 0; i < nodes.length; i++) (children[nodes[i]] || []).forEach(function (c) { nodes.push(c); });
      var group = { id: 'g:' + root, root: root, nodes: nodes, parent: parent, rate: rate, hasSex: root === 'sex',
        loci: nodes.filter(function (n) { return n !== 'sex'; }) };
      group.loci.forEach(function (L) { I.groupOf[L] = group; });
      I.groups.push(group);
    });
    Object.keys(parent).forEach(function (L) { if (!I.groupOf[L]) throw new Error('Linkage between loci forms a cycle at ' + L); });
    IX = I;
    return I;
  }

  G.gene = function (id) { var e = ix().genes[id]; return e ? e.gene : null; };
  G.locusOf = function (geneId) { var e = ix().genes[geneId]; return e ? e.locus : null; };

  /* All loci in data order: [{ id, order, alleles:[gene], linkage }] */
  G.loci = function () { var I = ix(); return I.order.map(function (L) { return I.loci[L]; }); };
  G.locus = function (L) { return ix().loci[L] || null; };

  /* A locus is phased when it belongs to a linkage group; its keys keep sire/dam order. */
  G.isPhased = function (L) { return !!ix().groupOf[L]; };
  G.isSexLinked = function (L) { var g = ix().groupOf[L]; return !!(g && g.hasSex); };

  /* A display name for a locus, e.g. "Mojave / Lesser" for the BEL complex. */
  G.locusName = function (L) {
    var loc = ix().loci[L];
    return loc ? loc.alleles.map(function (g) { return g.name; }).join(' / ') : L;
  };

  function groupFor(L) {
    var I = ix();
    if (I.groupOf[L]) return I.groupOf[L];
    return I.singles[L] || (I.singles[L] = { id: 'l:' + L, root: L, nodes: [L], loci: [L], single: true, hasSex: false });
  }

  function lociOrder(a, b) { var I = ix(); return I.loci[a].order - I.loci[b].order; }

  /* ---------- Genotype and knowledge formats ---------- */

  function ak(a) { return a == null ? WILD : a; }
  function unak(k) { return k === WILD ? null : k; }

  G.pairKey = function (L, pair) {
    var a = ak(pair[0]), b = ak(pair[1]);
    if (!G.isPhased(L) && b < a) { var t = a; a = b; b = t; }
    return a + '/' + b;
  };
  function sortedKey(a, b) { a = ak(a); b = ak(b); return a <= b ? a + '/' + b : b + '/' + a; }
  G.parsePairKey = function (k) { var p = k.split('/'); return [unak(p[0]), unak(p[1])]; };

  /*
   * Canonical genotype { locusId: [a, b] }. Accepts the canonical form, shorthand
   * copies per gene ({ pastel: 1, clown: 2 }) or a mix. Unknown genes are dropped.
   */
  G.norm = function (genotype) {
    var I = ix(), out = {}, extra = {};
    if (!genotype) return out;
    Object.keys(genotype).forEach(function (k) {
      var v = genotype[k];
      if (Array.isArray(v)) {
        var L = I.loci[k] ? k : I.genes[k] ? I.genes[k].locus : null;
        if (!L) return;
        var ok = function (a) { return a && I.genes[a] && I.genes[a].locus === L ? a : null; };
        out[L] = [ok(v[0]), ok(v[1])];
      } else if (v) {
        var e = I.genes[k];
        if (!e) return;
        for (var n = 0; n < Math.min(2, v); n++) (extra[e.locus] = extra[e.locus] || []).push(k);
      }
    });
    Object.keys(extra).forEach(function (L) {
      var list = (out[L] || []).filter(Boolean).concat(extra[L]);
      if (list.length > 2) throw new Error('More than two alleles at locus ' + L + ': ' + list.join(', '));
      out[L] = [list[0] || null, list[1] || null];
    });
    Object.keys(out).forEach(function (L) { if (!out[L][0] && !out[L][1]) delete out[L]; });
    return out;
  };

  /* Copies of one allele in a genotype (0, 1 or 2). */
  G.copies = function (genotype, geneId) {
    var L = G.locusOf(geneId), pair = L && G.norm(genotype)[L];
    return pair ? (pair[0] === geneId ? 1 : 0) + (pair[1] === geneId ? 1 : 0) : 0;
  };

  function cleanDist(d) {
    var tot = 0;
    Object.keys(d).forEach(function (k) { if (!(d[k] > 1e-12)) delete d[k]; else tot += d[k]; });
    if (tot > 0 && Math.abs(tot - 1) > 1e-9) Object.keys(d).forEach(function (k) { d[k] /= tot; });
    return d;
  }
  function isWildDist(d) { var ks = Object.keys(d); return !ks.length || (ks.length === 1 && ks[0] === WILD_KEY); }

  /*
   * Canonical knowledge. Accepts the canonical form or legacy per-gene arrays
   * [p0, p1, p2] (for a single allele; the copy's phase is split evenly on
   * phased loci because it is unknown).
   */
  G.normKnowledge = function (k) {
    var I = ix(), out = {};
    Object.keys(k || {}).forEach(function (key) {
      var v = k[key], L, d;
      if (Array.isArray(v)) {
        var e = I.genes[key];
        if (!e) return;
        L = e.locus; d = out[L] = out[L] || {};
        add(d, WILD_KEY, v[0] || 0);
        if (G.isPhased(L)) { add(d, key + '/' + WILD, (v[1] || 0) / 2); add(d, WILD + '/' + key, (v[1] || 0) / 2); }
        else add(d, sortedKey(key, null), v[1] || 0);
        add(d, key + '/' + key, v[2] || 0);
      } else if (v && typeof v === 'object') {
        L = I.loci[key] ? key : I.genes[key] ? I.genes[key].locus : null;
        if (!L) return;
        d = out[L] = out[L] || {};
        Object.keys(v).forEach(function (pk) {
          var pair = G.parsePairKey(pk);
          if ((pair[0] && G.locusOf(pair[0]) !== L) || (pair[1] && G.locusOf(pair[1]) !== L)) return;
          add(d, G.pairKey(L, pair), v[pk]);
        });
      }
    });
    Object.keys(out).forEach(function (L) { cleanDist(out[L]); if (isWildDist(out[L])) delete out[L]; });
    return out;
  };

  /* Knowledge that exactly matches the genotype (used for proven animals). */
  G.exactKnowledge = function (genotype) {
    var g = G.norm(genotype), k = {};
    Object.keys(g).forEach(function (L) { k[L] = {}; k[L][G.pairKey(L, g[L])] = 1; });
    return k;
  };

  /* A snake's knowledge in canonical form (exact if it has none recorded). */
  G.know = function (snake) {
    return snake.knowledge ? G.normKnowledge(snake.knowledge) : G.exactKnowledge(snake.genotype || {});
  };

  /* Knowledge distribution for one locus: { pairKey: prob }. */
  G.dist = function (snake, L) {
    var d = G.know(snake)[L];
    if (d) return d;
    var r = {}; r[WILD_KEY] = 1; return r;
  };

  /* Chance (from knowledge) that a snake carries at least one copy of an allele. */
  G.carryProb = function (snake, geneId) {
    var d = G.dist(snake, G.locusOf(geneId)), p = 0;
    Object.keys(d).forEach(function (k) { var pr = G.parsePairKey(k); if (pr[0] === geneId || pr[1] === geneId) p += d[k]; });
    return p;
  };

  /* Loci that are not certainly wild type in a knowledge object or genotype. */
  function activeLoci(list) {
    var seen = {};
    list.forEach(function (obj) {
      Object.keys(obj || {}).forEach(function (L) {
        var v = obj[L];
        if (Array.isArray(v) ? (v[0] || v[1]) : !isWildDist(v)) seen[L] = true;
      });
    });
    return Object.keys(seen).filter(function (L) { return ix().loci[L]; }).sort(lociOrder);
  }
  G.activeLoci = function () { return activeLoci(Array.prototype.slice.call(arguments)); };

  /* ---------- Visual forms, labels, lethality ---------- */

  function comboFor(a, b) { return ix().combos[[a, b].sort().join('/')] || null; }

  function geneForm(g, cls) {
    var e = ix().genes[g.id];
    return {
      id: g.id, cls: cls, gene: g, combo: null, locus: e.locus, order: e.order, recessive: g.type === 'recessive',
      name: cls === 'super' ? (g.superName || 'Super ' + g.name) : g.name,
      art: g.art ? (g.art[cls] || g.art.visual || null) : null
    };
  }

  /* The visual forms one pair of alleles produces (ignores lethality). */
  function formsForPair(a, b) {
    if (!a && !b) return [];
    var I = ix();
    if (!a || !b || a === b) {
      var g = I.genes[a || b].gene, hom = a === b;
      if (g.type === 'codominant') return [geneForm(g, hom ? 'super' : 'single')];
      if (g.type === 'dominant') return [geneForm(g, 'visual')];
      return hom ? [geneForm(g, 'visual')] : [];
    }
    var c = comboFor(a, b), ga = I.genes[a], gb = I.genes[b];
    if (c) {
      var first = ga.order <= gb.order ? ga : gb;
      var parts = [a, b].map(function (x) { return formsForPair(x, null)[0] || geneForm(I.genes[x].gene, 'visual'); });
      return [{
        id: c.id || c.pair.slice().sort().join('+'), cls: 'combo', gene: null, combo: c, locus: ga.locus, order: first.order,
        recessive: ga.gene.type === 'recessive' && gb.gene.type === 'recessive', name: c.name,
        // A combo without its own art shows both alleles' art.
        art: c.art || parts.map(function (f) { return f.art; }).filter(Boolean)
      }];
    }
    // No combo entry: each allele shows its own form. Two recessive alleles of one
    // locus do not complement each other, so both show.
    var bothRec = ga.gene.type === 'recessive' && gb.gene.type === 'recessive';
    return [ga, gb].sort(function (x, y) { return x.order - y.order; }).map(function (e) {
      if (e.gene.type === 'codominant') return geneForm(e.gene, 'single');
      if (e.gene.type === 'dominant' || bothRec) return geneForm(e.gene, 'visual');
      return null;
    }).filter(Boolean);
  }

  function pairLethal(a, b) {
    if (!a || !b) return false;
    if (a === b) return !!ix().genes[a].gene.superLethal;
    var c = comboFor(a, b);
    return !!(c && c.lethal);
  }

  function formsLabel(forms) { return forms.map(function (f) { return f.name; }).join(' '); }

  /* Codominant alleles in a pair, used to tell apart look-alike pairs (the BEL complex). */
  function codomSig(pair) {
    return pair.filter(function (a) { return a && G.gene(a).type === 'codominant'; })
      .sort(function (x, y) { return ix().genes[x].order - ix().genes[y].order; }).join('+');
  }
  function sigName(sig) { return sig.split('+').map(function (id) { return G.gene(id).name; }).join(' + '); }

  /*
   * Per-locus table of every unordered pair: its forms, per-locus label and
   * lethality. Pairs with the same label look alike, so the keeper cannot tell
   * them apart; the first such pair (wild type first, then data order) supplies
   * the canonical forms used for naming, which keeps labels consistent.
   */
  function locusInfo(L) {
    var loc = ix().loci[L];
    if (loc.info) return loc.info;
    var opts = [null].concat(loc.alleles.map(function (g) { return g.id; }));
    var info = { byKey: {}, labels: {}, pairs: [] };
    for (var i = 0; i < opts.length; i++) {
      for (var j = i; j < opts.length; j++) {
        var a = opts[i], b = opts[j], lethal = pairLethal(a, b);
        var forms = lethal ? [] : formsForPair(a, b);
        var p = { key: sortedKey(a, b), pair: [a, b], lethal: lethal, forms: forms, label: lethal ? null : formsLabel(forms) };
        info.byKey[p.key] = p;
        info.pairs.push(p);
        if (lethal) continue;
        var lab = info.labels[p.label];
        if (!lab) {
          lab = info.labels[p.label] = { forms: forms, shown: {}, sigs: {} };
          forms.forEach(function (f) {
            if (f.combo) f.combo.pair.forEach(function (x) { lab.shown[x] = true; });
            else lab.shown[f.id] = true;
          });
        }
        lab.sigs[codomSig([a, b])] = true;
      }
    }
    loc.info = info;
    return info;
  }

  function pairInfo(L, pair) { return locusInfo(L).byKey[sortedKey(pair[0], pair[1])]; }

  /* Every non-lethal unordered pair at a locus, for pickers: [{ key, pair, label }] */
  G.locusPairs = function (L) {
    return locusInfo(L).pairs.filter(function (p) { return !p.lethal; });
  };

  G.isLethal = function (genotype) {
    var g = G.norm(genotype);
    return Object.keys(g).some(function (L) { return pairInfo(L, g[L]).lethal; });
  };

  /*
   * The visual forms a genotype actually shows, in data order:
   * [{ id, cls: 'single'|'super'|'visual'|'combo', name, gene, combo, locus, art }]
   * `art` is a gene/combo art modifier (or a list of them for combos without art).
   */
  G.visualForms = function (genotype) {
    var g = G.norm(genotype), out = [];
    Object.keys(g).sort(lociOrder).forEach(function (L) {
      var p = pairInfo(L, g[L]);
      if (!p.lethal) out = out.concat(p.forms);
    });
    return out;
  };

  /* Ids of the forms a snake shows (gene ids, or combo ids for allele combos). */
  G.visualGenes = function (genotype) {
    var seen = {};
    return G.visualForms(genotype).map(function (f) { return f.id; }).filter(function (id) { return seen[id] ? false : (seen[id] = true); });
  };

  function clsMatch(want, cls) {
    return want === 'any' || want === cls || (Array.isArray(want) && want.indexOf(cls) >= 0);
  }

  /*
   * Name a set of forms. Designer names (SB.COMBO_NAMES) are matched greedily,
   * most specific entry first; leftover forms are appended. Parts are ordered
   * dominant/codominant before recessive, then by data order ("Bumblebee Clown").
   */
  function nameForms(forms) {
    var left = forms.slice(), parts = [], matched = [];
    var entries = SB.COMBO_NAMES || [];
    for (;;) {
      var best = null, bestUse = null, bestN = 0;
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i], keys = Object.keys(e.forms);
        if (keys.length <= bestN) continue;
        var use = [];
        var all = keys.every(function (id) {
          var f = left.find(function (x) { return x.id === id && use.indexOf(x) < 0 && clsMatch(e.forms[id], x.cls); });
          if (f) use.push(f);
          return !!f;
        });
        if (all) { best = e; bestUse = use; bestN = keys.length; }
      }
      if (!best) break;
      matched.push(best);
      left = left.filter(function (x) { return bestUse.indexOf(x) < 0; });
      parts.push({
        name: best.name,
        rank: bestUse.every(function (f) { return f.recessive; }) ? 1 : 0,
        order: Math.min.apply(null, bestUse.map(function (f) { return f.order; }))
      });
    }
    left.forEach(function (f) { parts.push({ name: f.name, rank: f.recessive ? 1 : 0, order: f.order }); });
    parts.sort(function (a, b) { return a.rank - b.rank || a.order - b.order; });
    return { label: parts.length ? parts.map(function (p) { return p.name; }).join(' ') : 'Normal', combos: matched };
  }

  function labelFormsFor(g) {
    var out = [];
    Object.keys(g).sort(lociOrder).forEach(function (L) {
      var p = pairInfo(L, g[L]);
      if (!p.lethal) out = out.concat(locusInfo(L).labels[p.label].forms);
    });
    return out;
  }

  /* { label, combos: [COMBO_NAMES entries used] } for a genotype. */
  G.describe = function (genotype) { return nameForms(labelFormsFor(G.norm(genotype))); };

  /* Visual morph label from a true genotype, e.g. "Bumblebee Clown" or "Normal". */
  G.morphLabel = function (genotype) { return G.describe(genotype).label; };

  /* Per-locus look, e.g. 'Pastel', 'Blue-Eyed Leucistic' or '' (null if lethal). */
  G.locusLabel = function (L, pair) { var p = pairInfo(L, pair); return p.lethal ? null : p.label; };

  /* ---------- Health / welfare ---------- */

  function formHealth(f) {
    var h = f.combo ? f.combo.health : f.gene && f.gene.health;
    if (!h || (h.forms && h.forms.indexOf(f.cls) < 0)) return null;
    return h;
  }

  /*
   * Health issues a genotype expresses: [{ source, issue, severity, note, fertility, sex }].
   * Issues restricted to one sex (health.sex) are dropped for the other sex.
   */
  G.healthIssues = function (genotype, sex) {
    var out = [];
    G.visualForms(genotype).forEach(function (f) {
      var h = formHealth(f);
      if (!h || (h.sex && sex && h.sex !== sex)) return;
      out.push({ source: f.name, issue: h.issue, severity: h.severity || 'mild', note: h.note || '', fertility: h.fertility, sex: h.sex || null });
    });
    return out;
  };

  G.worstSeverity = function (issues) {
    var worst = null;
    issues.forEach(function (i) { if (!worst || G.SEVERITY_RANK[i.severity] > G.SEVERITY_RANK[worst]) worst = i.severity; });
    return worst;
  };

  /* Multiplier on a female's fertile-egg chance from her own health flags. */
  G.fertilityFactor = function (snake) {
    if (snake.sex !== 'F') return 1;
    return G.healthIssues(snake.genotype, 'F').reduce(function (f, i) { return f * (i.fertility != null ? i.fertility : 1); }, 1);
  };

  /* ---------- Text helpers ---------- */

  G.pct = function (p) {
    var v = p * 100;
    if (v > 0 && v < 1) return '<1%';
    return (Math.round(v * 10) / 10).toString().replace(/\.0$/, '') + '%';
  };

  G.hetText = function (gene, p) {
    if (p >= 0.999) return 'het ' + gene.name;
    return floorPct(p) + '% poss. het ' + gene.name;
  };

  /*
   * Keeper notes for one locus from a knowledge distribution and the look
   * that was observed: hidden hets, possible homozygous dominants, look-alike
   * allele combinations and (for males) which sex chromosome carries a
   * sex-linked allele. Returns [{ text, certain, gene, locus }].
   */
  function notesFor(L, dist, label, sex) {
    var info = locusInfo(L), lab = info.labels[label] || { shown: {}, sigs: {} }, notes = [];
    var entries = Object.keys(dist).filter(function (k) { return dist[k] > 1e-9; }).map(function (k) { return { pair: G.parsePairKey(k), p: dist[k] }; });
    ix().loci[L].alleles.forEach(function (g) {
      var has = 0, hom = 0, onY = 0, onX = 0;
      entries.forEach(function (e) {
        var n = (e.pair[0] === g.id ? 1 : 0) + (e.pair[1] === g.id ? 1 : 0);
        if (n) has += e.p;
        if (n === 2) hom += e.p;
        if (e.pair[0] === g.id && e.pair[1] !== g.id) onY += e.p;
        if (e.pair[1] === g.id && e.pair[0] !== g.id) onX += e.p;
      });
      if (g.type === 'recessive' && !lab.shown[g.id] && has > 0.001) notes.push({ text: G.hetText(g, has), certain: has >= 0.999, gene: g.id, locus: L });
      if (g.type === 'dominant' && lab.shown[g.id] && hom > 0.001) {
        notes.push({ text: hom >= 0.999 ? 'Homozygous ' + g.name : floorPct(hom) + '% poss. homozygous ' + g.name, certain: hom >= 0.999, gene: g.id, locus: L });
      }
      if (sex === 'M' && G.isSexLinked(L) && onY + onX > 0.001) {
        var y = onY / (onY + onX);
        notes.push({
          text: y >= 0.999 ? 'Male maker (' + g.name + ' on Y)' : y <= 0.001 ? 'Female maker (' + g.name + ' on X)' : floorPct(y) + '% poss. male maker (' + g.name + ' on Y)',
          certain: y >= 0.999 || y <= 0.001, gene: g.id, locus: L
        });
      }
    });
    // Several allele combinations share this look (e.g. the BEL complex): say which.
    if (Object.keys(lab.sigs).length > 1) {
      var sigs = {};
      entries.forEach(function (e) { add(sigs, codomSig(e.pair), e.p); });
      Object.keys(sigs).forEach(function (s) {
        if (!s || sigs[s] <= 0.001) return;
        notes.push({ text: sigs[s] >= 0.999 ? sigName(s) : floorPct(sigs[s]) + '% poss. ' + sigName(s), certain: sigs[s] >= 0.999, locus: L });
      });
    }
    return notes;
  }

  /* Human-readable carrier / hidden notes for a snake, based on knowledge. */
  G.carrierNotes = function (snake) {
    var geno = G.norm(snake.genotype), know = G.know(snake), notes = [];
    activeLoci([know, geno]).forEach(function (L) {
      var label = G.locusLabel(L, geno[L] || [null, null]);
      var d = know[L];
      if (!d) { d = {}; d[G.pairKey(L, geno[L])] = 1; }
      notes = notes.concat(notesFor(L, d, label, snake.sex));
    });
    return notes;
  };

  /* Describe one pair for pickers and clues, e.g. "Pastel", "het Clown", "Blue-Eyed Leucistic (Mojave + Lesser)". */
  G.pairName = function (L, pair) {
    var p = pairInfo(L, pair);
    var names = pair.filter(Boolean).map(function (a) { return G.gene(a).name; });
    if (p.lethal) return names.join(' + ') + ' (lethal)';
    var lab = locusInfo(L).labels[p.label], parts = [];
    if (p.label) parts.push(p.label);
    if (Object.keys(lab.sigs).length > 1 && codomSig(pair)) parts.push('(' + sigName(codomSig(pair)) + ')');
    pair.forEach(function (a) { if (a && G.gene(a).type === 'recessive' && !lab.shown[a]) parts.push('het ' + G.gene(a).name); });
    if (pair[0] && pair[0] === pair[1] && G.gene(pair[0]).type === 'dominant') parts.push('(homozygous)');
    return parts.join(' ') || 'Normal';
  };

  /* ---------- Offspring distributions per linkage group ---------- */

  var WILD_DIST = {}; WILD_DIST[WILD_KEY] = 1;
  function kdist(know, L) { return know[L] || WILD_DIST; }

  /* Groups touching any non-wild locus of the given knowledge/genotype objects. */
  function groupsFor(objs) {
    var seen = {}, out = [];
    activeLoci(objs).forEach(function (L) {
      var g = groupFor(L);
      if (!seen[g.id]) { seen[g.id] = true; out.push(g); }
    });
    return out;
  }

  /* One parent's gametes for a multi-locus group: [{ p, al: {L: allele}, y }] */
  function groupGametes(group, know, isSire) {
    var states = [{ p: 1, pairs: {} }];
    // Knowledge is stored per locus, so loci are treated as independent here (documented approximation).
    group.loci.forEach(function (L) {
      var d = kdist(know, L), next = [];
      states.forEach(function (s) {
        Object.keys(d).forEach(function (k) {
          var np = Object.assign({}, s.pairs);
          np[L] = G.parsePairKey(k);
          next.push({ p: s.p * d[k], pairs: np });
        });
      });
      states = next;
    });
    var out = {};
    states.forEach(function (st) {
      (function walk(i, h, p, al) {
        if (p <= 0) return;
        if (i === group.nodes.length) {
          var y = group.hasSex && isSire && h.sex === 0;
          var key = (y ? 'Y' : 'X') + group.loci.map(function (L) { return ak(al[L]); }).join('|');
          var o = out[key] || (out[key] = { p: 0, al: Object.assign({}, al), y: y });
          o.p += p;
          return;
        }
        var n = group.nodes[i], opts;
        if (i === 0) opts = [[0, 0.5], [1, 0.5]];
        else { var ph = h[group.parent[n]], r = group.rate[n]; opts = [[ph, 1 - r], [1 - ph, r]]; }
        opts.forEach(function (o) {
          h[n] = o[0];
          if (n !== 'sex') al[n] = st.pairs[n][o[0]];
          walk(i + 1, h, p * o[1], al);
        });
      })(0, {}, st.p, {});
    });
    return Object.keys(out).map(function (k) { return out[k]; });
  }

  /* Offspring states for a group: [{ p, pairs: {L: [sireAllele, damAllele]}, sex: 'M'|'F'|null }] */
  function groupOffspring(group, kS, kD) {
    var acc = {};
    if (group.single) {
      var L = group.loci[0];
      var gam = function (d) {
        var g = {};
        Object.keys(d).forEach(function (k) { var pr = k.split('/'); add(g, pr[0], d[k] / 2); add(g, pr[1], d[k] / 2); });
        return g;
      };
      var gs = gam(kdist(kS, L)), gd = gam(kdist(kD, L));
      Object.keys(gs).forEach(function (a) {
        Object.keys(gd).forEach(function (b) {
          var k = sortedKey(unak(a), unak(b));
          var o = acc[k] || (acc[k] = { p: 0, pairs: {}, sex: null });
          o.pairs[L] = G.parsePairKey(k);
          o.p += gs[a] * gd[b];
        });
      });
    } else {
      var sg = groupGametes(group, kS, true), dg = groupGametes(group, kD, false);
      sg.forEach(function (s) {
        dg.forEach(function (d) {
          var sex = group.hasSex ? (s.y ? 'M' : 'F') : null, pairs = {};
          group.loci.forEach(function (L) { pairs[L] = [s.al[L] || null, d.al[L] || null]; });
          var k = sex + '|' + group.loci.map(function (L) { return G.pairKey(L, pairs[L]); }).join('|');
          var o = acc[k] || (acc[k] = { p: 0, pairs: pairs, sex: sex });
          o.p += s.p * d.p;
        });
      });
    }
    return Object.keys(acc).map(function (k) { return acc[k]; }).filter(function (o) { return o.p > 0; });
  }

  function stateLabels(group, st) {
    var labels = {}, lethal = false;
    group.loci.forEach(function (L) {
      var p = pairInfo(L, st.pairs[L]);
      if (p.lethal) lethal = true;
      labels[L] = p.label;
    });
    return { labels: labels, lethal: lethal };
  }

  function stateHealth(group, st) {
    var out = [];
    group.loci.forEach(function (L) {
      var p = pairInfo(L, st.pairs[L]);
      if (p.lethal) return;
      p.forms.forEach(function (f) {
        var h = formHealth(f);
        if (!h) return;
        var w = !h.sex ? 1 : st.sex ? (st.sex === h.sex ? 1 : 0) : 0.5;
        if (w) out.push({ key: f.name + '|' + h.issue, source: f.name, issue: h.issue, severity: h.severity || 'mild', note: h.note || '', sex: h.sex || null, w: w });
      });
    });
    return out;
  }

  /* Group offspring states into look-alike classes with carrier notes and health odds. */
  function classesOf(group, states) {
    var byKey = {}, list = [];
    states.forEach(function (st) {
      var sl = stateLabels(group, st);
      var key = sl.lethal ? '!lethal' : group.loci.map(function (L) { return sl.labels[L]; }).join('|');
      var c = byKey[key];
      if (!c) {
        c = byKey[key] = { prob: 0, male: group.hasSex ? 0 : null, lethal: sl.lethal, labels: sl.labels, dists: {}, health: {} };
        list.push(c);
      }
      c.prob += st.p;
      if (group.hasSex && st.sex === 'M') c.male += st.p;
      if (sl.lethal) return;
      group.loci.forEach(function (L) { add(c.dists[L] = c.dists[L] || {}, G.pairKey(L, st.pairs[L]), st.p); });
      stateHealth(group, st).forEach(function (h) {
        var e = c.health[h.key] || (c.health[h.key] = { source: h.source, issue: h.issue, severity: h.severity, note: h.note, sex: h.sex, p: 0 });
        e.p += st.p * h.w;
      });
    });
    list.forEach(function (c) {
      c.forms = []; c.carriers = [];
      if (!c.lethal) {
        group.loci.forEach(function (L) {
          var d = c.dists[L];
          Object.keys(d).forEach(function (k) { d[k] /= c.prob; });
          c.forms = c.forms.concat(locusInfo(L).labels[c.labels[L]].forms);
          c.carriers = c.carriers.concat(notesFor(L, d, c.labels[L], null).map(function (n) { return n.text; }));
        });
      }
      c.health = Object.keys(c.health).map(function (k) { var h = c.health[k]; h.p /= c.prob; return h; });
    });
    return list.sort(function (a, b) { return b.prob - a.prob; });
  }

  /* ---------- Predictions ---------- */

  function traitsPreview(male, female) {
    return (SB.TRAITS || []).map(function (t) {
      var mean = (G.traitScore(male, t.id) + G.traitScore(female, t.id)) / 2, sd = t.noise != null ? t.noise : 8;
      var z = (t.threshold - mean) / (sd || 1e-9);
      return { trait: t, mean: mean, sd: sd, pAbove: sd ? 1 - normCdf(z) : (mean >= t.threshold ? 1 : 0) };
    });
  }

  /*
   * Predict per-egg outcomes for a pairing using keeper knowledge.
   * Returns {
   *   outcomes: [{ label, prob, carriers:[text], genes:[form ids], forms, male, sexNote, health:[...], lethal?, other? }],
   *   lethal, other, sexLinked, health: [{ source, issue, severity, note, prob }],
   *   perLocus: [{ locus, name, classes: [{ label, prob, carriers, lethal }] }], traits: [...]
   * }
   * Outcome probabilities (including the lethal and "other" rows) sum to 1.
   */
  G.predict = function (male, female) {
    var kS = G.know(male), kD = G.know(female);
    var groups = groupsFor([kS, kD]);
    var sexLinked = groups.some(function (g) { return g.hasSex; });
    var perLocus = [], lethal = 0, other = 0;
    var outs = [{ prob: 1, male: 0.5, forms: [], carriers: [], health: [] }];

    groups.forEach(function (group) {
      var states = groupOffspring(group, kS, kD);
      var classes = classesOf(group, states);
      group.loci.forEach(function (L) {
        var single = group.loci.length === 1 ? classes : classesOf({ loci: [L], single: true, hasSex: false }, marginal(states, L));
        perLocus.push({ locus: L, name: G.locusName(L), classes: single.map(function (c) {
          return { label: c.lethal ? G.LETHAL_LABEL : c.labels[L] || 'Normal', prob: c.prob, carriers: c.carriers, lethal: c.lethal, male: c.male };
        }) });
      });
      var next = [];
      outs.forEach(function (o) {
        classes.forEach(function (c) {
          var p = o.prob * c.prob;
          if (c.lethal) { lethal += p; return; }
          if (p < G.PREDICT.minProb) { other += p; return; }
          next.push({
            prob: p, male: c.male != null ? o.prob * c.male : o.male * c.prob,
            forms: o.forms.concat(c.forms), carriers: o.carriers.concat(c.carriers),
            health: c.health.length ? o.health.concat(c.health) : o.health
          });
        });
      });
      if (next.length > G.PREDICT.maxStates) {
        next.sort(function (a, b) { return b.prob - a.prob; });
        next.slice(G.PREDICT.maxStates).forEach(function (o) { other += o.prob; });
        next.length = G.PREDICT.maxStates;
      }
      outs = next;
    });

    // Name each outcome and merge those that read the same.
    var merged = {}, outcomes = [];
    outs.forEach(function (o) {
      var label = nameForms(o.forms).label, key = label + '|' + o.carriers.join('|');
      var m = merged[key];
      if (!m) {
        m = merged[key] = { label: label, prob: 0, male: 0, carriers: o.carriers, forms: o.forms, genes: o.forms.map(function (f) { return f.id; }), health: {} };
        outcomes.push(m);
      }
      m.prob += o.prob; m.male += o.male;
      o.health.forEach(function (h) {
        var e = m.health[h.source + '|' + h.issue] || (m.health[h.source + '|' + h.issue] = { source: h.source, issue: h.issue, severity: h.severity, note: h.note, sex: h.sex, p: 0 });
        e.p += h.p * o.prob;
      });
    });
    var health = {};
    outcomes.forEach(function (o) {
      o.health = Object.keys(o.health).map(function (k) {
        var h = o.health[k];
        var agg = health[k] || (health[k] = { source: h.source, issue: h.issue, severity: h.severity, note: h.note, sex: h.sex, prob: 0 });
        agg.prob += h.p;
        h.p /= o.prob;
        return h;
      });
      var f = o.male / o.prob;
      o.sexNote = sexLinked && Math.abs(f - 0.5) >= 0.1 ? (f >= 0.5 ? G.pct(f) + ' male' : G.pct(1 - f) + ' female') : null;
    });
    outcomes.sort(function (a, b) { return b.prob - a.prob || a.label.localeCompare(b.label); });
    if (other > 1e-6) outcomes.push({ label: G.OTHER_LABEL, prob: other, carriers: [], genes: [], forms: [], health: [], other: true });
    if (lethal > 0) outcomes.push({ label: G.LETHAL_LABEL, prob: lethal, carriers: [], genes: [], forms: [], health: [], lethal: true });

    return {
      outcomes: outcomes, lethal: lethal, other: other, sexLinked: sexLinked,
      health: Object.keys(health).map(function (k) { return health[k]; }).sort(function (a, b) { return b.prob - a.prob; }),
      perLocus: perLocus, perGene: perLocus, traits: traitsPreview(male, female)
    };
  };

  function marginal(states, L) {
    var acc = {};
    states.forEach(function (st) {
      var k = G.pairKey(L, st.pairs[L]);
      var o = acc[k] || (acc[k] = { p: 0, pairs: {}, sex: null });
      o.pairs[L] = st.pairs[L];
      o.p += st.p;
    });
    return Object.keys(acc).map(function (k) { return acc[k]; });
  }

  /* The top n outcomes for display; the rest are folded into "Other combinations". */
  G.topOutcomes = function (pred, n) {
    var main = pred.outcomes.filter(function (o) { return !o.lethal && !o.other; });
    var out = main.slice(0, n);
    var rest = main.slice(n).reduce(function (s, o) { return s + o.prob; }, 0) + (pred.other > 1e-6 ? pred.other : 0);
    if (rest > 1e-9) out.push({ label: G.OTHER_LABEL, prob: rest, carriers: [], genes: [], forms: [], health: [], other: true, count: main.length - out.length });
    if (pred.lethal > 0) out.push(pred.outcomes[pred.outcomes.length - 1]);
    return out;
  };

  /*
   * Chance per egg of a hatchling that looks like `target` (a genotype), from
   * keeper knowledge. Computed per locus, so it stays fast with many genes.
   */
  G.probOf = function (male, female, target) {
    var t = G.norm(target), kS = G.know(male), kD = G.know(female), p = 1;
    groupsFor([kS, kD, t]).forEach(function (group) {
      var want = {};
      group.loci.forEach(function (L) { want[L] = G.locusLabel(L, t[L] || [null, null]); });
      var s = 0;
      groupOffspring(group, kS, kD).forEach(function (st) {
        var sl = stateLabels(group, st);
        if (!sl.lethal && group.loci.every(function (L) { return sl.labels[L] === want[L]; })) s += st.p;
      });
      p *= s;
    });
    return p;
  };

  /* ---------- Rolling eggs (true genotypes) ---------- */

  function rollGamete(geno, isSire, rng) {
    var I = ix(), al = {}, y = null;
    I.groups.forEach(function (group) {
      var h = {};
      group.nodes.forEach(function (n, i) {
        h[n] = i === 0 ? (rng() < 0.5 ? 0 : 1) : (rng() < group.rate[n] ? 1 - h[group.parent[n]] : h[group.parent[n]]);
        if (n !== 'sex' && geno[n]) al[n] = geno[n][h[n]];
      });
      if (group.hasSex && isSire) y = h.sex === 0;
    });
    Object.keys(geno).forEach(function (L) { if (!I.groupOf[L]) al[L] = geno[L][rng() < 0.5 ? 0 : 1]; });
    if (isSire && y === null) y = rng() < 0.5;
    return { al: al, y: y };
  }

  /*
   * Roll one egg from the parents' true genotypes. The sire's gamete decides
   * sex (Y → male). Returns { genotype, sex, lethal, traits }.
   */
  G.rollEgg = function (male, female, rng) {
    rng = rng || G.rng;
    var gm = G.norm(male.genotype), gf = G.norm(female.genotype);
    var a = rollGamete(gm, true, rng), b = rollGamete(gf, false, rng), g = {};
    activeLoci([gm, gf]).forEach(function (L) {
      var pair = [a.al[L] || null, b.al[L] || null];
      if (pair[0] || pair[1]) g[L] = pair;
    });
    return { genotype: g, sex: a.y ? 'M' : 'F', lethal: G.isLethal(g), traits: G.rollTraits(male, female, rng) };
  };

  /* Roll just the genotype of one egg. */
  G.rollGenotype = function (male, female, rng) { return G.rollEgg(male, female, rng).genotype; };

  /*
   * What a keeper can know about a hatchling: parents' knowledge, the baby's
   * looks and its sex. Loci in one linkage group are conditioned jointly and
   * then stored per locus.
   */
  G.inferKnowledge = function (male, female, genotype, sex) {
    var g = G.norm(genotype), kS = G.know(male), kD = G.know(female), k = {};
    groupsFor([kS, kD, g]).forEach(function (group) {
      var want = {};
      group.loci.forEach(function (L) { want[L] = G.locusLabel(L, g[L] || [null, null]); });
      var states = groupOffspring(group, kS, kD).filter(function (st) {
        var sl = stateLabels(group, st);
        return !sl.lethal && group.loci.every(function (L) { return sl.labels[L] === want[L]; }) && (!group.hasSex || !sex || st.sex === sex);
      });
      var tot = states.reduce(function (s, st) { return s + st.p; }, 0);
      group.loci.forEach(function (L) {
        var d = {};
        if (tot > 0) states.forEach(function (st) { add(d, G.pairKey(L, st.pairs[L]), st.p / tot); });
        else if (g[L]) d[G.pairKey(L, g[L])] = 1; // lineage can't explain the look; trust the look
        cleanDist(d);
        if (!isWildDist(d)) k[L] = d;
      });
    });
    return k;
  };

  /* ---------- Market value helper ---------- */

  /* Premium for one pair: visible forms plus hidden recessive copies (hetValue). */
  G.pairValue = function (L, pair) {
    var p = pairInfo(L, pair);
    if (p.lethal) return 0;
    var lab = locusInfo(L).labels[p.label], v = 0;
    p.forms.forEach(function (f) {
      if (f.combo) v += f.combo.value != null ? f.combo.value : f.combo.pair.reduce(function (s, id) { return s + (G.gene(id).value || 0); }, 0);
      else if (f.cls === 'super') v += f.gene.superValue != null ? f.gene.superValue : 2 * (f.gene.value || 0);
      else v += f.gene.value || 0;
    });
    pair.forEach(function (a) { if (a && G.gene(a).type === 'recessive' && !lab.shown[a]) v += G.gene(a).hetValue || 0; });
    return v;
  };

  /* Expected genetic premium from what the keeper can prove (knowledge), plus designer-name bonuses. */
  G.geneticValue = function (snake) {
    var know = G.know(snake), geno = G.norm(snake.genotype), v = 0;
    activeLoci([know, geno]).forEach(function (L) {
      var d = know[L];
      if (!d) { d = {}; d[G.pairKey(L, geno[L])] = 1; }
      Object.keys(d).forEach(function (k) { v += d[k] * G.pairValue(L, G.parsePairKey(k)); });
    });
    G.describe(geno).combos.forEach(function (c) { v += c.value || 0; });
    return v;
  };

  /* ---------- Polygenic (line-bred) traits ---------- */

  function traitDef(id) { return (SB.TRAITS || []).find(function (t) { return t.id === id; }); }

  function gauss(rng) {
    var u = 1 - rng(), v = rng();
    return Math.sqrt(-2 * Math.log(u || 1e-12)) * Math.cos(2 * Math.PI * v);
  }

  function normCdf(z) {
    // Abramowitz & Stegun 7.1.26 approximation of erf.
    var x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
    var erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
  }

  G.traitScore = function (snake, id) {
    var t = traitDef(id), v = snake && snake.traits && snake.traits[id];
    return v != null ? v : (t && t.base != null ? t.base : 50);
  };

  /* Founder scores: base ± spread (normal), clamped to 0–100. */
  G.randomTraits = function (rng) {
    rng = rng || G.rng;
    var out = {};
    (SB.TRAITS || []).forEach(function (t) {
      out[t.id] = Math.round(Math.max(0, Math.min(100, (t.base != null ? t.base : 50) + gauss(rng) * (t.spread != null ? t.spread : 12))));
    });
    return out;
  };

  /* Offspring scores: mid-parent + normal noise, clamped to 0–100. */
  G.rollTraits = function (male, female, rng) {
    rng = rng || G.rng;
    var out = {};
    (SB.TRAITS || []).forEach(function (t) {
      var mid = (G.traitScore(male, t.id) + G.traitScore(female, t.id)) / 2;
      out[t.id] = Math.round(Math.max(0, Math.min(100, mid + gauss(rng) * (t.noise != null ? t.noise : 8))));
    });
    return out;
  };

  /* Traits at or above their threshold: [{ trait, score, label }] */
  G.traitBadges = function (snake) {
    return (SB.TRAITS || []).filter(function (t) { return G.traitScore(snake, t.id) >= t.threshold; })
      .map(function (t) { return { trait: t, score: G.traitScore(snake, t.id), label: t.label || t.name }; });
  };

  /* Short genetics label used on cards, e.g. "High-contrast Pastel · het Clown". */
  G.fullLabel = function (snake) {
    var morph = G.traitBadges(snake).map(function (b) { return b.label + ' '; }).join('') + G.morphLabel(snake.genotype);
    var notes = G.carrierNotes(snake).map(function (n) { return n.text; });
    return notes.length ? morph + ' · ' + notes.join(' · ') : morph;
  };

  SB.genetics = G;
})(globalThis.SB = globalThis.SB || {});
