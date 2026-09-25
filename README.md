# Scale & نسل — Ball Python Breeder

A cozy, turn-based browser game about running a small ball python breeding operation: care for your snakes, learn their genetics, preview pairings, incubate clutches, hatch babies with inherited traits, and find them good homes.

## Run it

```bash
npm start        # serves the game at http://localhost:8080 (no dependencies)
npm test         # genetics, save-migration and long-run game-loop tests (Node 18+)
```

You can also open `index.html` directly in a browser. Progress saves automatically to `localStorage`; use **New game…** in the footer to reset.

## How to play

1. Start in the **Room**: each tank shows its snake, and bubbles above it flag needs (tap a bubble to feed, water, clean or fix the habitat).
2. Press **Chores** to handle routine care for everyone, and follow the quest shown in the top bar.
3. On **Breeding**, pick a male and female to see per-egg outcome odds, then start the pairing.
4. Press **Next week** (or `N`) — pairing → gravid → eggs → incubation → hatch.
5. Keep the incubator at 88–90°F and 90–100% humidity.
6. Keep favourites (★) and sell or trade others on the **Market**; expand on **Facility**.

## Code layout

| File | Purpose |
| --- | --- |
| `js/data.js` | Data-driven genes, care ranges, timings, upgrades, goals, buyer templates |
| `js/genetics.js` | Genetics engine: allelic loci, lethal pairs, linkage, health flags, traits, predictions, egg rolls, possible-het inference |
| `js/sim.js` | Player actions and the weekly simulation |
| `js/state.js` | New-game setup and save/load |
| `js/art.js` | Original SVG snake illustrations: tapered coiled body, morph-specific patterns, shading and head detail, all generated from gene `art` data |
| `js/ui.js`, `js/main.js` | Rendering (reptile room, HUD, dock, dialogs) and event wiring, including floating numbers and the weekly recap |

To add a morph, see [Adding content](#adding-content) below — everything is data in `js/data.js`.

## Illustration art hints

Each visual form in a gene's `art` (`single`/`super`/`visual`) may give:

- `set`: colour overrides for palette slots `base`, `pattern`, `belly`, `eye`, `spot`, `edge`, `head`, `headWash` (`edge: null` removes blotch outlines).
- `tint`: relative changes, applied after every `set`, in gene order, so they stack. A slot maps to one op or a list of ops, e.g. `{ pattern: ['warm', 0.4] }` or `{ all: [['desaturate', 0.9], ['cool', 0.1]] }`. `all` tints every slot that is present except `eye`. A tint on an unset derived slot (`spot`, `head`, `headWash`) fills it from the current palette first.
- `style`: one flag or a list, e.g. `'spider'` or `['reduced', 'blushed']`.

| Tint op | Effect | Suggested morphs |
| --- | --- | --- |
| `['lighten', t]` / `['darken', t]` | Mix toward white or black (t 0–1) | Pastel, Fire / Cinnamon, Black Pastel |
| `['mix', '#hex', t]` | Mix toward a colour | Lavender, Pastel yellows |
| `['desaturate', t]` / `['saturate', t]` | Pull toward grey/silver, or push colour richer | Axanthic, Ghost / Orange Dream, Yellow Belly |
| `['hue', deg]` | Rotate the hue by degrees | Lavender Albino purple, experimental casts |
| `['warm', t]` / `['cool', t]` | Orange/red or blue cast (dark colours shift less) | Caramel, Orange Dream, Enchi / Axanthic, Lavender |

Style flags come in two kinds. **Layouts** pick the base pattern; only one draws, and when genes disagree the first in this order wins: `plain` > `patternless` > `ivory` > `clown` > `stripe` > `champagne` > `spider` > `pin` > `banded` > `granite` > classic blotches. So Spider Clown draws the clown stripe and Spinner (spider + pin) draws spider webbing. A losing layout still counts toward pattern reduction (below). **Modifiers** stack on whichever layout won. The reducers `reduced`, `dinker`, `spider`, `pin`, `champagne` and `enchi` add up to one reduction level that thins stripes and webs and shrinks eyespots. `plain` and `patternless` hide pattern overlays, but `pied`/`ringer` white skin still shows, and so do colour washes on `patternless`.

| Style | Kind | Looks like | Suggested morphs |
| --- | --- | --- | --- |
| `plain` | layout | Near-white/solid, faint mottling, head wash | BEL, Super Lesser, Super Mojave |
| `patternless` | layout | Solid ground colour, no pattern, plain head | Super Cinnamon/Black Pastel, Lavender-like supers |
| `ivory` | layout | Pale body with a soft yellow dorsal stripe | Ivory (Super Yellow Belly) |
| `clown` | layout | Light body, wavy dark dorsal stripe, side ticks, clown head | Clown |
| `stripe` | layout | Straight near-black spine stripe with pale edging, clean sides, dark crown | Genetic Stripe, Super Stripe |
| `champagne` | layout | Tan body, soft blurry dorsal stripe, darker blushed head | Champagne |
| `spider` | layout + reducer | Light body, thin dark spine line and webbing, pale flame sides, bright head | Spider, Spinner, Bumblebee |
| `pin` | layout + reducer | Fine dorsal pinstripe, faint side dashes | Pinstripe |
| `banded` | layout | Light hourglass bands across a dark back (woma-style rings) | Woma, Hidden Gene Woma |
| `granite` | layout | Many small broken alien-head fragments on a dark ground | Granite, Chocolate |
| `keyhole` | blotch modifier | Dark keyhole inside each pale blotch | Mojave, Mystic |
| `cleanSides` | blotch modifier | Smaller eyespots | Yellow Belly, Gravel |
| `enchi` | blotch modifier + reducer | Fuller smooth blotches, rounded dark alien heads on the spine, orange flames, blushed head | Enchi, Orange Dream, Fire-Enchi combos |
| `reduced` | blotch modifier + reducer | Lighter muddier alien heads, spread blotches, faded eyespots, light head blush | Lesser, GHI-lite, Butter |
| `dinker` | blotch modifier + reducer | No eyespots, clean muted lower sides, slightly muted alien heads | Dinker, Special |
| `aberrant` | blotch modifier | Missing, stretched or tilted blotches; broken stripes, pinstripe and webs | Aberrant, Genetic Banded |
| `flames` | wash | Pale tongues licking up the lower flanks | Fire, Vanilla, Woma, Mystic |
| `blushed` | wash | Pale dorsal fade toward the head plus a blushed crown | Lesser, Fire, Butter, Enchi heads |
| `ghi` | wash | Much darker ground, muted pattern, smoky spine | GHI and GHI combos |
| `leopard` | overlay | Fine dark (and some pale) flecks scattered over the body | Leopard |
| `speckledHead` | head overlay | Dark speckles on the crown (pale ones on a very dark head) | Spotnose, Leopard, Special |
| `pied` | overlay | Clean white skin patches and a white snout | Piebald |
| `ringer` (alias `tail`) | overlay | Small white patch on one side, a third of the way from the tail tip | Ringer, Pied hets |

## Genetics model

The engine (`js/genetics.js`, `SB.genetics`, referred to as `G` below) is data-driven. It models:

- **Allelic groups** — several mutant alleles competing for one locus (e.g. the BEL complex: Mojave, Lesser…).
- **Lethal combinations** — a doubled allele (`superLethal`) or a named pair (`lethal: true`) never hatches.
- **Health / welfare flags** — e.g. Spider wobble, shown on snakes and in previews, with gentle reputation effects and optional reduced fertility.
- **Linkage** — a locus linked to another locus or to sex with a recombination fraction (Banana “male maker / female maker”).
- **Line-bred traits** — simple 0–100 quantitative scores inherited as mid-parent + noise.
- **Designer names** — trade names for sets of visual forms (Pastel + Spider = Bumblebee).

It is still a simplified teaching model: time is compressed, and see *Approximations* below.

### Stored formats

| Field | Format | Meaning |
| --- | --- | --- |
| `snake.genotype` | `{ locusId: [sireAllele, damAllele] }` | The hidden truth. Alleles are gene ids or `null` (wild type). Wild-type loci are omitted. Index 0 came from the sire, index 1 from the dam; this tracks **phase** for linked loci. In a **male**, index 0 of a sex-linked locus is on his **Y**, index 1 on his X. In a female both are X (index 0 from her sire). |
| `snake.knowledge` | `{ locusId: { pairKey: prob } }` | What the keeper can know. A `pairKey` is `'a/b'`, with `+` for wild type (e.g. `'+/clown'`, `'lesser/mojave'`). Keys are **sorted** for unlinked loci and **ordered sire/dam** for linked (phased) loci. A missing locus means certainly `'+/+'`. Probabilities sum to 1. |
| `snake.traits` | `{ traitId: 0–100 }` | Line-bred trait scores. Missing = the trait's `base`. |
| `snake.sex` | `'M'` or `'F'` | Ball pythons are XY. For hatchlings, sex is decided when the egg is rolled (the sire's gamete carries X or Y). |

**Shorthand input.** Every engine function also accepts a shorthand genotype — copies per gene, e.g. `{ pastel: 1, clown: 2 }` or `{ mojave: 1, lesser: 1 }` — and legacy knowledge arrays `{ geneId: [p0, p1, p2] }` (probabilities of 0/1/2 copies; only for single-allele loci; on a phased locus the het's phase is split 50/50). Data tables (Morph Book slots, example pairings, starters) use shorthand. To give a phase in data, use the canonical form: `{ banana: ['banana', null] }` is a male-maker Banana male. `G.norm` / `G.normKnowledge` convert to canonical form; more than two alleles at one locus throws.

Eggs in `project.eggs` store `{ genotype, sex, traits, health, status, lethal? }`. Project snapshots (`maleSnapshot` / `femaleSnapshot`) store `{ sex, genotype, knowledge, traits }`. Discoveries store `{ label, genes, genotype, … }`; their `label` is recomputed from `genotype` on every load so Morph Book slots keep matching when naming data changes.

### Visual forms and names

For one locus with the pair `(a, b)`:

| Pair | Forms shown |
| --- | --- |
| wild / wild | none |
| one mutant + wild | codominant → `single` (gene `name`); dominant → `visual`; recessive → none (a hidden **het**) |
| same mutant twice | codominant → `super` (`superName`, default `"Super <name>"`); dominant → `visual`; recessive → `visual` |
| two different mutants with an `ALLELE_COMBOS` entry | one `combo` form (combo `name`, `art`) |
| two different mutants, no entry | each allele's own form: codominant → `single`, dominant → `visual`; **recessive alleles show only if both alleles are recessive** (they don't complement each other), otherwise stay hidden |
| lethal pair | none — the egg is non-viable |

A form is `{ id, cls, name, gene, combo, locus, art }`: `id` is the gene id, or the combo's `id` (default: the two allele ids sorted and joined with `+`, e.g. `lesser+mojave`); `cls` is `single`, `super`, `visual` or `combo`.

The **per-locus label** is the forms' names joined. Pairs with the same per-locus label look alike: the keeper can't tell them apart (e.g. Super Mojave, Super Lesser and Mojave + Lesser are all “Blue-Eyed Leucistic”), predictions merge them, and a note such as “50% poss. Mojave + Lesser” says which it might be. For naming, the look-alike class always uses the forms of its first pair (wild type first, then `SB.GENES` order), so labels are consistent everywhere.

The **morph label** (`G.morphLabel`) names all loci's forms: `SB.COMBO_NAMES` entries are matched greedily, the entry with the **most forms** first (ties: earlier entry), each form used once; leftover forms keep their own names. Parts are ordered codominant/dominant before recessive, then by `SB.GENES` order (a designer name takes the position of its first form). No forms → `"Normal"`. Examples: `{pastel:1, spider:1}` → “Bumblebee”; plus `clown:2` → “Bumblebee Clown”; `{clown:2, pastel:1}` → “Pastel Clown”. Line-bred trait labels are **not** part of the morph label (they are prefixed in `G.fullLabel`, e.g. “High-contrast Pastel · het Clown”).

### Inheritance, prediction and knowledge

- **Rolling eggs** (`G.rollEgg`) uses true genotypes. Unlinked loci pass a random allele each. Each linkage group is a tree: the root (`sex`, or the unlinked locus that others link to) picks one of the parent's two homologs at random, and each linked locus stays on the same homolog as its parent node with probability `1 − rate` (switches with probability `rate`). The sire's choice at the `sex` root decides the egg's sex (index 0 = Y → male). Traits are rolled as mid-parent + normal noise.
- **Predictions** (`G.predict`) use knowledge, per linkage group, then multiply groups together. Lethal states are collected into one “Non-viable egg (lethal combination)” outcome; outcomes rarer than `G.PREDICT.minProb` (1e-7), or beyond `G.PREDICT.maxStates` (2500) while multiplying, fold into “Other combinations”. All outcome probabilities, including those two rows, sum to 1. When a sex-linked locus is involved each outcome also carries `male` (P(outcome and male)) and a `sexNote` such as “95% male”.
- **Hatchling knowledge** (`G.inferKnowledge`) conditions the parents' knowledge on the hatchling's per-locus looks and its sex, so a son of a male-maker sire is known to be a male maker.
- **Pair finder** (`G.probOf`) computes the chance of a target look per locus directly, so it stays fast with many genes.

**Approximations** (documented on purpose):

- Knowledge is stored per locus, so predictions treat a parent's uncertainty at different loci as independent, and a hatchling's joint knowledge across two linked autosomal loci is stored as per-locus marginals. Rolls always use exact phase. Sex linkage is handled exactly for a known phase (sex is observed, and phase is stored in the ordered pair keys).
- The pair finder and Morph Book compare per-locus looks, so two different gene sets that `COMBO_NAMES` happens to give the same name are separate targets for `G.probOf`.
- Health issues that apply to one sex are counted at 50% in predictions unless the locus is sex-linked.

### Welfare, lethality and value in the game

- Lethal eggs are **laid but never develop**: at laying they are rolled like every fertile egg, marked `status: 'failed', lethal: true`, counted in `project.nonViable`, reported in the laying message, shown as “Non-viable” in the incubator and compared with the predicted non-viable % in the hatch results.
- Health issues show as tags and a *Welfare* list on the snake, and as a *Welfare check* in breeding previews (x% of eggs). When a clutch with affected babies hatches, reputation changes by `SB.WELFARE.hatchRep[worstSeverity]` once; selling an affected animal adds `SB.WELFARE.saleRep[worstSeverity]` to the usual reputation gain. An affected female's fertile-egg chance is multiplied by her issues' `fertility`.
- Market value (`sim.value`) = 60 + the expected premium over the keeper's knowledge (`G.geneticValue`: visible forms, hidden recessive copies × `hetValue`, weighted by their odds) + designer-name `value` + trait `value` above threshold, then the existing combo/sex/age/health/reputation multipliers.

## Adding content

All content lives in `js/data.js`. After editing data at runtime (tests, mods) call `SB.genetics.reindex()`; the engine validates the tables and throws on mistakes (unknown alleles, combos across loci, linkage cycles…).

### `SB.GENES` — one entry per mutant allele

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Unique id (no `/`, `+` or `\|`). Used in genotypes, `COMBO_NAMES`, requests. |
| `name` | yes | Display name of the single/visual form. |
| `type` | yes | `'codominant'` (incomplete dominant), `'dominant'` or `'recessive'`. Each allele of a locus keeps its own type. |
| `locus` | no | Locus id shared by allelic genes (e.g. `'bel'`). Default: the gene's own `id`. A locus id must not equal the id of a gene at another locus. Order within `SB.GENES` sets naming order and art layering. |
| `superName` | codominant | Name of the homozygous form (default `"Super <name>"`). |
| `value` | no | Market premium for the visual/single form. |
| `superValue` | no | Premium for the super form (default `2 × value`). |
| `hetValue` | recessive | Premium for a proven het (scaled by odds for possible hets). |
| `blurb` | yes | One or two sentences for the guide and snake details. |
| `art` | no | `{ single, super, visual }` modifiers (see below). A missing `single` or `super` falls back to `visual`. |
| `superLethal` | no | `true` → two copies of this allele are lethal (e.g. Champagne, Hidden Gene Woma). |
| `health` | no | `{ issue, severity, note, forms?, sex?, fertility? }`: `issue` is a short word (`'wobble'`, `'kinking'`, `'fertility'`), `severity` is `'mild'`, `'moderate'` or `'severe'`, `note` is shown to the player. `forms` limits it to some visual classes (e.g. `['super']`), `sex: 'F'` limits it to females, `fertility` (0–1) multiplies an affected female's fertile-egg chance. Applies whenever the gene's form is visible (a hidden het is unaffected). |
| `linkage` | no | `{ to, rate }`: `to` is `'sex'`, a locus id or a gene id; `rate` is the recombination fraction (0–0.5; 0 = always inherited together). Put it on any allele of the locus; it applies to the whole locus. Linkage must form a tree (no cycles). |
| `market` | no | Relative weight for random market animals (default 1); `0` = never offered. |

Art modifiers (`SB.NORMAL_ART` is the starting palette): `set` overrides colours, `tint` applies `['lighten', a]`, `['darken', a]` or `['mix', '#hex', a]` to a colour key afterwards (so combos stack), and `style` sets a pattern style flag (`pin`, `clown`, `pied`, `keyhole`, `plain`, `ivory`, `cleanSides`, plus any styles `js/art.js` adds). `SB.art.lookFor(genotype)` applies the modifiers of `G.visualForms(genotype)` in data order.

### `SB.ALLELE_COMBOS` — two different alleles of one locus

`{ pair: ['mojave', 'lesser'], name, locus?, id?, value?, art?, blurb?, lethal?, health? }` — `pair` order doesn't matter; `locus` is optional and checked; `id` defaults to the sorted allele ids joined with `+`; `value` defaults to the sum of the two alleles' `value`; without `art` both alleles' art is applied; `lethal: true` makes the pair non-viable; `health` works as for genes (the alleles' own `health` does **not** carry over to a combo). Without an entry, the pair falls back to the rules in the table above.

### `SB.COMBO_NAMES` — designer (trade) names

`{ name, forms: { formId: cls }, value?, blurb? }` — `formId` is a gene id or combo id; `cls` is `'single'`, `'super'`, `'visual'`, `'combo'`, `'any'` or an array of those. Examples: `{ name: 'Bumblebee', forms: { pastel: 'single', spider: 'visual' } }`, `{ name: 'Killer Bee', forms: { pastel: 'super', spider: 'visual' } }`. `value` is an extra market premium when the name applies.

### `SB.TRAITS` — line-bred traits

`{ id, name, label, base, spread, noise, threshold, value, blurb }` — founders roll `base ± spread` (normal), hatchlings roll the parents' average `± noise` (normal), clamped to 0–100. At or above `threshold` the snake shows `label` (e.g. “High-contrast”) and gains `value`.

### Other tables

- `SB.WELFARE` — `{ saleRep: { mild, moderate, severe }, hatchRep: { … } }` reputation deltas.
- `SB.BOOK` slots and `SB.EXAMPLE_PAIRINGS` take shorthand genotypes; a slot matches when a hatchling's morph label equals the label of the slot genotype.
- `SB.REQUEST_TEMPLATES` criteria: `visual` / `visual2` match form ids from `G.visualGenes` (`'normal'` = no forms), `carries` is a gene id matched when `G.carryProb ≥ 0.5`.

### Genetics API used by the rest of the game

| Function | Returns |
| --- | --- |
| `G.norm(genotype)`, `G.normKnowledge(k)`, `G.exactKnowledge(genotype)`, `G.know(snake)` | Canonical genotype / knowledge. |
| `G.visualForms(genotype)` | `[{ id, cls, name, gene, combo, locus, art }]` actually shown (used by `art.lookFor`). |
| `G.visualGenes(genotype)` | Form ids shown. |
| `G.morphLabel(genotype)`, `G.describe(genotype)` | Label; `{ label, combos }`. |
| `G.carrierNotes(snake)`, `G.fullLabel(snake)` | Keeper notes (hets, homozygous, look-alikes, male maker); card label. |
| `G.predict(male, female)` | `{ outcomes, lethal, other, sexLinked, health, perLocus, traits }` (see above). |
| `G.topOutcomes(pred, n)` | Top `n` outcomes + “Other combinations” + non-viable row, for display. |
| `G.probOf(male, female, targetGenotype)` | Per-egg chance of a target look. |
| `G.rollEgg(male, female, rng?)`, `G.rollGenotype(…)` | `{ genotype, sex, lethal, traits }`; genotype only. |
| `G.inferKnowledge(male, female, genotype, sex)` | A hatchling's knowledge. |
| `G.healthIssues(genotype, sex)`, `G.worstSeverity(issues)`, `G.fertilityFactor(snake)` | Welfare helpers. |
| `G.carryProb(snake, geneId)`, `G.copies(genotype, geneId)` | Carrier odds from knowledge; true copy count. |
| `G.geneticValue(snake)`, `G.pairValue(locus, pair)` | Market premium helpers. |
| `G.traitScore`, `G.rollTraits`, `G.randomTraits`, `G.traitBadges` | Line-bred traits. |
| `G.loci()`, `G.locus(id)`, `G.locusOf(geneId)`, `G.locusPairs(id)`, `G.pairName(id, pair)`, `G.pairKey(id, pair)`, `G.parsePairKey(key)`, `G.isPhased(id)`, `G.isSexLinked(id)` | Locus helpers (calculator, clues). |

### Saves

The save `version` is 2. `SB.state.migrate` converts version 1 saves (`{ gene: copies }` genotypes and `[p0, p1, p2]` knowledge) for snakes, market listings and trades, project snapshots, eggs and discoveries; old eggs without a rolled sex get one at hatch.
