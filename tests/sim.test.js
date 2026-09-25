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

test('collection dashboard, search filters, and snake records show useful collection facts', () => {
  const state = SB.state.newGame();
  const allHtml = ui.collection(state, { filter: 'all', sort: 'name' });
  assert.match(allHtml, /Collection at a glance/);
  assert.match(allHtml, /Snake records<\/span><span class="tile-value">4/);
  assert.match(allHtml, /data-change="collection-search"/);
  assert.match(allHtml, /data-change="collection-filter"/);

  const morphSearch = ui.collection(state, { filter: 'all', sort: 'name', query: 'pinstripe' });
  assert.match(morphSearch, /Juniper/);
  assert.doesNotMatch(morphSearch, /Biscuit/);
  const males = ui.collection(state, { filter: 'M', sort: 'name' });
  assert.match(males, /Biscuit/);
  assert.doesNotMatch(males, /Marigold/);

  const record = ui.snakeDetail(state, state.snakes.find((s) => s.name === 'Biscuit'));
  assert.match(record, /Record ID/);
  assert.match(record, /Enclosure A/);
  assert.match(record, /Recorded milestones/);
  assert.match(record, /starter group/);

  const hidden = SB.state.makeSnake(state, { name: 'Secret hatchling', sex: 'F', ageWeeks: 0, origin: 'Hatched' });
  state.snakes.push(hidden);
  state.projects.push({ stage: 'done', babies: [hidden.id], revealed: [] });
  const femaleFilter = ui.collection(state, { filter: 'F', sort: 'name' });
  assert.doesNotMatch(femaleFilter, /Secret hatchling/);
  assert.match(ui.collection(state, { filter: 'all', sort: 'name' }), /Eggs to reveal/);
});

test('habitat bubbles survive the cap; Chores fixes habitat only with climate controllers', () => {
  const state = SB.state.newGame();
  const s = state.snakes[0], e = sim.enclosureOf(state, s);
  s.hunger = 60; e.water = 50; e.clean = 50; e.humidity = 25; e.temp = 84;
  const needs = ui.needs(state, s, e).slice(0, 4).map((n) => n.action);
  assert.ok(needs.includes('fix-hum'), 'humidity bubble survives the 4-bubble cap');
  assert.ok(needs.includes('fix-temp'), 'temperature bubble survives the 4-bubble cap');
  assert.ok(sim.careRound(state).ok);
  assert.strictEqual(e.humidity, 25, 'basic Chores leave humidity to the keeper');
  assert.strictEqual(e.temp, 84);
  state.money = 5000;
  assert.ok(sim.buyUpgrade(state, 'climate').ok);
  assert.ok(sim.careRound(state).ok);
  assert.ok(e.humidity >= SB.CARE.humidity.ideal[0] && e.humidity <= SB.CARE.humidity.ideal[1], 'humidity back in range');
  assert.strictEqual(e.temp, 90);
});

test('a broke keeper can always recover: free first meal and the rescue', () => {
  const state = SB.state.newGame();
  state.money = 0;
  const baby = SB.state.makeSnake(state, { genotype: {}, origin: 'Hatched', ageWeeks: 2, mealsEaten: 0, hunger: 60, health: 95 });
  baby.enclosureId = sim.freeEnclosures(state)[0].id;
  state.snakes.push(baby);
  assert.strictEqual(sim.canSell(state, baby).ok, false);
  assert.ok(sim.feed(state, baby.id).ok, 'first meal is free');
  assert.ok(sim.canSell(state, baby).ok, 'fed hatchling can be sold');
  const sick = state.snakes[0];
  sick.health = 10;
  assert.strictEqual(sim.canSell(state, sick).ok, false);
  const r = sim.surrender(state, sick.id);
  assert.ok(r.ok, r.msg);
  assert.ok(state.money >= 20, 'rescue pays a grant');
  assert.ok(!sim.snake(state, sick.id));
});

test('catalogue offers missing genes and the second quest arc follows', () => {
  const state = SB.state.newGame();
  assert.strictEqual(state.market.catalog.length, 3);
  const missing = ['yellowbelly', 'bel', 'piebald', 'banana'];
  assert.ok(state.market.catalog.some((l) => Object.keys(l.snake.genotype).some((L) => missing.includes(L))), 'offers a gene the starters lack');
  state.goalsDone = SB.GOALS.slice(0, 7).map((g) => g.id);
  assert.strictEqual(sim.currentGoal(state).id, 'newBlood');
  state.money = 20000;
  const offer = state.market.catalog.find((l) => ['yellowbelly', 'mojave', 'piebald'].some((g) => G.carryProb(l.snake, g) >= 0.99));
  if (offer) {
    assert.strictEqual(sim.buy(state, offer.id).ok, false, 'no free adult enclosure yet');
    assert.ok(sim.buyUpgrade(state, 'adult').ok);
    assert.ok(sim.buy(state, offer.id).ok);
    sim.checkGoals(state);
    assert.ok(state.goalsDone.includes('newBlood'));
  }
  for (let i = 0; i < 3; i++) assert.ok(sim.buyUpgrade(state, 'display').ok);
  assert.strictEqual(sim.buyUpgrade(state, 'display').ok, false, 'display vivariums are capped');
  const rep = state.reputation;
  while (state.week % 4 !== 3) sim.advanceWeek(state);
  sim.advanceWeek(state);
  assert.ok(state.reputation >= rep + 3, 'visitors add reputation every 4 weeks');
});

test('names come back round instead of running out', () => {
  const state = SB.state.newGame();
  for (let i = 0; i < 400; i++) SB.state.uniqueName(state);
  const n = SB.state.uniqueName(state);
  assert.ok(!/\d/.test(n), 'still a plain name after 400 hatchlings: ' + n);
});
