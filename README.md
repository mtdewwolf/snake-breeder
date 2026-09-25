# Scale & نسل — Ball Python Breeder

A cozy, turn-based browser game about running a small ball python breeding operation: care for your snakes, learn their genetics, preview pairings, incubate clutches, hatch babies with inherited traits, and find them good homes.

## Run it

```bash
npm start        # serves the game at http://localhost:8080 (no dependencies)
npm test         # genetics + full game-loop tests (Node 18+)
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
| `js/genetics.js` | Mendelian engine: predictions, egg rolls, possible-het inference |
| `js/sim.js` | Player actions and the weekly simulation |
| `js/state.js` | New-game setup and save/load |
| `js/art.js` | Original SVG snake illustrations: tapered coiled body, morph-specific patterns, shading and head detail, all generated from gene `art` data |
| `js/ui.js`, `js/main.js` | Rendering (reptile room, HUD, dock, dialogs) and event wiring, including floating numbers and the weekly recap |

To add a morph, append an entry to `SB.GENES` in `js/data.js` (type `codominant`, `dominant` or `recessive`, plus values and art hints).

## Genetics model limitations

This is a deliberately simplified teaching model: each gene is one independent locus with a single mutant allele. It does not model allelic groups (e.g. the BEL complex beyond Mojave), linked genes, polygenic traits, gene-associated health issues, or lethal combinations. Time is heavily compressed.
