/*
 * Static game data. Everything here is plain data so new morphs, buyers,
 * goals and upgrades can be added without touching the simulation code.
 */
(function (SB) {
  'use strict';

  /*
   * Genes. Each entry is one mutant allele (full schema in README.md, "Genetics model"):
   *  - type codominant (incomplete dominant): 1 copy is visual, 2 copies give a distinct "super" form.
   *  - type dominant: 1 or 2 copies look the same.
   *  - type recessive: needs 2 copies to be visual; 1 copy is an invisible "het" carrier.
   *  - locus: alleles sharing a locus compete for the same two slots (default: the gene's own id).
   *  - superLethal: two copies of this allele never hatch.
   *  - health: { issue, severity: 'mild'|'moderate'|'severe', note, forms?, sex?, fertility? }
   *  - linkage: { to: 'sex' | locus id, rate: recombination fraction 0–0.5 }
   *
   * `art` describes how the visual form changes the placeholder illustration (see SB.NORMAL_ART).
   * `value` is the market premium for the visual form; `hetValue` is the premium
   * for a proven (100%) het carrier, scaled down for "possible het" animals.
   */
  var BEL_ART = { set: { base: '#f7f4ec', pattern: '#f1ede3', belly: '#fdfcf8', eye: '#4d8fdc', head: '#f7f4ec', headWash: '#f1e2b8' }, style: 'plain' };

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
      id: 'mojave', name: 'Mojave', type: 'codominant', locus: 'bel', superName: 'Blue-Eyed Leucistic',
      value: 70, superValue: 260,
      blurb: 'Rich chocolate tones with a pale, "keyhole" pattern. Two copies produce a white Blue-Eyed Leucistic.',
      art: { single: { set: { base: '#2a1f18', pattern: '#c2b198', spot: '#2e221a', belly: '#f3efe6' }, style: 'keyhole' },
             super: BEL_ART }
    },
    {
      id: 'lesser', name: 'Lesser', type: 'codominant', locus: 'bel', superName: 'Blue-Eyed Leucistic',
      value: 65, superValue: 250,
      blurb: 'A BEL-complex allele: paler, milky-brown sides and a lighter pattern. Allelic with Mojave, so a snake carries at most two of them; Lesser × Mojave (or two Lessers) makes a Blue-Eyed Leucistic.',
      art: { single: { set: { base: '#6a4a2f', belly: '#f6f1e6' }, tint: { pattern: ['lighten', 0.28] }, style: 'cleanSides' },
             super: BEL_ART }
    },
    {
      id: 'pinstripe', name: 'Pinstripe', type: 'dominant',
      value: 55,
      blurb: 'Reduces the pattern to a fine dorsal pinstripe. One or two copies look the same, so a homozygous Pinstripe can only be proven by breeding.',
      art: { visual: { tint: { base: ['mix', '#74502c', 0.55] }, style: 'pin' } }
    },
    {
      id: 'spider', name: 'Spider', type: 'dominant',
      value: 50,
      blurb: 'A fine, web-like reduced pattern on a lighter body. Every Spider carries a neurological "wobble" to some degree, so many keepers choose not to work with it.',
      health: { issue: 'wobble', severity: 'moderate', note: 'Head tremors and poor coordination, from barely visible to severe. Affected snakes need calm handling and easy prey.' },
      art: { visual: { set: { belly: '#f7f0de' }, tint: { base: ['lighten', 0.16], pattern: ['lighten', 0.22] }, style: 'pin' } }
    },
    {
      id: 'champagne', name: 'Champagne', type: 'dominant', superLethal: true,
      value: 70,
      blurb: 'A warm tan, nearly patternless snake. Two copies are lethal: Champagne × Champagne eggs with a double dose never develop. Champagnes can also wobble.',
      health: { issue: 'wobble', severity: 'mild', note: 'Many Champagnes show a mild neurological wobble.' },
      art: { visual: { set: { base: '#b88c5c', pattern: '#e6cc9f', spot: '#a57a4d', belly: '#f8efdc' }, style: 'plain' } }
    },
    {
      id: 'banana', name: 'Banana', type: 'codominant', superName: 'Super Banana',
      value: 90, superValue: 300,
      // Sex-linked: sits near the sex-determining region, so a male passes Banana mostly with his Y ("male maker") or X ("female maker").
      linkage: { to: 'sex', rate: 0.05 },
      blurb: 'Lavender body with bright yellow pattern (also sold as Coral Glow). Banana is linked to sex: a Banana male that got it from his father makes mostly Banana sons ("male maker"); one that got it from his mother makes mostly Banana daughters.',
      art: { single: { tint: { base: ['mix', '#9d7a8b', 0.7], pattern: ['mix', '#ffc93a', 0.65] } },
             super: { tint: { base: ['mix', '#d9c4cf', 0.8], pattern: ['mix', '#ffe27a', 0.8] } } }
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
   * Named looks for two different alleles of one locus (a heterozygous combo).
   * Without an entry, each allele shows its own single/visual form.
   * Fields: pair, name, locus? (checked), id?, value?, art?, blurb?, lethal?, health?
   */
  SB.ALLELE_COMBOS = [
    { locus: 'bel', pair: ['mojave', 'lesser'], name: 'Blue-Eyed Leucistic', value: 240, art: BEL_ART,
      blurb: 'Two different BEL-complex alleles (Mojave + Lesser) also make a white, blue-eyed snake.' }
  ];

  /*
   * Designer (trade) names for sets of visual forms, checked before the joined
   * fallback name. `forms` maps a form id (gene id, or combo id) to a visual
   * class ('single', 'super', 'visual', 'combo', 'any' or a list). The most
   * specific match wins and leftover genes are appended: Pastel Spider Clown →
   * "Bumblebee Clown". `value` is an optional extra market premium.
   */
  SB.COMBO_NAMES = [
    { name: 'Bumblebee', forms: { pastel: 'single', spider: 'visual' }, value: 20 },
    { name: 'Killer Bee', forms: { pastel: 'super', spider: 'visual' }, value: 40 },
    { name: 'Lemon Blast', forms: { pastel: 'single', pinstripe: 'visual' }, value: 20 }
  ];

  /*
   * Line-bred (polygenic) traits: a 0–100 score inherited as the parents'
   * average plus random noise. At or above `threshold` the snake earns the
   * `label` and a `value` premium. Founders roll base ± spread.
   */
  SB.TRAITS = [
    { id: 'contrast', name: 'Contrast', label: 'High-contrast', base: 50, spread: 12, noise: 8, threshold: 75, value: 45,
      blurb: 'Crisp, high-contrast pattern edges. Selected over generations: pair high-contrast parents to raise the average.' }
  ];

  /*
   * Welfare: reputation changes for producing and selling animals with gene-linked
   * health issues, by the worst severity involved. Kept gentle on purpose.
   *   saleRep  — added to the usual +1 for a healthy sale
   *   hatchRep — once per clutch that hatches affected babies
   */
  SB.WELFARE = {
    saleRep: { mild: 0, moderate: -1, severe: -2 },
    hatchRep: { mild: 0, moderate: 0, severe: -1 }
  };

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
      desc: 'Holds incubator temperature and humidity steady, protecting egg health. Chores also dial in incubators holding eggs.' },
    { id: 'climate', name: 'Automatic misters & climate controller', price: 650, repeatable: false,
      desc: 'Chores also fix humidity and reset thermostats in every occupied enclosure. Without it, tap the 💦 and 🌡️ bubbles yourself.' },
    { id: 'display', name: 'Public display vivarium', price: 1200, repeatable: true, max: 3,
      desc: 'A showpiece tank in your shop window. Visitors earn you +1 reputation every 4 weeks per vivarium.' },
    { id: 'vetLab', name: 'In-house vet corner', price: 900, repeatable: false,
      desc: 'Vet visits cost half and heal more (+40 health instead of +25).' }
  ];

  /*
   * Breeder's catalogue: proven adults from specialist breeders, restocked every
   * 8 weeks. Pricier than the open Market, but the only reliable source of genes
   * the starter group lacks. `weight` is how often an entry is offered.
   */
  SB.CATALOG = [
    { genotype: { yellowbelly: 1 }, weight: 3 },
    { genotype: { pinstripe: 1 }, weight: 1 },
    { genotype: { mojave: 1 }, weight: 3 },
    { genotype: { lesser: 1 }, weight: 2 },
    { genotype: { piebald: 1 }, weight: 3 },
    { genotype: { piebald: 2 }, weight: 1 },
    { genotype: { pastel: 1, yellowbelly: 1 }, weight: 1 },
    { genotype: { mojave: 1, clown: 1 }, weight: 1 },
    { genotype: { albino: 1, piebald: 1 }, weight: 1 },
    { genotype: { banana: 1 }, weight: 1 },
    { genotype: { clown: 2 }, weight: 1 }
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
      check: function (s) { return Math.min(1, s.reputation / 40); } },
    // Arc 2: new blood and the Morph Book.
    { id: 'newBlood', title: 'New blood', reward: { money: 150, rep: 2 },
      desc: 'Your starters only carry a few genes. Buy a breeder carrying Yellow Belly, Mojave or Piebald from the Breeder’s catalogue on the Market. Adults need an adult enclosure, so buy one in the Shop first.',
      check: function (s) { return s.snakes.some(function (x) { return x.origin === 'Bought' && ['yellowbelly', 'mojave', 'piebald'].some(function (g) { return SB.genetics.carryProb(x, g) >= 0.99; }); }) || (s.stats.boughtNewGenes || 0) > 0 ? 1 : 0; } },
    { id: 'classics', title: 'Complete The Classics', reward: { money: 300, rep: 3 },
      desc: 'Fill every sticker on the first Morph Book page. Tap an empty sticker in the Book to see which of your snakes could produce it.',
      check: function (s) { var pg = SB.BOOK[0]; return pg.slots.filter(function (sl) { return SB.sim.slotDiscovery(s, sl); }).length / pg.slots.length; } },
    { id: 'super', title: 'Double up', reward: { money: 400, rep: 4 },
      desc: 'Hatch a super form: pair two carriers of the same incomplete-dominant gene (e.g. Pastel × Pastel for a Super Pastel).',
      check: function (s) { return s.discoveries.some(function (d) { return ['Super Pastel', 'Ivory', 'Blue-Eyed Leucistic'].indexOf(d.label) >= 0; }) ? 1 : 0; } },
    { id: 'display', title: 'Open to the public', reward: { money: 0, rep: 5 },
      desc: 'Install a public display vivarium from the Shop so visitors can see your work.',
      check: function (s) { return s.upgrades.display ? 1 : 0; } },
    { id: 'designer', title: 'Designer collection', reward: { money: 1000, rep: 6 },
      desc: 'Complete the Designer Combos page of the Morph Book.',
      check: function (s) { var pg = SB.BOOK[2]; return pg.slots.filter(function (sl) { return SB.sim.slotDiscovery(s, sl); }).length / pg.slots.length; } },
    { id: 'master', title: 'Master breeder', reward: { money: 2500, rep: 10 },
      desc: 'Fill every sticker in the Morph Book and reach 150 reputation.',
      check: function (s) {
        var tot = 0, got = 0;
        SB.BOOK.forEach(function (pg) { pg.slots.forEach(function (sl) { tot++; if (SB.sim.slotDiscovery(s, sl)) got++; }); });
        return (got / tot) * 0.7 + Math.min(1, s.reputation / 150) * 0.3;
      } }
  ];

  SB.TUTORIAL = [
    { id: 'look', text: 'Open a snake from the Snakes tab to see its care, genetics and enclosure.' },
    { id: 'care', text: 'Press Chores to feed, water and clean. Tap 💦 and 🌡️ bubbles to fix humidity and heat — Chores won’t, until you buy climate controllers.' },
    { id: 'preview', text: 'On the Breeding tab, pick Biscuit and Marigold to preview their offspring odds.' },
    { id: 'pair', text: 'Start the pairing, then press “Advance week” to move time forward.' },
    { id: 'incubate', text: 'Keep the incubator at 88–90°F and 90–100% humidity until the eggs hatch.' },
    { id: 'market', text: 'Keep the hatchlings you love and find good homes for the rest on the Market.' }
  ];

  /*
   * Morph Book: sticker pages filled by hatching each morph for the first time.
   * A slot matches when a hatchling's visual morph equals the slot genotype's.
   */
  SB.BOOK = [
    { id: 'classics', title: 'The Classics', reward: { money: 250, rep: 3 },
      desc: 'One gene each. Every keeper’s first page.',
      slots: [
        { name: 'Normal', genotype: {} },
        { name: 'Pastel', genotype: { pastel: 1 } },
        { name: 'Yellow Belly', genotype: { yellowbelly: 1 } },
        { name: 'Mojave', genotype: { mojave: 1 } },
        { name: 'Pinstripe', genotype: { pinstripe: 1 } },
        { name: 'Clown', genotype: { clown: 2 } },
        { name: 'Albino', genotype: { albino: 2 } },
        { name: 'Piebald', genotype: { piebald: 2 } }
      ] },
    { id: 'supers', title: 'Super Forms', reward: { money: 400, rep: 4 },
      desc: 'Two copies of an incomplete-dominant gene, one from each parent.',
      slots: [
        { name: 'Super Pastel', genotype: { pastel: 2 } },
        { name: 'Ivory', genotype: { yellowbelly: 2 } },
        { name: 'Blue-Eyed Leucistic', genotype: { mojave: 2 } }
      ] },
    { id: 'designer', title: 'Designer Combos', reward: { money: 600, rep: 6 },
      desc: 'Two or more visual genes stacked in one snake.',
      slots: [
        { name: 'Pastel Clown', genotype: { pastel: 1, clown: 2 } },
        { name: 'Lemon Blast', genotype: { pastel: 1, pinstripe: 1 } },
        { name: 'Albino Pinstripe', genotype: { pinstripe: 1, albino: 2 } },
        { name: 'Mojave Clown', genotype: { mojave: 1, clown: 2 } },
        { name: 'Albino Piebald', genotype: { albino: 2, piebald: 2 } },
        { name: 'Super Pastel Clown', genotype: { pastel: 2, clown: 2 } }
      ] }
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
      note: 'No visual Piebalds, but every baby is 100% het Piebald — a great start for the next generation.' },
    { title: 'Allelic pair (BEL complex)', male: { mojave: 1 }, female: { lesser: 1 },
      note: 'Mojave and Lesser sit at the same locus. A baby that gets one from each parent is a Blue-Eyed Leucistic.' },
    { title: 'Lethal super', male: { champagne: 1 }, female: { champagne: 1 },
      note: 'Two copies of Champagne never develop: about 1 egg in 4 is non-viable, and every hatchling is a single-copy Champagne or Normal.' },
    { title: 'Sex-linked (Banana male maker)', male: { banana: ['banana', null] }, female: {},
      note: 'This male got Banana from his father, so it rides on his Y chromosome: nearly all Banana babies are sons.' }
  ];

  SB.NAMES = [
    'Mango', 'Pecan', 'Saffron', 'Clover', 'Juniper', 'Toffee', 'Basil', 'Honeycomb', 'Fig', 'Cinder',
    'Nutmeg', 'Pistachio', 'Marzipan', 'Sorrel', 'Tansy', 'Quince', 'Hazel', 'Rooibos', 'Chai', 'Ember',
    'Sable', 'Olive', 'Tamarind', 'Paprika', 'Ginger', 'Maple', 'Acorn', 'Bramble', 'Sesame', 'Cumin',
    'Latte', 'Wren', 'Sprout', 'Truffle', 'Kumquat', 'Persimmon', 'Moss', 'Dune', 'Pebble', 'Sienna',
    'Umber', 'Ochre', 'Poppy', 'Sunny', 'Biscotti', 'Churro', 'Dumpling', 'Noodle', 'Waffle', 'Pretzel',
    'Rosemary', 'Thyme', 'Anise', 'Cocoa', 'Butterscotch', 'Caramel', 'Tofu', 'Miso', 'Yuzu', 'Lychee',
    'Beacon', 'Comet', 'Meadow', 'Harbor', 'Willow', 'Aspen', 'Cedar', 'Linden', 'Rowan', 'Marble',
    'Almond', 'Apricot', 'Bagel', 'Banjo', 'Bean', 'Blossom', 'Bramblewood', 'Brioche', 'Buttons', 'Cashew',
    'Cayenne', 'Cinnamon', 'Clementine', 'Cobble', 'Crumpet', 'Custard', 'Daffodil', 'Dandelion', 'Dash', 'Doodle',
    'Echo', 'Elderberry', 'Fennel', 'Fern', 'Fudge', 'Gingersnap', 'Gnocchi', 'Hickory', 'Honey', 'Indigo',
    'Jasper', 'Jellybean', 'Kale', 'Kiwi', 'Lentil', 'Licorice', 'Lotus', 'Macaron', 'Mocha', 'Muffin',
    'Nectar', 'Nori', 'Nugget', 'Oat', 'Onyx', 'Opal', 'Orzo', 'Paisley', 'Peanut', 'Pepperoni',
    'Pickle', 'Pinecone', 'Pixel', 'Plum', 'Praline', 'Pudding', 'Quill', 'Radish', 'Raisin', 'Ripple',
    'Russet', 'Saffy', 'Sage', 'Scone', 'Shortbread', 'Sparrow', 'Sprinkle', 'Sugarsnap', 'Taffy', 'Tangerine',
    'Tapioca', 'Teacake', 'Tiramisu', 'Topaz', 'Turmeric', 'Twig', 'Vanilla', 'Walnut', 'Wasabi', 'Zephyr'
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
