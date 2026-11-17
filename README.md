# CastleFront

A mobile idle army game. Build back-line production lines, turn their output into an army, and push your
front line across ever-harder maps of NPC defenses. Every asset upgrades almost without limit; each new map
raises the level cap by 100.

Plan and roadmap: [docs/PLAN.md](docs/PLAN.md). Status: **phases 0–3 done** (scaffold, economy core, base screen, rival race, battles).

## Getting started

```bash
npm install
npm run dev        # dev build with the debug HUD, open on a phone-sized viewport
npm test           # unit tests (Vitest)
npm run balance    # headless pacing report: npm run balance -- --maps 10 --dt 60 --days 400
npm run lint && npm run typecheck && npm run format:check
```

In the browser console, `cf.state` shows the live game state and `cf.reset()` wipes the save.

## Layout

| Path                   | What                                                                      |
| ---------------------- | ------------------------------------------------------------------------- |
| `src/core/`            | Pure TS game logic, no rendering: big numbers, formulas, economy, army,   |
|                        | progression, upgrades, offline earnings, save/load. Fully unit-tested.    |
| `src/data/`            | **All balance numbers**: `assets.ts` (buildings) and `balance.ts` (knobs) |
| `src/render/`          | Three.js world: base layout, procedural building models, troops           |
| `src/ui/`              | HUD, building labels, upgrade sheet, modals and toasts                    |
| `src/platform/`        | Storage adapter (localStorage now; Capacitor later)                       |
| `tools/balance-sim.ts` | Simulator that plays the game and reports time per map                    |
| `tests/`               | Vitest suites                                                             |

## How the numbers work

- Upgrade cost: `cost × costScale × costGrowth^L` per resource. Bulk buys use a geometric series.
- Output: `base × L × 2^floor(L/25)` (×2 milestone every 25 levels).
- Level cap: `100 × map`.
- Each map conquered multiplies all resource production by `conquestProductionMult`.
- Enemies are tuned against a _reference army_ (every unlocked army asset at the same level), so
  changing economy numbers changes how long things take, never whether they are possible.
- Numbers use [break_infinity.js](https://github.com/Patashu/break_infinity.js) and are shown as
  `1.23K / 4.5M / 6.7B / 8.9T / 1aa … 9.9zz`, then scientific notation.
