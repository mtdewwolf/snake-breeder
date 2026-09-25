/*
 * Rendering. Each view is a function returning an HTML string built from game
 * state. Interaction is handled with event delegation in main.js via
 * data-action attributes, so views stay declarative.
 */
(function (SB) {
  'use strict';

  var U = SB.util, G = SB.genetics, sim = SB.sim, esc = U.esc, T = SB.TIMING, CARE = SB.CARE;
  var ui = {};

  ui.VIEWS = [
    { id: 'overview', label: 'Room', icon: '🏡' },
    { id: 'collection', label: 'Snakes', icon: '🐍' },
    { id: 'breeding', label: 'Breed', icon: '💞' },
    { id: 'incubation', label: 'Eggs', icon: '🥚' },
    { id: 'book', label: 'Book', icon: '📘' },
    { id: 'market', label: 'Market', icon: '🏷️' },
    { id: 'facility', label: 'Shop', icon: '🛠️' },
    { id: 'journal', label: 'Journal', icon: '📖' }
  ];

  /* ---------- Small components ---------- */

  function chip(level, text, extraClass) {
    return '<span class="chip chip-' + level + (extraClass ? ' ' + extraClass : '') + '"><span aria-hidden="true">' + U.ICON[level] + '</span> ' + esc(text) + '</span>';
  }
  ui.chip = chip;

  function levelFor(kind, v) {
    if (kind === 'health') return v >= 75 ? 'good' : v >= 50 ? 'warn' : 'bad';
    if (kind === 'stress') return v <= 30 ? 'good' : v <= 60 ? 'warn' : 'bad';
    if (kind === 'hunger') return v < 35 ? 'good' : v <= 80 ? 'warn' : 'bad';
    if (kind === 'clean' || kind === 'water') return v >= 70 ? 'good' : v >= 40 ? 'warn' : 'bad';
    return 'good';
  }
  function wordFor(kind, v) {
    if (kind === 'health') return v >= 75 ? 'Healthy' : v >= 50 ? 'Fair' : 'Poor';
    if (kind === 'stress') return v <= 30 ? 'Relaxed' : v <= 60 ? 'Uneasy' : 'Stressed';
    if (kind === 'hunger') return v < 35 ? 'Satisfied' : v <= 80 ? 'Ready to eat' : 'Very hungry';
    if (kind === 'clean') return v >= 70 ? 'Clean' : v >= 40 ? 'Getting dirty' : 'Dirty';
    if (kind === 'water') return v >= 70 ? 'Fresh' : v >= 40 ? 'Needs changing' : 'Stale';
    return '';
  }
  function meter(kind, label, v) {
    var lvl = levelFor(kind, v);
    return '<div class="meter meter-' + lvl + '">' +
      '<div class="meter-top"><span class="meter-label">' + esc(label) + '</span><span class="meter-val"><span aria-hidden="true">' + U.ICON[lvl] + '</span> ' + wordFor(kind, v) + ' · ' + Math.round(v) + '</span></div>' +
      '<div class="meter-track" role="presentation"><div class="meter-fill" style="width:' + U.clamp(v, 0, 100) + '%"></div></div></div>';
  }
  ui.meter = meter;

  function sexLabel(s) {
    return s.sex === 'M' ? '<span class="sex sex-m"><span aria-hidden="true">♂</span> Male</span>' : '<span class="sex sex-f"><span aria-hidden="true">♀</span> Female</span>';
  }

  function geneTags(snake) {
    var tags = G.visualGenes(snake.genotype).map(function (id) {
      var gene = SB.GENE_BY_ID[id];
      var cls = G.visualClass(gene, snake.genotype[id]);
      return '<span class="tag tag-visual" title="' + esc(typeName(gene.type)) + ' — visual">' + esc(G.classLabel(gene, cls)) + '</span>';
    });
    if (!tags.length) tags.push('<span class="tag tag-visual">Normal</span>');
    G.carrierNotes(snake).forEach(function (n) {
      tags.push('<span class="tag ' + (n.certain ? 'tag-het' : 'tag-poss') + '">' + esc(n.text) + '</span>');
    });
    return '<div class="tags">' + tags.join('') + '</div>';
  }
  ui.geneTags = geneTags;

  function typeName(t) {
    return t === 'codominant' ? 'Incomplete dominant' : t === 'dominant' ? 'Dominant' : 'Recessive';
  }

  function snakeStatusChips(state, s) {
    var out = [];
    var proj = sim.projectFor(state, s);
    if (!s.enclosureId) out.push(chip('bad', 'Temporary tub'));
    if (proj && proj.stage === 'pairing') out.push(chip('info', 'Pairing'));
    if (proj && proj.stage === 'gravid') out.push(chip('info', 'Gravid'));
    if (s.recoveryUntil > state.week) out.push(chip('info', 'Recovering'));
    if (s.health < 60) out.push(chip(s.health < 40 ? 'bad' : 'warn', 'Health ' + s.health));
    if (s.hunger >= 35) out.push(chip(s.hunger > 80 ? 'bad' : 'warn', s.hunger > 80 ? 'Very hungry' : 'Ready to eat'));
    if (s.stress > 50) out.push(chip('warn', 'Stressed'));
    var e = sim.enclosureOf(state, s);
    if (e && envIssues(e, s).length) out.push(chip('warn', 'Habitat needs attention'));
    if (!out.length) out.push(chip('good', 'Doing well'));
    return out.join('');
  }

  function envIssues(e, s) {
    var issues = [];
    var t = U.rate(e.temp, CARE.temp), h = U.rate(e.humidity, CARE.humidity);
    if (t.level !== 'good') issues.push('temperature ' + t.text.toLowerCase());
    if (h.level !== 'good') issues.push('humidity ' + h.text.toLowerCase());
    if (e.clean < 70) issues.push('needs cleaning');
    if (e.water < 70) issues.push('water needs changing');
    if (s && e.kind === 'tub' && s.weight > T.tubMaxWeight) issues.push('outgrown tub');
    return issues;
  }
  ui.envIssues = envIssues;

  function empty(title, text, action) {
    return '<div class="empty"><p class="empty-title">' + esc(title) + '</p><p>' + text + '</p>' + (action || '') + '</div>';
  }

  function btn(label, action, attrs, cls) {
    return '<button type="button" class="btn ' + (cls || '') + '" data-action="' + action + '" ' + (attrs || '') + '>' + label + '</button>';
  }

  /* ---------- Header / tabs ---------- */

  var COIN = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10.5" fill="#f2b632" stroke="#a8740f" stroke-width="1.5"/><circle cx="12" cy="12" r="7" fill="none" stroke="#fbd970" stroke-width="1.4"/><text x="12" y="16.2" text-anchor="middle" font-size="11" font-weight="900" fill="#8a5d08" font-family="Arial, sans-serif">$</text></svg>';

  function res(kind, icon, value, label, count) {
    return '<div class="res res-' + kind + '" title="' + esc(label) + '"><span class="res-icon" aria-hidden="true">' + icon + '</span>' +
      '<span class="res-val"' + (count != null ? ' data-count="' + kind + '" data-value="' + count + '"' : '') + '>' + value + '</span><span class="sr-only"> ' + esc(label) + '</span></div>';
  }

  ui.renderTop = function (state) {
    var cap = state.enclosures.length, used = state.snakes.filter(function (s) { return s.enclosureId; }).length;
    return res('coin', COIN, U.money(state.money), 'Funds', Math.round(state.money)) +
      res('rep', '★', String(state.reputation), 'Reputation', state.reputation) +
      res('week', '📅', 'Wk ' + state.week, 'Week') +
      res('house', '🏠', used + '/' + cap, 'Enclosures in use');
  };

  function ring(p, size) {
    var r = size / 2 - 3, c = 2 * Math.PI * r;
    return '<svg class="ring" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" aria-hidden="true">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="4"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="#f2b632" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + (c * p).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/></svg>';
  }

  ui.renderQuest = function (state) {
    var g = sim.currentGoal(state);
    if (!g) return '<button type="button" class="quest" data-action="quest"><span class="quest-ring">🏆</span><span class="quest-text"><span class="quest-label">Quests</span><span class="quest-title">All complete!</span></span></button>';
    var p = Math.min(1, g.check(state, SB));
    return '<button type="button" class="quest" data-action="quest" aria-label="Current quest: ' + esc(g.title) + ', ' + Math.round(p * 100) + '% complete. Show details">' +
      '<span class="quest-ring">' + ring(p, 38) + '<span class="quest-pct">' + Math.round(p * 100) + '%</span></span>' +
      '<span class="quest-text"><span class="quest-label">Quest ' + (state.goalsDone.length + 1) + '/' + SB.GOALS.length + '</span><span class="quest-title">' + esc(g.title) + '</span></span></button>';
  };

  ui.questDetail = function (state) {
    var g = sim.currentGoal(state);
    if (!g) return '<p>You’ve completed every quest. Keep filling your Morph Book!</p>' + btn('Open Morph Book', 'view', 'data-view="book"', 'btn-primary');
    var p = Math.min(1, g.check(state, SB));
    var reward = [g.reward.money ? U.money(g.reward.money) : '', g.reward.rep ? '+' + g.reward.rep + ' ★ reputation' : ''].filter(Boolean).join(' and ');
    return '<div class="quest-detail"><div class="quest-big-ring">' + ring(p, 96).replace('rgba(255,255,255,.18)', '#eadcbc') + '<span>' + Math.round(p * 100) + '%</span></div>' +
      '<div><p class="lead">' + esc(g.desc) + '</p><p><span class="reward-pill">Reward: ' + esc(reward) + '</span></p></div></div>' +
      '<h3>Quest line</h3><ol class="quest-line">' + SB.GOALS.map(function (q) {
        var done = state.goalsDone.indexOf(q.id) >= 0, cur = q === g;
        return '<li class="' + (done ? 'is-done' : cur ? 'is-current' : 'is-locked') + '"><span class="ql-dot" aria-hidden="true">' + (done ? '✓' : cur ? '●' : '🔒') + '</span><span>' + esc(q.title) + (done ? '<span class="sr-only"> (done)</span>' : cur ? '<span class="sr-only"> (current)</span>' : '<span class="sr-only"> (locked)</span>') + '</span></li>';
      }).join('') + '</ol>';
  };

  ui.renderTabs = function (current, state) {
    var badges = {
      incubation: sim.activeProjects(state).filter(function (p) { return p.stage === 'incubating'; }).length + sim.pendingReveals(state).length,
      overview: ui.needCount(state)
    };
    return ui.VIEWS.map(function (v) {
      var n = badges[v.id];
      var b = n ? '<span class="dock-badge' + (v.id === 'overview' ? ' is-alert' : '') + '"><span class="sr-only">(</span>' + n + '<span class="sr-only">)</span></span>' : '';
      return '<button type="button" class="dock-btn' + (v.id === current ? ' is-active' : '') + '" data-action="view" data-view="' + v.id + '"' +
        (v.id === current ? ' aria-current="page"' : '') + '><span class="dock-icon" aria-hidden="true">' + v.icon + '</span><span class="dock-label">' + v.label + '</span>' + b + '</button>';
    }).join('');
  };

  /* ---------- Overview ---------- */

  ui.alerts = function (state) {
    var list = [];
    state.snakes.forEach(function (s) {
      if (!s.enclosureId) list.push({ level: 'bad', text: s.name + ' is in a temporary holding tub. Buy a tub or find it a new home.', action: btn('Facility', 'view', 'data-view="facility"', 'btn-small') });
      if (s.health < 60) list.push({ level: s.health < 40 ? 'bad' : 'warn', text: s.name + '’s health is ' + (s.health < 40 ? 'poor' : 'fair') + ' (' + s.health + ').', action: btn('Check', 'open-snake', 'data-id="' + s.id + '"', 'btn-small') });
      if (s.hunger > 80) list.push({ level: 'bad', text: s.name + ' is very hungry.', action: btn('Feed', 'feed', 'data-id="' + s.id + '"', 'btn-small') });
      else if (s.hunger >= 35) list.push({ level: 'warn', text: s.name + ' is ready to eat.', action: btn('Feed', 'feed', 'data-id="' + s.id + '"', 'btn-small') });
      var e = sim.enclosureOf(state, s);
      if (e) {
        var issues = envIssues(e, s);
        if (issues.length) list.push({ level: 'warn', text: e.name + ' (' + s.name + '): ' + issues.join(', ') + '.', action: btn('Adjust', 'open-snake', 'data-id="' + s.id + '"', 'btn-small') });
      }
    });
    sim.activeProjects(state).forEach(function (p) {
      if (p.stage !== 'incubating') return;
      var inc = state.incubators.find(function (i) { return i.id === p.incubatorId; });
      var t = U.rate(inc.temp, CARE.incubTemp), h = U.rate(inc.humidity, CARE.incubHumidity);
      if (t.level !== 'good' || h.level !== 'good') list.push({ level: 'bad', text: inc.name + ' is out of range (' + inc.temp + '°F, ' + inc.humidity + '%). Eggs are at risk.', action: btn('Incubation', 'view', 'data-view="incubation"', 'btn-small') });
    });
    return list.sort(function (a, b) { return (a.level === 'bad' ? 0 : 1) - (b.level === 'bad' ? 0 : 1); });
  };

  /* ---------- Reptile room (home) ---------- */

  /* Things a snake or its enclosure needs, as tappable bubbles. */
  ui.needs = function (state, s, e) {
    var out = [];
    if (sim.isUnrevealed(state, s)) return out;
    if (s.health < 60) out.push({ icon: '🩺', action: 'vet', id: s.id, urgent: s.health < 40, label: 'Vet visit for ' + s.name + ' (' + U.money(SB.COSTS.vet) + ')' });
    if (s.hunger >= 35) out.push({ icon: '🐭', action: 'feed', id: s.id, urgent: s.hunger > 80, label: 'Feed ' + s.name + ' (' + U.money(sim.feedCost(s)) + ')' });
    if (e) {
      if (e.water < 70) out.push({ icon: '💧', action: 'water', id: e.id, urgent: e.water < 40, label: 'Fresh water for ' + s.name });
      if (e.clean < 70) out.push({ icon: '🧽', action: 'clean', id: e.id, urgent: e.clean < 40, label: 'Clean ' + e.name + ' (' + U.money(SB.COSTS.cleanEnclosure) + ')' });
      var t = U.rate(e.temp, CARE.temp), h = U.rate(e.humidity, CARE.humidity);
      if (t.level !== 'good') out.push({ icon: '🌡️', action: 'fix-temp', id: e.id, urgent: t.level === 'bad', label: e.name + ' is ' + t.text.toLowerCase() + ' (' + e.temp + '°F). Reset the thermostat to 90°F' });
      if (h.level !== 'good') out.push({ icon: e.humidity < CARE.humidity.ideal[0] ? '💦' : '🌬️', action: 'fix-hum', id: e.id, urgent: h.level === 'bad', label: (e.humidity < CARE.humidity.ideal[0] ? 'Mist ' : 'Ventilate ') + e.name + ' (humidity ' + e.humidity + '%)' });
      if (e.kind === 'tub' && s.weight > T.tubMaxWeight) out.push({ icon: '📦', action: 'open-snake', id: s.id, urgent: false, label: s.name + ' has outgrown this tub. Move to a bigger enclosure' });
    }
    return out;
  };

  ui.needCount = function (state) {
    return state.snakes.reduce(function (n, s) { return n + ui.needs(state, s, sim.enclosureOf(state, s)).length; }, 0) + sim.homeless(state).length;
  };

  function bubble(nd) {
    return '<button type="button" class="bubble' + (nd.urgent ? ' is-urgent' : '') + '" data-action="' + nd.action + '" data-id="' + nd.id + '" aria-label="' + esc(nd.label) + '" title="' + esc(nd.label) + '"><span aria-hidden="true">' + nd.icon + '</span></button>';
  }

  function hearts(h) {
    var full = Math.round(h / 20), out = '';
    for (var i = 0; i < 5; i++) out += '<span class="' + (i < full ? 'on' : 'off') + '">♥</span>';
    return '<span class="hearts" title="Health ' + Math.round(h) + '" aria-label="Health ' + Math.round(h) + ' of 100">' + out + '</span>';
  }

  function bowl(water) {
    var col = SB.art.mix('#8a7a3a', '#6cc0e8', U.clamp(water, 0, 100) / 100);
    return '<svg class="tank-bowl" viewBox="0 0 40 18" aria-hidden="true"><ellipse cx="20" cy="10" rx="18" ry="7" fill="#8d8f93"/><ellipse cx="20" cy="8.5" rx="14.5" ry="5" fill="' + col + '"/><ellipse cx="15" cy="7.5" rx="4" ry="1.4" fill="#fff" opacity=".5"/></svg>';
  }

  function thermo(e) {
    var t = U.rate(e.temp, CARE.temp);
    var pct = U.clamp((e.temp - 80) / 18, 0.05, 1) * 100;
    return '<span class="thermo thermo-' + t.level + '" title="' + e.temp + '°F — ' + t.text + '"><span class="thermo-fill" style="height:' + pct.toFixed(0) + '%"></span></span>';
  }

  function tank(state, e) {
    var s = sim.occupant(state, e);
    if (!s) {
      return '<li class="tank tank-' + e.kind + ' is-empty"><div class="tank-bubbles"></div>' +
        '<button type="button" class="tank-glass" data-action="view" data-view="market" aria-label="' + esc(e.name) + ' is empty. Find a snake on the Market">' +
        '<span class="tank-empty-label"><span aria-hidden="true">+</span> Empty</span><span class="tank-shine"></span></button>' +
        '<div class="tank-plate"><span class="tank-name">' + esc(e.name) + '</span></div></li>';
    }
    var unrev = sim.isUnrevealed(state, s);
    var proj = unrev ? sim.projectOfBaby(state, s) : sim.projectFor(state, s);
    var needs = ui.needs(state, s, e);
    var tag = '';
    if (!unrev && proj && proj.stage === 'pairing') tag = '<span class="tank-tag">💞 Pairing</span>';
    else if (!unrev && proj && proj.stage === 'gravid') tag = '<span class="tank-tag">🥚 Gravid</span>';
    else if (s.recoveryUntil > state.week) tag = '<span class="tank-tag">🌙 Resting</span>';
    else if (s.keeper) tag = '<span class="tank-tag">★ Keeper</span>';
    var label = unrev ? 'Unopened egg in ' + e.name + '. Crack it open' : s.name + ', ' + (s.sex === 'M' ? 'male' : 'female') + ' ' + G.morphLabel(s.genotype) + ', in ' + e.name + '. Open details';
    return '<li class="tank tank-' + e.kind + (needs.some(function (n) { return n.urgent; }) ? ' is-urgent' : '') + '">' +
      '<div class="tank-bubbles">' + needs.slice(0, 4).map(bubble).join('') + '</div>' +
      '<button type="button" class="tank-glass" data-action="' + (unrev ? 'hatch-results' : 'open-snake') + '" data-id="' + (unrev ? proj.id : s.id) + '" aria-label="' + esc(label) + '">' +
        (unrev ? '<span class="tank-egg">' + bigEgg(s.id + 'k') + '</span>' : '<span class="tank-snake">' + SB.art.snakeSVG(s, { suffix: 'k', label: '' }) + '</span>') +
        '<span class="tank-grime" style="opacity:' + ((1 - e.clean / 100) * 0.95).toFixed(2) + '"></span>' +
        bowl(e.water) + thermo(e) + tag +
        '<span class="tank-shine"></span>' +
      '</button>' +
      '<div class="tank-plate"><span class="tank-name"><span class="' + (s.sex === 'M' ? 'sex-m' : 'sex-f') + '" aria-hidden="true">' + (s.sex === 'M' ? '♂' : '♀') + '</span> ' + esc(s.name) + '</span>' +
        (unrev ? '<span class="tank-sub">Egg</span>' : hearts(s.health)) + '</div></li>';
  }

  function shelf(state, title, list) {
    if (!list.length) return '';
    return '<div class="shelf"><h3 class="shelf-label">' + esc(title) + '</h3><ul class="shelf-row shelf-' + list[0].kind + '">' + list.map(function (e) { return tank(state, e); }).join('') + '</ul></div>';
  }

  function incubatorWidget(state, inc) {
    var p = sim.activeProjects(state).find(function (x) { return x.incubatorId === inc.id; });
    var t = U.rate(inc.temp, CARE.incubTemp), h = U.rate(inc.humidity, CARE.incubHumidity);
    var incubating = p && p.stage === 'incubating';
    var alert = incubating && (t.level !== 'good' || h.level !== 'good');
    var status, weeks = 0, total = 1;
    if (!p) status = 'Idle — start a pairing';
    else if (p.stage === 'pairing') { status = '💞 ' + p.maleName + ' × ' + p.femaleName + ' pairing'; weeks = p.weeksInStage; total = T.pairingWeeks; }
    else if (p.stage === 'gravid') { status = '🤰 ' + p.femaleName + ' is gravid'; weeks = p.weeksInStage; total = T.gravidWeeks; }
    else { status = '🥚 Hatching in ' + (T.incubationWeeks - p.weeksInStage) + ' wk'; weeks = p.weeksInStage; total = T.incubationWeeks; }
    var eggs = incubating ? p.eggs.map(function (egg) { return '<span class="mini-egg' + (egg.status === 'failed' ? ' is-failed' : egg.health < 50 ? ' is-weak' : '') + '"></span>'; }).join('') : '';
    return '<div class="incubator-box' + (alert ? ' is-alert' : '') + '">' +
      '<div class="inc-top"><strong>' + esc(inc.name) + '</strong>' +
        '<span class="led led-' + t.level + '" title="Temperature: ' + t.text + '">' + inc.temp + '°F</span>' +
        '<span class="led led-' + h.level + '" title="Humidity: ' + h.text + '">' + inc.humidity + '%</span></div>' +
      '<button type="button" class="inc-window" data-action="view" data-view="' + (p ? 'incubation' : 'breeding') + '" aria-label="' + esc(inc.name + ': ' + status) + '">' +
        (eggs ? '<span class="mini-eggs">' + eggs + '</span>' : '<span class="inc-empty">' + (p ? (p.stage === 'pairing' ? '💞' : '⏳') : '·  ·  ·') + '</span>') + '</button>' +
      '<p class="inc-status">' + esc(status) + '</p>' +
      (p ? '<div class="inc-progress"><div style="width:' + Math.round(weeks / total * 100) + '%"></div></div>' : '') +
      (alert ? '<button type="button" class="btn btn-small btn-primary inc-fix" data-action="fix-incubator" data-id="' + inc.id + '">🌡️ Fix conditions</button>' : '') +
      '</div>';
  }

  function coach(state) {
    if (state.tutorial.dismissed) return '';
    var done = state.tutorial.done;
    var idx = SB.TUTORIAL.findIndex(function (t) { return !done[t.id]; });
    var text = idx < 0 ? 'You’ve tried every core action. Nice work, keeper! You can hide these tips now.' : SB.TUTORIAL[idx].text;
    return '<section class="coach" aria-label="Tip">' +
      '<svg class="coach-mascot" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#4f7d33"/><path d="M11 30c0-9 8-15 15-13s9 9 3 12-10-1-7-6" stroke="#f2b632" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="21.5" cy="23" r="1.6" fill="#2f2418"/></svg>' +
      '<div class="coach-bubble"><p class="coach-step">' + (idx < 0 ? 'All tips done' : 'Tip ' + (idx + 1) + ' of ' + SB.TUTORIAL.length) + '</p><p>' + esc(text) + '</p>' +
        '<span class="coach-dots" aria-hidden="true">' + SB.TUTORIAL.map(function (t) { return '<span class="' + (done[t.id] ? 'on' : '') + '"></span>'; }).join('') + '</span></div>' +
      btn('Hide tips', 'dismiss-tutorial', '', 'btn-small btn-ghost coach-hide') + '</section>';
  }

  ui.overview = function (state) {
    var pending = sim.pendingReveals(state);
    var pendingEggs = pending.reduce(function (n, p) { return n + sim.unrevealedCount(state, p); }, 0);
    var adults = state.enclosures.filter(function (e) { return e.kind === 'adult'; });
    var tubs = state.enclosures.filter(function (e) { return e.kind === 'tub'; });
    var homeless = sim.homeless(state);
    var count = { feed: 0, water: 0, clean: 0, habitat: 0, vet: 0 };
    state.snakes.forEach(function (s) {
      ui.needs(state, s, sim.enclosureOf(state, s)).forEach(function (n) {
        if (n.action === 'feed') count.feed++; else if (n.action === 'water') count.water++; else if (n.action === 'clean') count.clean++; else if (n.action === 'vet') count.vet++; else count.habitat++;
      });
    });
    var chips = [];
    if (count.feed) chips.push('🐭 ' + count.feed + ' hungry');
    if (count.water) chips.push('💧 ' + count.water + ' water');
    if (count.clean) chips.push('🧽 ' + count.clean + ' dirty');
    if (count.habitat) chips.push('🌡️ ' + count.habitat + ' habitat');
    if (count.vet) chips.push('🩺 ' + count.vet + ' unwell');
    var lastHatch = !pending.length && state.lastHatch && state.projects.find(function (p) { return p.id === state.lastHatch.projectId; });
    return '<div class="room">' +
      coach(state) +
      (pending.length ? '<section class="card reveal-banner"><div class="reveal-banner-eggs" aria-hidden="true">' + bigEgg('ov1') + bigEgg('ov2') + '</div><div><h2>Eggs are pipping!</h2><p>' + pendingEggs + ' hatchling' + (pendingEggs === 1 ? ' is' : 's are') + ' waiting inside ' + (pendingEggs === 1 ? 'its egg' : 'their eggs') + '. Crack them open to see what you bred.</p>' + btn('🥚 Crack them open', 'hatch-results', 'data-id="' + pending[0].id + '"', 'btn-primary') + '</div></section>' : '') +
      '<div class="room-layout">' +
        '<section class="rack-panel" aria-labelledby="rack-h">' +
          '<div class="rack-head"><h2 id="rack-h">Reptile room</h2>' +
            (chips.length ? '<p class="need-chips">' + chips.map(function (c) { return '<span>' + c + '</span>'; }).join('') + '</p>' : '<p class="need-chips is-calm"><span>✓ Everyone is comfortable</span></p>') + '</div>' +
          '<p class="rack-hint">Tap a bubble to take care of it, or a tank to visit the snake.</p>' +
          shelf(state, 'Adult enclosures', adults) + shelf(state, 'Hatchling rack', tubs) +
          (homeless.length ? '<div class="holding" role="alert"><strong>📦 Temporary holding: ' + homeless.map(function (h) { return esc(h.name); }).join(', ') + '</strong><span>Cramped holding tubs stress snakes. Buy a tub and they’ll move in automatically.</span>' + btn('Go to Shop', 'view', 'data-view="facility"', 'btn-small btn-primary') + '</div>' : '') +
        '</section>' +
        '<aside class="side-table" aria-label="Incubators and notes">' +
          '<section class="card side-card"><h2>Incubators</h2>' + state.incubators.map(function (inc) { return incubatorWidget(state, inc); }).join('') + '</section>' +
          (lastHatch ? '<section class="card side-card"><h2>🐣 Last hatch</h2><p class="small">' + lastHatch.babies.length + ' babies from ' + esc(lastHatch.maleName) + ' × ' + esc(lastHatch.femaleName) + ' (week ' + lastHatch.hatchWeek + ').</p>' + btn('See results', 'hatch-results', 'data-id="' + lastHatch.id + '"', 'btn-small') + '</section>' : '') +
          '<section class="card side-card notes"><h2>Keeper’s notes</h2>' + logList(state.log.slice(0, 5)) + btn('Full log', 'journal-log', '', 'btn-small btn-ghost') + '</section>' +
        '</aside>' +
      '</div></div>';
  };

  function tile(label, value, sub) {
    return '<div class="tile"><span class="tile-label">' + esc(label) + '</span><span class="tile-value">' + esc(value) + '</span><span class="tile-sub">' + esc(sub) + '</span></div>';
  }

  function logList(entries) {
    if (!entries.length) return empty('Nothing yet', 'Your journal fills up as you play.');
    return '<ul class="log">' + entries.map(function (l) {
      return '<li class="log-' + l.kind + '"><span class="log-week">Wk ' + l.week + '</span><span aria-hidden="true" class="log-icon">' + (U.ICON[l.kind] || '•') + '</span><span>' + esc(l.text) + '</span></li>';
    }).join('') + '</ul>';
  }

  /* ---------- Collection ---------- */

  /* A decorative egg with a crack line that animates while cracking. */
  function bigEgg(key) {
    var id = 'eg' + key;
    return '<svg class="big-egg" viewBox="0 0 80 96" aria-hidden="true" focusable="false">' +
      '<defs><radialGradient id="' + id + '" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#fffdf6"/><stop offset=".7" stop-color="#f1e6cc"/><stop offset="1" stop-color="#dcc79c"/></radialGradient></defs>' +
      '<ellipse cx="40" cy="90" rx="24" ry="4" fill="#3b2710" opacity=".15"/>' +
      '<ellipse cx="40" cy="50" rx="29" ry="38" fill="url(#' + id + ')" stroke="#c9b287" stroke-width="1.6"/>' +
      '<circle cx="52" cy="62" r="1.6" fill="#c9b287" opacity=".6"/><circle cx="27" cy="66" r="1.2" fill="#c9b287" opacity=".6"/><circle cx="48" cy="30" r="1" fill="#c9b287" opacity=".6"/>' +
      '<ellipse cx="29" cy="32" rx="6" ry="10" fill="#fff" opacity=".75"/>' +
      '<path class="egg-crack" d="M13 50 L23 44 L29 54 L39 44 L47 55 L55 45 L67 51" stroke="#7a5f33" stroke-width="2" fill="none" stroke-linejoin="round"/>' +
      '</svg>';
  }
  ui.bigEgg = bigEgg;

  function snakeCard(state, s) {
    if (sim.isUnrevealed(state, s)) {
      var proj = sim.projectOfBaby(state, s);
      return '<article class="snake-card is-egg">' +
        '<button type="button" class="snake-card-btn" data-action="hatch-results" data-id="' + proj.id + '" aria-label="Crack open the egg for ' + esc(s.name) + '">' +
          '<div class="portrait egg-portrait">' + bigEgg(s.id + 'c') + '</div>' +
          '<div class="snake-card-body"><h3>' + esc(s.name) + '</h3><p class="snake-meta">Hatchling · ' + esc(proj.maleName) + ' × ' + esc(proj.femaleName) + '</p>' +
          '<div class="tags"><span class="tag tag-poss">Morph unknown</span></div><div class="chips">' + chip('info', 'Tap to crack it open') + '</div></div>' +
        '</button></article>';
    }
    return '<article class="snake-card">' +
      '<button type="button" class="snake-card-btn" data-action="open-snake" data-id="' + s.id + '" aria-label="Open details for ' + esc(s.name) + '">' +
        '<div class="portrait">' + SB.art.snakeSVG(s, { label: 'Placeholder illustration of ' + s.name + ', ' + G.morphLabel(s.genotype) }) + '</div>' +
        '<div class="snake-card-body">' +
          '<h3>' + esc(s.name) + (s.keeper ? ' <span class="keeper" title="Keeper">★<span class="sr-only"> keeper</span></span>' : '') + '</h3>' +
          '<p class="snake-meta">' + sexLabel(s) + ' · ' + U.age(s.ageWeeks) + ' · ' + s.weight + ' g</p>' +
          geneTags(s) +
          '<div class="chips">' + snakeStatusChips(state, s) + '</div>' +
        '</div>' +
      '</button></article>';
  }
  ui.snakeCard = snakeCard;

  ui.collection = function (state, uis) {
    var list = state.snakes.slice();
    var f = uis.filter || 'all';
    list = list.filter(function (s) {
      if (f === 'M' || f === 'F') return s.sex === f;
      if (f === 'breeders') return sim.eligibility(state, s).ok;
      if (f === 'young') return s.ageWeeks < 52;
      if (f === 'attention') return s.hunger >= 35 || s.health < 60 || s.stress > 50 || !s.enclosureId || (sim.enclosureOf(state, s) && envIssues(sim.enclosureOf(state, s), s).length);
      return true;
    });
    var sort = uis.sort || 'name';
    list.sort(function (a, b) {
      if (sort === 'age') return b.ageWeeks - a.ageWeeks;
      if (sort === 'value') return sim.value(state, b) - sim.value(state, a);
      if (sort === 'health') return a.health - b.health;
      return a.name.localeCompare(b.name);
    });
    var filters = [['all', 'All'], ['attention', 'Needs care'], ['breeders', 'Ready to breed'], ['M', 'Males'], ['F', 'Females'], ['young', 'Juveniles']];
    return '<section aria-labelledby="col-h"><div class="section-head"><h2 id="col-h">Your collection <span class="muted">(' + state.snakes.length + ')</span></h2>' +
      '<div class="toolbar"><div class="segmented" role="group" aria-label="Filter snakes">' + filters.map(function (x) {
        return '<button type="button" class="seg' + (x[0] === f ? ' is-active' : '') + '" aria-pressed="' + (x[0] === f) + '" data-action="filter" data-filter="' + x[0] + '">' + x[1] + '</button>';
      }).join('') + '</div>' +
      '<label class="inline-field">Sort <select data-change="sort">' + [['name', 'Name'], ['age', 'Age'], ['value', 'Value'], ['health', 'Health (lowest first)']].map(function (o) {
        return '<option value="' + o[0] + '"' + (o[0] === sort ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></label></div></div>' +
      (state.snakes.length === 0 ? empty('Your collection is empty', 'Visit the Market to adopt a snake, or start a new game.', btn('Go to Market', 'view', 'data-view="market"', 'btn-small')) :
        list.length === 0 ? empty('No snakes match this filter', 'Try another filter.') :
        '<div class="card-grid">' + list.map(function (s) { return snakeCard(state, s); }).join('') + '</div>') +
      '</section>';
  };

  /* ---------- Snake details (dialog) ---------- */

  function rangeControl(label, value, unit, range, minusAction, plusAction, id, minusLabel, plusLabel) {
    var r = U.rate(value, range);
    return '<div class="control-row">' +
      '<div><span class="control-label">' + esc(label) + '</span> <strong>' + value + unit + '</strong> ' + chip(r.level, r.text) +
      '<div class="small muted">Ideal ' + range.ideal[0] + '–' + range.ideal[1] + unit + '</div></div>' +
      '<div class="control-btns">' +
        btn(minusLabel || '−', minusAction, 'data-id="' + id + '" aria-label="' + esc(label) + ': ' + (minusLabel || 'decrease') + '"', 'btn-small') +
        btn(plusLabel || '+', plusAction, 'data-id="' + id + '" aria-label="' + esc(label) + ': ' + (plusLabel || 'increase') + '"', 'btn-small') +
      '</div></div>';
  }

  ui.enclosureControls = function (state, e) {
    return '<div class="enclosure-controls">' +
      rangeControl('Hot spot', e.temp, '°F', CARE.temp, 'temp-down', 'temp-up', e.id) +
      '<div class="small muted">Thermostat set to ' + e.setTemp + '°F' + (state.upgrades.thermostats ? ' (precision thermostat)' : ' — basic thermostats wander ±2.5°F') + '</div>' +
      rangeControl('Humidity', e.humidity, '%', CARE.humidity, 'hum-down', 'hum-up', e.id, 'Ventilate', 'Mist') +
      meter('clean', 'Cleanliness', e.clean) +
      meter('water', 'Water', e.water) +
      '<div class="btn-row">' + btn('🧽 Clean ($' + SB.COSTS.cleanEnclosure + ')', 'clean', 'data-id="' + e.id + '"', 'btn-small') + btn('💧 Fresh water', 'water', 'data-id="' + e.id + '"', 'btn-small') + '</div>' +
      '</div>';
  };

  ui.snakeDetail = function (state, s) {
    var e = sim.enclosureOf(state, s);
    var elig = sim.eligibility(state, s);
    var sell = sim.canSell(state, s);
    var proj = sim.projectFor(state, s);
    var freeHomes = sim.freeEnclosures(state).filter(function (x) { return sim.fitsIn(s, x); });
    var genes = G.visualGenes(s.genotype);
    var parents = s.parents ? 'Offspring of <strong>' + esc(s.parents.sireName) + '</strong> × <strong>' + esc(s.parents.damName) + '</strong>' + (s.hatchWeek ? ', hatched week ' + s.hatchWeek : '') + '.' : 'Origin: ' + esc(s.origin) + '.';

    return '<div class="detail">' +
      '<div class="detail-side">' +
        '<div class="portrait portrait-lg">' + SB.art.snakeSVG(s, { suffix: 'd', label: 'Placeholder illustration of ' + s.name }) + '</div>' +
        '<dl class="facts">' +
          '<div><dt>Sex</dt><dd>' + sexLabel(s) + '</dd></div>' +
          '<div><dt>Age</dt><dd>' + U.age(s.ageWeeks) + '</dd></div>' +
          '<div><dt>Weight</dt><dd>' + s.weight + ' g</dd></div>' +
          '<div><dt>Temperament</dt><dd>' + esc(s.temperament) + '</dd></div>' +
          '<div><dt>Meals eaten</dt><dd>' + s.mealsEaten + '</dd></div>' +
          '<div><dt>Est. value</dt><dd>' + U.money(sim.value(state, s)) + '</dd></div>' +
        '</dl>' +
        '<form class="rename" data-form="rename" data-id="' + s.id + '"><label for="rename-' + s.id + '">Name</label><div class="rename-row"><input id="rename-' + s.id + '" name="name" maxlength="24" value="' + esc(s.name) + '" autocomplete="off"><button class="btn btn-small" type="submit">Rename</button></div></form>' +
      '</div>' +
      '<div class="detail-main">' +
        '<section><h3>Condition</h3>' + meter('health', 'Health', s.health) + meter('stress', 'Stress', s.stress) + meter('hunger', 'Hunger', s.hunger) +
          '<div class="btn-row">' +
            btn('🐭 Feed (' + U.money(sim.feedCost(s)) + ')', 'feed', 'data-id="' + s.id + '"', 'btn-primary btn-small') +
            btn('🩺 Vet visit (' + U.money(SB.COSTS.vet) + ')', 'vet', 'data-id="' + s.id + '"', 'btn-small') +
            btn(s.keeper ? '★ Keeper (unmark)' : '☆ Mark as keeper', 'keeper', 'data-id="' + s.id + '" aria-pressed="' + s.keeper + '"', 'btn-small') +
          '</div>' +
          (proj ? '<p class="small">' + chip('info', proj.stage === 'pairing' ? 'In a pairing' : 'Gravid') + ' Part of the ' + esc(proj.maleName) + ' × ' + esc(proj.femaleName) + ' project.</p>' : '') +
        '</section>' +
        '<section><h3>Genetics</h3>' + geneTags(s) +
          '<ul class="gene-list">' + (genes.length ? genes.map(function (id) {
            var gene = SB.GENE_BY_ID[id];
            var c = s.genotype[id];
            return '<li><strong>' + esc(G.classLabel(gene, G.visualClass(gene, c))) + '</strong> <span class="muted">(' + typeName(gene.type) + (gene.type === 'codominant' ? ', ' + c + ' cop' + (c === 1 ? 'y' : 'ies') : '') + ')</span> — ' + esc(gene.blurb) + '</li>';
          }).join('') : '<li>Normal (wild type) appearance — no visual morph genes.</li>') +
          G.carrierNotes(s).map(function (n) {
            return '<li><strong>' + esc(n.text) + '</strong> <span class="muted">— ' + (n.certain ? 'proven by lineage' : 'odds from lineage; only breeding can prove it') + '</span></li>';
          }).join('') + '</ul>' +
          '<p class="small muted">' + parents + '</p>' +
          '<p class="small">' + (elig.ok ? chip('good', 'Eligible to breed') : chip('warn', 'Not breeding-ready') + ' ' + esc(elig.reasons.join('; ')) + '.') + '</p>' +
        '</section>' +
        '<section><h3>Enclosure' + (e ? ': ' + esc(e.name) + ' <span class="muted small">(' + (e.kind === 'tub' ? 'hatchling tub' : 'adult enclosure') + ')</span>' : '') + '</h3>' +
          (e ? ui.enclosureControls(state, e) : '<p>' + chip('bad', 'Temporary holding tub') + ' This snake needs a proper enclosure. Buy one on the Facility tab.</p>') +
          (freeHomes.length ? '<div class="move"><label>Move to <select data-change="move" data-id="' + s.id + '"><option value="">Choose an empty enclosure…</option>' +
            freeHomes.map(function (x) { return '<option value="' + x.id + '">' + esc(x.name) + (x.kind === 'tub' ? ' (tub)' : '') + '</option>'; }).join('') + '</select></label></div>' : '') +
        '</section>' +
        '<section><h3>Market</h3>' +
          (sell.ok ? '<p>Estimated sale price <strong>' + U.money(sim.value(state, s)) + '</strong>.</p>' + btn('Sell ' + esc(s.name) + '…', 'sell', 'data-id="' + s.id + '"', 'btn-small') :
            '<p class="small">' + chip('warn', 'Not ready for a new home') + ' ' + esc(sell.reasons.join('; ')) + '.</p>') +
        '</section>' +
        '<section><h3>History</h3><ul class="history">' + s.history.slice(0, 12).map(function (h) {
          return '<li><span class="log-week">Wk ' + h.week + '</span> ' + esc(h.text) + '</li>';
        }).join('') + '</ul></section>' +
      '</div></div>';
  };

  /* ---------- Breeding ---------- */

  function pickList(state, sex, selected) {
    var list = state.snakes.filter(function (s) { return s.sex === sex && !sim.isUnrevealed(state, s); }).sort(function (a, b) {
      var ea = sim.eligibility(state, a).ok ? 0 : 1, eb = sim.eligibility(state, b).ok ? 0 : 1;
      return ea - eb || a.name.localeCompare(b.name);
    });
    var name = sex === 'M' ? 'male' : 'female';
    if (!list.length) return empty('No ' + name + 's', 'You don’t have any ' + name + ' snakes. Look for one on the Market.');
    return '<fieldset class="pick-list"><legend class="sr-only">Choose a ' + name + '</legend>' + list.map(function (s) {
      var el = sim.eligibility(state, s);
      return '<label class="pick' + (selected === s.id ? ' is-selected' : '') + (el.ok ? '' : ' is-ineligible') + '">' +
        '<input type="radio" name="pick-' + sex + '" value="' + s.id + '" data-change="pick" data-sex="' + sex + '"' + (selected === s.id ? ' checked' : '') + '>' +
        '<span class="pick-art">' + SB.art.snakeSVG(s, { suffix: 'p', label: '' }) + '</span>' +
        '<span class="pick-body"><strong>' + esc(s.name) + '</strong> <span class="small muted">' + U.age(s.ageWeeks) + ' · ' + s.weight + ' g</span>' +
        '<span class="small">' + esc(G.fullLabel(s)) + '</span>' +
        (el.ok ? chip('good', 'Eligible') : chip('warn', 'Not eligible: ' + el.reasons.join(', '))) + '</span></label>';
    }).join('') + '</fieldset>';
  }

  ui.outcomeTable = function (pred, clutchMid) {
    return '<table class="outcomes"><caption class="sr-only">Predicted offspring per egg</caption><thead><tr><th scope="col">Morph</th><th scope="col">Chance per egg</th>' + (clutchMid ? '<th scope="col" class="hide-sm">In ' + clutchMid + ' eggs</th>' : '') + '</tr></thead><tbody>' +
      pred.outcomes.map(function (o) {
        return '<tr><th scope="row"><span class="morph-name">' + esc(o.label) + '</span>' + (o.carriers.length ? '<span class="carrier">' + esc(o.carriers.join(' · ')) + '</span>' : '') + '</th>' +
          '<td><div class="bar"><div class="bar-fill" style="width:' + (o.prob * 100).toFixed(1) + '%"></div><span>' + G.pct(o.prob) + '</span></div></td>' +
          (clutchMid ? '<td class="hide-sm">≈ ' + U.round(o.prob * clutchMid, 1) + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table>';
  };

  ui.breeding = function (state, uis) {
    var m = uis.male && sim.snake(state, uis.male), f = uis.female && sim.snake(state, uis.female);
    var preview = '';
    if (m && f) {
      var pred = G.predict(m, f);
      var check = sim.pairCheck(state, m.id, f.id);
      var clutch = sim.expectedClutch(f);
      var mid = Math.round((clutch[0] + clutch[1]) / 2);
      preview = '<section class="card preview" aria-labelledby="prev-h" aria-live="polite">' +
        '<h2 id="prev-h">Outcome preview: ' + esc(m.name) + ' × ' + esc(f.name) + '</h2>' +
        '<p class="small">' + esc(G.fullLabel(m)) + ' <strong>×</strong> ' + esc(G.fullLabel(f)) + '</p>' +
        ui.outcomeTable(pred, mid) +
        '<div class="note"><strong>Remember: a clutch is a small sample.</strong> These are odds for <em>each egg</em>, like coin flips. A clutch of ' + clutch[0] + '–' + clutch[1] + ' eggs can easily contain more or fewer of a morph than predicted — even none.</div>' +
        '<ul class="facts-inline"><li>Expected clutch: <strong>' + clutch[0] + '–' + clutch[1] + ' eggs</strong> (bigger, healthier females lay more)</li>' +
        '<li>Chance the pairing takes: <strong>about ' + Math.round(sim.successChance(m, f) * 100) + '%</strong> (health &amp; stress matter)</li>' +
        '<li>Timeline: ' + T.pairingWeeks + ' wks pairing → ' + T.gravidWeeks + ' wks gravid → ' + T.incubationWeeks + ' wks incubation</li></ul>' +
        (check.ok ? '<div class="btn-row">' + btn('Start pairing', 'start-pairing', '', 'btn-primary') + '</div>' :
          '<div class="error-box" role="alert"><strong><span aria-hidden="true">✕</span> This pairing can’t start yet:</strong><ul>' + check.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul><p class="small">You can still study the preview above.</p></div>') +
        '</section>';
    } else {
      preview = '<section class="card preview">' + empty('Choose a pair', 'Select one male and one female to see the offspring odds. Tip: try <strong>Biscuit × Marigold</strong> — both carry Clown.') + '</section>';
    }
    var eligM = state.snakes.filter(function (s) { return s.sex === 'M' && sim.eligibility(state, s).ok; }).length;
    var eligF = state.snakes.filter(function (s) { return s.sex === 'F' && sim.eligibility(state, s).ok; }).length;
    var noPair = !eligM || !eligF;
    var projects = state.projects.slice().reverse();
    return '<div class="breeding-layout">' +
      '<section class="card" aria-labelledby="pick-h"><h2 id="pick-h">Choose a pair</h2>' +
        (noPair ? '<div class="note note-warn"><span aria-hidden="true">!</span> No eligible pair right now (' + eligM + ' eligible male' + (eligM === 1 ? '' : 's') + ', ' + eligF + ' eligible female' + (eligF === 1 ? '' : 's') + '). Care for your snakes, wait for recovery, or find a partner on the Market. You can still preview any pairing.</div>' : '') +
        '<div class="pick-cols"><div><h3>Males</h3>' + pickList(state, 'M', uis.male) + '</div><div><h3>Females</h3>' + pickList(state, 'F', uis.female) + '</div></div>' +
        '<p class="small muted">Requirements: males ' + U.age(T.maleMinAgeWeeks) + '+ and ' + T.maleMinWeight + ' g+, females ' + U.age(T.femaleMinAgeWeeks) + '+ and ' + T.femaleMinWeight + ' g+, both healthy (60+), calm (stress ≤ 50) and fed. You also need a free incubator and at least ' + T.minFreeSpacesToPair + ' free enclosures for the hatchlings.</p>' +
      '</section>' +
      preview +
      '<section class="card" aria-labelledby="bp-h"><h2 id="bp-h">Projects</h2>' +
        (projects.length ? '<ul class="project-list">' + projects.slice(0, 8).map(function (p) {
          var label = { pairing: 'Pairing', gravid: 'Gravid', incubating: 'Incubating', done: 'Hatched', failed: 'Didn’t succeed', cancelled: 'Cancelled' }[p.stage];
          var lvl = p.stage === 'done' ? 'good' : p.stage === 'failed' || p.stage === 'cancelled' ? 'warn' : 'info';
          return '<li class="project-row"><div><strong>' + esc(p.maleName) + ' × ' + esc(p.femaleName) + '</strong><div class="small muted">Started week ' + p.startWeek + '</div></div><div class="project-time">' + chip(lvl, label) +
            (p.stage === 'pairing' ? ' ' + btn('Separate', 'cancel-pairing', 'data-id="' + p.id + '"', 'btn-small btn-ghost') : '') +
            (p.stage === 'done' ? ' ' + btn('Results', 'hatch-results', 'data-id="' + p.id + '"', 'btn-small btn-ghost') : '') + '</div></li>';
        }).join('') + '</ul>' : empty('No projects yet', 'Your pairings will be listed here.')) +
      '</section>' +
      '<section class="card" aria-labelledby="ex-h"><h2 id="ex-h">Example pairings</h2><p class="small">Classic crosses that show how each inheritance type works.</p><div class="examples">' +
        SB.EXAMPLE_PAIRINGS.map(function (ex) {
          var pred = G.predict({ genotype: ex.male, knowledge: G.exactKnowledge(ex.male) }, { genotype: ex.female, knowledge: G.exactKnowledge(ex.female) });
          return '<div class="example"><h3>' + esc(ex.title) + '</h3><p class="small"><strong>' + esc(exLabel(ex.male)) + ' × ' + esc(exLabel(ex.female)) + '</strong></p>' +
            '<ul class="mini-outcomes">' + pred.outcomes.map(function (o) { return '<li><span>' + esc(o.label) + (o.carriers.length ? ' <em>(' + esc(o.carriers.join(', ')) + ')</em>' : '') + '</span><strong>' + G.pct(o.prob) + '</strong></li>'; }).join('') + '</ul>' +
            '<p class="small muted">' + esc(ex.note) + '</p></div>';
        }).join('') + '</div></section>' +
      '</div>';
  };

  function exLabel(geno) {
    var s = { genotype: geno, knowledge: G.exactKnowledge(geno) };
    return G.fullLabel(s);
  }

  /* ---------- Incubation ---------- */

  ui.incubation = function (state) {
    var cards = state.incubators.map(function (inc) {
      var p = sim.activeProjects(state).find(function (x) { return x.incubatorId === inc.id; });
      var body;
      if (!p) body = empty('Empty', 'Start a pairing to reserve this incubator for the next clutch.', btn('Go to Breeding', 'view', 'data-view="breeding"', 'btn-small'));
      else if (p.stage !== 'incubating') body = '<p>' + chip('info', 'Reserved') + ' For the <strong>' + esc(p.maleName) + ' × ' + esc(p.femaleName) + '</strong> clutch (' + (p.stage === 'pairing' ? 'pairing in progress' : esc(p.femaleName) + ' is gravid') + '). Get the conditions right before the eggs arrive.</p>';
      else {
        var good = p.eggs.filter(function (e) { return e.status === 'good'; });
        var left = T.incubationWeeks - p.weeksInStage;
        body = '<p><strong>' + esc(p.maleName) + ' × ' + esc(p.femaleName) + '</strong> · laid week ' + p.layWeek + ' · ' + good.length + ' developing' + (p.slugs ? ', ' + p.slugs + ' infertile removed' : '') + '</p>' +
          '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + T.incubationWeeks + '" aria-valuenow="' + p.weeksInStage + '" aria-label="Incubation progress"><div style="width:' + (p.weeksInStage / T.incubationWeeks * 100) + '%"></div></div>' +
          '<p class="small">' + (left <= 1 ? '🐣 Hatching next week!' : left + ' weeks until hatching') + '</p>' +
          '<ul class="eggs">' + p.eggs.map(function (egg, i) {
            var lvl = egg.status === 'failed' ? 'bad' : egg.health >= 70 ? 'good' : egg.health >= 40 ? 'warn' : 'bad';
            return '<li class="egg">' + SB.art.eggSVG(egg) + '<span class="small">Egg ' + (i + 1) + '</span>' + chip(lvl, egg.status === 'failed' ? 'Stopped' : Math.round(egg.health) + '%') + '</li>';
          }).join('') + '</ul>';
      }
      return '<section class="card incubator" aria-labelledby="h-' + inc.id + '"><h2 id="h-' + inc.id + '">' + esc(inc.name) + '</h2>' +
        '<div class="enclosure-controls">' +
          rangeControl('Temperature', inc.temp, '°F', CARE.incubTemp, 'inc-temp-down', 'inc-temp-up', inc.id) +
          rangeControl('Humidity', inc.humidity, '%', CARE.incubHumidity, 'inc-hum-down', 'inc-hum-up', inc.id, '− 5%', '+ 5% (add water)') +
          '<p class="small muted">' + (state.upgrades.incubController ? 'Controller installed: conditions stay steady.' : 'Without a controller, temperature wanders ±1.2°F and humidity drops a few % each week.') + '</p>' +
        '</div>' + body + '</section>';
    }).join('');
    var done = state.projects.filter(function (p) { return p.stage === 'done'; }).reverse();
    return '<div class="stack"><div class="note"><strong>Incubation basics:</strong> keep eggs at <strong>88–90°F</strong> with <strong>90–100% humidity</strong>. Eggs lose health quickly when conditions drift, so check each week. Time is compressed in this game (6 weeks here stands in for about 2 months).</div>' +
      '<div class="card-grid wide">' + cards + '</div>' +
      '<section class="card" aria-labelledby="hr-h"><h2 id="hr-h">Hatch results</h2>' + (done.length ? '<ul class="project-list">' + done.map(function (p) {
        return '<li class="project-row"><div><strong>' + esc(p.maleName) + ' × ' + esc(p.femaleName) + '</strong><div class="small muted">Hatched week ' + p.hatchWeek + ' · ' + p.babies.length + ' babies</div></div>' + btn('View', 'hatch-results', 'data-id="' + p.id + '"', 'btn-small') + '</li>';
      }).join('') + '</ul>' : empty('No hatches yet', 'Your first clutch results will appear here.')) + '</section></div>';
  };

  function confetti(tier) {
    var colors = tier === 'jackpot' ? ['#d9a441', '#f3d36b', '#b35d38', '#4f6b3a', '#fff4d6'] : ['#d9a441', '#4f6b3a', '#f3d36b'];
    var n = tier === 'jackpot' ? 18 : 10, out = '';
    for (var i = 0; i < n; i++) {
      out += '<span style="--x:' + Math.round(-60 + (i * 137) % 120) + 'px;--r:' + ((i * 67) % 360) + 'deg;--d:' + (0.9 + (i % 5) * 0.12).toFixed(2) + 's;background:' + colors[i % colors.length] + '"></span>';
    }
    return '<div class="confetti" aria-hidden="true">' + out + '</div>';
  }

  function revealCard(state, p, b, fresh) {
    var label = G.morphLabel(b.genotype);
    var r = sim.rarity(p, label);
    var disc = state.discoveries.find(function (d) { return d.label === label; });
    var isNew = !!(disc && disc.snakeId === b.id);
    var inBook = isNew && sim.bookSlotFor(label);
    var badges = '';
    if (r.tier !== 'common') badges += '<span class="badge badge-' + r.tier + '"><span aria-hidden="true">' + (r.tier === 'jackpot' ? '✦' : '★') + '</span> ' + esc(r.text) + '</span>';
    if (isNew) badges += '<span class="badge badge-new"><span aria-hidden="true">✚</span> New morph!</span>';
    if (inBook) badges += '<span class="badge badge-book"><span aria-hidden="true">📘</span> Book sticker</span>';
    var celebrate = fresh && (r.tier !== 'common' || isNew);
    return '<li class="reveal-card tier-' + r.tier + (fresh ? ' is-fresh' : '') + (isNew ? ' is-new' : '') + '">' +
      (celebrate ? confetti(isNew && r.tier === 'common' ? 'rare' : r.tier) : '') +
      '<div class="reveal-art">' + (r.tier === 'jackpot' || isNew ? '<span class="rays" aria-hidden="true"></span>' : '') + SB.art.snakeSVG(b, { suffix: 'h', label: 'Illustration of ' + b.name + ', ' + label }) + '</div>' +
      '<div class="reveal-body"><p class="reveal-morph">' + esc(label) + '</p>' +
        '<p class="small"><strong>' + esc(b.name) + '</strong> · ' + sexLabel(b) + '</p>' +
        (badges ? '<div class="badges">' + badges + '</div>' : '') +
        (G.carrierNotes(b).length ? '<p class="small muted">' + esc(G.carrierNotes(b).map(function (n) { return n.text; }).join(' · ')) + '</p>' : '') +
        '<div class="btn-row">' + btn(b.keeper ? '★ Keeping' : '☆ Keep', 'keeper', 'data-id="' + b.id + '" aria-pressed="' + b.keeper + '"', 'btn-small') + btn('Details', 'open-snake', 'data-id="' + b.id + '"', 'btn-small btn-ghost') + '</div>' +
      '</div></li>';
  }

  /* Hatch results double as the egg-cracking reveal while any egg is still closed. */
  ui.hatchResults = function (state, p, fresh) {
    fresh = fresh || {};
    var closed = sim.unrevealedCount(state, p);
    var babies = p.babies.map(function (id) { return sim.snake(state, id); });
    var present = babies.filter(Boolean);
    var n = p.babies.length;
    var intro = closed
      ? '<div class="reveal-intro"><p><strong>' + closed + ' of ' + n + ' egg' + (n === 1 ? '' : 's') + '</strong> from ' + esc(p.maleName) + ' × ' + esc(p.femaleName) + ' ' + (closed === 1 ? 'is' : 'are') + ' still closed. Tap an egg to crack it open.</p>' +
        btn('Crack all ' + closed, 'reveal-all', 'data-id="' + p.id + '"', 'btn-small') + '</div>'
      : '<p>' + n + ' hatchling' + (n === 1 ? '' : 's') + ' from <strong>' + esc(p.maleName) + ' × ' + esc(p.femaleName) + '</strong> (week ' + p.hatchWeek + ').</p>';
    var grid = '<ul class="reveal-grid">' + present.map(function (b, i) {
      var open = !p.revealed || p.revealed.indexOf(b.id) >= 0;
      if (open) return revealCard(state, p, b, fresh[b.id]);
      return '<li><button type="button" class="reveal-egg" data-action="reveal" data-project="' + p.id + '" data-id="' + b.id + '" aria-label="Crack egg ' + (i + 1) + '">' +
        bigEgg(b.id + 'r') + '<span class="reveal-egg-label">Egg ' + (i + 1) + '</span></button></li>';
    }).join('') + '</ul>';
    if (closed) return intro + grid;

    var counts = {};
    babies.forEach(function (b, i) {
      // Babies that have since left the collection still count toward the original results.
      var label = b ? G.morphLabel(b.genotype) : (p.hatchLabels && p.hatchLabels[i]) || 'Rehomed';
      counts[label] = (counts[label] || 0) + 1;
    });
    var labels = {};
    p.predicted.forEach(function (o) { labels[o.label] = true; });
    Object.keys(counts).forEach(function (l) { labels[l] = true; });
    return intro + grid +
      '<h3>Predicted vs. hatched</h3>' +
      '<table class="outcomes compare"><thead><tr><th scope="col">Morph</th><th scope="col">Predicted</th><th scope="col">Hatched</th></tr></thead><tbody>' +
      Object.keys(labels).map(function (l) {
        var pr = p.predicted.find(function (o) { return o.label === l; });
        return '<tr><th scope="row">' + esc(l) + '</th><td>' + (pr ? G.pct(pr.prob) + ' <span class="muted small">(≈' + U.round(pr.prob * n, 1) + ')</span>' : '—') + '</td><td><strong>' + (counts[l] || 0) + '</strong></td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="small muted">Differences between predicted and actual are normal: each egg is an independent roll. Hatchlings need to eat on their own (feed them after a week) before they can go to new homes.</p>';
  };

  /* ---------- Morph Book ---------- */

  ui.clue = function (genotype) {
    var parts = [];
    SB.GENES.forEach(function (g) {
      var c = genotype[g.id] || 0;
      if (!c) return;
      if (g.type === 'codominant') parts.push(c === 2 ? 'two copies of ' + g.name + ' (one from each parent)' : 'one copy of ' + g.name);
      else if (g.type === 'dominant') parts.push(g.name + ' from either parent');
      else parts.push('two copies of ' + g.name + ' (both parents must carry it)');
    });
    return parts.length ? 'Needs ' + parts.join(' + ') + '.' : 'A hatchling with no visual morph genes.';
  };

  function sticker(state, page, slot, idx) {
    var d = sim.slotDiscovery(state, slot);
    if (d) {
      var snake = { id: d.snakeId || ('book-' + slot.name), name: slot.name, genotype: d.genotype || slot.genotype, ageWeeks: 120, temperament: 'Calm' };
      return '<li class="sticker is-filled"><div class="sticker-art">' + SB.art.snakeSVG(snake, { suffix: 'b', label: 'Sticker: ' + slot.name }) + '</div>' +
        '<p class="sticker-name">' + esc(slot.name) + '</p><p class="sticker-meta">' + chip('good', 'Hatched wk ' + d.week) + '<span class="block">First: ' + esc(d.by) + '</span></p></li>';
    }
    var ghost = { id: 'ghost-' + page.id + idx, name: slot.name, genotype: slot.genotype, ageWeeks: 120, temperament: 'Calm' };
    return '<li class="sticker is-empty"><button type="button" class="sticker-btn" data-action="book-slot" data-page="' + page.id + '" data-slot="' + idx + '" aria-label="' + esc(slot.name) + ': not hatched yet. Find pairings">' +
      '<div class="sticker-art silhouette">' + SB.art.snakeSVG(ghost, { suffix: 'g', label: '' }) + '<span class="sticker-q" aria-hidden="true">?</span></div>' +
      '<p class="sticker-name">' + esc(slot.name) + '</p><p class="sticker-clue">' + esc(ui.clue(slot.genotype)) + '</p>' +
      '<span class="sticker-cta">Find pairings ›</span></button></li>';
  }

  ui.book = function (state) {
    var total = 0, got = 0;
    SB.BOOK.forEach(function (pg) { var pr = sim.pageProgress(state, pg); total += pr.total; got += pr.got; });
    var claimed = state.bookDone || [];
    return '<div class="stack">' +
      '<section class="card book-cover" aria-labelledby="book-h"><div class="book-cover-text"><p class="eyebrow">Keeper’s collection</p><h2 id="book-h">Morph Book</h2>' +
        '<p>Every morph you hatch for the first time earns a sticker. Fill a page to claim its reward. Tap an empty slot to see which of your snakes could produce it.</p></div>' +
        '<div class="book-count"><span class="book-count-num">' + got + '<span class="muted"> / ' + total + '</span></span><span class="small muted">stickers collected</span>' +
        '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + got + '" aria-label="Morph Book progress"><div style="width:' + (got / total * 100) + '%"></div></div></div></section>' +
      SB.BOOK.map(function (page) {
        var pr = sim.pageProgress(state, page);
        var done = claimed.indexOf(page.id) >= 0;
        return '<section class="card book-page' + (done ? ' is-complete' : '') + '" aria-labelledby="bp-' + page.id + '">' +
          '<div class="book-page-head"><div><h2 id="bp-' + page.id + '">' + esc(page.title) + '</h2><p class="small muted">' + esc(page.desc) + '</p></div>' +
          '<div class="book-page-status"><strong>' + pr.got + ' / ' + pr.total + '</strong>' +
            (done ? chip('good', 'Page complete · reward claimed') : chip('info', 'Reward: ' + U.money(page.reward.money) + ' + ' + page.reward.rep + ' rep')) + '</div></div>' +
          '<ul class="sticker-grid">' + page.slots.map(function (slot, i) { return sticker(state, page, slot, i); }).join('') + '</ul></section>';
      }).join('') + '</div>';
  };

  ui.bookSlot = function (state, page, slot) {
    var pairs = sim.pairsFor(state, slot.genotype);
    var needed = SB.GENES.filter(function (g) { return slot.genotype[g.id]; }).map(function (g) { return g.name; });
    var ghost = { id: 'ghost-dlg-' + slot.name, name: slot.name, genotype: slot.genotype, ageWeeks: 120, temperament: 'Calm' };
    return '<div class="slot-detail"><div class="sticker-art silhouette slot-art">' + SB.art.snakeSVG(ghost, { suffix: 's', label: '' }) + '<span class="sticker-q" aria-hidden="true">?</span></div>' +
      '<div><p><strong>' + esc(ui.clue(slot.genotype)) + '</strong></p><p class="small muted">Page: ' + esc(page.title) + '. Hatch one to fill this slot.</p>' +
      '<h3>Best pairings in your collection</h3>' +
      (pairs.length ? '<ul class="pair-list">' + pairs.map(function (pr) {
        return '<li class="pair-row"><div><strong>' + esc(pr.male.name) + ' × ' + esc(pr.female.name) + '</strong><div class="small muted">' + esc(G.fullLabel(pr.male)) + ' × ' + esc(G.fullLabel(pr.female)) + '</div></div>' +
          '<div class="pair-odds"><span class="pair-pct">' + G.pct(pr.prob) + '</span><span class="small muted">per egg</span></div>' +
          '<div class="pair-actions">' + (pr.ready ? chip('good', 'Ready') : chip('warn', 'Not ready yet')) + btn('Preview', 'preview-pair', 'data-m="' + pr.male.id + '" data-f="' + pr.female.id + '"', 'btn-small') + '</div></li>';
      }).join('') + '</ul>'
        : '<div class="note note-warn"><span aria-hidden="true">!</span> None of your snakes can produce a ' + esc(slot.name) + ' yet. Look for a male and a female carrying <strong>' + esc(needed.join(' and ') || 'no visual genes') + '</strong> on the Market, or breed carriers first.</div>' +
          btn('Go to Market', 'view', 'data-view="market"', 'btn-small')) +
      '</div></div>';
  };

  /* ---------- Market ---------- */

  ui.market = function (state) {
    var mk = state.market;
    var requests = mk.requests.map(function (r) {
      var matches = state.snakes.filter(function (s) { return !sim.isUnrevealed(state, s) && sim.matchesCriteria(state, s, r.criteria); });
      var sellable = matches.filter(function (s) { return sim.canSell(state, s).ok; });
      return '<li class="request"><div class="request-head"><strong>' + esc(r.buyer) + '</strong>' + chip('info', 'Pays +' + Math.round((r.bonus - 1) * 100) + '%') + '</div>' +
        '<p>' + esc(r.text) + '</p><p class="small muted">Open until week ' + r.expires + '</p>' +
        (sellable.length ? '<form class="inline-form" data-form="fulfill" data-id="' + r.id + '"><label class="sr-only" for="ff-' + r.id + '">Choose a snake for ' + esc(r.buyer) + '</label><select id="ff-' + r.id + '" name="snake">' +
          sellable.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + (s.keeper ? ' ★' : '') + ' — ' + esc(G.fullLabel(s)) + ' — ' + U.money(Math.round(sim.value(state, s) * r.bonus / 5) * 5) + '</option>'; }).join('') +
          '</select><button class="btn btn-small btn-primary" type="submit">Sell to buyer</button></form>'
          : '<p class="small">' + chip('warn', matches.length ? 'Your matching snakes aren’t ready to sell yet' : 'No matching snakes yet') + '</p>') + '</li>';
    }).join('');

    var sellRows = state.snakes.filter(function (s) { return !sim.isUnrevealed(state, s); }).sort(function (a, b) { return (a.keeper ? 1 : 0) - (b.keeper ? 1 : 0) || a.name.localeCompare(b.name); }).map(function (s) {
      var c = sim.canSell(state, s);
      return '<tr><th scope="row"><button type="button" class="link" data-action="open-snake" data-id="' + s.id + '">' + esc(s.name) + '</button>' + (s.keeper ? ' <span class="keeper">★<span class="sr-only"> keeper</span></span>' : '') + '<div class="small muted">' + (s.sex === 'M' ? '♂' : '♀') + ' ' + U.age(s.ageWeeks) + ' · ' + esc(G.fullLabel(s)) + '</div></th>' +
        '<td>' + U.money(sim.value(state, s)) + '</td><td>' + (c.ok ? btn('Sell…', 'sell', 'data-id="' + s.id + '"', 'btn-small') : '<span class="small">' + chip('warn', 'Not yet') + '<span class="block muted">' + esc(c.reasons[0]) + '</span></span>') + '</td></tr>';
    }).join('');

    var listings = mk.listings.map(function (l) {
      return '<li class="listing"><span class="pick-art">' + SB.art.snakeSVG(l.snake, { suffix: 'l', label: '' }) + '</span><div><strong>' + esc(l.snake.name) + '</strong> · ' + sexLabel(l.snake) + '<div class="small">' + U.age(l.snake.ageWeeks) + ' · ' + l.snake.weight + ' g</div>' + geneTags(l.snake) +
        '<div class="small muted">From ' + esc(l.seller) + '</div><div class="btn-row">' + btn('Buy for ' + U.money(l.price), 'buy', 'data-id="' + l.id + '"', 'btn-small btn-primary') + '</div></div></li>';
    }).join('');

    var trades = mk.trades.map(function (t) {
      var matches = state.snakes.filter(function (s) { return sim.matchesCriteria(state, s, t.criteria) && sim.canSell(state, s).ok; });
      return '<li class="listing"><span class="pick-art">' + SB.art.snakeSVG(t.snake, { suffix: 't', label: '' }) + '</span><div><strong>' + esc(t.trader) + '</strong><p class="small">' + esc(t.text) + '</p>' +
        '<div class="small">Offers <strong>' + esc(t.snake.name) + '</strong> · ' + (t.snake.sex === 'M' ? '♂ Male' : '♀ Female') + ' · ' + U.age(t.snake.ageWeeks) + ' · ' + t.snake.weight + ' g</div>' + geneTags(t.snake) +
        (matches.length ? '<form class="inline-form" data-form="trade" data-id="' + t.id + '"><label class="sr-only" for="tr-' + t.id + '">Snake to trade</label><select id="tr-' + t.id + '" name="snake">' + matches.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + ' — ' + esc(G.fullLabel(s)) + '</option>'; }).join('') + '</select><button class="btn btn-small" type="submit">Trade</button></form>'
          : '<p class="small">' + chip('warn', 'You have no matching snake ready to trade') + '</p>') + '<p class="small muted">Open until week ' + t.expires + '</p></div></li>';
    }).join('');

    return '<div class="market-layout">' +
      '<section class="card" aria-labelledby="rq-h"><h2 id="rq-h">Buyer requests</h2><p class="small">Buyers pay a premium for exactly what they want and it boosts your reputation.</p>' + (requests ? '<ul class="request-list">' + requests + '</ul>' : empty('No requests right now', 'New buyers appear as the weeks go by.')) + '</section>' +
      '<section class="card" aria-labelledby="sell-h"><h2 id="sell-h">Sell to vetted buyers</h2><p class="small">Only healthy, feeding snakes go to new homes. Prices reflect proven genetics, age, sex, health and your reputation.</p>' +
        (sellRows ? '<div class="table-wrap"><table class="sell-table"><thead><tr><th scope="col">Snake</th><th scope="col">Value</th><th scope="col">Action</th></tr></thead><tbody>' + sellRows + '</tbody></table></div>' : empty('Nothing to sell', 'Your collection is empty.')) + '</section>' +
      '<section class="card" aria-labelledby="buy-h"><h2 id="buy-h">Snakes looking for a home</h2>' + (listings ? '<ul class="listing-list">' + listings + '</ul>' : empty('No listings', 'Sellers post new animals every few weeks.')) + '</section>' +
      '<section class="card" aria-labelledby="trade-h"><h2 id="trade-h">Trade offers</h2>' + (trades ? '<ul class="listing-list">' + trades + '</ul>' : empty('No trade offers', 'Traders sometimes appear — check back after a few weeks.')) + '</section>' +
      '</div>';
  };

  /* ---------- Facility ---------- */

  ui.facility = function (state) {
    var free = sim.freeEnclosures(state).length;
    var homeless = sim.homeless(state);
    var encCards = state.enclosures.map(function (e) {
      var o = sim.occupant(state, e);
      var issues = o ? envIssues(e, o) : [];
      return '<li class="enc"><div class="enc-head"><strong>' + esc(e.name) + '</strong><span class="small muted">' + (e.kind === 'tub' ? 'Hatchling tub' : 'Adult enclosure') + '</span></div>' +
        (o ? '<p class="small">Home to <button type="button" class="link" data-action="open-snake" data-id="' + o.id + '">' + esc(o.name) + '</button></p>' +
          '<div class="chips">' + (issues.length ? chip('warn', issues.join(', ')) : chip('good', 'All conditions good')) + '</div>' +
          '<p class="small">' + e.temp + '°F · ' + e.humidity + '% humidity · clean ' + e.clean + ' · water ' + e.water + '</p>'
          : '<p class="small">' + chip('info', 'Empty — ready for a snake') + '</p>') + '</li>';
    }).join('');
    var shop = SB.UPGRADES.map(function (u) {
      var count = sim.upgradeCount(state, u.id);
      var owned = !u.repeatable && count;
      var maxed = u.repeatable && count >= u.max;
      var poor = state.money < u.price;
      var reason = owned ? 'Installed' : maxed ? 'Maximum reached' : poor ? 'Need ' + U.money(u.price - state.money) + ' more' : '';
      return '<li class="upgrade"><div><strong>' + esc(u.name) + '</strong>' + (u.repeatable ? ' <span class="small muted">(own ' + count + ')</span>' : '') + '<p class="small">' + esc(u.desc) + '</p></div>' +
        '<div class="upgrade-buy">' + (owned ? chip('good', 'Installed') : '<button type="button" class="btn btn-small' + (poor || maxed ? '' : ' btn-primary') + '" data-action="buy-upgrade" data-id="' + u.id + '"' + (poor || maxed ? ' aria-disabled="true"' : '') + '>Buy ' + U.money(u.price) + '</button>' + (reason ? '<span class="small muted block">' + reason + '</span>' : '')) + '</div></li>';
    }).join('');
    return '<div class="stack">' +
      '<section class="tiles" aria-label="Facility summary">' +
        tile('Enclosures', String(state.enclosures.length), free + ' free') +
        tile('Incubators', String(state.incubators.length), sim.freeIncubators(state).length + ' free') +
        tile('Promised to clutches', String(sim.promisedSpaces(state)), 'spaces reserved for hatchlings') +
        tile('Weekly upkeep', U.money(state.enclosures.length * SB.COSTS.upkeepPerEnclosure + state.incubators.length), 'heating & lighting') +
      '</section>' +
      (homeless.length ? '<div class="error-box" role="alert"><strong><span aria-hidden="true">✕</span> ' + homeless.length + ' snake(s) in temporary holding tubs.</strong> Buy a tub or adult enclosure — they’ll move in automatically.</div>' : '') +
      '<section class="card" aria-labelledby="shop-h"><h2 id="shop-h">Upgrades &amp; expansion</h2><ul class="upgrade-list">' + shop + '</ul></section>' +
      '<section class="card" aria-labelledby="enc-h"><h2 id="enc-h">Enclosures</h2><p class="small">Ball pythons are housed individually. Open a snake to adjust its enclosure.</p><ul class="enc-grid">' + encCards + '</ul></section>' +
      '</div>';
  };

  /* ---------- Journal ---------- */

  ui.journal = function (state, uis) {
    var tab = uis.journalTab || 'guide';
    var tabs = [['guide', 'Guide'], ['calc', 'Genetics calculator'], ['discoveries', 'Discoveries'], ['goals', 'Goals'], ['log', 'Event log']];
    var body = '';
    if (tab === 'guide') body = guide();
    if (tab === 'calc') body = calculator(uis);
    if (tab === 'discoveries') {
      body = state.discoveries.length ? '<ul class="discoveries">' + state.discoveries.map(function (d) {
        return '<li><span class="disc-badge" aria-hidden="true">✦</span><div><strong>' + esc(d.label) + '</strong><div class="small muted">First hatched week ' + d.week + ' (' + esc(d.by) + ')</div></div></li>';
      }).join('') + '</ul>' : empty('No discoveries yet', 'Each new morph you hatch is recorded here.');
    }
    if (tab === 'goals') {
      body = '<ol class="goal-list">' + SB.GOALS.map(function (g) {
        var done = state.goalsDone.indexOf(g.id) >= 0;
        var cur = sim.currentGoal(state) === g;
        return '<li class="' + (done ? 'is-done' : cur ? 'is-current' : '') + '">' + (done ? chip('good', 'Done') : cur ? chip('info', 'Current') : chip('warn', 'Locked')) + ' <strong>' + esc(g.title) + '</strong><div class="small">' + esc(g.desc) + '</div></li>';
      }).join('') + '</ol>';
    }
    if (tab === 'log') body = logList(state.log);
    return '<section class="card" aria-labelledby="j-h"><h2 id="j-h">Keeper’s journal</h2>' +
      '<div class="segmented" role="group" aria-label="Journal sections">' + tabs.map(function (t) {
        return '<button type="button" class="seg' + (t[0] === tab ? ' is-active' : '') + '" aria-pressed="' + (t[0] === tab) + '" data-action="journal-tab" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div><div class="journal-body">' + body + '</div></section>';
  };

  function guide() {
    return '<div class="prose">' +
      '<h3>How to play</h3><ol>' +
        '<li><strong>Care first.</strong> Each week snakes get hungrier and enclosures get dirtier. Feed snakes when they’re ready to eat (adults every ~2 weeks, juveniles weekly), keep water fresh, and hold the hot spot at 88–92°F with 50–65% humidity.</li>' +
        '<li><strong>Pick a pair.</strong> Adults that are healthy, calm and at a good weight can breed. The Breeding tab shows the odds for every egg before you commit.</li>' +
        '<li><strong>Advance time.</strong> Pairings take ' + T.pairingWeeks + ' weeks, gravid females lay after ' + T.gravidWeeks + ' more, and eggs incubate for ' + T.incubationWeeks + ' weeks (compressed game time).</li>' +
        '<li><strong>Incubate carefully.</strong> 88–90°F and 90–100% humidity keep eggs healthy.</li>' +
        '<li><strong>Hatch, keep or rehome.</strong> Once hatchlings are feeding, keep your favourites and find good homes for the others.</li>' +
      '</ol>' +
      '<h3>Genetics basics</h3>' +
      '<p>Every snake has two copies of each gene — one from each parent. When breeding, each parent passes on one of its two copies at random, independently for every egg.</p>' +
      '<ul>' +
        '<li><strong>Incomplete dominant</strong> (Pastel, Yellow Belly, Mojave): one copy is visible; two copies make a distinct “super” form (Super Pastel, Ivory, Blue-Eyed Leucistic).</li>' +
        '<li><strong>Dominant</strong> (Pinstripe): one or two copies look the same, so a homozygous animal is only proven by its offspring.</li>' +
        '<li><strong>Recessive</strong> (Clown, Albino, Piebald): needs two copies to show. A snake with one copy looks normal but is a <em>het</em> (heterozygous carrier).</li>' +
        '<li><strong>Visual</strong> means you can see the trait. <strong>Het</strong> means an invisible single copy of a recessive gene.</li>' +
        '<li><strong>Possible hets</strong>: when two hets breed, a normal-looking baby has a 2-in-3 chance of being het — shown as “66% poss. het”. Only future breeding can prove it.</li>' +
      '</ul>' +
      '<h3>Why results differ from the odds</h3><p>Percentages are per egg. A clutch of 6 from a 25% pairing averages 1.5 visuals, but 0, 1, 2 or even 4 are all perfectly possible. Over many clutches, results approach the predictions.</p>' +
      '<h3>Morphs in this game</h3><ul>' + SB.GENES.map(function (g) {
        return '<li><strong>' + esc(g.name) + '</strong> <span class="muted">(' + typeName(g.type) + (g.superName ? '; super form: ' + esc(g.superName) : '') + ')</span> — ' + esc(g.blurb) + '</li>';
      }).join('') + '</ul>' +
      '<h3>Welfare notes</h3><ul><li>Poor conditions raise stress and lower health, which reduces breeding success and egg quality.</li><li>Gravid females often refuse food — that’s normal. Feed them well after laying; they need ' + T.postLayRecoveryWeeks + ' weeks to recover before breeding again.</li><li>Low humidity causes stuck sheds. Hatchlings must be eating before they go to new homes.</li><li>Neglected, unhealthy animals cost you reputation.</li></ul>' +
      '<div class="note"><strong>About this model:</strong> this is a deliberately simplified teaching model. Real ball python genetics include allelic groups (e.g. the BEL complex), linked genes, genes with health concerns, and incomplete knowledge of some traits. Each gene here is treated as an independent, single-locus trait with simple inheritance, and time is heavily compressed.</div>' +
      '</div>';
  }

  function calculator(uis) {
    var calc = uis.calc || { male: {}, female: {} };
    function side(key, title) {
      return '<fieldset class="calc-side"><legend>' + title + '</legend>' + SB.GENES.map(function (g) {
        var v = calc[key][g.id] || 0;
        var opts = g.type === 'recessive' ? [[0, 'Not carrying'], [1, 'Het (carrier)'], [2, 'Visual']] :
          g.type === 'dominant' ? [[0, 'None'], [1, 'Visual (1 copy)'], [2, 'Visual (2 copies)']] : [[0, 'None'], [1, g.name], [2, g.superName]];
        return '<label class="calc-row"><span>' + esc(g.name) + '</span><select data-change="calc" data-side="' + key + '" data-gene="' + g.id + '">' + opts.map(function (o) {
          return '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
        }).join('') + '</select></label>';
      }).join('') + '</fieldset>';
    }
    var pred = G.predict({ genotype: calc.male, knowledge: G.exactKnowledge(calc.male) }, { genotype: calc.female, knowledge: G.exactKnowledge(calc.female) });
    return '<p class="small">Experiment with any combination — no snakes needed. Parents here are treated as proven.</p><div class="calc">' + side('male', '♂ Parent 1') + side('female', '♀ Parent 2') + '</div>' +
      '<h3>Per-egg odds</h3>' + ui.outcomeTable(pred, 0) + btn('Reset calculator', 'calc-reset', '', 'btn-small btn-ghost');
  }

  SB.ui = ui;
})(globalThis.SB = globalThis.SB || {});
