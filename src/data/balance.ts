/**
 * Global balance knobs. Everything tunable lives in src/data, and `npm run balance` reports the
 * pacing that results from these values.
 */
export const BALANCE = {
  /** Multiplies every asset's base cost. A blunt knob for overall pace. */
  costScale: 5,
  /** Level cap per map: map N allows levels up to N × this. */
  levelCapPerMap: 100,
  /** Produce/convert/power output is multiplied by `milestoneMult` every `milestoneEvery` levels. */
  milestoneEvery: 25,
  milestoneMult: 2,
  /** Every map cleared multiplies all resource production (the "conquest" bonus). */
  conquestProductionMult: 100,

  /** Enemy targets per map: `sectorsPerMap` formations, then the HQ. */
  sectorsPerMap: 8,
  /** Uniform army level the HQ of map N is tuned against: 100(N-1) + this. */
  hqLevel: 95,
  /** Curve of sector difficulty inside a map (>1 = gentle start, steep end). */
  sectorCurve: 1.4,
  /** Enemy power = reference army power at the target level × this. */
  enemyPowerFactor: 1,
  /** Each cleared sector permanently adds this fraction of the reference market's gold/s. */
  sectorGoldFraction: 0.35,
  /** One-off bounty for clearing a target, in seconds of that sector's gold/s. */
  bountySeconds: 300,

  /** Offline earnings run at this fraction of online speed. */
  offlineEfficiency: 0.5,
} as const;

export const TARGETS_PER_MAP = BALANCE.sectorsPerMap + 1;
