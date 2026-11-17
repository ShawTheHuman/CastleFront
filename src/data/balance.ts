/**
 * Global balance knobs. Everything tunable lives in src/data, and `npm run balance` reports the
 * pacing that results from these values.
 */
export const BALANCE = {
  /** Multiplies every asset's base cost. A blunt knob for overall pace. */
  costScale: 15,
  /** The first this-many levels of every building are discounted (level 1 at 1/N of the
   * price, ramping to full price), so the opening minutes are quick. */
  earlyDiscountLevels: 20,
  /** Level cap per map: map N allows levels up to N × this. */
  levelCapPerMap: 100,
  /** Produce/convert/power output is multiplied by `milestoneMult` every `milestoneEvery` levels. */
  milestoneEvery: 25,
  milestoneMult: 2,
  /** Every map cleared multiplies all resource production (the "conquest" bonus). */
  conquestProductionMult: 18,

  /** Enemy targets per map: `sectorsPerMap` outposts, then the rival's base. */
  sectorsPerMap: 8,
  /** The last outpost's garrison is the map's starting army with every building this many levels
   * higher (earlier outposts are fewer levels up, along `sectorCurve`). */
  outpostLevelsPerMap: 75,
  /** Uniform level used to size outpost gold rewards: 100(N-1) + this at the end of map N. */
  hqLevel: 80,
  /** Curve of outpost difficulty inside a map (>1 = gentle start, steep end). */
  sectorCurve: 1.4,
  /** Outpost garrison power × this. */
  enemyPowerFactor: 1,
  /** Each cleared sector permanently adds this fraction of the reference market's gold/s. */
  sectorGoldFraction: 0.35,
  /** One-off bounty for clearing a target, in seconds of that sector's gold/s. */
  bountySeconds: 300,

  /** The rival plays the same game as you, with its economy running at this fraction of normal
   * speed on map 1... */
  rivalPaceMap1: 0.5,
  /** ...and this much faster on every map after: slow early, then a real race, then faster
   * than you. */
  rivalPaceGrowth: 1.12,
  /** Each outpost the player takes slows the rival's building by this fraction. */
  rivalSlowPerOutpost: 0,
  /** The rival's base is finished once its cheapest next upgrade would cost more than this many
   * minutes of its income (it has hit the map's wall), or once it has built this fraction of the
   * map's levels. It then stops building and attacks, so a player who keeps upgrading always
   * overtakes it. */
  rivalPatienceMinutes: 20,
  rivalFinishFraction: 0.9,
  /** Share of every stored resource the rival takes when its attack breaks through. */
  rivalRaidLoss: 0.1,
  /** ...but never more than this many minutes of that resource's income. */
  rivalRaidMaxMinutes: 30,
  /** Hours between rival attacks after one breaks through. */
  rivalAttackCooldownHours: 8,
  /** Minutes the player's army regroups after a failed assault on the rival base. */
  assaultCooldownMinutes: 10,

  /** Offline earnings count for at most this many hours away... */
  offlineCapHours: 8,
  /** ...and run at this fraction of online speed. */
  offlineEfficiency: 0.5,
} as const;

export const TARGETS_PER_MAP = BALANCE.sectorsPerMap + 1;
