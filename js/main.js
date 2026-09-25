/*
 * App controller: owns the game state, wires DOM events to simulation
 * actions, saves after every change and re-renders.
 */
(function (SB) {
  'use strict';

  var sim = SB.sim, ui = SB.ui, U = SB.util;
  var UI_KEY = 'scale-and-nasl-ui'; // pre-rename key, kept so UI prefs survive
  var state;
  var uis = {
    view: 'overview', filter: 'all', sort: 'name', male: null, female: null, journalTab: 'guide',
    calc: { male: { pastel: 1, clown: 1 }, female: { clown: 1 } }
  };
  var dialogState = null;
  var freshReveals = {}; // babies revealed in the latest click, for one celebratory render
  var pendingConfirm = null;
  var lastFocus = null;

  var $ = function (id) { return document.getElementById(id); };
  var dialog = $('dialog');

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ---------- Feedback ---------- */

  // A toast with a key replaces any visible toast with the same key, so rapid
  // repeats (e.g. skipping several quiet weeks) update in place instead of piling up.
  function toast(msg, level, key) {
    var box = $('toasts');
    var el = document.createElement('div');
    level = level || 'good';
    el.className = 'toast toast-' + level;
    if (key) {
      el.dataset.key = key;
      Array.prototype.forEach.call(box.querySelectorAll('[data-key="' + key + '"]'), function (old) { old.remove(); });
    }
    el.innerHTML = '<span aria-hidden="true" class="toast-icon">' + (U.ICON[level] || '•') + '</span><span>' + U.esc(msg) + '</span>';
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(function () { el.classList.add('is-leaving'); setTimeout(function () { el.remove(); }, 400); }, level === 'bad' ? 7000 : 4500);
  }

  function notice(msg) {
    var n = $('notice');
    if (!msg) { n.hidden = true; return; }
    n.hidden = false;
    n.innerHTML = '<span aria-hidden="true">!</span> ' + U.esc(msg) + ' <button type="button" class="btn btn-small btn-ghost" data-action="dismiss-notice">Dismiss</button>';
  }

  function persist() {
    if (!SB.state.save(state)) notice('Progress could not be saved in this browser (storage may be full or disabled).');
    try { localStorage.setItem(UI_KEY, JSON.stringify({ view: uis.view, filter: uis.filter, sort: uis.sort, query: uis.query || '' })); } catch (e) { /* optional */ }
  }

  /* Floating "+$50" style numbers rising from where the player tapped. */
  var lastRect = null;
  function floater(text, kind, rect, offset) {
    if (!rect || reducedMotion()) return;
    var el = document.createElement('div');
    el.className = 'floater floater-' + kind;
    el.textContent = text;
    el.style.left = (rect.left + rect.width / 2) + 'px';
    el.style.top = (rect.top + (offset || 0)) + 'px';
    $('floaters').appendChild(el);
    setTimeout(function () { el.remove(); }, 1300);
  }
  function floatDeltas(money, rep, rect) {
    rect = rect || lastRect;
    var dm = Math.round(state.money - money), dr = state.reputation - rep;
    if (dm) floater((dm > 0 ? '+' : '−') + U.money(Math.abs(dm)), dm > 0 ? 'gain' : 'spend', rect);
    if (dr) floater((dr > 0 ? '+' : '−') + Math.abs(dr) + ' ★', 'rep', rect, -26);
  }

  /* Run an action, show its result, check goals, save and re-render. */
  function act(fn) {
    var money = state.money, rep = state.reputation;
    var res = fn();
    if (res && res.msg) toast(res.msg, res.ok ? 'good' : 'bad');
    sim.checkGoals(state).forEach(function (m) { toast(m, 'good'); });
    floatDeltas(money, rep);
    persist();
    render();
    return res;
  }

  /* ---------- Rendering ---------- */

  /* HUD counters tick toward their new value and bump when they change. */
  var shown = {};
  function animateCounters() {
    document.querySelectorAll('[data-count]').forEach(function (el) {
      var key = el.dataset.count, to = Number(el.dataset.value), from = shown[key];
      shown[key] = to;
      if (from == null || from === to) return;
      var fmt = key === 'coin' ? function (v) { return U.money(v); } : function (v) { return String(Math.round(v)); };
      var box = el.closest('.res');
      if (box) { box.classList.remove('bump', 'bump-down'); void box.offsetWidth; box.classList.add(to > from ? 'bump' : 'bump-down'); }
      if (reducedMotion()) return;
      var t0 = performance.now(), dur = 650;
      el.textContent = fmt(from);
      (function step(now) {
        var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = fmt(from + (to - from) * e);
        if (k < 1) requestAnimationFrame(step);
      })(t0);
    });
  }

  function render() {
    $('top-stats').innerHTML = ui.renderTop(state);
    $('quest').innerHTML = ui.renderQuest(state);
    animateCounters();
    $('tabs').innerHTML = ui.renderTabs(uis.view, state);
    var view = ui[uis.view] ? uis.view : 'overview';
    var scrollY = window.scrollY;
    $('view').innerHTML = ui[view](state, uis);
    window.scrollTo(0, scrollY);
    renderDialog();
  }

  function renderDialog() {
    if (!dialogState || !dialog.open) return;
    var body = $('dialog-body'), title = $('dialog-title');
    dialog.dataset.kind = dialogState.type;
    var scroll = dialog.querySelector('.dialog-inner').scrollTop;
    if (dialogState.type === 'snake') {
      var s = sim.snake(state, dialogState.id);
      if (!s) { closeDialog(); return; }
      title.textContent = s.name + ' — ' + SB.genetics.morphLabel(s.genotype);
      body.innerHTML = ui.snakeDetail(state, s);
    } else if (dialogState.type === 'hatch') {
      var p = state.projects.find(function (x) { return x.id === dialogState.id; });
      if (!p) { closeDialog(); return; }
      var closed = sim.unrevealedCount(state, p);
      title.textContent = closed ? '🥚 Crack the eggs!' : '🐣 Hatch results';
      body.innerHTML = ui.hatchResults(state, p, freshReveals);
      freshReveals = {};
    } else if (dialogState.type === 'quest') {
      title.textContent = '🎯 ' + (sim.currentGoal(state) ? sim.currentGoal(state).title : 'Quests');
      body.innerHTML = ui.questDetail(state);
    } else if (dialogState.type === 'recap') {
      title.textContent = 'Week ' + dialogState.report.week;
      body.innerHTML = recapHTML(dialogState);
    } else if (dialogState.type === 'book-slot') {
      var page = SB.BOOK.find(function (x) { return x.id === dialogState.page; });
      var slot = page && page.slots[dialogState.slot];
      if (!slot) { closeDialog(); return; }
      title.textContent = '📘 ' + slot.name;
      body.innerHTML = ui.bookSlot(state, page, slot);
    } else if (dialogState.type === 'confirm') {
      title.textContent = dialogState.title;
      body.innerHTML = '<p>' + dialogState.html + '</p><div class="btn-row end">' +
        '<button type="button" class="btn" data-action="confirm-no">Cancel</button>' +
        '<button type="button" class="btn ' + (dialogState.danger ? 'btn-danger' : 'btn-primary') + '" data-action="confirm-yes">' + U.esc(dialogState.yes) + '</button></div>';
    }
    dialog.querySelector('.dialog-inner').scrollTop = scroll;
  }

  function openDialog(ds) {
    if (!dialog.open) lastFocus = document.activeElement;
    dialogState = ds;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('.dialog-inner').scrollTop = 0;
    renderDialog();
    var focusTarget = ds.type === 'confirm' ? dialog.querySelector('[data-action="confirm-yes"]') : dialog.querySelector('[data-action="close-dialog"]');
    if (focusTarget) focusTarget.focus();
  }

  function closeDialog() {
    dialogState = null; pendingConfirm = null;
    if (dialog.open) dialog.close();
  }

  function confirmAction(opts, onYes) {
    pendingConfirm = { onYes: onYes, back: dialogState && dialogState.type !== 'confirm' ? dialogState : null };
    openDialog({ type: 'confirm', title: opts.title, html: opts.html, yes: opts.yes || 'Confirm', danger: opts.danger });
  }

  dialog.addEventListener('close', function () {
    dialogState = null; pendingConfirm = null;
    if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus();
  });

  /* ---------- Actions ---------- */

  function switchView(v) {
    if (dialog.open) closeDialog();
    uis.view = v;
    persist();
    render();
    window.scrollTo(0, 0);
    var h = document.querySelector('#view h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  function recapHTML(ds) {
    var r = ds.report, icons = { good: '✓', warn: '!', bad: '✕', info: '•' };
    var delta = function (v, fmt, label) {
      if (!v) return '';
      return '<span class="recap-delta ' + (v > 0 ? 'is-up' : 'is-down') + '">' + (v > 0 ? '+' : '−') + fmt(Math.abs(v)) + ' <small>' + label + '</small></span>';
    };
    var evs = r.events.concat(r.goals.map(function (g) { return { text: g, kind: 'good' }; }));
    return '<div class="recap">' +
      '<div class="recap-cal" aria-hidden="true"><span>Week</span><strong>' + r.week + '</strong></div>' +
      '<div class="recap-deltas">' + delta(ds.money, U.money, 'funds') + delta(ds.rep, String, 'reputation') + (!ds.money && !ds.rep ? '<span class="recap-delta">No change in funds</span>' : '') + '</div>' +
      (evs.length ? '<ul class="recap-events">' + evs.slice(0, 7).map(function (e) {
        return '<li class="log-' + e.kind + '"><span class="log-icon" aria-hidden="true">' + (icons[e.kind] || '•') + '</span><span>' + U.esc(e.text) + '</span></li>';
      }).join('') + '</ul>' + (evs.length > 7 ? '<p class="small muted">…and ' + (evs.length - 7) + ' more in the Journal.</p>' : '') : '<p class="recap-quiet">A quiet week in the reptile room.</p>') +
      '<div class="btn-row end">' + (ds.hatchId
        ? '<button type="button" class="btn btn-primary btn-big" data-action="hatch-results" data-id="' + ds.hatchId + '">🥚 Crack the eggs!</button>'
        : '<button type="button" class="btn btn-primary btn-big" data-action="close-dialog">Continue</button>') + '</div></div>';
  }

  function advance() {
    if (dialog.open) closeDialog();
    var hatchBefore = state.lastHatch && state.lastHatch.week;
    var money = state.money, rep = state.reputation;
    var report = sim.advanceWeek(state);
    var hatched = state.lastHatch && state.lastHatch.week !== hatchBefore && state.lastHatch.week === state.week;
    if (hatched) state.lastHatch.seen = true;
    persist();
    document.body.classList.remove('week-turn'); void document.body.offsetWidth; document.body.classList.add('week-turn');
    render();
    var fab = document.querySelector('.fab-next');
    floatDeltas(money, rep, fab && fab.getBoundingClientRect());
    if (hatched || report.events.length || report.goals.length) {
      openDialog({ type: 'recap', report: report, money: Math.round(state.money - money), rep: state.reputation - rep, hatchId: hatched ? state.lastHatch.projectId : null });
      var go = dialog.querySelector('.recap .btn-primary');
      if (go) go.focus();
    } else {
      var todo = ui.needCount(state);
      if (todo) toast('Week ' + report.week + ' — ' + todo + ' thing' + (todo === 1 ? ' needs' : 's need') + ' attention in the room. Try Chores.', 'warn', 'quiet-week');
      else toast('Week ' + report.week + ' — a quiet week in the reptile room.', 'good', 'quiet-week');
    }
  }

  function sellFlow(id, requestId) {
    var s = sim.snake(state, id);
    if (!s) return;
    var req = requestId && state.market.requests.find(function (r) { return r.id === requestId; });
    var price = sim.value(state, s);
    if (req) price = Math.round(price * req.bonus / 5) * 5;
    confirmAction({
      title: 'Find a new home for ' + s.name + '?',
      html: U.esc(s.name) + ' (' + U.esc(SB.genetics.fullLabel(s)) + ') will go to ' + U.esc(req ? req.buyer : 'a vetted buyer') + ' for <strong>' + U.money(price) + '</strong>.' + (s.keeper ? ' <strong>You marked this snake as a keeper.</strong>' : '') + ' This can’t be undone.',
      yes: 'Sell for ' + U.money(price)
    }, function () { act(function () { return sim.sell(state, id, requestId); }); });
  }

  var actions = {
    'view': function (el) { switchView(el.dataset.view); },
    'advance': advance,
    'care-round': function () { act(function () { return sim.careRound(state); }); },
    'open-snake': function (el) { sim.markTutorial(state, 'look'); persist(); openDialog({ type: 'snake', id: el.dataset.id }); render(); },
    'close-dialog': closeDialog,
    'feed': function (el) { act(function () { return sim.feed(state, el.dataset.id); }); },
    'clean': function (el) { act(function () { return sim.clean(state, el.dataset.id); }); },
    'water': function (el) { act(function () { return sim.water(state, el.dataset.id); }); },
    'temp-up': function (el) { act(function () { return sim.adjustTemp(state, el.dataset.id, 1); }); },
    'temp-down': function (el) { act(function () { return sim.adjustTemp(state, el.dataset.id, -1); }); },
    'hum-up': function (el) { act(function () { return sim.adjustHumidity(state, el.dataset.id, 8); }); },
    'hum-down': function (el) { act(function () { return sim.adjustHumidity(state, el.dataset.id, -6); }); },
    'vet': function (el) { act(function () { return sim.vet(state, el.dataset.id); }); },
    'keeper': function (el) { act(function () { return sim.toggleKeeper(state, el.dataset.id); }); },
    'sell': function (el) { sellFlow(el.dataset.id); },
    'filter': function (el) { uis.filter = el.dataset.filter; uis.query = ''; persist(); render(); },
    'clear-collection-filters': function () { uis.filter = 'all'; uis.query = ''; uis.sort = 'name'; persist(); render(); },
    'dismiss-tutorial': function () { state.tutorial.dismissed = true; persist(); render(); toast('Tips hidden. You can find the full guide in the Journal.'); },
    'dismiss-notice': function () { notice(null); },
    'start-pairing': function () {
      var m = sim.snake(state, uis.male), f = sim.snake(state, uis.female);
      if (!m || !f) return;
      confirmAction({ title: 'Start this pairing?', html: 'Pair <strong>' + U.esc(m.name) + '</strong> with <strong>' + U.esc(f.name) + '</strong>? An incubator will be reserved for their clutch. Remember the outcome odds are per egg.', yes: 'Start pairing' },
        function () {
          var r = act(function () { return sim.startPairing(state, uis.male, uis.female); });
          if (r.ok) { uis.male = null; uis.female = null; render(); }
        });
    },
    'cancel-pairing': function (el) {
      confirmAction({ title: 'Separate this pair?', html: 'The pairing will end without eggs and the incubator becomes free.', yes: 'Separate' }, function () { act(function () { return sim.cancelPairing(state, el.dataset.id); }); });
    },
    'hatch-results': function (el) { openDialog({ type: 'hatch', id: el.dataset.id }); },
    'fix-temp': function (el) { act(function () { return sim.resetThermostat(state, el.dataset.id); }); },
    'fix-hum': function (el) { act(function () { return sim.resetHumidity(state, el.dataset.id); }); },
    'fix-incubator': function (el) { act(function () { return sim.tuneIncubator(state, el.dataset.id); }); },
    'quest': function () { openDialog({ type: 'quest' }); },
    'journal-log': function () { uis.journalTab = 'log'; switchView('journal'); },
    'reveal': function (el) {
      if (el.classList.contains('is-cracking')) return;
      var pid = el.dataset.project, id = el.dataset.id;
      var go = function () {
        var r = sim.reveal(state, pid, id);
        if (r.ok) freshReveals[id] = true;
        act(function () { return r; });
        var next = dialog.querySelector('.reveal-egg');
        if (next) next.focus({ preventScroll: true });
        else { var card = dialog.querySelector('.reveal-card.is-fresh .btn'); if (card) card.focus({ preventScroll: true }); }
      };
      if (reducedMotion()) return go();
      el.classList.add('is-cracking');
      setTimeout(go, 650);
    },
    'reveal-all': function (el) {
      var p = state.projects.find(function (x) { return x.id === el.dataset.id; });
      if (!p) return;
      var ids = p.babies.filter(function (id) { return p.revealed && p.revealed.indexOf(id) < 0; });
      var go = function () {
        ids.forEach(function (id) { freshReveals[id] = true; });
        act(function () { return sim.revealAll(state, p.id); });
      };
      if (reducedMotion()) return go();
      dialog.querySelectorAll('.reveal-egg').forEach(function (b) { b.classList.add('is-cracking'); });
      setTimeout(go, 650);
    },
    'book-slot': function (el) { openDialog({ type: 'book-slot', page: el.dataset.page, slot: Number(el.dataset.slot) }); },
    'preview-pair': function (el) {
      uis.male = el.dataset.m; uis.female = el.dataset.f;
      sim.markTutorial(state, 'preview');
      switchView('breeding');
      var prev = document.querySelector('.preview');
      if (prev) prev.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
    },
    'inc-temp-up': function (el) { act(function () { return sim.adjustIncubator(state, el.dataset.id, 'temp', 0.5); }); },
    'inc-temp-down': function (el) { act(function () { return sim.adjustIncubator(state, el.dataset.id, 'temp', -0.5); }); },
    'inc-hum-up': function (el) { act(function () { return sim.adjustIncubator(state, el.dataset.id, 'humidity', 5); }); },
    'inc-hum-down': function (el) { act(function () { return sim.adjustIncubator(state, el.dataset.id, 'humidity', -5); }); },
    'buy': function (el) {
      var l = state.market.listings.find(function (x) { return x.id === el.dataset.id; });
      if (!l) return;
      confirmAction({ title: 'Welcome ' + l.snake.name + '?', html: 'Buy ' + U.esc(l.snake.name) + ' (' + U.esc(SB.genetics.fullLabel(l.snake)) + ') for <strong>' + U.money(l.price) + '</strong>? They’ll need a free enclosure.', yes: 'Buy for ' + U.money(l.price) },
        function () { act(function () { return sim.buy(state, l.id); }); });
    },
    'buy-upgrade': function (el) { act(function () { return sim.buyUpgrade(state, el.dataset.id); }); },
    'journal-tab': function (el) { uis.journalTab = el.dataset.tab; render(); },
    'calc-reset': function () { uis.calc = { male: {}, female: {} }; render(); },
    'reset': function () {
      confirmAction({ title: 'Start a new game?', html: 'This permanently erases your current collection, money and progress in this browser.', yes: 'Erase and start over', danger: true }, function () {
        SB.state.clear();
        state = SB.state.newGame();
        uis.male = uis.female = null; uis.view = 'overview';
        persist();
        closeDialog();
        render();
        toast('A fresh start! Your new operation is ready.');
      });
    },
    'confirm-yes': function () {
      var pc = pendingConfirm;
      if (!pc) return closeDialog();
      if (pc.back) { dialogState = pc.back; pendingConfirm = null; } else closeDialog();
      pc.onYes();
      if (dialogState && dialog.open) renderDialog();
    },
    'confirm-no': function () {
      var pc = pendingConfirm;
      if (pc && pc.back) { pendingConfirm = null; dialogState = pc.back; renderDialog(); } else closeDialog();
    }
  };

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-action]');
    if (!el) return;
    lastRect = el.getBoundingClientRect();
    var fn = actions[el.dataset.action];
    if (fn) { ev.preventDefault(); fn(el); }
  });

  document.addEventListener('change', function (ev) {
    var el = ev.target;
    var kind = el.dataset && el.dataset.change;
    if (!kind) return;
    if (kind === 'sort') { uis.sort = el.value; persist(); render(); }
    if (kind === 'collection-filter') { uis.filter = el.value; persist(); render(); }
    if (kind === 'collection-search') {
      var cursor = el.selectionStart;
      uis.query = el.value;
      persist(); render();
      var search = document.querySelector('[data-change="collection-search"]');
      if (search) { search.focus({ preventScroll: true }); search.setSelectionRange(cursor, cursor); }
    }
    if (kind === 'pick') {
      if (el.dataset.sex === 'M') uis.male = el.value; else uis.female = el.value;
      if (uis.male && uis.female) { sim.markTutorial(state, 'preview'); persist(); }
      render();
      var sel = document.querySelector('input[name="' + el.name + '"][value="' + el.value + '"]');
      if (sel) sel.focus({ preventScroll: true });
    }
    if (kind === 'move' && el.value) { var id = el.dataset.id, to = el.value; act(function () { return sim.move(state, id, to); }); }
    if (kind === 'calc') {
      // Values are pair keys like 'mojave/lesser' ('+' = wild type) for one locus.
      var G = SB.genetics, sideGeno = G.norm(uis.calc[el.dataset.side]);
      var pair = G.parsePairKey(el.value);
      if (pair[0] || pair[1]) sideGeno[el.dataset.locus] = pair; else delete sideGeno[el.dataset.locus];
      uis.calc[el.dataset.side] = sideGeno;
      render();
      var again = document.querySelector('select[data-change="calc"][data-side="' + el.dataset.side + '"][data-locus="' + el.dataset.locus + '"]');
      if (again) again.focus({ preventScroll: true });
    }
  });

  document.addEventListener('submit', function (ev) {
    var form = ev.target;
    var kind = form.dataset.form;
    if (!kind) return;
    ev.preventDefault();
    var data = new FormData(form);
    if (kind === 'rename') act(function () { return sim.rename(state, form.dataset.id, data.get('name')); });
    if (kind === 'fulfill') sellFlow(data.get('snake'), form.dataset.id);
    if (kind === 'trade') {
      var t = state.market.trades.find(function (x) { return x.id === form.dataset.id; });
      var s = sim.snake(state, data.get('snake'));
      if (!t || !s) return;
      confirmAction({ title: 'Confirm trade', html: 'Trade <strong>' + U.esc(s.name) + '</strong> to ' + U.esc(t.trader) + ' for <strong>' + U.esc(t.snake.name) + '</strong> (' + U.esc(SB.genetics.fullLabel(t.snake)) + ')?', yes: 'Trade' },
        function () { act(function () { return sim.trade(state, t.id, s.id); }); });
    }
  });

  /* Arrow-key navigation between section tabs. */
  $('tabs').addEventListener('keydown', function (ev) {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    var tabs = Array.prototype.slice.call(this.querySelectorAll('.tab'));
    var i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    var next = tabs[(i + (ev.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    next.focus();
    ev.preventDefault();
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.target.matches('input, select, textarea') || dialog.open || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === 'n' || ev.key === 'N') { ev.preventDefault(); advance(); }
  });

  /* ---------- Boot ---------- */

  function boot() {
    var loaded = SB.state.load();
    if (loaded.state) {
      state = loaded.state;
    } else {
      state = SB.state.newGame();
      if (loaded.error) notice(loaded.error);
    }
    try {
      var saved = JSON.parse(localStorage.getItem(UI_KEY) || 'null');
      if (saved) { uis.view = saved.view || uis.view; uis.filter = saved.filter || uis.filter; uis.sort = saved.sort || uis.sort; uis.query = saved.query || ''; }
    } catch (e) { /* optional */ }
    sim.checkGoals(state);
    persist();
    render();
    if (loaded.state) toast('Welcome back! Your operation was restored at week ' + state.week + '.');
    SB.app = { get state() { return state; }, render: render };
  }

  boot();
})(globalThis.SB = globalThis.SB || {});
