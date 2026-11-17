import { D, Decimal } from './bignum';
import { levelOutput } from './formulas';
import { ASSETS } from '../data/assets';

/** Army power from a set of asset levels: (Σ power outputs) × (Π power multipliers). */
export function armyPowerFromLevels(levels: Readonly<Record<string, number>>): Decimal {
  let sum = D(0);
  let mult = D(1);
  for (const a of ASSETS) {
    const lvl = levels[a.id] ?? 0;
    if (lvl <= 0) continue;
    if (a.effect.kind === 'power') sum = sum.add(levelOutput(a.effect.base, lvl));
    else if (a.effect.kind === 'powerMult') mult = mult.mul(1 + a.effect.perLevel * lvl);
  }
  return sum.mul(mult);
}

export function armyPower(state: { levels: Readonly<Record<string, number>> }): Decimal {
  return armyPowerFromLevels(state.levels);
}
