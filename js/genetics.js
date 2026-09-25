/*
 * Simplified Mendelian genetics engine.
 *
 * Each gene is an independent locus with a wild-type allele and one mutant
 * allele. A snake stores:
 *   genotype:  { geneId: 0 | 1 | 2 }        -- the true number of mutant copies (hidden truth)
 *   knowledge: { geneId: [p0, p1, p2] }     -- what the keeper can know from lineage + looks
 *
 * Predictions use knowledge (so "possible hets" are handled honestly);
 * actual eggs are rolled from the true genotypes.
 */
(function (SB) {
  'use strict';

  var G = {};

  G.rng = function () { return Math.random(); };

  /* Which visual class a count of copies falls into, per gene type. */
  G.visualClass = function (gene, count) {
    if (gene.type === 'codominant') return ['none', 'single', 'super'][count];
    if (gene.type === 'dominant') return count > 0 ? 'visual' : 'none';
    return count === 2 ? 'visual' : 'none'; // recessive
  };

  G.classCounts = function (gene, cls) {
    return [0, 1, 2].filter(function (c) { return G.visualClass(gene, c) === cls; });
  };

  G.classLabel = function (gene, cls) {
    if (cls === 'none') return '';
    if (cls === 'super') return gene.superName;
    return gene.name;
  };

  /* Knowledge helpers */
  G.exact = function (count) {
    var d = [0, 0, 0]; d[count] = 1; return d;
  };

  G.distOf = function (snake, geneId) {
    return (snake.knowledge && snake.knowledge[geneId]) || [1, 0, 0];
  };

  G.mutantGameteProb = function (dist) { return dist[1] * 0.5 + dist[2]; };

  G.offspringDist = function (dA, dB) {
    var a = G.mutantGameteProb(dA), b = G.mutantGameteProb(dB);
    return [(1 - a) * (1 - b), a * (1 - b) + b * (1 - a), a * b];
  };

  /* Condition a distribution on the visual class that was actually observed. */
  G.condition = function (gene, dist, cls) {
    var counts = G.classCounts(gene, cls);
    var total = counts.reduce(function (s, c) { return s + dist[c]; }, 0);
    var out = [0, 0, 0];
    if (total <= 0) return out;
    counts.forEach(function (c) { out[c] = dist[c] / total; });
    return out;
  };

  /* Genes that matter for a set of snakes (any nonzero chance of a mutant copy). */
  G.relevantGenes = function (snakes) {
    return SB.GENES.filter(function (gene) {
      return snakes.some(function (s) { return G.distOf(s, gene.id)[0] < 1; });
    });
  };

  /* Visual morph label from a true genotype, e.g. "Pastel Clown" or "Normal". */
  G.morphLabel = function (genotype) {
    var parts = [];
    SB.GENES.forEach(function (gene) {
      var lbl = G.classLabel(gene, G.visualClass(gene, genotype[gene.id] || 0));
      if (lbl) parts.push(lbl);
    });
    return parts.length ? parts.join(' ') : 'Normal';
  };

  G.visualGenes = function (genotype) {
    return SB.GENES.filter(function (gene) {
      return G.visualClass(gene, genotype[gene.id] || 0) !== 'none';
    }).map(function (g) { return g.id; });
  };

  G.pct = function (p) {
    var v = p * 100;
    if (v > 0 && v < 1) return '<1%';
    return (Math.round(v * 10) / 10).toString().replace(/\.0$/, '') + '%';
  };

  G.hetText = function (gene, p) {
    if (p >= 0.999) return 'het ' + gene.name;
    return Math.floor(p * 100 + 1e-6) + '% poss. het ' + gene.name;
  };

  /*
   * Human-readable carrier / hidden notes for a snake, based on knowledge.
   * Returns [{ text, certain }]
   */
  G.carrierNotes = function (snake) {
    var notes = [];
    SB.GENES.forEach(function (gene) {
      var d = G.distOf(snake, gene.id);
      var count = snake.genotype[gene.id] || 0;
      var cls = G.visualClass(gene, count);
      if (gene.type === 'recessive' && cls === 'none') {
        var p = d[1] + d[2];
        if (p > 0.001) notes.push({ text: G.hetText(gene, p), certain: p >= 0.999, gene: gene.id });
      }
      if (gene.type === 'dominant' && cls === 'visual' && d[2] > 0.001) {
        notes.push({
          text: d[2] >= 0.999 ? 'Homozygous ' + gene.name : Math.floor(d[2] * 100 + 1e-6) + '% poss. homozygous ' + gene.name,
          certain: d[2] >= 0.999, gene: gene.id
        });
      }
    });
    return notes;
  };

  /* Short genetics label used on cards, e.g. "Pastel · het Clown". */
  G.fullLabel = function (snake) {
    var morph = G.morphLabel(snake.genotype);
    var notes = G.carrierNotes(snake).map(function (n) { return n.text; });
    return notes.length ? morph + ' · ' + notes.join(' · ') : morph;
  };

  /*
   * Predict per-egg outcomes for a pairing using keeper knowledge.
   * Returns { outcomes: [{label, prob, carriers:[text], genes:[ids]}], perGene: [...] }
   */
  G.predict = function (male, female) {
    var genes = G.relevantGenes([male, female]);
    var perGene = genes.map(function (gene) {
      var od = G.offspringDist(G.distOf(male, gene.id), G.distOf(female, gene.id));
      var classes = {};
      [0, 1, 2].forEach(function (c) {
        if (od[c] <= 0) return;
        var cls = G.visualClass(gene, c);
        classes[cls] = (classes[cls] || 0) + od[c];
      });
      var list = Object.keys(classes).map(function (cls) {
        var cond = G.condition(gene, od, cls);
        var carrier = null;
        if (gene.type === 'recessive' && cls === 'none' && cond[1] > 0.001) carrier = G.hetText(gene, cond[1]);
        if (gene.type === 'dominant' && cls === 'visual' && cond[2] > 0.001) {
          carrier = cond[2] >= 0.999 ? 'homozygous ' + gene.name : Math.floor(cond[2] * 100 + 1e-6) + '% poss. homozygous ' + gene.name;
        }
        return { cls: cls, prob: classes[cls], label: G.classLabel(gene, cls), carrier: carrier, geneId: gene.id };
      });
      return { gene: gene, dist: od, classes: list };
    });

    var outcomes = [{ prob: 1, parts: [], carriers: [], genes: [] }];
    perGene.forEach(function (pg) {
      var next = [];
      outcomes.forEach(function (o) {
        pg.classes.forEach(function (c) {
          next.push({
            prob: o.prob * c.prob,
            parts: c.label ? o.parts.concat([c.label]) : o.parts,
            carriers: c.carrier ? o.carriers.concat([c.carrier]) : o.carriers,
            genes: c.cls !== 'none' ? o.genes.concat([c.geneId]) : o.genes
          });
        });
      });
      outcomes = next;
    });

    outcomes = outcomes.filter(function (o) { return o.prob > 1e-9; }).map(function (o) {
      return { label: o.parts.length ? o.parts.join(' ') : 'Normal', prob: o.prob, carriers: o.carriers, genes: o.genes };
    }).sort(function (a, b) { return b.prob - a.prob || a.label.localeCompare(b.label); });

    return { outcomes: outcomes, perGene: perGene };
  };

  /* Roll one egg's true genotype from the parents' true genotypes. */
  G.rollGenotype = function (male, female, rng) {
    rng = rng || G.rng;
    var g = {};
    SB.GENES.forEach(function (gene) {
      var m = male.genotype[gene.id] || 0, f = female.genotype[gene.id] || 0;
      var c = (rng() < m / 2 ? 1 : 0) + (rng() < f / 2 ? 1 : 0);
      if (c) g[gene.id] = c;
    });
    return g;
  };

  /* What a keeper can know about a hatchling: parents' knowledge + the baby's looks. */
  G.inferKnowledge = function (male, female, genotype) {
    var k = {};
    SB.GENES.forEach(function (gene) {
      var od = G.offspringDist(G.distOf(male, gene.id), G.distOf(female, gene.id));
      if (od[0] >= 1) return;
      var cls = G.visualClass(gene, genotype[gene.id] || 0);
      var cond = G.condition(gene, od, cls);
      if (cond[0] < 1) k[gene.id] = cond;
    });
    return k;
  };

  /* Knowledge that exactly matches the genotype (used for proven animals). */
  G.exactKnowledge = function (genotype) {
    var k = {};
    Object.keys(genotype).forEach(function (id) { if (genotype[id]) k[id] = G.exact(genotype[id]); });
    return k;
  };

  SB.genetics = G;
})(globalThis.SB = globalThis.SB || {});
