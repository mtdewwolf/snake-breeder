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
    assert.strictEqual(G.rollGenotype(snake({ albino: 2 }), snake({ albino: 2 })).albino, 2);
    assert.ok(!G.rollGenotype(snake({}), snake({})).pastel);
  }
});

test('rolled frequencies approximate predictions', () => {
  let clowns = 0; const n = 20000;
  for (let i = 0; i < n; i++) if (G.rollGenotype(snake({ clown: 1 }), snake({ clown: 1 })).clown === 2) clowns++;
  assert.ok(Math.abs(clowns / n - 0.25) < 0.015);
});

test('inferred hatchling knowledge', () => {
  const k = G.inferKnowledge(snake({ albino: 2 }), snake({}), { albino: 1 });
  assert.deepStrictEqual(k.albino, [0, 1, 0]);
  const k2 = G.inferKnowledge(snake({ clown: 1 }), snake({ clown: 1 }), { clown: 1 });
  near(k2.clown[1], 2 / 3);
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
  assert.strictEqual(SB.sim.canSell(state, baby).ok, false, 'unfed hatchling cannot be sold');
  SB.sim.advanceWeek(state);
  assert.ok(SB.sim.feed(state, baby.id).ok);
  r = SB.sim.sell(state, baby.id);
  assert.ok(r.ok, r.msg);
});
