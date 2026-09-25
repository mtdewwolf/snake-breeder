/*
 * Simulation: player actions and the weekly turn.
 * Every action returns { ok: boolean, msg: string } so the UI can show feedback.
 */
(function (SB) {
  'use strict';

  var U = SB.util, G = SB.genetics, T = SB.TIMING, C = SB.COSTS, CARE = SB.CARE;
  var sim = {};

  function ok(msg) { return { ok: true, msg: msg }; }
  function fail(msg) { return { ok: false, msg: msg }; }

  sim.log = function (state, text, kind) {
    state.log.unshift({ week: state.week, text: text, kind: kind || 'info' });
    if (state.log.length > 200) state.log.length = 200;
  };

  function history(state, snake, text) {
    snake.history.unshift({ week: state.week, text: text });
    if (snake.history.length > 40) snake.history.length = 40;
  }

  /* ---------- Lookups ---------- */

  sim.snake = function (state, id) { return state.snakes.find(function (s) { return s.id === id; }); };
  sim.enclosure = function (state, id) { return state.enclosures.find(function (e) { return e.id === id; }); };
  sim.enclosureOf = function (state, snake) { return snake.enclosureId ? sim.enclosure(state, snake.enclosureId) : null; };
  sim.occupant = function (state, enc) { return state.snakes.find(function (s) { return s.enclosureId === enc.id; }); };
  sim.freeEnclosures = function (state) {
    return state.enclosures.filter(function (e) { return !sim.occupant(state, e); });
  };
  sim.homeless = function (state) { return state.snakes.filter(function (s) { return !s.enclosureId; }); };

  sim.isJuvenile = function (snake) { return snake.ageWeeks < 52; };

  sim.activeProjects = function (state) {
    return state.projects.filter(function (p) { return p.stage === 'pairing' || p.stage === 'gravid' || p.stage === 'incubating'; });
  };

  sim.projectFor = function (state, snake) {
    return sim.activeProjects(state).find(function (p) {
      return (p.maleId === snake.id && p.stage === 'pairing') || (p.femaleId === snake.id && (p.stage === 'pairing' || p.stage === 'gravid'));
    });
  };

  sim.freeIncubators = function (state) {
    var used = sim.activeProjects(state).map(function (p) { return p.incubatorId; });
    return state.incubators.filter(function (i) { return used.indexOf(i.id) < 0; });
  };

  /* Spaces that active projects will need when they hatch. */
  sim.promisedSpaces = function (state) {
    return sim.activeProjects(state).reduce(function (sum, p) {
      if (p.stage === 'incubating') return sum + p.eggs.filter(function (e) { return e.status === 'good'; }).length;
      return sum + T.minFreeSpacesToPair;
    }, 0);
  };

  sim.priceMultiplier = function (state) { return 1 + U.clamp(state.reputation, 0, 100) / 100; };

  /* Market value, based on what can be proven about the snake (knowledge), not hidden truth. */
  sim.value = function (state, snake) {
    var v = 60;
    SB.GENES.forEach(function (gene) {
      var d = G.distOf(snake, gene.id);
      var cls = G.visualClass(gene, snake.genotype[gene.id] || 0);
      if (cls === 'single' || cls === 'visual') v += gene.value;
      if (cls === 'super') v += gene.superValue;
      if (gene.type === 'recessive' && cls === 'none') v += (gene.hetValue || 0) * (d[1] + d[2]);
    });
    var geneCount = G.visualGenes(snake.genotype).length;
    if (geneCount >= 2) v *= 1 + 0.25 * (geneCount - 1); // combos are in demand
    if (snake.sex === 'F') v *= 1.2;
    if (snake.ageWeeks >= 104) v *= 1.4; else if (snake.ageWeeks >= 52) v *= 1.2;
    v *= 0.6 + 0.4 * snake.health / 100;
    v *= sim.priceMultiplier(state);
    return Math.round(v / 5) * 5;
  };

  /* ---------- Care ---------- */

  sim.canSell = function (state, snake) {
    var reasons = [];
    if (snake.health < 60) reasons.push('health must be at least 60 — reputable buyers expect a healthy animal');
    if (sim.isUnrevealed(state, snake)) reasons.push('still inside its egg — reveal it first');
    if (snake.mealsEaten < 1) reasons.push('hatchlings must be feeding on their own before going to a new home');
    if (sim.projectFor(state, snake)) reasons.push('is part of an active breeding project');
    if (snake.recoveryUntil > state.week) reasons.push('is recovering after laying eggs');
    return { ok: reasons.length === 0, reasons: reasons };
  };

  sim.feedCost = function (snake) { return sim.isJuvenile(snake) ? C.feedJuvenile : C.feedAdult; };

  sim.feed = function (state, id, quiet) {
    var s = sim.snake(state, id);
    if (!s) return fail('That snake could not be found.');
    var cost = sim.feedCost(s);
    if (s.hunger < 35) return fail(s.name + ' isn’t hungry yet. Ball pythons only need a meal every 1–3 weeks.');
    if (state.money < cost) return fail('Not enough money for a feeder (' + U.money(cost) + '). Consider selling a snake.');
    var proj = sim.projectFor(state, s);
    if (proj && proj.stage === 'gravid' && proj.femaleId === s.id) {
      history(state, s, 'Refused a meal — gravid females often fast.');
      return fail(s.name + ' is gravid and refused the meal. That’s normal; offer food again after she lays.');
    }
    if (s.stress > 70) {
      history(state, s, 'Refused a meal while stressed.');
      return fail(s.name + ' refused the meal — stress is high. Fix the enclosure conditions first.');
    }
    state.money -= cost;
    var gain = sim.isJuvenile(s) ? U.randInt(24, 34) : (s.recoveryUntil > state.week ? U.randInt(35, 50) : U.randInt(8, 18));
    s.weight += gain;
    s.hunger = 0;
    s.mealsEaten += 1;
    s.stress = U.clamp(s.stress - 5, 0, 100);
    state.stats.fed += 1;
    sim.markTutorial(state, 'care');
    history(state, s, 'Ate a meal (+' + gain + ' g).');
    if (!quiet) sim.log(state, s.name + ' ate well (+' + gain + ' g).', 'good');
    return ok(s.name + ' ate a meal. +' + gain + ' g, cost ' + U.money(cost) + '.');
  };

  sim.clean = function (state, encId, quiet) {
    var e = sim.enclosure(state, encId);
    if (!e) return fail('Enclosure not found.');
    if (e.clean >= 95) return fail(e.name + ' is already clean.');
    if (state.money < C.cleanEnclosure) return fail('Not enough money for cleaning supplies.');
    state.money -= C.cleanEnclosure;
    e.clean = 100;
    state.stats.cleaned += 1;
    sim.markTutorial(state, 'care');
    var o = sim.occupant(state, e);
    if (o) history(state, o, 'Enclosure spot-cleaned and substrate refreshed.');
    if (!quiet) sim.log(state, e.name + ' cleaned.', 'good');
    return ok(e.name + ' is clean and fresh.');
  };

  sim.water = function (state, encId) {
    var e = sim.enclosure(state, encId);
    if (!e) return fail('Enclosure not found.');
    if (e.water >= 95) return fail(e.name + ' already has fresh water.');
    e.water = 100;
    sim.markTutorial(state, 'care');
    return ok('Fresh water in ' + e.name + '.');
  };

  sim.adjustTemp = function (state, encId, delta) {
    var e = sim.enclosure(state, encId);
    if (!e) return fail('Enclosure not found.');
    var next = U.clamp(e.setTemp + delta, 80, 98);
    if (next === e.setTemp) return fail('The thermostat can’t go any ' + (delta > 0 ? 'higher.' : 'lower.'));
    e.setTemp = next;
    e.temp = U.round(e.temp + delta, 1);
    return ok(e.name + ' thermostat set to ' + e.setTemp + '°F (hot spot now ' + e.temp + '°F).');
  };

  sim.adjustHumidity = function (state, encId, delta) {
    var e = sim.enclosure(state, encId);
    if (!e) return fail('Enclosure not found.');
    var next = U.clamp(e.humidity + delta, 20, 95);
    if (next === e.humidity) return fail('Humidity can’t go any ' + (delta > 0 ? 'higher.' : 'lower.'));
    e.humidity = next;
    return ok((delta > 0 ? 'Misted ' : 'Ventilated ') + e.name + ' — humidity now ' + e.humidity + '%.');
  };

  /* One-tap fixes used by the room's care bubbles. */
  sim.resetThermostat = function (state, encId) {
    var e = sim.enclosure(state, encId);
    if (!e) return fail('Enclosure not found.');
    e.setTemp = 90; e.temp = 90;
    return ok(e.name + ' thermostat reset — hot spot is 90°F.');
  };

  sim.resetHumidity = function (state, encId) {
    var e = sim.enclosure(state, encId);
    if (!e) return fail('Enclosure not found.');
    var before = e.humidity;
    e.humidity = 58;
    return ok((before < 58 ? 'Misted ' : 'Ventilated ') + e.name + ' — humidity is 58%.');
  };

  sim.tuneIncubator = function (state, incId) {
    var inc = state.incubators.find(function (i) { return i.id === incId; });
    if (!inc) return fail('Incubator not found.');
    inc.setTemp = 89; inc.temp = 89; inc.humidity = Math.max(inc.humidity, 95);
    sim.markTutorial(state, 'incubate');
    return ok(inc.name + ' dialled in: 89°F and ' + inc.humidity + '% humidity.');
  };

  sim.vet = function (state, id) {
    var s = sim.snake(state, id);
    if (!s) return fail('That snake could not be found.');
    if (s.health >= 90) return fail(s.name + ' is in great health — no vet visit needed.');
    if (state.money < C.vet) return fail('A vet visit costs ' + U.money(C.vet) + ' — not enough money.');
    state.money -= C.vet;
    s.health = U.clamp(s.health + 25, 0, 100);
    s.stress = U.clamp(s.stress - 10, 0, 100);
    history(state, s, 'Vet check-up and treatment (+25 health).');
    sim.log(state, s.name + ' saw the vet and is feeling better.', 'good');
    return ok(s.name + ' was treated by the vet. Health +25.');
  };

  sim.fitsIn = function (snake, enc) {
    return enc.kind === 'adult' || snake.weight <= T.tubMaxWeight;
  };

  sim.move = function (state, id, encId) {
    var s = sim.snake(state, id), e = sim.enclosure(state, encId);
    if (!s || !e) return fail('Could not move that snake.');
    if (sim.occupant(state, e)) return fail(e.name + ' is occupied. Ball pythons are housed one per enclosure.');
    if (!sim.fitsIn(s, e)) return fail(s.name + ' is too big for a hatchling tub.');
    s.enclosureId = e.id;
    s.stress = U.clamp(s.stress + 5, 0, 100);
    history(state, s, 'Moved to ' + e.name + '.');
    return ok(s.name + ' moved to ' + e.name + '. A little settling-in stress is normal.');
  };

  sim.rename = function (state, id, name) {
    var s = sim.snake(state, id);
    name = (name || '').trim();
    if (!s) return fail('That snake could not be found.');
    if (!name) return fail('Please enter a name.');
    if (name.length > 24) return fail('Names can be at most 24 characters.');
    if (state.snakes.some(function (o) { return o.id !== id && o.name.toLowerCase() === name.toLowerCase(); })) return fail('Another snake already has that name.');
    history(state, s, 'Renamed from ' + s.name + ' to ' + name + '.');
    s.name = name;
    return ok('Renamed to ' + name + '.');
  };

  sim.toggleKeeper = function (state, id) {
    var s = sim.snake(state, id);
    if (!s) return fail('That snake could not be found.');
    s.keeper = !s.keeper;
    sim.markTutorial(state, 'market');
    return ok(s.keeper ? s.name + ' is marked as a keeper and hidden from quick-sell lists.' : s.name + ' is no longer marked as a keeper.');
  };

  /* Routine chores for everyone: feed hungry snakes, fresh water, clean dirty enclosures. */
  sim.careRound = function (state) {
    var fed = 0, refused = [], cleaned = 0, watered = 0, spent = 0, startMoney = state.money, broke = false;
    state.snakes.forEach(function (s) {
      if (s.hunger < 35) return;
      if (state.money < sim.feedCost(s)) { broke = true; return; }
      var r = sim.feed(state, s.id, true);
      if (r.ok) fed++; else refused.push(s.name);
    });
    state.enclosures.forEach(function (e) {
      if (!sim.occupant(state, e)) return;
      if (e.water < 95) { e.water = 100; watered++; }
      if (e.clean < 75) {
        if (state.money < C.cleanEnclosure) { broke = true; return; }
        sim.clean(state, e.id, true); cleaned++;
      }
    });
    spent = startMoney - state.money;
    if (!fed && !cleaned && !watered) return fail('Nothing needed doing — everyone is fed, watered and clean' + (refused.length ? ' (refused food: ' + refused.join(', ') + ')' : '') + '.');
    var parts = [];
    if (fed) parts.push('fed ' + fed);
    if (watered) parts.push('fresh water ×' + watered);
    if (cleaned) parts.push('cleaned ' + cleaned);
    var msg = 'Care round: ' + parts.join(', ') + ' (' + U.money(spent) + ').';
    if (refused.length) msg += ' Refused food: ' + refused.join(', ') + '.';
    if (broke) msg += ' Some chores were skipped — not enough money.';
    sim.log(state, msg, 'good');
    return ok(msg);
  };

  /* ---------- Breeding ---------- */

  sim.eligibility = function (state, s) {
    var reasons = [];
    var male = s.sex === 'M';
    var minW = male ? T.maleMinWeight : T.femaleMinWeight;
    var minA = male ? T.maleMinAgeWeeks : T.femaleMinAgeWeeks;
    if (s.ageWeeks < minA) reasons.push('too young (needs ' + U.age(minA) + ')');
    if (s.weight < minW) reasons.push('underweight (' + s.weight + ' g of ' + minW + ' g)');
    if (s.health < 60) reasons.push('health too low (' + Math.round(s.health) + ')');
    if (s.stress > 50) reasons.push('too stressed (' + Math.round(s.stress) + ')');
    if (s.hunger > 75) reasons.push('hungry — feed first');
    if (!s.enclosureId) reasons.push('needs a proper enclosure');
    if (sim.projectFor(state, s)) reasons.push('already in a breeding project');
    if (s.recoveryUntil > state.week) reasons.push('recovering after laying (until week ' + s.recoveryUntil + ')');
    if (s.restUntil > state.week) reasons.push('resting after a pairing (until week ' + s.restUntil + ')');
    return { ok: reasons.length === 0, reasons: reasons };
  };

  sim.pairCheck = function (state, maleId, femaleId) {
    var reasons = [];
    var m = sim.snake(state, maleId), f = sim.snake(state, femaleId);
    if (!m || !f) return { ok: false, reasons: ['Choose a male and a female.'] };
    if (m.sex !== 'M' || f.sex !== 'F') reasons.push('A pairing needs one male and one female.');
    var em = sim.eligibility(state, m), ef = sim.eligibility(state, f);
    if (!em.ok) reasons.push(m.name + ': ' + em.reasons.join(', ') + '.');
    if (!ef.ok) reasons.push(f.name + ': ' + ef.reasons.join(', ') + '.');
    if (sim.related(m, f)) reasons.push(m.name + ' and ' + f.name + ' are closely related. Pairing parents with offspring or siblings together raises health risks, so choose an unrelated partner.');
    if (!sim.freeIncubators(state).length) reasons.push('Every incubator is reserved by an active project. Buy another incubator or wait for a hatch.');
    var spare = sim.freeEnclosures(state).length - sim.promisedSpaces(state);
    if (spare < T.minFreeSpacesToPair) reasons.push('Not enough room for hatchlings: you need at least ' + T.minFreeSpacesToPair + ' free enclosures not already promised to other clutches (you have ' + Math.max(0, spare) + '). Buy tubs on the Facility tab.');
    return { ok: reasons.length === 0, reasons: reasons };
  };

  /* Close relatives: parent and offspring, or siblings/half-siblings. */
  sim.related = function (a, b) {
    var pa = a.parents, pb = b.parents;
    if (pa && (pa.sireId === b.id || pa.damId === b.id)) return true;
    if (pb && (pb.sireId === a.id || pb.damId === a.id)) return true;
    return !!(pa && pb && (pa.sireId === pb.sireId || pa.damId === pb.damId));
  };

  sim.successChance = function (m, f) {
    var cond = function (s) { return s.health / 100 - s.stress / 200; };
    return U.clamp(0.45 + 0.45 * ((cond(m) + cond(f)) / 2), 0.2, 0.9);
  };

  sim.expectedClutch = function (f) {
    var mid = U.clamp(Math.round(3 + (f.weight - 1500) / 180), 2, 9);
    return [Math.max(2, mid - 1), Math.min(9, mid + 1)];
  };

  sim.startPairing = function (state, maleId, femaleId) {
    var check = sim.pairCheck(state, maleId, femaleId);
    if (!check.ok) return fail(check.reasons.join(' '));
    var m = sim.snake(state, maleId), f = sim.snake(state, femaleId);
    var inc = sim.freeIncubators(state)[0];
    var pred = G.predict(m, f);
    var p = {
      id: SB.state.nextId(state, 'pr'),
      maleId: m.id, femaleId: f.id, maleName: m.name, femaleName: f.name,
      stage: 'pairing', weeksInStage: 0, startWeek: state.week, incubatorId: inc.id,
      eggs: [], slugs: 0,
      predicted: pred.outcomes.map(function (o) { return { label: o.label, prob: o.prob }; }),
      babies: []
    };
    state.projects.push(p);
    state.stats.pairings += 1;
    sim.markTutorial(state, 'pair');
    history(state, m, 'Introduced to ' + f.name + ' for breeding.');
    history(state, f, 'Introduced to ' + m.name + ' for breeding.');
    sim.log(state, 'Pairing started: ' + m.name + ' × ' + f.name + '. ' + inc.name + ' is reserved for the clutch.', 'good');
    return ok('Pairing started! Advance time to see whether ' + f.name + ' ovulates (about ' + T.pairingWeeks + ' weeks).');
  };

  sim.cancelPairing = function (state, projectId) {
    var p = state.projects.find(function (x) { return x.id === projectId; });
    if (!p || p.stage !== 'pairing') return fail('Only a pairing that hasn’t taken yet can be cancelled.');
    p.stage = 'cancelled';
    sim.log(state, 'Pairing ' + p.maleName + ' × ' + p.femaleName + ' was separated early.', 'info');
    return ok('The pair has been separated and the incubator is free again.');
  };

  /* ---------- Incubation ---------- */

  sim.adjustIncubator = function (state, incId, field, delta) {
    var inc = state.incubators.find(function (i) { return i.id === incId; });
    if (!inc) return fail('Incubator not found.');
    sim.markTutorial(state, 'incubate');
    if (field === 'temp') {
      var t = U.round(U.clamp(inc.setTemp + delta, 80, 96), 1);
      if (t === inc.setTemp) return fail('Can’t adjust further.');
      inc.setTemp = t;
      inc.temp = U.round(inc.temp + delta, 1);
      return ok(inc.name + ' set to ' + inc.setTemp + '°F.');
    }
    var h = U.clamp(inc.humidity + delta, 50, 100);
    if (h === inc.humidity) return fail('Can’t adjust further.');
    inc.humidity = h;
    return ok(inc.name + ' humidity now ' + inc.humidity + '%.');
  };

  function findHome(state, snake) {
    var free = sim.freeEnclosures(state).filter(function (e) { return sim.fitsIn(snake, e); });
    free.sort(function (a, b) {
      var pa = snake.weight <= T.tubMaxWeight ? (a.kind === 'tub' ? 0 : 1) : 0;
      var pb = snake.weight <= T.tubMaxWeight ? (b.kind === 'tub' ? 0 : 1) : 0;
      return pa - pb;
    });
    return free[0] || null;
  }
  sim.findHome = findHome;

  sim.houseHomeless = function (state) {
    var housed = 0;
    sim.homeless(state).forEach(function (s) {
      var e = findHome(state, s);
      if (e) { s.enclosureId = e.id; housed++; history(state, s, 'Moved from a temporary tub into ' + e.name + '.'); }
    });
    return housed;
  };

  function hatch(state, p) {
    var m = sim.snake(state, p.maleId) || p.maleSnapshot, f = sim.snake(state, p.femaleId) || p.femaleSnapshot;
    var babies = [];
    p.eggs.forEach(function (egg) {
      if (egg.status !== 'good') return;
      var baby = SB.state.makeSnake(state, {
        genotype: egg.genotype,
        knowledge: G.inferKnowledge(m, f, egg.genotype),
        ageWeeks: 0, weight: U.randInt(58, 90),
        health: Math.round(U.clamp(55 + egg.health * 0.45, 40, 100)),
        stress: 20, hunger: 30, mealsEaten: 0, weeksSinceShed: 0,
        origin: 'Hatched', hatchWeek: state.week,
        parents: { sireId: p.maleId, damId: p.femaleId, sireName: p.maleName, damName: p.femaleName }
      });
      var home = findHome(state, baby);
      if (home) baby.enclosureId = home.id;
      baby.history.push({ week: state.week, text: 'Hatched from the ' + p.maleName + ' × ' + p.femaleName + ' clutch.' });
      state.snakes.push(baby);
      babies.push(baby);
    });
    p.stage = 'done';
    p.babies = babies.map(function (b) { return b.id; });
    p.hatchLabels = babies.map(function (b) { return G.morphLabel(b.genotype); });
    p.hatchWeek = state.week;
    // Morphs stay a surprise until the keeper cracks each egg open (see sim.reveal).
    p.revealed = [];
    state.stats.hatched += babies.length;
    if (babies.length) state.reputation += 1;
    state.lastHatch = { projectId: p.id, week: state.week, seen: false };
    var homeless = babies.filter(function (b) { return !b.enclosureId; }).length;
    sim.log(state, babies.length + ' egg' + (babies.length === 1 ? ' is' : 's are') + ' pipping in the ' + p.maleName + ' × ' + p.femaleName + ' clutch. Crack them open to meet your hatchlings!', 'good');
    if (homeless) sim.log(state, homeless + ' hatchling' + (homeless === 1 ? ' is' : 's are') + ' in temporary holding tubs. Buy tubs or find them homes soon — cramped holding adds stress.', 'warn');
  }

  /* ---------- Hatch reveal ---------- */

  sim.projectOfBaby = function (state, snake) {
    if (snake.origin !== 'Hatched') return null;
    return state.projects.find(function (p) { return p.babies && p.babies.indexOf(snake.id) >= 0; }) || null;
  };

  /* Old saves have no `revealed` list; their babies count as revealed. */
  sim.isUnrevealed = function (state, snake) {
    var p = sim.projectOfBaby(state, snake);
    return !!(p && p.revealed && p.revealed.indexOf(snake.id) < 0);
  };

  sim.unrevealedCount = function (state, p) {
    if (!p.revealed) return 0;
    return p.babies.filter(function (id) { return p.revealed.indexOf(id) < 0 && sim.snake(state, id); }).length;
  };

  sim.pendingReveals = function (state) {
    return state.projects.filter(function (p) { return p.stage === 'done' && sim.unrevealedCount(state, p) > 0; });
  };

  /* How surprising a hatch was, from the per-egg odds predicted for its clutch. */
  sim.rarity = function (p, label) {
    var o = (p.predicted || []).find(function (x) { return x.label === label; });
    var prob = o ? o.prob : 0;
    if (!prob) return { tier: 'jackpot', prob: 0, text: 'Unexpected!' };
    if (prob <= 0.07) return { tier: 'jackpot', prob: prob, text: 'Jackpot! 1 in ' + Math.round(1 / prob) };
    if (prob <= 0.2) return { tier: 'rare', prob: prob, text: 'Rare hatch · 1 in ' + Math.round(1 / prob) };
    return { tier: 'common', prob: prob, text: '' };
  };

  sim.bookSlotFor = function (label) {
    for (var i = 0; i < SB.BOOK.length; i++) {
      var slot = SB.BOOK[i].slots.find(function (sl) { return G.morphLabel(sl.genotype) === label; });
      if (slot) return { page: SB.BOOK[i], slot: slot };
    }
    return null;
  };

  function recordDiscovery(state, baby) {
    var label = G.morphLabel(baby.genotype);
    if (state.discoveries.some(function (d) { return d.label === label; })) return null;
    var d = { label: label, week: state.week, genes: G.visualGenes(baby.genotype), by: baby.name, snakeId: baby.id, genotype: Object.assign({}, baby.genotype) };
    state.discoveries.push(d);
    var inBook = sim.bookSlotFor(label);
    sim.log(state, 'New discovery: your first ' + label + ' (' + baby.name + ')!' + (inBook ? ' A new sticker for your Morph Book.' : ''), 'good');
    return d;
  }

  /* Crack one egg. Returns { ok, msg, baby, isNew } */
  sim.reveal = function (state, projectId, snakeId) {
    var p = state.projects.find(function (x) { return x.id === projectId; });
    if (!p || !p.revealed) return fail('That clutch has already been revealed.');
    if (p.babies.indexOf(snakeId) < 0) return fail('That hatchling isn’t from this clutch.');
    if (p.revealed.indexOf(snakeId) >= 0) return fail('Already revealed.');
    var baby = sim.snake(state, snakeId);
    p.revealed.push(snakeId);
    if (!baby) return ok('Revealed.');
    var d = recordDiscovery(state, baby);
    var label = G.morphLabel(baby.genotype);
    var r = sim.rarity(p, label);
    if (r.tier !== 'common') sim.log(state, baby.name + ' hatched as a ' + label + ' — ' + r.text.toLowerCase() + '!', 'good');
    history(state, baby, 'Revealed as a ' + label + '.');
    var res = ok(baby.name + ' is a ' + (baby.sex === 'M' ? 'male ' : 'female ') + label + '!' + (d ? ' New morph discovered!' : ''));
    res.baby = baby; res.isNew = !!d; res.rarity = r;
    return res;
  };

  sim.revealAll = function (state, projectId) {
    var p = state.projects.find(function (x) { return x.id === projectId; });
    if (!p || !p.revealed) return fail('Nothing left to reveal.');
    var ids = p.babies.filter(function (id) { return p.revealed.indexOf(id) < 0; });
    if (!ids.length) return fail('Every egg in this clutch is already open.');
    var fresh = 0;
    ids.forEach(function (id) { var r = sim.reveal(state, projectId, id); if (r.isNew) fresh++; });
    return ok('Cracked ' + ids.length + ' egg' + (ids.length === 1 ? '' : 's') + '!' + (fresh ? ' ' + fresh + ' new morph' + (fresh === 1 ? '' : 's') + ' discovered!' : ''));
  };

  /* ---------- Morph Book ---------- */

  sim.slotDiscovery = function (state, slot) {
    var label = G.morphLabel(slot.genotype);
    return state.discoveries.find(function (d) { return d.label === label; }) || null;
  };

  sim.pageProgress = function (state, page) {
    var got = page.slots.filter(function (sl) { return sim.slotDiscovery(state, sl); }).length;
    return { got: got, total: page.slots.length, done: got === page.slots.length };
  };

  sim.checkBook = function (state) {
    state.bookDone = state.bookDone || [];
    var msgs = [];
    SB.BOOK.forEach(function (page) {
      if (state.bookDone.indexOf(page.id) >= 0 || !sim.pageProgress(state, page).done) return;
      state.bookDone.push(page.id);
      state.money += page.reward.money;
      state.reputation += page.reward.rep;
      var msg = 'Morph Book page complete: ' + page.title + '! Reward: ' + U.money(page.reward.money) + ' and +' + page.reward.rep + ' reputation.';
      sim.log(state, msg, 'good');
      msgs.push(msg);
    });
    return msgs;
  };

  /* Best pairings in the collection for producing a morph, by per-egg chance. */
  sim.pairsFor = function (state, genotype) {
    var label = G.morphLabel(genotype);
    var pool = state.snakes.filter(function (s) { return !sim.isUnrevealed(state, s); });
    var males = pool.filter(function (s) { return s.sex === 'M'; }), females = pool.filter(function (s) { return s.sex === 'F'; });
    var out = [];
    males.forEach(function (m) {
      females.forEach(function (f) {
        if (sim.related(m, f)) return;
        var o = G.predict(m, f).outcomes.find(function (x) { return x.label === label; });
        if (o) out.push({ male: m, female: f, prob: o.prob, ready: sim.eligibility(state, m).ok && sim.eligibility(state, f).ok });
      });
    });
    return out.sort(function (a, b) { return (b.ready - a.ready) || (b.prob - a.prob); }).slice(0, 4);
  };

  /* ---------- Market ---------- */

  sim.matchesCriteria = function (state, snake, c) {
    if (c.sex && snake.sex !== c.sex) return false;
    if (c.maxAgeWeeks != null && snake.ageWeeks > c.maxAgeWeeks) return false;
    var vis = G.visualGenes(snake.genotype);
    if (c.visual === 'normal' && vis.length) return false;
    if (c.visual && c.visual !== 'normal' && vis.indexOf(c.visual) < 0) return false;
    if (c.visual2 && vis.indexOf(c.visual2) < 0) return false;
    if (c.carries) {
      var d = G.distOf(snake, c.carries);
      if (d[1] + d[2] < 0.5) return false;
    }
    return true;
  };

  function randomGenotype() {
    var geno = {}, know = {};
    SB.GENES.forEach(function (gene) {
      var r = U.rand();
      if (gene.type === 'recessive') {
        if (r < 0.1) { geno[gene.id] = 2; know[gene.id] = G.exact(2); }
        else if (r < 0.3) { geno[gene.id] = 1; know[gene.id] = G.exact(1); }
        else if (r < 0.42) { // advertised as 50% possible het; truth is rolled
          if (U.rand() < 0.5) geno[gene.id] = 1;
          know[gene.id] = [0.5, 0.5, 0];
        }
      } else if (r < 0.22) {
        geno[gene.id] = gene.type === 'codominant' && U.rand() < 0.12 ? 2 : 1;
        know[gene.id] = G.exact(geno[gene.id]);
      }
    });
    return { genotype: geno, knowledge: know };
  }

  function makeListing(state) {
    var gk = randomGenotype();
    var adult = U.rand() < 0.6;
    var sex = U.rand() < 0.55 ? 'F' : 'M';
    var age = adult ? U.randInt(110, 220) : U.randInt(10, 40);
    var weight = adult ? (sex === 'F' ? U.randInt(1550, 2100) : U.randInt(750, 1250)) : U.randInt(150, 450);
    var snake = SB.state.makeSnake(state, {
      genotype: gk.genotype, knowledge: gk.knowledge, sex: sex, ageWeeks: age, weight: weight,
      health: U.randInt(82, 98), stress: U.randInt(15, 30), hunger: U.randInt(10, 40), origin: 'Bought', mealsEaten: 12
    });
    return { id: SB.state.nextId(state, 'ls'), seller: U.pick(SB.BUYERS), snake: snake, price: Math.round(sim.value(state, snake) * 1.15 / 5) * 5 };
  }

  function makeRequest(state) {
    var t = U.pick(SB.REQUEST_TEMPLATES);
    return { id: SB.state.nextId(state, 'rq'), buyer: U.pick(SB.BUYERS), text: t.text, criteria: t.criteria, bonus: t.bonus, expires: state.week + U.randInt(8, 14) };
  }

  function makeTrade(state) {
    var t = U.pick(SB.REQUEST_TEMPLATES.filter(function (x) { return !x.criteria.visual2; }));
    var listing = makeListing(state);
    return { id: SB.state.nextId(state, 'tr'), trader: U.pick(SB.BUYERS), text: t.text, criteria: t.criteria, snake: listing.snake, expires: state.week + U.randInt(8, 12) };
  }

  sim.refreshMarket = function (state, initial) {
    var mk = state.market;
    mk.requests = mk.requests.filter(function (r) { return r.expires > state.week; });
    mk.trades = mk.trades.filter(function (r) { return r.expires > state.week; });
    if (initial) {
      mk.requests.push({ id: SB.state.nextId(state, 'rq'), buyer: 'Priya (first-time keeper)', text: 'Wants a calm Normal hatchling as a first snake.', criteria: { visual: 'normal', maxAgeWeeks: 26 }, bonus: 1.6, expires: 30 });
      mk.requests.push({ id: SB.state.nextId(state, 'rq'), buyer: 'Tomas (morph collector)', text: 'Looking for a healthy Pastel of either sex.', criteria: { visual: 'pastel' }, bonus: 1.5, expires: 30 });
      mk.requests.push({ id: SB.state.nextId(state, 'rq'), buyer: 'Mei (breeder, two towns over)', text: 'Needs a female carrying Clown (het or visual, possible hets OK).', criteria: { sex: 'F', carries: 'clown' }, bonus: 1.5, expires: 34 });
      var fem = SB.state.makeSnake(state, { genotype: { mojave: 1 }, sex: 'F', ageWeeks: 140, weight: 1600, origin: 'Bought', health: 94, stress: 18, hunger: 20 });
      mk.listings.push({ id: SB.state.nextId(state, 'ls'), seller: 'Greenleaf Reptile Shop', snake: fem, price: Math.round(sim.value(state, fem) * 1.15 / 5) * 5 });
      mk.listings.push(makeListing(state));
      var tsnake = SB.state.makeSnake(state, { genotype: {}, knowledge: { clown: [0, 1, 0] }, sex: 'F', ageWeeks: 120, weight: 1520, origin: 'Traded', health: 90 });
      tsnake.genotype = { clown: 1 };
      mk.trades.push({ id: SB.state.nextId(state, 'tr'), trader: 'The Coil Club', text: 'Will trade an adult female het Clown for any Pinstripe.', criteria: { visual: 'pinstripe' }, snake: tsnake, expires: 40 });
      return;
    }
    while (mk.requests.length < 3) mk.requests.push(makeRequest(state));
    if (mk.requests.length < 5 && U.rand() < 0.2) mk.requests.push(makeRequest(state));
    if (state.week % 4 === 0) {
      mk.listings = mk.listings.slice(-1);
      while (mk.listings.length < 3) mk.listings.push(makeListing(state));
    }
    if (mk.trades.length < 2 && U.rand() < 0.15) mk.trades.push(makeTrade(state));
  };

  function removeSnake(state, snake) {
    state.snakes = state.snakes.filter(function (s) { return s.id !== snake.id; });
  }

  sim.sell = function (state, id, requestId) {
    var s = sim.snake(state, id);
    if (!s) return fail('That snake could not be found.');
    var check = sim.canSell(state, s);
    if (!check.ok) return fail(s.name + ' can’t be sold yet: ' + check.reasons.join('; ') + '.');
    var price = sim.value(state, s), req = null;
    if (requestId) {
      req = state.market.requests.find(function (r) { return r.id === requestId; });
      if (!req) return fail('That request is no longer available.');
      if (!sim.matchesCriteria(state, s, req.criteria)) return fail(s.name + ' doesn’t match what ' + req.buyer + ' is looking for.');
      price = Math.round(price * req.bonus / 5) * 5;
    }
    state.money += price;
    state.stats.sold += 1;
    var repGain = s.health >= 85 ? 1 : 0;
    if (req) {
      repGain += 2;
      state.stats.requestsFilled += 1;
      state.market.requests = state.market.requests.filter(function (r) { return r.id !== req.id; });
    }
    state.reputation += repGain;
    removeSnake(state, s);
    sim.markTutorial(state, 'market');
    var who = req ? req.buyer : 'a vetted buyer';
    sim.log(state, s.name + ' (' + G.fullLabel(s) + ') went to a new home with ' + who + ' for ' + U.money(price) + '.', 'good');
    return ok(s.name + ' sold to ' + who + ' for ' + U.money(price) + (repGain ? ' (+' + repGain + ' reputation)' : '') + '.');
  };

  sim.buy = function (state, listingId) {
    var l = state.market.listings.find(function (x) { return x.id === listingId; });
    if (!l) return fail('That listing is gone.');
    if (state.money < l.price) return fail('You need ' + U.money(l.price) + ' but have ' + U.money(state.money) + '.');
    var home = findHome(state, l.snake);
    if (!home) return fail('No suitable free enclosure for ' + l.snake.name + (l.snake.weight > T.tubMaxWeight ? ' (adults need an adult enclosure)' : '') + '. Expand your facility first.');
    state.money -= l.price;
    var s = l.snake;
    if (state.snakes.some(function (o) { return o.name === s.name; })) s.name = SB.state.uniqueName(state);
    s.enclosureId = home.id;
    s.history = [{ week: state.week, text: 'Bought from ' + l.seller + ' for ' + U.money(l.price) + '.' }];
    state.snakes.push(s);
    state.market.listings = state.market.listings.filter(function (x) { return x.id !== l.id; });
    sim.log(state, 'Welcomed ' + s.name + ' (' + G.fullLabel(s) + ') from ' + l.seller + '.', 'good');
    return ok(s.name + ' joined your collection in ' + home.name + '.');
  };

  sim.trade = function (state, tradeId, snakeId) {
    var t = state.market.trades.find(function (x) { return x.id === tradeId; });
    var s = sim.snake(state, snakeId);
    if (!t) return fail('That trade offer has expired.');
    if (!s) return fail('Choose one of your snakes to offer.');
    var check = sim.canSell(state, s);
    if (!check.ok) return fail(s.name + ' can’t be traded yet: ' + check.reasons.join('; ') + '.');
    if (!sim.matchesCriteria(state, s, t.criteria)) return fail(s.name + ' doesn’t match what ' + t.trader + ' wants.');
    var enc = sim.enclosureOf(state, s);
    removeSnake(state, s);
    var incoming = t.snake;
    if (state.snakes.some(function (o) { return o.name === incoming.name; })) incoming.name = SB.state.uniqueName(state);
    incoming.enclosureId = enc && sim.fitsIn(incoming, enc) ? enc.id : null;
    if (!incoming.enclosureId) { var h = findHome(state, incoming); incoming.enclosureId = h ? h.id : null; }
    incoming.history = [{ week: state.week, text: 'Arrived in a trade with ' + t.trader + ' for ' + s.name + '.' }];
    state.snakes.push(incoming);
    state.market.trades = state.market.trades.filter(function (x) { return x.id !== t.id; });
    state.reputation += 1;
    sim.markTutorial(state, 'market');
    sim.log(state, 'Traded ' + s.name + ' to ' + t.trader + ' for ' + incoming.name + ' (' + G.fullLabel(incoming) + ').', 'good');
    return ok('Trade complete — welcome, ' + incoming.name + '!' + (incoming.enclosureId ? '' : ' (In a temporary tub until you have a suitable enclosure.)'));
  };

  /* ---------- Facility ---------- */

  sim.upgradeCount = function (state, id) {
    if (id === 'tub') return state.enclosures.filter(function (e) { return e.kind === 'tub'; }).length;
    if (id === 'adult') return state.enclosures.filter(function (e) { return e.kind === 'adult'; }).length;
    if (id === 'incubator') return state.incubators.length;
    return state.upgrades[id] ? 1 : 0;
  };

  sim.buyUpgrade = function (state, id) {
    var u = SB.UPGRADES.find(function (x) { return x.id === id; });
    if (!u) return fail('Unknown upgrade.');
    var count = sim.upgradeCount(state, id);
    if (!u.repeatable && count) return fail(u.name + ' is already installed.');
    if (u.repeatable && count >= u.max) return fail('You have the maximum number of ' + u.name.toLowerCase() + 's.');
    if (state.money < u.price) return fail(u.name + ' costs ' + U.money(u.price) + ' — you have ' + U.money(state.money) + '.');
    state.money -= u.price;
    if (id === 'tub' || id === 'adult') {
      var n = id === 'tub' ? count + 1 : String.fromCharCode(65 + count);
      state.enclosures.push(SB.state.makeEnclosure(state, id, n));
    } else if (id === 'incubator') {
      state.incubators.push(SB.state.makeIncubator(state, count + 1));
    } else {
      state.upgrades[id] = true;
    }
    var housed = sim.houseHomeless(state);
    sim.log(state, 'Purchased: ' + u.name + ' (' + U.money(u.price) + ').' + (housed ? ' ' + housed + ' snake(s) moved out of temporary tubs.' : ''), 'good');
    return ok(u.name + ' added to your facility.' + (housed ? ' Moved ' + housed + ' snake(s) into proper housing.' : ''));
  };

  /* ---------- Goals & tutorial ---------- */

  sim.markTutorial = function (state, id) { state.tutorial.done[id] = true; };

  sim.currentGoal = function (state) {
    return SB.GOALS.find(function (g) { return state.goalsDone.indexOf(g.id) < 0; }) || null;
  };

  sim.checkGoals = function (state) {
    var messages = [];
    var goal = sim.currentGoal(state);
    while (goal && goal.check(state, SB) >= 1) {
      state.goalsDone.push(goal.id);
      state.money += goal.reward.money;
      state.reputation += goal.reward.rep;
      var reward = [goal.reward.money ? U.money(goal.reward.money) : '', goal.reward.rep ? '+' + goal.reward.rep + ' reputation' : ''].filter(Boolean).join(' and ');
      var msg = 'Goal complete: ' + goal.title + '! Reward: ' + reward + '.';
      sim.log(state, msg, 'good');
      messages.push(msg);
      goal = sim.currentGoal(state);
    }
    return messages.concat(sim.checkBook(state));
  };

  /* ---------- Weekly turn ---------- */

  function envPenalty(state, s, e) {
    var p = 0, notes = [];
    if (!e) { p += 12; notes.push('temporary holding tub'); }
    else {
      var t = U.rate(e.temp, CARE.temp), h = U.rate(e.humidity, CARE.humidity);
      if (t.level === 'warn') p += 4; else if (t.level === 'bad') { p += 10; notes.push('temperature'); }
      if (h.level === 'warn') p += 3; else if (h.level === 'bad') { p += 8; notes.push('humidity'); }
      if (e.clean < 40) { p += 6; notes.push('dirty enclosure'); } else if (e.clean < 70) p += 2;
      if (e.water < 40) { p += 6; notes.push('stale water'); } else if (e.water < 70) p += 2;
      if (e.kind === 'tub' && s.weight > T.tubMaxWeight) { p += 6; notes.push('outgrown tub'); }
    }
    if (s.hunger > 80) { p += 8; notes.push('hunger'); } else if (s.hunger > 60) p += 3;
    return { penalty: p, notes: notes };
  }

  sim.advanceWeek = function (state) {
    state.week += 1;
    var w = state.week;
    var events = [];

    // Enclosures drift
    state.enclosures.forEach(function (e) {
      var occupied = !!sim.occupant(state, e);
      if (occupied) {
        e.clean = U.clamp(e.clean - U.randInt(10, 18), 0, 100);
        e.water = U.clamp(e.water - U.randInt(25, 40), 0, 100);
      }
      var noise = state.upgrades.thermostats ? (U.rand() - 0.5) : (U.rand() - 0.5) * 5;
      e.temp = U.round(e.setTemp + noise, 1);
      e.humidity = U.clamp(e.humidity - (state.upgrades.humidity ? U.randInt(0, 2) : U.randInt(3, 8)), 20, 95);
    });

    // Snakes
    state.snakes.forEach(function (s) {
      s.ageWeeks += 1;
      var proj = sim.projectFor(state, s);
      var gravid = proj && proj.stage === 'gravid' && proj.femaleId === s.id;
      s.hunger = U.clamp(s.hunger + (gravid ? 10 : sim.isJuvenile(s) ? 40 : 18), 0, 100);
      var e = sim.enclosureOf(state, s);
      var env = envPenalty(state, s, e);
      s.stress = U.clamp(s.stress + env.penalty - 8, 0, 100);
      if (s.stress > 60) s.health -= 6;
      else if (env.penalty >= 10) s.health -= 3;
      else s.health += 4;
      if (s.hunger >= 95) { s.health -= 4; s.weight = Math.round(s.weight * 0.98); }
      s.health = U.clamp(Math.round(s.health), 0, 100);
      s.stress = Math.round(s.stress);
      if (env.notes.length && env.penalty >= 8) {
        history(state, s, 'Uncomfortable this week: ' + env.notes.join(', ') + '.');
      }

      // Shedding: low humidity causes stuck shed.
      s.weeksSinceShed += 1;
      if (s.weeksSinceShed >= 6 + (s.id.length % 3)) {
        s.weeksSinceShed = 0;
        if (e && e.humidity < CARE.humidity.ok[0]) {
          s.health = U.clamp(s.health - 8, 0, 100);
          s.stress = U.clamp(s.stress + 10, 0, 100);
          history(state, s, 'Stuck shed — humidity was too low. Needed help removing retained skin.');
          events.push({ text: s.name + ' had a stuck shed because humidity was low. Raise humidity to 50–65%.', kind: 'warn' });
        } else {
          history(state, s, 'Had a clean, one-piece shed.');
        }
      }

      if (s.health < 40) {
        state.reputation = Math.max(0, state.reputation - 1);
        events.push({ text: s.name + '’s health is poor (' + s.health + '). Check food, temperature, humidity and cleanliness, or book a vet visit.', kind: 'bad' });
      } else if (s.health < 60 && env.notes.length) {
        events.push({ text: s.name + ' is struggling (' + env.notes.join(', ') + ').', kind: 'warn' });
      }
    });

    // Breeding projects
    state.projects.forEach(function (p) {
      if (['pairing', 'gravid', 'incubating'].indexOf(p.stage) < 0) return;
      p.weeksInStage += 1;
      var m = sim.snake(state, p.maleId), f = sim.snake(state, p.femaleId);
      if (p.stage === 'pairing' && p.weeksInStage >= T.pairingWeeks) {
        var chance = sim.successChance(m, f);
        if (U.rand() < chance) {
          p.stage = 'gravid'; p.weeksInStage = 0;
          // Snapshot the parents so the clutch works even if the male later leaves the collection.
          p.maleSnapshot = { genotype: m.genotype, knowledge: m.knowledge };
          p.femaleSnapshot = { genotype: f.genotype, knowledge: f.knowledge };
          history(state, f, 'Ovulated after pairing with ' + m.name + ' — now gravid.');
          events.push({ text: f.name + ' is gravid! Eggs expected in about ' + T.gravidWeeks + ' weeks. Keep her calm and warm.', kind: 'good' });
        } else {
          p.stage = 'failed';
          m.restUntil = w + 2; f.restUntil = w + 2;
          history(state, f, 'Pairing with ' + m.name + ' did not take this time.');
          events.push({ text: 'The ' + m.name + ' × ' + f.name + ' pairing didn’t take. That’s common — let them rest 2 weeks and try again.', kind: 'warn' });
        }
      } else if (p.stage === 'gravid' && p.weeksInStage >= T.gravidWeeks) {
        var size = U.clamp(Math.round(3 + (f.weight - 1500) / 180) + U.randInt(-1, 1), 2, 9);
        var fert = U.clamp(0.72 + 0.22 * f.health / 100 - f.stress / 300, 0.4, 0.95);
        p.eggs = []; p.slugs = 0;
        for (var i = 0; i < size; i++) {
          if (U.rand() < fert) {
            p.eggs.push({ id: 'e' + i, genotype: G.rollGenotype(m || p.maleSnapshot, f), health: U.clamp(U.randInt(78, 96) - Math.round(f.stress / 5), 50, 100), status: 'good' });
          } else p.slugs++;
        }
        f.weight = Math.round(f.weight * 0.82);
        f.hunger = Math.max(f.hunger, 70);
        f.recoveryUntil = w + T.postLayRecoveryWeeks;
        history(state, f, 'Laid ' + size + ' eggs (' + p.eggs.length + ' good, ' + p.slugs + ' infertile).');
        if (p.eggs.length) {
          p.stage = 'incubating'; p.weeksInStage = 0; p.layWeek = w;
          events.push({ text: f.name + ' laid ' + size + ' eggs: ' + p.eggs.length + ' good' + (p.slugs ? ' and ' + p.slugs + ' infertile slug' + (p.slugs === 1 ? '' : 's') : '') + '. They’re in the incubator. Offer her a meal to recover.', kind: 'good' });
        } else {
          p.stage = 'failed';
          events.push({ text: f.name + ' laid only infertile eggs this time. She needs rest and meals to recover.', kind: 'warn' });
        }
      } else if (p.stage === 'incubating') {
        var inc = state.incubators.find(function (x) { return x.id === p.incubatorId; });
        var tr = U.rate(inc.temp, CARE.incubTemp), hr = U.rate(inc.humidity, CARE.incubHumidity);
        var delta = (tr.level === 'good' ? 2 : tr.level === 'warn' ? -6 : -18) + (hr.level === 'good' ? 1 : hr.level === 'warn' ? -4 : -14);
        var lost = 0;
        p.eggs.forEach(function (egg) {
          if (egg.status !== 'good') return;
          egg.health = U.clamp(egg.health + delta + U.randInt(-2, 2), 0, 100);
          if (egg.health <= 0) { egg.status = 'failed'; lost++; }
        });
        if (lost) events.push({ text: lost + ' egg' + (lost === 1 ? '' : 's') + ' in ' + inc.name + ' stopped developing. Keep the incubator at 88–90°F and 90–100% humidity.', kind: 'bad' });
        else if (delta < 0) events.push({ text: inc.name + ' is out of range (' + inc.temp + '°F, ' + inc.humidity + '%) — egg health is dropping.', kind: 'warn' });
        if (p.weeksInStage >= T.incubationWeeks) {
          if (p.eggs.some(function (e) { return e.status === 'good'; })) hatch(state, p);
          else { p.stage = 'failed'; events.push({ text: 'Sadly no eggs from the ' + p.maleName + ' × ' + p.femaleName + ' clutch survived incubation.', kind: 'bad' }); }
        }
      }
    });

    // Incubators drift after this week's eggs have been checked
    state.incubators.forEach(function (inc) {
      var ctl = state.upgrades.incubController;
      inc.temp = U.round(inc.setTemp + (U.rand() - 0.5) * (ctl ? 0.6 : 2.4), 1);
      inc.humidity = U.clamp(inc.humidity - (ctl ? U.randInt(0, 1) : U.randInt(2, 6)), 50, 100);
    });

    // Upkeep
    var upkeep = state.enclosures.length * C.upkeepPerEnclosure + state.incubators.length;
    if (state.money >= upkeep) state.money -= upkeep;
    else { state.money = 0; events.push({ text: 'You couldn’t fully cover this week’s electricity (' + U.money(upkeep) + '). Sell a snake to stay afloat.', kind: 'bad' }); }

    var housed = sim.houseHomeless(state);
    if (housed) events.push({ text: housed + ' snake(s) moved out of temporary tubs.', kind: 'good' });

    sim.refreshMarket(state, false);

    events.forEach(function (ev) { sim.log(state, ev.text, ev.kind); });
    var goalMsgs = sim.checkGoals(state);
    return { week: w, events: events, goals: goalMsgs };
  };

  SB.sim = sim;
})(globalThis.SB = globalThis.SB || {});
