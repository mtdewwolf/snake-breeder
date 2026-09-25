/*
 * Game state creation, snake factory and local save/load.
 */
(function (SB) {
  'use strict';

  var U = SB.util, G = SB.genetics;
  var SAVE_KEY = 'scale-and-nasl-save-v1';
  var VERSION = 1;

  var S = {};

  S.nextId = function (state, prefix) {
    state.nextId = (state.nextId || 1) + 1;
    return prefix + state.nextId.toString(36);
  };

  S.uniqueName = function (state) {
    var used = {};
    state.snakes.forEach(function (s) { used[s.name.toLowerCase()] = true; });
    (state.usedNames || []).forEach(function (n) { used[n.toLowerCase()] = true; });
    var pool = SB.NAMES.filter(function (n) { return !used[n.toLowerCase()]; });
    var name;
    if (pool.length) {
      name = U.pick(pool);
    } else {
      var base = U.pick(SB.NAMES), i = 2;
      while (used[(base + ' ' + i).toLowerCase()]) i++;
      name = base + ' ' + i;
    }
    state.usedNames = (state.usedNames || []).concat([name]);
    return name;
  };

  /*
   * Build a snake. `opts.knowledge` may be supplied for animals whose genetics
   * are not fully proven; otherwise the keeper knows the exact genotype.
   */
  S.makeSnake = function (state, opts) {
    var genotype = opts.genotype || {};
    return {
      id: S.nextId(state, 'sn'),
      name: opts.name || S.uniqueName(state),
      sex: opts.sex || (U.rand() < 0.5 ? 'M' : 'F'),
      ageWeeks: opts.ageWeeks || 0,
      weight: opts.weight || 70,
      genotype: genotype,
      knowledge: opts.knowledge || G.exactKnowledge(genotype),
      health: opts.health != null ? opts.health : 90,
      stress: opts.stress != null ? opts.stress : 15,
      hunger: opts.hunger != null ? opts.hunger : 20,
      temperament: opts.temperament || U.pick(SB.TEMPERAMENTS),
      enclosureId: null,
      origin: opts.origin || 'Starter',
      parents: opts.parents || null,
      hatchWeek: opts.hatchWeek || null,
      mealsEaten: opts.mealsEaten != null ? opts.mealsEaten : 10,
      weeksSinceShed: opts.weeksSinceShed != null ? opts.weeksSinceShed : U.randInt(0, 4),
      recoveryUntil: 0,
      restUntil: 0,
      keeper: false,
      history: []
    };
  };

  S.makeEnclosure = function (state, kind, n) {
    return {
      id: S.nextId(state, 'en'),
      kind: kind,
      name: (kind === 'adult' ? 'Enclosure ' : 'Tub ') + n,
      setTemp: 90, temp: 90, humidity: 58, clean: 100, water: 100
    };
  };

  S.makeIncubator = function (state, n) {
    return { id: S.nextId(state, 'in'), name: 'Incubator ' + n, setTemp: 89, temp: 89, humidity: 95 };
  };

  S.newGame = function () {
    var state = {
      version: VERSION, week: 1, money: 600, reputation: 5, nextId: 1,
      snakes: [], enclosures: [], incubators: [], projects: [],
      upgrades: { thermostats: false, humidity: false, incubController: false },
      market: { requests: [], listings: [], trades: [] },
      goalsDone: [], discoveries: [], log: [], usedNames: [],
      stats: { fed: 0, cleaned: 0, pairings: 0, hatched: 0, sold: 0, requestsFilled: 0 },
      tutorial: { done: {}, dismissed: false },
      lastHatch: null
    };

    var letters = ['A', 'B', 'C', 'D'];
    letters.forEach(function (l) { state.enclosures.push(S.makeEnclosure(state, 'adult', l)); });
    for (var i = 1; i <= 4; i++) state.enclosures.push(S.makeEnclosure(state, 'tub', i));
    state.incubators.push(S.makeIncubator(state, 1));

    // Marigold is 50% possible het Piebald: the truth is rolled, the keeper only knows the odds.
    var marigoldPied = U.rand() < 0.5 ? 1 : 0;
    var marigoldGeno = { clown: 1 };
    if (marigoldPied) marigoldGeno.piebald = 1;

    var starters = [
      { name: 'Biscuit', sex: 'M', ageWeeks: 160, weight: 1150, genotype: { pastel: 1, clown: 1 }, hunger: 62, temperament: 'Easygoing' },
      { name: 'Marigold', sex: 'F', ageWeeks: 212, weight: 1900, genotype: marigoldGeno,
        knowledge: { clown: [0, 1, 0], piebald: [0.5, 0.5, 0] }, hunger: 30, temperament: 'Calm' },
      { name: 'Juniper', sex: 'F', ageWeeks: 150, weight: 1650, genotype: { pinstripe: 1, albino: 1 }, hunger: 44, temperament: 'Curious' },
      { name: 'Pepper', sex: 'M', ageWeeks: 40, weight: 430, genotype: { albino: 2 }, hunger: 50, temperament: 'Bold' }
    ];
    starters.forEach(function (o, idx) {
      var s = S.makeSnake(state, o);
      s.enclosureId = state.enclosures[idx].id;
      s.history.push({ week: 1, text: 'Joined your collection as part of the starter group.' });
      state.snakes.push(s);
      state.usedNames.push(s.name);
    });

    // A couple of starting chores so the first actions are meaningful.
    state.enclosures[1].clean = 45;
    state.enclosures[2].humidity = 37;
    state.enclosures[3].water = 35;

    SB.sim.refreshMarket(state, true);
    SB.sim.log(state, 'Welcome to Scale & نسل! Your small ball python operation opens its doors.', 'good');
    return state;
  };

  S.save = function (state) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  };

  S.load = function () {
    var raw;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return { state: null, error: 'Local storage is unavailable, so progress cannot be saved in this browser.' }; }
    if (!raw) return { state: null };
    try {
      var state = JSON.parse(raw);
      if (!state || state.version !== VERSION || !Array.isArray(state.snakes)) {
        return { state: null, error: 'Your save was from an incompatible version, so a new game was started.' };
      }
      return { state: state };
    } catch (e) {
      return { state: null, error: 'Your save file could not be read, so a new game was started.' };
    }
  };

  S.clear = function () {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  };

  SB.state = S;
})(globalThis.SB = globalThis.SB || {});
