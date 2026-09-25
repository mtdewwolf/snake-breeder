(function (SB) {
  'use strict';

  var U = {};

  U.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  U.clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  U.rand = function () { return SB.genetics.rng(); };
  U.randInt = function (lo, hi) { return lo + Math.floor(U.rand() * (hi - lo + 1)); };
  U.pick = function (arr) { return arr[Math.floor(U.rand() * arr.length)]; };
  U.round = function (v, d) { var m = Math.pow(10, d || 0); return Math.round(v * m) / m; };

  U.money = function (v) { return '$' + Math.round(v).toLocaleString('en-US'); };

  U.age = function (weeks) {
    if (weeks < 9) return weeks + (weeks === 1 ? ' week' : ' weeks');
    var months = Math.floor(weeks / 4.345);
    if (months < 24) return months + ' mo';
    var y = Math.floor(months / 12), m = months % 12;
    return y + ' yr' + (m ? ' ' + m + ' mo' : '');
  };

  /* Rate a value against an ideal/ok range. Returns { level: 'good'|'warn'|'bad', text } */
  U.rate = function (value, range) {
    if (value >= range.ideal[0] && value <= range.ideal[1]) return { level: 'good', text: 'Ideal' };
    if (value >= range.ok[0] && value <= range.ok[1]) return { level: 'warn', text: value < range.ideal[0] ? 'A bit low' : 'A bit high' };
    return { level: 'bad', text: value < range.ok[0] ? 'Too low' : 'Too high' };
  };

  U.ICON = { good: '✓', warn: '!', bad: '✕', info: 'ℹ' };

  SB.util = U;
})(globalThis.SB = globalThis.SB || {});
