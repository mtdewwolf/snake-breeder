/*
 * App controller: owns the game state, wires DOM events to simulation
 * actions, saves after every change and re-renders.
 */
(function (SB) {
  'use strict';

  var sim = SB.sim, ui = SB.ui, U = SB.util;
  var UI_KEY = 'scale-and-nasl-ui';
  var state;
  var uis = {
    view: 'overview', filter: 'all', sort: 'name', male: null, female: null, journalTab: 'guide',
    calc: { male: { pastel: 1, clown: 1 }, female: { clown: 1 } }
  };
  var dialogState = null;
  var pendingConfirm = null;
  var lastFocus = null;

  var $ = function (id) { return document.getElementById(id); };
  var dialog = $('dialog');

  /* ---------- Feedback ---------- */

  function toast(msg, level) {
    var box = $('toasts');
    var el = document.createElement('div');
    level = level || 'good';
    el.className = 'toast toast-' + level;
    el.innerHTML = '<span aria-hidden="true" class="toast-icon">' + (U.ICON[level] || '•') + '</span><span>' + U.esc(msg) + '</span>';
    box.appendChild(el);
    while (box.children.length > 4) box.removeChild(box.firstChild);
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
    try { localStorage.setItem(UI_KEY, JSON.stringify({ view: uis.view, filter: uis.filter, sort: uis.sort })); } catch (e) { /* optional */ }
  }

  /* Run an action, show its result, check goals, save and re-render. */
  function act(fn) {
    var res = fn();
    if (res && res.msg) toast(res.msg, res.ok ? 'good' : 'bad');
    sim.checkGoals(state).forEach(function (m) { toast(m, 'good'); });
    persist();
    render();
    return res;
  }

  /* ---------- Rendering ---------- */

  function render() {
    $('top-stats').innerHTML = ui.renderTop(state);
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
    var scroll = dialog.querySelector('.dialog-inner').scrollTop;
    if (dialogState.type === 'snake') {
      var s = sim.snake(state, dialogState.id);
      if (!s) { closeDialog(); return; }
      title.textContent = s.name + ' — ' + SB.genetics.morphLabel(s.genotype);
      body.innerHTML = ui.snakeDetail(state, s);
    } else if (dialogState.type === 'hatch') {
      var p = state.projects.find(function (x) { return x.id === dialogState.id; });
      if (!p) { closeDialog(); return; }
      title.textContent = '🐣 Hatch results';
      body.innerHTML = ui.hatchResults(state, p);
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
    uis.view = v;
    persist();
    render();
    window.scrollTo(0, 0);
    var h = document.querySelector('#view h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  function advance() {
    var hatchBefore = state.lastHatch && state.lastHatch.week;
    var report = sim.advanceWeek(state);
    persist();
    render();
    var bad = report.events.filter(function (e) { return e.kind === 'bad'; }).length;
    toast('Week ' + report.week + ' begins. ' + (report.events.length ? report.events.length + ' event' + (report.events.length === 1 ? '' : 's') + ' in the log.' : 'A quiet week.'), bad ? 'warn' : 'good');
    report.events.slice(0, 3).forEach(function (e) { toast(e.text, e.kind === 'info' ? 'good' : e.kind); });
    report.goals.forEach(function (m) { toast(m, 'good'); });
    if (state.lastHatch && state.lastHatch.week !== hatchBefore && state.lastHatch.week === state.week) {
      state.lastHatch.seen = true;
      persist();
      openDialog({ type: 'hatch', id: state.lastHatch.projectId });
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
    'filter': function (el) { uis.filter = el.dataset.filter; persist(); render(); },
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
    var fn = actions[el.dataset.action];
    if (fn) { ev.preventDefault(); fn(el); }
  });

  document.addEventListener('change', function (ev) {
    var el = ev.target;
    var kind = el.dataset && el.dataset.change;
    if (!kind) return;
    if (kind === 'sort') { uis.sort = el.value; persist(); render(); }
    if (kind === 'pick') {
      if (el.dataset.sex === 'M') uis.male = el.value; else uis.female = el.value;
      if (uis.male && uis.female) { sim.markTutorial(state, 'preview'); persist(); }
      render();
      var sel = document.querySelector('input[name="' + el.name + '"][value="' + el.value + '"]');
      if (sel) sel.focus({ preventScroll: true });
    }
    if (kind === 'move' && el.value) { var id = el.dataset.id, to = el.value; act(function () { return sim.move(state, id, to); }); }
    if (kind === 'calc') {
      uis.calc[el.dataset.side][el.dataset.gene] = Number(el.value);
      if (!uis.calc[el.dataset.side][el.dataset.gene]) delete uis.calc[el.dataset.side][el.dataset.gene];
      render();
      var again = document.querySelector('select[data-change="calc"][data-side="' + el.dataset.side + '"][data-gene="' + el.dataset.gene + '"]');
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
      if (saved) { uis.view = saved.view || uis.view; uis.filter = saved.filter || uis.filter; uis.sort = saved.sort || uis.sort; }
    } catch (e) { /* optional */ }
    sim.checkGoals(state);
    persist();
    render();
    if (loaded.state) toast('Welcome back! Your operation was restored at week ' + state.week + '.');
    SB.app = { get state() { return state; }, render: render };
  }

  boot();
})(globalThis.SB = globalThis.SB || {});
