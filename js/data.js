/*
 * Static game data. Everything here is plain data so new morphs, buyers,
 * goals and upgrades can be added without touching the simulation code.
 */
(function (SB) {
  'use strict';

  /*
   * Gene types:
   *  - codominant (incomplete dominant): 1 copy is visual, 2 copies give a distinct "super" form.
   *  - dominant: 1 or 2 copies look the same.
   *  - recessive: needs 2 copies to be visual; 1 copy is an invisible "het" carrier.
   *
   * `art` describes how the visual form changes the placeholder illustration (see SB.NORMAL_ART).
   * `value` is the market premium for the visual form; `hetValue` is the premium
   * for a proven (100%) het carrier, scaled down for "possible het" animals.
   */
  SB.GENES = [
    {
      id: 'pastel', name: 'Pastel', type: 'codominant', superName: 'Super Pastel',
      value: 60, superValue: 170,
      blurb: 'Brightens yellows and fades the dark pattern edges. Two copies make a Super Pastel.',
      art: { single: { set: { edge: '#f5df8e' }, tint: { base: ['lighten', 0.2], pattern: ['mix', '#ffd84a', 0.55] } },
             super: { set: { edge: '#fbefc0', belly: '#fbf4dc' }, tint: { base: ['lighten', 0.42], pattern: ['mix', '#ffe36b', 0.8] } } }
    },
    {
      id: 'yellowbelly', name: 'Yellow Belly', type: 'codominant', superName: 'Ivory',
      value: 45, superValue: 190,
      blurb: 'A subtle gene with clean, yellow-edged bellies. Two copies make the pale Ivory.',
      art: { single: { set: { belly: '#f1d56a' }, tint: { pattern: ['mix', '#d9a94f', 0.35] }, style: 'cleanSides' },
             super: { set: { base: '#efe3c3', pattern: '#e9d59c', belly: '#fbf6e6', spot: '#e2cf97' }, style: 'ivory' } }
    },
    {
      id: 'mojave', name: 'Mojave', type: 'codominant', superName: 'Blue-Eyed Leucistic',
      value: 70, superValue: 260,
      blurb: 'Rich chocolate tones with a pale, "keyhole" pattern. Two copies produce a white Blue-Eyed Leucistic.',
      art: { single: { set: { base: '#2a1f18', pattern: '#c2b198', spot: '#2e221a', belly: '#f3efe6' }, style: 'keyhole' },
             super: { set: { base: '#f7f4ec', pattern: '#f1ede3', belly: '#fdfcf8', eye: '#4d8fdc', head: '#f7f4ec', headWash: '#f1e2b8' }, style: 'plain' } }
    },
    {
      id: 'pinstripe', name: 'Pinstripe', type: 'dominant',
      value: 55,
      blurb: 'Reduces the pattern to a fine dorsal pinstripe. One or two copies look the same, so a homozygous Pinstripe can only be proven by breeding.',
      art: { visual: { tint: { base: ['mix', '#74502c', 0.55] }, style: 'pin' } }
    },
    {
      id: 'clown', name: 'Clown', type: 'recessive',
      value: 380, hetValue: 55,
      blurb: 'A striking recessive: a bold dorsal stripe and a clean, "clown-faced" head. Hets look normal but carry it.',
      art: { visual: { style: 'clown' } }
    },
    {
      id: 'albino', name: 'Albino', type: 'recessive',
      value: 300, hetValue: 45,
      blurb: 'No black pigment: white and bright yellow with pink-red eyes. Hets look normal.',
      art: { visual: { set: { base: '#fbf1dc', pattern: '#f3b73f', spot: '#f6e2b4', belly: '#fffaf0', eye: '#d23b48', edge: null } } }
    },
    {
      id: 'piebald', name: 'Piebald', type: 'recessive',
      value: 420, hetValue: 60,
      blurb: 'Patches of clean white skin interrupt the normal pattern. Hets look normal.',
      art: { visual: { style: 'pied' } }
    }
  ];

  SB.GENE_BY_ID = {};
  SB.GENES.forEach(function (g) { SB.GENE_BY_ID[g.id] = g; });

  /*
   * Illustration palette for a Normal ball python. Gene `art` entries modify it:
   *   set:   colour overrides (applied in gene order)
   *   tint:  relative colour changes applied afterwards, so combos stack (e.g. Pastel Clown)
   *   style: pattern style flag (pin, clown, pied, keyhole, plain, ivory, cleanSides)
   */
  SB.NORMAL_ART = { base: '#2b1e14', pattern: '#b98a45', belly: '#efe6d2', eye: '#1a120b', spot: null, edge: null, head: null, headWash: null };

  /* Care targets. Ranges are [ideal low, ideal high] and [acceptable low, acceptable high]. */
  SB.CARE = {
    temp: { ideal: [88, 92], ok: [85, 95], unit: '°F', label: 'Hot spot' },
    humidity: { ideal: [50, 65], ok: [40, 75], unit: '%', label: 'Humidity' },
    incubTemp: { ideal: [88, 90], ok: [86, 91], unit: '°F', label: 'Incubator temp' },
    incubHumidity: { ideal: [90, 100], ok: [80, 100], unit: '%', label: 'Incubator humidity' }
  };

  /* Time is compressed: one turn is one week and breeding stages are shortened. */
  SB.TIMING = {
    pairingWeeks: 2,
    gravidWeeks: 3,
    incubationWeeks: 6,
    postLayRecoveryWeeks: 6,
    maleMinWeight: 600, maleMinAgeWeeks: 52,
    femaleMinWeight: 1500, femaleMinAgeWeeks: 104,
    tubMaxWeight: 650,
    minFreeSpacesToPair: 4
  };

  SB.COSTS = {
    feedAdult: 5, feedJuvenile: 3, vet: 45, cleanEnclosure: 2, upkeepPerEnclosure: 1
  };

  SB.UPGRADES = [
    { id: 'tub', name: 'Hatchling tub', price: 45, repeatable: true, max: 16,
      desc: 'A secure small tub with hides and a water bowl. Houses one snake up to about 650 g.' },
    { id: 'adult', name: 'Adult enclosure', price: 160, repeatable: true, max: 12,
      desc: 'A roomy enclosure with two hides and a heat gradient. Houses any single snake.' },
    { id: 'incubator', name: 'Extra incubator', price: 260, repeatable: true, max: 3,
      desc: 'Lets you incubate another clutch at the same time (one pairing per incubator).' },
    { id: 'thermostats', name: 'Precision thermostats', price: 220, repeatable: false,
      desc: 'Proportional thermostats keep enclosure hot spots within about ±0.5°F of the setting.' },
    { id: 'humidity', name: 'Humidity-holding lids & substrate', price: 180, repeatable: false,
      desc: 'Enclosures dry out far more slowly, so humidity stays in range between checks.' },
    { id: 'incubController', name: 'Incubator controller', price: 150, repeatable: false,
      desc: 'Holds incubator temperature and humidity steady, protecting egg health.' }
  ];

  /* Goals are checked in order; `check(state, SB)` returns a number 0..1 progress. */
  SB.GOALS = [
    { id: 'settle', title: 'Settle in', reward: { money: 50, rep: 1 },
      desc: 'Feed a hungry snake and clean an enclosure. Good care comes before breeding.',
      check: function (s) { return ((s.stats.fed > 0 ? 1 : 0) + (s.stats.cleaned > 0 ? 1 : 0)) / 2; } },
    { id: 'firstPair', title: 'First pairing', reward: { money: 0, rep: 2 },
      desc: 'Review a breeding preview and start a pairing between two eligible adults.',
      check: function (s) { return s.stats.pairings > 0 ? 1 : 0; } },
    { id: 'clown', title: 'Hatch a visual Clown', reward: { money: 300, rep: 5 },
      desc: 'Pair two Clown carriers and incubate the clutch until a visual Clown hatches. (Biscuit × Marigold gives a 25% chance per egg.)',
      check: function (s) { return s.discoveries.some(function (d) { return d.genes && d.genes.indexOf('clown') >= 0; }) ? 1 : 0; } },
    { id: 'request', title: 'Fill a buyer request', reward: { money: 100, rep: 3 },
      desc: 'Sell a healthy snake to a buyer with a matching request on the Market.',
      check: function (s) { return s.stats.requestsFilled > 0 ? 1 : 0; } },
    { id: 'expand', title: 'Grow the facility', reward: { money: 150, rep: 2 },
      desc: 'Own at least 12 enclosures so you have room for future clutches.',
      check: function (s) { return Math.min(1, s.enclosures.length / 12); } },
    { id: 'pastelClown', title: 'Produce a Pastel Clown', reward: { money: 400, rep: 6 },
      desc: 'Combine a codominant and a recessive gene in one animal.',
      check: function (s) { return s.discoveries.some(function (d) { return d.label === 'Pastel Clown'; }) ? 1 : 0; } },
    { id: 'renowned', title: 'Respected keeper', reward: { money: 500, rep: 0 },
      desc: 'Reach 40 reputation through healthy animals, honest sales and successful clutches.',
      check: function (s) { return Math.min(1, s.reputation / 40); } }
  ];

  SB.TUTORIAL = [
    { id: 'look', text: 'Open a snake from the Collection tab to see its care, genetics and enclosure.' },
    { id: 'care', text: 'Feed hungry snakes and clean enclosures (or use “Care round” to do the routine chores).' },
    { id: 'preview', text: 'On the Breeding tab, pick Biscuit and Marigold to preview their offspring odds.' },
    { id: 'pair', text: 'Start the pairing, then press “Advance week” to move time forward.' },
    { id: 'incubate', text: 'Keep the incubator at 88–90°F and 90–100% humidity until the eggs hatch.' },
    { id: 'market', text: 'Keep the hatchlings you love and find good homes for the rest on the Market.' }
  ];

  SB.EXAMPLE_PAIRINGS = [
    { title: 'Codominant × Normal', male: { pastel: 1 }, female: {},
      note: 'Each baby has a 50% chance to inherit the single Pastel copy.' },
    { title: 'Codominant × Codominant', male: { pastel: 1 }, female: { pastel: 1 },
      note: '25% Super Pastel, 50% Pastel, 25% Normal — the super form needs a copy from each parent.' },
    { title: 'Het × Het (recessive)', male: { clown: 1 }, female: { clown: 1 },
      note: '25% visual Clown. The normal-looking babies are “66% possible het”: 2 in 3 of them carry Clown.' },
    { title: 'Visual × Het (recessive)', male: { albino: 2 }, female: { albino: 1 },
      note: '50% visual Albino; every normal-looking baby is a guaranteed (100%) het.' },
    { title: 'Visual × Normal (recessive)', male: { piebald: 2 }, female: {},
      note: 'No visual Piebalds, but every baby is 100% het Piebald — a great start for the next generation.' }
  ];

  SB.NAMES = [
    'Mango', 'Pecan', 'Saffron', 'Clover', 'Juniper', 'Toffee', 'Basil', 'Honeycomb', 'Fig', 'Cinder',
    'Nutmeg', 'Pistachio', 'Marzipan', 'Sorrel', 'Tansy', 'Quince', 'Hazel', 'Rooibos', 'Chai', 'Ember',
    'Sable', 'Olive', 'Tamarind', 'Paprika', 'Ginger', 'Maple', 'Acorn', 'Bramble', 'Sesame', 'Cumin',
    'Latte', 'Wren', 'Sprout', 'Truffle', 'Kumquat', 'Persimmon', 'Moss', 'Dune', 'Pebble', 'Sienna',
    'Umber', 'Ochre', 'Poppy', 'Sunny', 'Biscotti', 'Churro', 'Dumpling', 'Noodle', 'Waffle', 'Pretzel',
    'Rosemary', 'Thyme', 'Anise', 'Cocoa', 'Butterscotch', 'Caramel', 'Tofu', 'Miso', 'Yuzu', 'Lychee',
    'Beacon', 'Comet', 'Meadow', 'Harbor', 'Willow', 'Aspen', 'Cedar', 'Linden', 'Rowan', 'Marble'
  ];

  SB.TEMPERAMENTS = ['Calm', 'Curious', 'Shy', 'Bold', 'Easygoing', 'Inquisitive', 'Gentle'];

  SB.BUYERS = [
    'Greenleaf Reptile Shop', 'Hollis (hobby keeper)', 'Dr. Osei (nature center educator)',
    'Priya (first-time keeper)', 'Tomas (morph collector)', 'Sunrise Herp Supply', 'The Coil Club',
    'Mei (breeder, two towns over)'
  ];

  /* Templates for buyer requests. `criteria` is matched by SB.sim.matchesCriteria. */
  SB.REQUEST_TEMPLATES = [
    { text: 'Looking for a healthy Pastel of either sex.', criteria: { visual: 'pastel' }, bonus: 1.5 },
    { text: 'Wants a calm Normal hatchling as a first snake.', criteria: { visual: 'normal', maxAgeWeeks: 26 }, bonus: 1.6 },
    { text: 'Needs a female carrying Clown (het or visual).', criteria: { sex: 'F', carries: 'clown' }, bonus: 1.5 },
    { text: 'Seeking any Pinstripe for an educational display.', criteria: { visual: 'pinstripe' }, bonus: 1.5 },
    { text: 'Collector wants a visual Clown.', criteria: { visual: 'clown' }, bonus: 1.35 },
    { text: 'Wants a male carrying Albino (het or visual).', criteria: { sex: 'M', carries: 'albino' }, bonus: 1.5 },
    { text: 'Looking for any hatchling under 6 months.', criteria: { maxAgeWeeks: 26 }, bonus: 1.4 },
    { text: 'Wants a Pastel Clown for a breeding project.', criteria: { visual: 'pastel', visual2: 'clown' }, bonus: 1.4 }
  ];
})(globalThis.SB = globalThis.SB || {});
