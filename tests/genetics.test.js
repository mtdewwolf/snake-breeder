'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

['util', 'data', 'genetics', 'art', 'state', 'sim'].forEach((f) => require(path.join(__dirname, '..', 'js', f + '.js')));
const SB = globalThis.SB;
const G = SB.genetics;

function snake(genotype, knowledge) {
  return { genotype, knowledge: knowledge || G.exactKnowledge(genotype) };
}
function probOf(pred, label) {
  const o = pred.outcomes.find((x) => x.label === label);
  return o ? o.prob : 0;
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('codominant x normal gives 50/50', () => {
  const p = G.predict(snake({ pastel: 1 }), snake({}));
  near(probOf(p, 'Pastel'), 0.5);
  near(probOf(p, 'Normal'), 0.5);
});

test('codominant x codominant produces a super form', () => {
  const p = G.predict(snake({ pastel: 1 }), snake({ pastel: 1 }));
  near(probOf(p, 'Super Pastel'), 0.25);
  near(probOf(p, 'Pastel'), 0.5);
});

test('het x het recessive: 25% visual, normals are 66% possible het', () => {
  const p = G.predict(snake({ clown: 1 }), snake({ clown: 1 }));
  near(probOf(p, 'Clown'), 0.25);
  const normal = p.outcomes.find((o) => o.label === 'Normal');
  assert.deepStrictEqual(normal.carriers, ['66% poss. het Clown']);
});

test('multi-gene: Pastel het Clown x het Clown', () => {
  const p = G.predict(snake({ pastel: 1, clown: 1 }), snake({ clown: 1 }));
  near(probOf(p, 'Pastel Clown'), 0.125);
  near(probOf(p, 'Clown'), 0.125);
  near(probOf(p, 'Pastel'), 0.375);
  near(p.outcomes.reduce((s, o) => s + o.prob, 0), 1);
});

test('dominant: pinstripe homozygous looks the same as single copy', () => {
  const p = G.predict(snake({ pinstripe: 1 }), snake({ pinstripe: 1 }));
  near(probOf(p, 'Pinstripe'), 0.75);
  const pin = p.outcomes.find((o) => o.label === 'Pinstripe');
  assert.deepStrictEqual(pin.carriers, ['33% poss. homozygous Pinstripe']);
});

test('possible het parent is handled by knowledge', () => {
  const p = G.predict(snake({ clown: 1 }), snake({ clown: 1 }, { clown: [0.5, 0.5, 0] }));
  near(probOf(p, 'Clown'), 0.125);
});

test('rolled genotypes respect parents (visual x visual recessive always visual)', () => {
  for (let i = 0; i < 200; i++) {
    assert.strictEqual(G.copies(G.rollGenotype(snake({ albino: 2 }), snake({ albino: 2 })), 'albino'), 2);
    assert.strictEqual(G.copies(G.rollGenotype(snake({}), snake({})), 'pastel'), 0);
  }
});

test('rolled frequencies approximate predictions', () => {
  let clowns = 0; const n = 20000;
  for (let i = 0; i < n; i++) if (G.copies(G.rollGenotype(snake({ clown: 1 }), snake({ clown: 1 })), 'clown') === 2) clowns++;
  assert.ok(Math.abs(clowns / n - 0.25) < 0.015);
});

test('inferred hatchling knowledge', () => {
  const k = G.inferKnowledge(snake({ albino: 2 }), snake({}), { albino: 1 });
  assert.deepStrictEqual(k.albino, { '+/albino': 1 });
  const k2 = G.inferKnowledge(snake({ clown: 1 }), snake({ clown: 1 }), { clown: 1 });
  near(k2.clown['+/clown'], 2 / 3);
});

test('a full game loop runs: pair, lay, incubate, hatch, sell', () => {
  global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const state = SB.state.newGame();
  state.money = 5000;
  state.upgrades.thermostats = true; state.upgrades.humidity = true; state.upgrades.incubController = true;
  const biscuit = state.snakes.find((s) => s.name === 'Biscuit');
  const marigold = state.snakes.find((s) => s.name === 'Marigold');
  const pepper = state.snakes.find((s) => s.name === 'Pepper');
  assert.strictEqual(SB.sim.eligibility(state, pepper).ok, false);
  SB.sim.careRound(state);
  let r = SB.sim.startPairing(state, biscuit.id, marigold.id);
  assert.ok(r.ok, r.msg);
  const origRng = G.rng; G.rng = () => 0.1; // force success
  for (let i = 0; i < 20 && !state.projects.some((p) => p.stage === 'done'); i++) {
    state.enclosures.forEach((e) => { e.humidity = 58; });
    SB.sim.careRound(state);
    SB.sim.advanceWeek(state);
  }
  G.rng = origRng;
  const proj = state.projects[0];
  assert.strictEqual(proj.stage, 'done');
  assert.ok(proj.babies.length > 0);
  const baby = SB.sim.snake(state, proj.babies[0]);
  assert.ok(SB.sim.isUnrevealed(state, baby), 'hatchlings start inside their eggs');
  assert.match(SB.sim.canSell(state, baby).reasons.join(), /reveal/);
  assert.ok(SB.sim.revealAll(state, proj.id).ok);
  assert.strictEqual(SB.sim.isUnrevealed(state, baby), false);
  assert.strictEqual(SB.sim.canSell(state, baby).ok, false, 'unfed hatchling cannot be sold');
  SB.sim.advanceWeek(state);
  assert.ok(SB.sim.feed(state, baby.id).ok);
  r = SB.sim.sell(state, baby.id);
  assert.ok(r.ok, r.msg);
});

function freshState() {
  global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  return SB.state.newGame();
}

function fakeClutch(state, genotypes, predicted) {
  const babies = genotypes.map((g) => { const b = SB.state.makeSnake(state, { genotype: g, origin: 'Hatched', ageWeeks: 0, mealsEaten: 0 }); state.snakes.push(b); return b; });
  const p = { id: 'pz', maleName: 'A', femaleName: 'B', stage: 'done', hatchWeek: 1, babies: babies.map((b) => b.id), revealed: [], predicted: predicted || [] };
  state.projects.push(p);
  return { p, babies };
}

test('discoveries are recorded only when an egg is revealed', () => {
  const state = freshState();
  const { p, babies } = fakeClutch(state, [{ clown: 2 }, { clown: 2 }], [{ label: 'Clown', prob: 0.0625 }]);
  assert.strictEqual(state.discoveries.length, 0);
  const r = SB.sim.reveal(state, p.id, babies[0].id);
  assert.ok(r.ok && r.isNew);
  assert.strictEqual(r.rarity.tier, 'jackpot');
  assert.strictEqual(state.discoveries[0].label, 'Clown');
  assert.strictEqual(SB.sim.reveal(state, p.id, babies[1].id).isNew, false, 'second Clown is not new');
  assert.strictEqual(SB.sim.reveal(state, p.id, babies[1].id).ok, false, 'cannot reveal twice');
  assert.strictEqual(SB.sim.pendingReveals(state).length, 0);
});

test('completing a Morph Book page pays its reward once', () => {
  const state = freshState();
  const page = SB.BOOK.find((pg) => pg.id === 'supers');
  const { p } = fakeClutch(state, page.slots.map((sl) => sl.genotype));
  SB.sim.revealAll(state, p.id);
  const money = state.money;
  const msgs = SB.sim.checkBook(state);
  assert.strictEqual(msgs.length, 1);
  assert.strictEqual(state.money, money + page.reward.money);
  assert.strictEqual(SB.sim.checkBook(state).length, 0, 'reward is not paid twice');
});

test('pair finder ranks collection pairs that can produce a morph', () => {
  const state = freshState();
  const pairs = SB.sim.pairsFor(state, { pastel: 1, clown: 2 });
  assert.ok(pairs.length > 0);
  assert.strictEqual(pairs[0].male.name, 'Biscuit');
  assert.strictEqual(pairs[0].female.name, 'Marigold');
  near(pairs[0].prob, 0.125);
  assert.strictEqual(SB.sim.pairsFor(state, { mojave: 2 }).length, 0);
});

test('close relatives cannot be paired and are skipped by the pair finder', () => {
  const state = freshState();
  const mk = (sex, parents) => { const s = SB.state.makeSnake(state, { sex, genotype: { clown: 2 }, ageWeeks: 200, weight: 2000, parents }); state.snakes.push(s); return s; };
  const par = { sireId: 'x1', damId: 'x2', sireName: 'X', damName: 'Y' };
  const bro = mk('M', par), sis = mk('F', par);
  assert.ok(SB.sim.related(bro, sis));
  assert.match(SB.sim.pairCheck(state, bro.id, sis.id).reasons.join(' '), /closely related/);
  assert.ok(!SB.sim.pairsFor(state, { clown: 2 }).some((p) => p.male === bro && p.female === sis));
  const biscuit = state.snakes.find((s) => s.name === 'Biscuit');
  assert.strictEqual(SB.sim.related(biscuit, sis), false);
});
