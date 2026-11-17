# CastleFront: Rough Plan

## 1. What we're building

A portrait-mode mobile **idle army builder**, in the hybrid-casual style of the reference ads:

- Low-poly "toy soldier" look: bright saturated team colors (us: green, enemy: red), snowy and desert
  terrain, chunky readable silhouettes.
- A top-down 3/4 camera over a battlefield.
- Large crowds: dozens of units early, hundreds or thousands later.
- Enemy formations show a **power number** above them (1000, 1500, 2500…), so the player can tell at a glance whether they can win.
- Spectacle moments: a "Charge" pad, and super weapons like the missile strike.

> The references are visual direction only. Name, characters, art, UI and maps will be our own. We're
> making a game in this genre, not a copy of any specific game.

### Core loop

```
 ┌──────────── BACK LINE (idle economy) ────────────┐
 │ Farms, mills, mines, refineries produce resources │──┐
 └───────────────────────────────────────────────────┘  │ resources
                                                        ▼
 ┌──────────── FRONT LINE (army) ───────────────────┐
 │ Barracks, factory, artillery, airfield, silo      │──┐
 │ turn resources into troops                        │  │ army power
 └───────────────────────────────────────────────────┘  ▼
 ┌──────────── BATTLE ──────────────────────────────┐
 │ Clear enemy formations (sectors) on the map,      │──► gold, loot, map progress
 │ then the enemy HQ                                 │       │
 └───────────────────────────────────────────────────┘       │
            ▲                                                │
            └───────── spend on upgrades ◄───────────────────┘
```

Beating a map's HQ unlocks the next map, and with it **+100 to every asset's level cap**.

---

## 2. Research notes: how idle games pace upgrades

What the established games (AdVenture Capitalist, Cookie Clicker, Idle Miner Tycoon, Egg Inc., and the
"army crowd" hybrid-casuals) have in common:

| Mechanic                          | Typical implementation                                                                 | Why it works                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Exponential cost**              | `cost(L) = base × r^L`, with `r` ≈ 1.07–1.15                                           | Every upgrade is affordable eventually, and each one takes a bit longer than the last                    |
| **Linear output + milestones**    | `output = base × L × milestoneMult`, with output ×2 (or more) at levels 25/50/75/100…  | Linear output falls behind exponential cost; milestones bring back a "power spike" and short-term goals  |
| **Hard level caps per tier**      | Cap goes up only when you progress (a new map, mine or planet)                         | Stops grinding a single asset and pushes the player onward. This is the "100 per map" rule you described |
| **Offline earnings**              | Earn at X% of the online rate while away, capped at 2–12 h; doubled for watching an ad | The heart of "idle". Also the main ad-monetization hook                                                  |
| **Big numbers**                   | Abbreviated values (1.2K, 3.4M, 5.6aa…) stored as mantissa/exponent                    | Plain doubles overflow near 1e308; the costs we're talking about get there                               |
| **Soft prestige / meta currency** | A permanent multiplier earned at reset or at milestones                                | Keeps the game going after the curves flatten. Optional for us, since map caps already do much of this   |
| **Visible power vs. threat**      | A number on every enemy group, compared against your army power                        | Makes the game readable at a glance; the reference ads lean on this heavily                              |

### How fast the curves grow (cost multiplier relative to base)

| r    | Level 100 | Level 200 | Level 1000 (map 10) |
| ---- | --------- | --------- | ------------------- |
| 1.07 | 868×      | 7.5e5×    | 2.4e29×             |
| 1.10 | 1.4e4×    | 1.9e8×    | 2.5e41×             |
| 1.12 | 8.4e4×    | 7.0e9×    | 1.6e49×             |
| 1.15 | 1.2e6×    | 1.4e12×   | 5.0e60×             |

So "almost unlimited" levels need a big-number type from day one. The recommendation is
**break_infinity.js**, which is built for idle games, fast, and goes up to 1e9e15.

### Proposed formulas (starting points to tune)

```
cost(L)          = baseCost × r^L                      r per asset, 1.07 to 1.15
output(L)        = baseOut × L × 2^(floor(L / 25))     ×2 every 25 levels
levelCap(map)    = 100 × mapIndex
enemyPower(map, sector) = P0 × g^(map) × s^(sector)    tuned so time-to-clear grows slowly
```

- Cheap, fast assets (farms) get a low `r`; expensive, powerful ones (tank factory, silo) get a high `r`.
- From map 2 on, every map multiplies enemy power by a factor `g`. It is tuned against the economy you
  can realistically have at that map's cap, so each map takes a bit longer than the one before.
- We'll build a **headless balance simulator** (section 5, phase 1) that plays the game optimally and
  reports time-to-cap and time-to-clear for each map. That way tuning is based on data, not guesswork.

**Pacing target (first pass):** map 1 takes about 2–4 days of casual play to max out, and each later
map takes roughly 1.3× as long as the one before.

---

## 3. Game systems

### 3.1 Resources

| Resource           | Produced by                                     | Main use                                  |
| ------------------ | ----------------------------------------------- | ----------------------------------------- |
| **Gold**           | Battles, Mint/Market building, offline earnings | Universal upgrade currency                |
| **Food**           | Farm                                            | Infantry training                         |
| **Steel**          | Mine → Foundry (2-step chain)                   | Vehicles, fortifications                  |
| **Fuel**           | Oil Derrick → Refinery                          | Tanks, aircraft, missiles                 |
| **Medals** (later) | Map completion, achievements                    | Permanent global multipliers (meta layer) |

Production lines can be chained (raw → refined), which gives the back line a light "factory builder"
feel. Each building in a chain is upgraded separately, so bottlenecks become decisions for the player.

### 3.2 Upgradeable assets

Every asset has the same set of stats: `level`, `baseCost` (per resource), `costGrowth r`, `baseOutput`,
and `milestones`.

**Back line (economy):** Farm, Mine, Foundry, Oil Derrick, Refinery, Market, Warehouse (raises
the offline cap).

**Front line (army):**

- **Barracks**: produces infantry. Upgrades increase troop count, HP and damage.
- **Rifle Range** / **Training Ground**: infantry quality.
- **Tank Factory**: tanks.
- **Artillery Yard**: splash damage support.
- **Airfield**: air strikes (mid-game).
- **Missile Silo**: super weapon on a long charge timer. This is the "nuke" moment from the reference.
- **Commander**: the player's avatar (the gold soldier). Gives a passive aura buff; upgradeable.

Army power = a weighted sum of unit count × unit stats. This is the number shown against the enemy
formations.

### 3.3 Maps and battles

- A map is a vertical lane (portrait), like reference image 3. Our base is at the bottom, the enemy
  fortress at the top, and **sectors** of enemy formations with power labels sit in between.
- **Battle mode (active):** drag to move the commander, and troops follow in formation. Step on the
  **Charge** pad to send the army at the nearest formation. Firing a super weapon is a tap-to-target.
- **Auto mode (idle):** the army slowly pushes sector by sector on its own whenever its power beats the
  next sector's. Cleared sectors pay out gold at a steady rate.
- **Map clear:** defeating the HQ unlocks map N+1 (a new biome: snow, desert, jungle, city…) and raises
  every asset's cap to `100 × (N+1)`. Levels carry over, nothing resets.
- **Optional prestige:** replay earlier maps for Medals. We can decide later.

### 3.4 Meta and retention

- Offline earnings, plus "2× for an ad".
- Daily missions and login streaks.
- Commander skins and unit cosmetics (IAP).
- Speed-up boosts (2× production for 30 min).

---

## 4. Tech approach

**Recommendation: TypeScript + Three.js, packaged with Capacitor for iOS and Android.**

| Option                           | Pros                                                                                                                                                                                                              | Cons                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **TS + Three.js + Capacitor** ✅ | One codebase across web, iOS and Android. Fast iteration: testable in a browser and in CI. `InstancedMesh` handles thousands of low-poly units. Pure-TS simulation is easy to unit-test and to balance headlessly | Less built-in tooling than an engine. Native performance has a lower ceiling                         |
| Unity                            | Industry standard for this genre. Great crowd rendering (GPU instancing/DOTS), ad/IAP SDKs                                                                                                                        | C# and a heavy editor, which can't be driven from this cloud environment. Slower iteration loop here |
| Godot 4                          | Free, lightweight, good mobile export                                                                                                                                                                             | Weaker web/mobile 3D performance than Unity. Smaller ad/IAP ecosystem                                |

If performance becomes the bottleneck later (10k+ animated units), the simulation core is engine-agnostic
TS, so the economy and balance work carries over.

### Architecture

```
src/
  core/        pure TS, no rendering: economy, formulas, upgrades, save/load, offline calc
    bignum.ts      wrapper around break_infinity.js + formatting (1.2K, 3.4M, 5aa)
    economy.ts     tick(dt), production chains, costs
    army.ts        unit stats, army power
    battle.ts      deterministic battle sim (also used by auto mode)
    progression.ts maps, sectors, level caps
  data/        JSON/TS config for assets, units, maps (all balance numbers live here)
  render/      Three.js scenes: base view, battlefield, instanced crowds, VFX
  ui/          HUD, upgrade panels, joystick, popups (DOM/Preact overlay)
  platform/    Capacitor bridges: storage, ads, IAP, haptics, analytics
tools/
  balance-sim.ts   headless optimal-play simulator → CSV/plots of time-to-cap per map
```

- **Fixed-step simulation, decoupled from rendering.** The same `tick()` runs for gameplay, offline
  catch-up (in large steps) and the balance simulator.
- **Save:** versioned JSON in local storage, with cloud save later.

---

## 5. Roadmap

| Phase                   | Goal                 | Deliverable                                                                                                               |
| ----------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **0. Scaffold**         | Clean repo, tooling  | Vite + TS + Three.js, ESLint/Prettier, Vitest, CI                                                                         |
| **1. Economy core**     | The math, tested     | bignum, cost/output formulas, production chains, level caps, save/offline. **Balance simulator** with first pacing curves |
| **2. Base screen**      | A playable idle loop | Back-line buildings with upgrade buttons, resource HUD, number formatting, offline-earnings popup                         |
| **3. Battle prototype** | The fun part         | Portrait battlefield, instanced squads, commander + joystick, Charge pad, enemy formations with power labels, win/lose    |
| **4. Progression**      | Long-term goals      | Map 1 → map 2 transition, cap raise, sectors, auto-push idle mode                                                         |
| **5. Spectacle**        | Juice                | Missile silo super weapon, explosions, scorch decals, screen shake, unit ragdoll "pop"                                    |
| **6. Content**          | Breadth              | 4–5 biomes, more unit types, airfield, missions                                                                           |
| **7. Mobile ship**      | Release              | Capacitor builds, ads (rewarded), IAP, analytics, performance pass on low-end Android                                     |

A vertical slice of phases 0–3 (one map, about 5 assets, one battle) is the first milestone worth
playtesting.

---

## 6. Open questions

1. **Tech stack:** are you OK with TS + Three.js + Capacitor, or do you prefer Unity?
2. **Battle control:** should battles be mostly active (joystick and charge, as in reference 1), mostly
   watched (auto, as in references 2 and 3), or both, as proposed?
3. **Level-up model:** single taps only, or also "buy ×10 / ×max"? (The standard is to have both.)
4. **Prestige/Medals:** include a meta-reset layer, or rely only on map caps?
5. **Monetization:** rewarded ads + IAP cosmetics/boosts. Any no-go areas?
6. **Art pipeline:** procedural low-poly in code at first, then commissioned or asset-store models?

---

## 7. Progress log

### Phases 0–1 (done)

- Scaffold: Vite + TypeScript (strict) + Three.js, ESLint, Prettier, Vitest, GitHub Actions CI.
- Economy core in `src/core` (big numbers, costs and bulk buys ×1/×10/next milestone/max, production
  chains with input throttling, level caps, army power, sectors/HQ, idle auto-push, offline
  earnings, versioned saves). 44 unit tests.
- Decisions taken: enemies are generated from a _reference army_ instead of hand-written numbers;
  army upgrades are paid in food/steel/fuel, economy upgrades mostly in gold; each cleared sector
  adds permanent gold/s; each conquered map multiplies all production by 12.

First pacing from `npm run balance` (always-online optimal play, so real players are ~2–3× slower):

| Map | Time on map | × previous |
| --- | ----------- | ---------- |
| 1   | 1d 0h       | –          |
| 2   | 1d 19h      | 1.73       |
| 3   | 1d 23h      | 1.10       |
| 4   | 2d 11h      | 1.25       |
| 5   | 3d 23h      | 1.62       |
| 6   | 5d 8h       | 1.34       |
| 8   | 13d 11h     | 1.74       |

Known tuning items: the HQ is a large wall (about half of each map's time); the steel/fuel chain is the
bottleneck while farms and barracks cap early; later maps slowly drift above the 1.3× target.

### Phase 2 (done)

- 3D base: every building has its own low-poly model on a fixed plot (front line nearest the wall,
  back line behind). Locked and unbuilt plots show as construction sites. Buildings grow a little at
  each ★ milestone and pop when upgraded. Pumpjack, chimney smoke, flag and artillery animate.
- Drag to pan between the base and the battlefield; the **Battle / Base** button jumps between them.
  The enemy formation shows its power on a red badge.
- Labels above every building: name, level, ★ tier, a ▲ badge when an upgrade is affordable, a lock
  when not yet unlocked, **Build** when unlocked but not built.
- Tap a building for its upgrade sheet: stats now → next, progress to the next ★, ×1/×10/Next★/Max
  (remembered), cost chips that turn red when short, "Ready in …" countdown, and hold-to-repeat buying.
- Top HUD: resource chips with net rates (only resources you have discovered), map/sector progress
  dots, army vs. enemy power meter, settings.
- "+N" numbers float up from producing buildings; toasts for sectors taken and new buildings; a
  "Map conquered" card.
- Welcome-back card with offline gains and the Warehouse cap explained.
- Settings: "Skip 1 hour" for testing, and reset progress with an in-page confirmation.
