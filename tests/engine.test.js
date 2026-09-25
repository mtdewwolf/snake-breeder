'use strict';
// Allelic loci, lethal pairs, sex linkage, designer names, health, traits,
// prediction pruning and save migration.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

['util', 'data', 'genetics', 'art', 'state', 'sim'].forEach((f) => require(path.join(__dirname, '..', 'js', f + '.js')));
const SB = globalThis.SB;
const G = SB.genetics;

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const snake = (genotype, sex, knowledge) => ({ genotype, sex, knowledge: knowledge || G.exactKnowledge(genotype) });
const probOf = (pred, label) => pred.outcomes.filter((o) => o.label === label).reduce((s, o) => s + o.prob, 0);
const total = (pred) => pred.outcomes.reduce((s, o) => s + o.prob, 0);

/* Small deterministic PRNG so statistical tests are repeatable. */
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Temporarily extend the data tables for a test, then restore them. */
function withData(extra, fn) {
  const saved = { genes: SB.GENES.slice(), combos: SB.ALLELE_COMBOS.slice(), names: SB.COMBO_NAMES.slice() };
  try {
    (extra.genes || []).forEach((g) => SB.GENES.push(g));
    (extra.combos || []).forEach((c) => SB.ALLELE_COMBOS.push(c));
    (extra.names || []).forEach((c) => SB.COMBO_NAMES.push(c));
    G.reindex();
    return fn();
  } finally {
    SB.GENES.length = 0; saved.genes.forEach((g) => SB.GENES.push(g));
    SB.ALLELE_COMBOS.length = 0; saved.combos.forEach((c) => SB.ALLELE_COMBOS.push(c));
    SB.COMBO_NAMES.length = 0; saved.names.forEach((c) => SB.COMBO_NAMES.push(c));
    G.reindex();
  }
}

function fakeStorage(initial) {
  const store = Object.assign({}, initial);
  global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } };
  return store;
}

/* ---------- Formats ---------- */

test('shorthand genotypes normalise to per-locus allele pairs', () => {
  assert.deepStrictEqual(G.norm({ pastel: 1, clown: 2 }), { pastel: ['pastel', null], clown: ['clown', 'clown'] });
  assert.deepStrictEqual(G.norm({ mojave: 1, lesser: 1 }), { bel: ['mojave', 'lesser'] });
  assert.deepStrictEqual(G.norm(G.norm({ mojave: 1, lesser: 1 })), { bel: ['mojave', 'lesser'] }, 'idempotent');
  assert.throws(() => G.norm({ mojave: 2, lesser: 1 }), /More than two alleles/);
  assert.strictEqual(G.copies({ lesser: 2 }, 'lesser'), 2);
  assert.deepStrictEqual(G.normKnowledge({ clown: [0.5, 0.5, 0] }), { clown: { '+/+': 0.5, '+/clown': 0.5 } });
  // Phase of a legacy het on a sex-linked locus is unknown: split evenly.
  assert.deepStrictEqual(G.normKnowledge({ banana: [0, 1, 0] }), { banana: { 'banana/+': 0.5, '+/banana': 0.5 } });
});

/* ---------- Allelic groups ---------- */

test('Mojave x Lesser: allelic pair makes a Blue-Eyed Leucistic combo', () => {
  const p = G.predict(snake({ mojave: 1 }), snake({ lesser: 1 }));
  near(probOf(p, 'Blue-Eyed Leucistic'), 0.25);
  near(probOf(p, 'Mojave'), 0.25);
  near(probOf(p, 'Lesser'), 0.25);
  near(probOf(p, 'Normal'), 0.25);
  const forms = G.visualForms({ mojave: 1, lesser: 1 });
  assert.strictEqual(forms.length, 1);
  assert.strictEqual(forms[0].cls, 'combo');
  assert.strictEqual(forms[0].art, SB.ALLELE_COMBOS[0].art);
  assert.strictEqual(G.morphLabel({ lesser: 2 }), 'Blue-Eyed Leucistic', 'homozygous codominant uses superName');
  // A BEL from Mojave x Lesser parents: the keeper sees a BEL and knows which alleles it has.
  const k = G.inferKnowledge(snake({ mojave: 1 }), snake({ lesser: 1 }), { mojave: 1, lesser: 1 });
  assert.deepStrictEqual(k.bel, { 'lesser/mojave': 1 });
  // BEL x BEL never produces anything but BELs, and no snake carries three alleles.
  const bb = G.predict(snake({ mojave: 1, lesser: 1 }), snake({ mojave: 1, lesser: 1 }));
  near(probOf(bb, 'Blue-Eyed Leucistic'), 1);
  const bel = bb.outcomes[0];
  assert.ok(bel.carriers.some((c) => /50% poss\. Mojave \+ Lesser/.test(c)), bel.carriers.join());
});

test('allelic fallback: no combo entry shows both forms; recessive alleles do not complement', () => {
  withData({ genes: [
    { id: 'cinnamon', name: 'Cinnamon', type: 'codominant', locus: 'cin', superName: 'Super Cinnamon', value: 50 },
    { id: 'blackpastel', name: 'Black Pastel', type: 'codominant', locus: 'cin', superName: 'Super Black Pastel', value: 50 },
    { id: 'candy', name: 'Candy', type: 'recessive', locus: 'cdy', value: 100, hetValue: 10 },
    { id: 'toffee', name: 'Toffee', type: 'recessive', locus: 'cdy', value: 100, hetValue: 10 }
  ] }, () => {
    assert.strictEqual(G.morphLabel({ cinnamon: 1, blackpastel: 1 }), 'Cinnamon Black Pastel');
    assert.strictEqual(G.morphLabel({ candy: 1, toffee: 1 }), 'Candy Toffee');
    assert.strictEqual(G.morphLabel({ candy: 1 }), 'Normal');
    const p = G.predict(snake({ candy: 1 }), snake({ toffee: 1 }));
    near(probOf(p, 'Candy Toffee'), 0.25);
    near(probOf(p, 'Normal'), 0.75);
    const normal = p.outcomes.find((o) => o.label === 'Normal');
    assert.deepStrictEqual(normal.carriers, ['33% poss. het Candy', '33% poss. het Toffee']);
  });
});

test('a combo can be lethal', () => {
  withData({ genes: [
    { id: 'alpha', name: 'Alpha', type: 'codominant', locus: 'ab', superName: 'Super Alpha' },
    { id: 'beta', name: 'Beta', type: 'codominant', locus: 'ab', superName: 'Super Beta' }
  ], combos: [{ pair: ['alpha', 'beta'], name: 'Alpha Beta', lethal: true }] }, () => {
    const p = G.predict(snake({ alpha: 1 }), snake({ beta: 1 }));
    near(p.lethal, 0.25);
    near(probOf(p, G.LETHAL_LABEL), 0.25);
    assert.ok(G.isLethal({ alpha: 1, beta: 1 }));
  });
});

/* ---------- Lethal supers ---------- */

test('Champagne x Champagne: 25% non-viable, shown explicitly, and rolls agree', () => {
  const p = G.predict(snake({ champagne: 1 }), snake({ champagne: 1 }));
  near(p.lethal, 0.25);
  near(probOf(p, 'Champagne'), 0.5);
  near(probOf(p, 'Normal'), 0.25);
  near(total(p), 1);
  const last = G.topOutcomes(p, 3).slice(-1)[0];
  assert.ok(last.lethal && last.label === G.LETHAL_LABEL);
  const champ = p.outcomes.find((o) => o.label === 'Champagne');
  assert.deepStrictEqual(champ.carriers, [], 'surviving Champagnes are all single-copy');
  const rng = seeded(7); let lethal = 0; const n = 20000;
  for (let i = 0; i < n; i++) if (G.rollEgg(snake({ champagne: 1 }, 'M'), snake({ champagne: 1 }, 'F'), rng).lethal) lethal++;
  near(lethal / n, 0.25, 0.015);
});

test('lethal eggs are laid but never develop, and are surfaced in the clutch', () => {
  fakeStorage();
  const state = SB.state.newGame();
  state.money = 5000;
  const m = SB.state.makeSnake(state, { name: 'Fizz', sex: 'M', genotype: { champagne: 1 }, ageWeeks: 200, weight: 1100, hunger: 10 });
  const f = SB.state.makeSnake(state, { name: 'Pop', sex: 'F', genotype: { champagne: 1 }, ageWeeks: 200, weight: 2400, hunger: 10 });
  state.snakes.push(m, f);
  const proj = { id: 'pq', maleId: m.id, femaleId: f.id, maleName: m.name, femaleName: f.name, stage: 'gravid', weeksInStage: SB.TIMING.gravidWeeks, startWeek: 1,
    incubatorId: state.incubators[0].id, eggs: [], slugs: 0, predicted: [], babies: [] };
  state.projects.push(proj);
  const orig = G.rng; G.rng = seeded(3);
  try { SB.sim.advanceWeek(state); } finally { G.rng = orig; }
  assert.ok(proj.eggs.length > 0);
  const lethalEggs = proj.eggs.filter((e) => e.lethal);
  assert.strictEqual(lethalEggs.length, proj.nonViable);
  lethalEggs.forEach((e) => { assert.strictEqual(e.status, 'failed'); assert.strictEqual(G.copies(e.genotype, 'champagne'), 2); });
  proj.eggs.filter((e) => !e.lethal).forEach((e) => assert.ok(G.copies(e.genotype, 'champagne') < 2));
  assert.ok(proj.nonViable > 0, 'this seed lays at least one lethal egg');
  assert.ok(state.log.some((l) => /won’t develop/.test(l.text)));
});

/* ---------- Sex linkage (Banana) ---------- */

test('Banana male maker: predictions show sex-specific odds and match seeded rolls', () => {
  const r = SB.GENE_BY_ID.banana.linkage.rate;
  const maleMaker = snake({ banana: ['banana', null] }, 'M');
  const p = G.predict(maleMaker, snake({}, 'F'));
  assert.ok(p.sexLinked);
  const ban = p.outcomes.find((o) => o.label === 'Banana');
  near(ban.prob, 0.5);
  near(ban.male, 0.5 * (1 - r));
  assert.strictEqual(ban.sexNote, G.pct(1 - r) + ' male');
  const rng = seeded(11), n = 40000; let bm = 0, bf = 0, males = 0;
  for (let i = 0; i < n; i++) {
    const egg = G.rollEgg(maleMaker, snake({}, 'F'), rng);
    if (egg.sex === 'M') males++;
    if (G.copies(egg.genotype, 'banana')) { if (egg.sex === 'M') bm++; else bf++; }
  }
  near(males / n, 0.5, 0.01);
  near(bm / n, 0.5 * (1 - r), 0.01);
  near(bf / n, 0.5 * r, 0.006);
});

test('Banana female maker and Banana females', () => {
  const r = SB.GENE_BY_ID.banana.linkage.rate;
  const femaleMaker = snake({ banana: [null, 'banana'] }, 'M');
  const ban = G.predict(femaleMaker, snake({}, 'F')).outcomes.find((o) => o.label === 'Banana');
  near(ban.male, 0.5 * r);
  assert.strictEqual(ban.sexNote, G.pct(1 - r) + ' female');
  // A Banana female passes it to sons and daughters alike.
  const fb = G.predict(snake({}, 'M'), snake({ banana: 1 }, 'F')).outcomes.find((o) => o.label === 'Banana');
  near(fb.male, 0.25);
  assert.strictEqual(fb.sexNote, null);
  // Unknown phase (e.g. a bought male): 50/50.
  const unknown = snake({ banana: ['banana', null] }, 'M', { banana: [0, 1, 0] });
  near(G.predict(unknown, snake({}, 'F')).outcomes.find((o) => o.label === 'Banana').male, 0.25);
  assert.match(G.carrierNotes(unknown).map((n) => n.text).join(), /50% poss\. male maker/);
});

test('hatchlings inherit phase knowledge: sons of a male maker are male makers', () => {
  const sire = snake({ banana: ['banana', null] }, 'M');
  const son = G.inferKnowledge(sire, snake({}, 'F'), { banana: ['banana', null] }, 'M');
  assert.deepStrictEqual(son.banana, { 'banana/+': 1 });
  assert.deepStrictEqual(G.carrierNotes({ genotype: { banana: ['banana', null] }, knowledge: son, sex: 'M' }).map((n) => n.text), ['Male maker (Banana on Y)']);
  // A rare Banana daughter from a male maker got it through recombination onto his X.
  const daughter = G.inferKnowledge(sire, snake({}, 'F'), { banana: ['banana', null] }, 'F');
  assert.deepStrictEqual(daughter.banana, { 'banana/+': 1 });
  // Her sons then get Banana from their mother (on X): female makers.
  const grandson = G.inferKnowledge(snake({}, 'M'), { genotype: { banana: ['banana', null] }, knowledge: daughter, sex: 'F' }, { banana: [null, 'banana'] }, 'M');
  assert.match(G.carrierNotes({ genotype: { banana: [null, 'banana'] }, knowledge: grandson, sex: 'M' })[0].text, /Female maker/);
});

test('gene-to-gene linkage keeps phase in rolls', () => {
  withData({ genes: [
    { id: 'lk1', name: 'Link One', type: 'codominant' },
    { id: 'lk2', name: 'Link Two', type: 'codominant', linkage: { to: 'lk1', rate: 0.1 } }
  ] }, () => {
    assert.ok(G.isPhased('lk1') && G.isPhased('lk2') && !G.isSexLinked('lk2'));
    const cis = snake({ lk1: ['lk1', null], lk2: ['lk2', null] }, 'M'); // both on the sire-derived chromosome
    const rng = seeded(5), n = 20000; let both = 0, one = 0;
    for (let i = 0; i < n; i++) {
      const g = G.rollGenotype(cis, snake({}, 'F'), rng);
      const a = G.copies(g, 'lk1'), b = G.copies(g, 'lk2');
      if (a && b) both++; else if (a || b) one++;
    }
    near(both / n, 0.45, 0.015);
    near(one / n, 0.1, 0.01);
    const pred = G.predict(cis, snake({}, 'F'));
    near(probOf(pred, 'Link One Link Two'), 0.45);
  });
});

/* ---------- Designer names ---------- */

test('designer names: most specific match wins, leftovers are appended', () => {
  assert.strictEqual(G.morphLabel({ pastel: 1, spider: 1 }), 'Bumblebee');
  assert.strictEqual(G.morphLabel({ pastel: 1, spider: 1, clown: 2 }), 'Bumblebee Clown');
  assert.strictEqual(G.morphLabel({ pastel: 2, spider: 1 }), 'Killer Bee');
  assert.strictEqual(G.morphLabel({ pastel: 1, pinstripe: 1 }), 'Lemon Blast');
  assert.strictEqual(G.morphLabel({ pastel: 1, pinstripe: 1, spider: 1 }), 'Bumblebee Pinstripe', 'each form is used once; first-listed wins a tie');
  assert.strictEqual(G.morphLabel({ clown: 2, pastel: 1 }), 'Pastel Clown', 'recessives come last regardless of key order');
  withData({ names: [{ name: 'Queen Bee', forms: { pastel: 'single', spider: 'visual', clown: 'visual' } }] }, () => {
    assert.strictEqual(G.morphLabel({ pastel: 1, spider: 1, clown: 2 }), 'Queen Bee');
    assert.strictEqual(G.morphLabel({ pastel: 1, spider: 1, clown: 2, albino: 2 }), 'Queen Bee Albino');
  });
  withData({ names: [{ name: 'Any Pastel Pin', forms: { pastel: 'any', pinstripe: ['visual'] } }] }, () => {
    assert.strictEqual(G.morphLabel({ pastel: 2, pinstripe: 1 }), 'Any Pastel Pin');
  });
  // Predictions use the same names.
  const p = G.predict(snake({ pastel: 1, spider: 1 }), snake({}));
  near(probOf(p, 'Bumblebee'), 0.25);
});

test('Morph Book matching and pair finder use engine labels', () => {
  fakeStorage();
  const state = SB.state.newGame();
  const slot = SB.BOOK.find((pg) => pg.id === 'designer').slots.find((s) => s.name === 'Lemon Blast');
  assert.strictEqual(G.morphLabel(slot.genotype), 'Lemon Blast');
  assert.strictEqual(SB.sim.bookSlotFor('Lemon Blast').slot, slot);
  const m = snake({ pastel: 1, clown: 1 }, 'M'), f = snake({ clown: 1, pastel: 1 }, 'F');
  near(G.probOf(m, f, { pastel: 1, clown: 2 }), probOf(G.predict(m, f), 'Pastel Clown'));
  near(G.probOf(m, f, {}), probOf(G.predict(m, f), 'Normal'));
  assert.ok(state.snakes.length);
});

/* ---------- Health / welfare ---------- */

test('health flags surface on snakes and in predictions', () => {
  const issues = G.healthIssues({ spider: 1 }, 'M');
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].issue, 'wobble');
  assert.strictEqual(G.worstSeverity(issues), 'moderate');
  const p = G.predict(snake({ spider: 1, pastel: 1 }), snake({}));
  const wob = p.health.find((h) => h.issue === 'wobble');
  near(wob.prob, 0.5);
  assert.ok(p.outcomes.find((o) => o.label === 'Bumblebee').health.length === 1);
});

test('female-only fertility issues reduce eggs and are sex-aware', () => {
  withData({ genes: [
    { id: 'desertx', name: 'Desert X', type: 'dominant', health: { issue: 'fertility', severity: 'mild', note: 'Females lay fewer good eggs.', sex: 'F', fertility: 0.5 } }
  ] }, () => {
    assert.strictEqual(G.healthIssues({ desertx: 1 }, 'M').length, 0);
    assert.strictEqual(G.fertilityFactor({ sex: 'F', genotype: { desertx: 1 } }), 0.5);
    assert.strictEqual(G.fertilityFactor({ sex: 'M', genotype: { desertx: 1 } }), 1);
    const h = G.predict(snake({ desertx: 1 }), snake({})).health[0];
    near(h.prob, 0.25); // half are Desert X, half of those are female
  });
});

test('selling an affected animal earns less reputation (gently)', () => {
  fakeStorage();
  const state = SB.state.newGame();
  const mk = (g) => { const s = SB.state.makeSnake(state, { genotype: g, ageWeeks: 60, weight: 500, health: 95 }); state.snakes.push(s); return s; };
  const plain = mk({ pastel: 1 }), wobbly = mk({ spider: 1 });
  let rep = state.reputation;
  assert.ok(SB.sim.sell(state, plain.id).ok);
  assert.strictEqual(state.reputation, rep + 1);
  rep = state.reputation;
  assert.ok(SB.sim.sell(state, wobbly.id).ok);
  assert.strictEqual(state.reputation, rep + 1 + SB.WELFARE.saleRep.moderate);
});

/* ---------- Polygenic traits ---------- */

test('line-bred traits: mid-parent plus noise, label above threshold, value bonus', () => {
  const t = SB.TRAITS[0];
  const hi = { genotype: {}, traits: { contrast: 90 } }, lo = { genotype: {}, traits: { contrast: 70 } };
  const rng = seeded(9); let sum = 0; const n = 5000;
  for (let i = 0; i < n; i++) sum += G.rollTraits(hi, lo, rng).contrast;
  near(sum / n, 80, 0.6);
  assert.deepStrictEqual(G.traitBadges(hi).map((b) => b.label), [t.label]);
  assert.deepStrictEqual(G.traitBadges(lo), []);
  assert.strictEqual(G.traitScore({ genotype: {} }, 'contrast'), t.base, 'missing scores read the base');
  assert.match(G.fullLabel(Object.assign({ knowledge: {} }, hi)), /^High-contrast Normal/);
  fakeStorage();
  const state = SB.state.newGame();
  const a = SB.state.makeSnake(state, { genotype: {}, traits: { contrast: 90 }, health: 100, ageWeeks: 10, sex: 'M' });
  const b = SB.state.makeSnake(state, { genotype: {}, traits: { contrast: 50 }, health: 100, ageWeeks: 10, sex: 'M' });
  assert.ok(SB.sim.value(state, a) > SB.sim.value(state, b));
  const pred = G.predict(Object.assign({ sex: 'M' }, hi), Object.assign({ sex: 'F' }, lo));
  near(pred.traits[0].mean, 80);
  assert.ok(pred.traits[0].pAbove > 0.7);
});

/* ---------- Prediction scalability ---------- */

test('predictions stay fast and bounded with ~10 genes per parent', () => {
  const extra = [];
  for (let i = 0; i < 14; i++) extra.push({ id: 'syn' + i, name: 'Syn' + i, type: i % 3 === 0 ? 'recessive' : i % 3 === 1 ? 'dominant' : 'codominant', superName: 'Super Syn' + i, value: 10 });
  withData({ genes: extra }, () => {
    const male = { pastel: 1, spider: 1, mojave: 1, clown: 1, albino: 1 }, female = { pastel: 1, lesser: 1, clown: 1, piebald: 1, yellowbelly: 1 };
    extra.forEach((g, i) => { if (i % 2) male[g.id] = 1; else female[g.id] = 1; });
    const t0 = Date.now();
    const p = G.predict(snake(male, 'M'), snake(female, 'F'));
    const ms = Date.now() - t0;
    assert.ok(ms < 1500, 'predict took ' + ms + 'ms');
    near(total(p), 1, 1e-6);
    assert.ok(p.outcomes.length <= G.PREDICT.maxStates + 2);
    assert.ok(p.other > 0, 'the long tail is folded into Other combinations');
    const top = G.topOutcomes(p, 12);
    assert.ok(top.length <= 13);
    assert.strictEqual(top[top.length - 1].label, G.OTHER_LABEL);
    near(top.reduce((s, o) => s + o.prob, 0), 1, 1e-6);
    assert.ok(p.perLocus.length >= 20, 'per-locus breakdown is kept');
    p.perLocus.forEach((pl) => near(pl.classes.reduce((s, c) => s + c.prob, 0), 1, 1e-9));
    // The per-locus pair finder agrees with an unpruned prediction.
    const q = G.predict(snake({ pastel: 1, clown: 1, syn1: 1 }), snake({ clown: 1, syn2: 1 }));
    near(G.probOf(snake({ pastel: 1, clown: 1, syn1: 1 }), snake({ clown: 1, syn2: 1 }), { pastel: 1, clown: 2, syn1: 1 }), probOf(q, 'Pastel Syn1 Clown'));
  });
});

/* ---------- Market ---------- */

test('random market animals are canonical, never lethal and not overloaded with genes', () => {
  fakeStorage();
  const state = SB.state.newGame();
  const orig = G.rng; G.rng = seeded(21);
  try {
    let genes = 0;
    for (let w = 0; w < 60; w++) {
      state.week = w * 4;
      SB.sim.refreshMarket(state, false);
      state.market.listings.forEach((l) => {
        assert.deepStrictEqual(l.snake.genotype, G.norm(l.snake.genotype));
        assert.ok(!G.isLethal(l.snake.genotype));
        genes += Object.keys(l.snake.genotype).length;
      });
    }
    assert.ok(genes > 0);
  } finally { G.rng = orig; }
});

/* ---------- Save migration ---------- */

test('a version 1 save migrates losslessly and keeps playing', () => {
  const v1 = {
    version: 1, week: 30, money: 900, reputation: 12, nextId: 50,
    snakes: [
      { id: 'sn2', name: 'Biscuit', sex: 'M', ageWeeks: 190, weight: 1200, genotype: { pastel: 1, clown: 1 }, knowledge: { pastel: [0, 1, 0], clown: [0, 1, 0] },
        health: 95, stress: 10, hunger: 20, temperament: 'Calm', enclosureId: 'en1', origin: 'Starter', parents: null, hatchWeek: null, mealsEaten: 20, weeksSinceShed: 1, recoveryUntil: 0, restUntil: 0, keeper: false, history: [] },
      { id: 'sn3', name: 'Marigold', sex: 'F', ageWeeks: 240, weight: 2000, genotype: { clown: 1, piebald: 1 }, knowledge: { clown: [0, 1, 0], piebald: [0.5, 0.5, 0] },
        health: 95, stress: 10, hunger: 20, temperament: 'Calm', enclosureId: 'en2', origin: 'Starter', parents: null, hatchWeek: null, mealsEaten: 20, weeksSinceShed: 1, recoveryUntil: 0, restUntil: 0, keeper: false, history: [] },
      { id: 'sn4', name: 'Lemon', sex: 'F', ageWeeks: 20, weight: 300, genotype: { pastel: 1, pinstripe: 2 }, knowledge: { pastel: [0, 1, 0], pinstripe: [0, 0.33, 0.67] },
        health: 95, stress: 10, hunger: 20, temperament: 'Calm', enclosureId: 'en3', origin: 'Hatched', parents: null, hatchWeek: 10, mealsEaten: 5, weeksSinceShed: 1, recoveryUntil: 0, restUntil: 0, keeper: false, history: [] }
    ],
    enclosures: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ id: 'en' + i, kind: i < 5 ? 'adult' : 'tub', name: 'E' + i, setTemp: 90, temp: 90, humidity: 58, clean: 100, water: 100 })),
    incubators: [{ id: 'in1', name: 'Incubator 1', setTemp: 89, temp: 89, humidity: 95 }],
    projects: [{ id: 'pr1', maleId: 'sn2', femaleId: 'sn3', maleName: 'Biscuit', femaleName: 'Marigold', stage: 'incubating', weeksInStage: 5, startWeek: 20, incubatorId: 'in1', layWeek: 25,
      eggs: [{ id: 'e0', genotype: { pastel: 1, clown: 2 }, health: 90, status: 'good' }, { id: 'e1', genotype: { clown: 1 }, health: 90, status: 'good' }], slugs: 1,
      predicted: [{ label: 'Pastel Clown', prob: 0.125 }], babies: [],
      maleSnapshot: { genotype: { pastel: 1, clown: 1 }, knowledge: { pastel: [0, 1, 0], clown: [0, 1, 0] } },
      femaleSnapshot: { genotype: { clown: 1, piebald: 1 }, knowledge: { clown: [0, 1, 0], piebald: [0.5, 0.5, 0] } } }],
    upgrades: { thermostats: true, humidity: true, incubController: true },
    market: { requests: [], trades: [], listings: [{ id: 'ls1', seller: 'Shop', price: 300, snake: { id: 'sn9', name: 'Mo', sex: 'F', ageWeeks: 150, weight: 1600, genotype: { mojave: 1 }, knowledge: { mojave: [0, 1, 0] }, health: 90, stress: 10, hunger: 10, temperament: 'Shy', enclosureId: null, origin: 'Bought', parents: null, hatchWeek: null, mealsEaten: 10, weeksSinceShed: 0, recoveryUntil: 0, restUntil: 0, keeper: false, history: [] } }] },
    goalsDone: ['settle', 'firstPair'],
    discoveries: [{ label: 'Pastel Pinstripe', week: 10, genes: ['pastel', 'pinstripe'], by: 'Lemon', snakeId: 'sn4', genotype: { pastel: 1, pinstripe: 2 } }],
    log: [], usedNames: ['Biscuit', 'Marigold', 'Lemon'],
    stats: { fed: 3, cleaned: 2, pairings: 1, hatched: 1, sold: 0, requestsFilled: 0 },
    tutorial: { done: {}, dismissed: true }, lastHatch: null, bookDone: []
  };
  // Values before migration, computed with the v1 rules for comparison.
  fakeStorage({ 'scale-and-nasl-save-v1': JSON.stringify(v1) });
  const loaded = SB.state.load();
  assert.ok(loaded.state, loaded.error);
  const st = loaded.state;
  assert.strictEqual(st.version, 2);
  const bis = st.snakes.find((s) => s.name === 'Biscuit');
  assert.deepStrictEqual(bis.genotype, { pastel: ['pastel', null], clown: ['clown', null] });
  assert.deepStrictEqual(bis.knowledge, { pastel: { '+/pastel': 1 }, clown: { '+/clown': 1 } });
  const mari = st.snakes.find((s) => s.name === 'Marigold');
  assert.deepStrictEqual(mari.knowledge.piebald, { '+/+': 0.5, '+/piebald': 0.5 });
  assert.strictEqual(G.fullLabel(mari), 'Normal · het Clown · 50% poss. het Piebald');
  const lemon = st.snakes.find((s) => s.name === 'Lemon');
  assert.deepStrictEqual(lemon.knowledge.pinstripe, { '+/pinstripe': 0.33, 'pinstripe/pinstripe': 0.67 });
  assert.strictEqual(G.fullLabel(lemon), 'Lemon Blast · 67% poss. homozygous Pinstripe');
  assert.deepStrictEqual(st.market.listings[0].snake.genotype, { bel: ['mojave', null] });
  assert.deepStrictEqual(st.market.listings[0].snake.knowledge, { bel: { '+/mojave': 1 } });
  const p = st.projects[0];
  assert.deepStrictEqual(p.eggs[0].genotype, { pastel: ['pastel', null], clown: ['clown', 'clown'] });
  assert.deepStrictEqual(p.maleSnapshot.knowledge.clown, { '+/clown': 1 });
  assert.deepStrictEqual(p.femaleSnapshot.genotype, { clown: ['clown', null], piebald: ['piebald', null] });
  // Discovery labels follow the naming data, so the Morph Book slot still matches.
  assert.strictEqual(st.discoveries[0].label, 'Lemon Blast');
  const slot = SB.BOOK.find((pg) => pg.id === 'designer').slots.find((s) => s.name === 'Lemon Blast');
  assert.ok(SB.sim.slotDiscovery(st, slot));
  // Keep playing: the old eggs (no rolled sex) hatch and get inferred knowledge.
  const orig = G.rng; G.rng = seeded(2);
  try { for (let i = 0; i < 3; i++) SB.sim.advanceWeek(st); } finally { G.rng = orig; }
  assert.strictEqual(p.stage, 'done');
  const baby = SB.sim.snake(st, p.babies[0]);
  assert.ok(baby.sex === 'M' || baby.sex === 'F');
  assert.strictEqual(G.morphLabel(baby.genotype), 'Pastel Clown');
  assert.deepStrictEqual(baby.knowledge.clown, { 'clown/clown': 1 });
  assert.ok(SB.sim.revealAll(st, p.id).ok);
  assert.ok(st.discoveries.some((d) => d.label === 'Pastel Clown'));
  // Saving and loading again is stable.
  SB.state.save(st);
  const again = SB.state.load().state;
  assert.deepStrictEqual(again.snakes.map((s) => s.genotype), st.snakes.map((s) => s.genotype));
});

test('an unknown future version is rejected with a friendly message', () => {
  fakeStorage({ 'scale-and-nasl-save-v1': JSON.stringify({ version: 99, snakes: [] }) });
  const r = SB.state.load();
  assert.strictEqual(r.state, null);
  assert.match(r.error, /incompatible/);
});

/* ---------- Art hook ---------- */

test('art.lookFor uses engine visual forms, including combo art', () => {
  const bel = SB.art.lookFor({ mojave: 1, lesser: 1 });
  assert.strictEqual(bel.eye, '#4d8fdc');
  assert.ok(bel.flags.plain);
  assert.ok(SB.art.lookFor({ lesser: 1 }).flags.cleanSides);
  const svg = SB.art.snakeSVG({ id: 'x1', name: 'X', genotype: G.norm({ banana: 1, spider: 1 }), ageWeeks: 60 });
  assert.match(svg, /^<svg/);
});
