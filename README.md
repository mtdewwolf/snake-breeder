# Scale & نسل — Ball Python Breeder

A cozy, turn-based browser game about running a small ball python breeding operation: care for your snakes, learn their genetics, preview pairings, incubate clutches, hatch babies with inherited traits, and find them good homes.

## Run it

```bash
npm start        # serves the game at http://localhost:8080 (no dependencies)
npm test         # genetics + full game-loop tests (Node 18+)
```

You can also open `index.html` directly in a browser. Progress saves automatically to `localStorage`; use **New game…** in the footer to reset.

## How to play

1. Check the **Overview** for your goal, alerts and projects.
2. Feed snakes, clean enclosures and dial in temperature/humidity (or press **Care round**).
3. On **Breeding**, pick a male and female to see per-egg outcome odds, then start the pairing.
4. **Advance week** (or press `N`) — pairing → gravid → eggs → incubation → hatch.
5. Keep the incubator at 88–90°F and 90–100% humidity.
6. Keep favourites (★) and sell or trade others on the **Market**; expand on **Facility**.

## Code layout

| File | Purpose |
| --- | --- |
| `js/data.js` | Data-driven genes, care ranges, timings, upgrades, goals, buyer templates |
| `js/genetics.js` | Mendelian engine: predictions, egg rolls, possible-het inference |
| `js/sim.js` | Player actions and the weekly simulation |
| `js/state.js` | New-game setup and save/load |
| `js/art.js` | Original SVG snake illustrations: tapered coiled body, morph-specific patterns, shading and head detail, all generated from gene `art` data |
| `js/ui.js`, `js/main.js` | Rendering and event wiring |

To add a morph, append an entry to `SB.GENES` in `js/data.js` (type `codominant`, `dominant` or `recessive`, plus values and art hints).

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

## Genetics model limitations

This is a deliberately simplified teaching model: each gene is one independent locus with a single mutant allele. It does not model allelic groups (e.g. the BEL complex beyond Mojave), linked genes, polygenic traits, gene-associated health issues, or lethal combinations. Time is heavily compressed.
