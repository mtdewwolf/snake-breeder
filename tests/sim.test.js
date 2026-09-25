'use strict';
// Long-run smoke test: an automatic keeper plays many weeks with a seeded RNG
// while every view renders, checking the genetics data stays canonical.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

['util', 'data', 'genetics', 'art', 'state', 'sim', 'ui'].forEach((f) => require(path.join(__dirname, '..', 'js', f + '.js')));
const SB = globalThis.SB;
const G = SB.genetics, sim = SB.sim, ui = SB.ui;

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

function checkSnake(s) {
  assert.deepStrictEqual(s.genotype, G.norm(s.genotype), s.name + ' genotype is canonical');
  assert.ok(!G.isLethal(s.genotype), s.name + ' is not a lethal genotype');
  Object.keys(s.knowledge).forEach((L) => {
    const d = s.knowledge[L], sum = Object.keys(d).reduce((t, k) => t + d[k], 0);
    assert.ok(Math.abs(sum - 1) < 1e-6, s.name + ' knowledge at ' + L + ' sums to 1');
  });
  // The truth must be one of the possibilities the keeper allows for.
  G.activeLoci(s.genotype).forEach((L) => {
    const d = s.knowledge[L];
    assert.ok(d && d[G.pairKey(L, s.genotype[L])] > 0, s.name + ' knowledge covers its true pair at ' + L);
  });
}

function renderAll(state, uis) {
  ['overview', 'collection', 'breeding', 'incubation', 'book', 'market', 'facility'].forEach((v) => assert.strictEqual(typeof ui[v](state, uis), 'string'));
  ['guide', 'calc', 'discoveries', 'goals', 'log'].forEach((t) => ui.journal(state, Object.assign({}, uis, { journalTab: t })));
  state.snakes.slice(0, 6).forEach((s) => ui.snakeDetail(state, s));
  state.projects.filter((p) => p.stage === 'done').forEach((p) => ui.hatchResults(state, p, {}));
  SB.BOOK.forEach((pg) => pg.slots.slice(0, 2).forEach((sl) => ui.bookSlot(state, pg, sl)));
}

test('an automatic keeper plays 160 weeks without errors', () => {
  global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const orig = G.rng;
  G.rng = seeded(1234);
  try {
    const state = SB.state.newGame();
    state.money = 3000;
    const uis = { calc: { male: { pastel: 1, spider: 1, banana: ['banana', null] }, female: { mojave: 1, clown: 1 } } };
    for (let w = 0; w < 160; w++) {
      sim.careRound(state);
      state.enclosures.forEach((e) => { e.humidity = 58; e.setTemp = 90; });
      state.incubators.forEach((i) => { i.humidity = 95; i.setTemp = 89; i.temp = 89; });
      ['thermostats', 'humidity', 'incubController'].forEach((u) => { if (!state.upgrades[u] && state.money > 800) sim.buyUpgrade(state, u); });
      if (sim.freeEnclosures(state).length < 6 && state.money > 400) sim.buyUpgrade(state, 'tub');
      if (sim.freeEnclosures(state).length < 3 && state.money > 600) sim.buyUpgrade(state, 'adult');
      if (state.incubators.length < 2 && state.money > 1200) sim.buyUpgrade(state, 'incubator');
      // Pair the first eligible, unrelated couple.
      const males = state.snakes.filter((s) => s.sex === 'M' && sim.eligibility(state, s).ok);
      const females = state.snakes.filter((s) => s.sex === 'F' && sim.eligibility(state, s).ok);
      outer: for (const m of males) for (const f of females) {
        if (sim.pairCheck(state, m.id, f.id).ok) {
          uis.male = m.id; uis.female = f.id;
          assert.ok(sim.startPairing(state, m.id, f.id).ok);
          break outer;
        }
      }
      sim.pendingReveals(state).forEach((p) => sim.revealAll(state, p.id));
      // Keep the collection manageable: sell juveniles that are ready, fill requests first.
      state.market.requests.slice().forEach((r) => {
        const s = state.snakes.find((x) => sim.canSell(state, x).ok && sim.isJuvenile(x) && sim.matchesCriteria(state, x, r.criteria));
        if (s) assert.ok(sim.sell(state, s.id, r.id).ok);
      });
      state.snakes.filter((s) => sim.isJuvenile(s) && s.ageWeeks > 8 && sim.canSell(state, s).ok).slice(2).forEach((s) => sim.sell(state, s.id));
      if (w % 10 === 5 && state.market.listings.length && state.money > 2500) sim.buy(state, state.market.listings[0].id);
      const report = sim.advanceWeek(state);
      assert.strictEqual(report.week, state.week);
      if (w % 20 === 0) renderAll(state, uis);
    }
    state.snakes.forEach(checkSnake);
    state.market.listings.forEach((l) => checkSnake(l.snake));
    assert.ok(state.stats.hatched > 0, 'clutches hatched');
    assert.ok(state.discoveries.length > 1, 'morphs were discovered');
    renderAll(state, uis);
    // The save round-trips through JSON.
    const copy = SB.state.migrate(JSON.parse(JSON.stringify(state)));
    assert.deepStrictEqual(copy.snakes.map((s) => s.genotype), state.snakes.map((s) => s.genotype));
  } finally {
    G.rng = orig;
  }
});
