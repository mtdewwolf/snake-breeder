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
| `js/art.js` | Original SVG placeholder snake illustrations generated from genes |
| `js/ui.js`, `js/main.js` | Rendering and event wiring |

To add a morph, append an entry to `SB.GENES` in `js/data.js` (type `codominant`, `dominant` or `recessive`, plus values and art hints).

## Genetics model limitations

This is a deliberately simplified teaching model: each gene is one independent locus with a single mutant allele. It does not model allelic groups (e.g. the BEL complex beyond Mojave), linked genes, polygenic traits, gene-associated health issues, or lethal combinations. Time is heavily compressed.
