import { ItemShare } from '@/types/types';

/**
 * Claims are entered in the item's own units, never as a percent of the whole
 * line, which people misread on items with qty > 1:
 *   how many of the item × (shares you cover ÷ people splitting them)
 * e.g. 2 waters split 3 ways, covering you and a partner: 2 × 2/3 = 1⅓ waters.
 */

// Rounding slack for comparing fractions like 1/3 that don't add up exactly
export const EPS = 1e-6;

/** How one person claimed one item. */
export interface Claim {
  count: number;                         // how many of the item
  mode: 'mine' | 'split' | 'percent';
  ways: number;                          // people splitting them (split mode)
  covered: number;                       // shares of the split you pay for (split mode)
  percent: number;                       // your percent of them (uneven splits)
}

export const NO_CLAIM: Claim = { count: 0, mode: 'mine', ways: 2, covered: 1, percent: 50 };

/** The claim's size in units of the item: 2 waters split 3 ways, covering 1 → ⅔. */
export function claimUnits(claim: Claim): number {
  if (claim.mode === 'split') return (claim.count * claim.covered) / claim.ways;
  if (claim.mode === 'percent') return (claim.count * claim.percent) / 100;
  return claim.count;
}

/** The columns that remember how a claim was entered (see item_shares). */
export function claimColumns(claim: Claim) {
  return {
    units_count: claim.count,
    split_ways: claim.mode === 'split' ? claim.ways : claim.mode === 'mine' ? 1 : null,
    shares_covered: claim.mode === 'split' ? claim.covered : claim.mode === 'mine' ? 1 : null,
  };
}

/**
 * Rebuild the claim behind a saved share. Uses the stored details when there are
 * any; older or bulk-made shares only have a size, so make a sensible guess.
 */
export function claimFromShare(share: ItemShare | undefined, qty: number): Claim {
  const units = (share?.proportion ?? 0) * qty;
  if (units < EPS) return NO_CLAIM;

  // Trust the stored details only if they still add up to the saved size: an
  // older version of the app may have changed the size and left them behind.
  const count = share?.count;
  if (count) {
    let stored: Claim = { ...NO_CLAIM, count, mode: 'percent', percent: round1((units / count) * 100) };
    if (share.ways === 1) stored = { ...NO_CLAIM, count };
    else if (share.ways && share.covered) stored = { ...NO_CLAIM, count, mode: 'split', ways: share.ways, covered: share.covered };
    if (Math.abs(claimUnits(stored) - units) < 1e-3) return stored;
  }

  if (Math.abs(units - Math.round(units)) < EPS) return { ...NO_CLAIM, count: Math.round(units) };
  for (let c = 1; c <= qty; c++) {
    for (let ways = 2; ways <= 12; ways++) {
      for (let covered = 1; covered < ways; covered++) {
        if (Math.abs((c * covered) / ways - units) < EPS) return { ...NO_CLAIM, count: c, mode: 'split', ways, covered };
      }
    }
  }
  const c = Math.min(qty, Math.ceil(units - EPS));
  return { ...NO_CLAIM, count: c, mode: 'percent', percent: round1((units / c) * 100) };
}

/** A claim in words: "2", "2 split 3 ways, 1 share", "60% of 1". */
export function describeClaim(claim: Claim): string {
  if (claim.mode === 'split') {
    return `${claim.count} split ${claim.ways} ways, ${claim.covered} ${claim.covered === 1 ? 'share' : 'shares'}`;
  }
  if (claim.mode === 'percent') return `${claim.percent}% of ${claim.count}`;
  return String(claim.count);
}

const FRACTION_GLYPHS: [number, string][] = [
  [1 / 2, '½'], [1 / 3, '⅓'], [2 / 3, '⅔'], [1 / 4, '¼'], [3 / 4, '¾'],
  [1 / 5, '⅕'], [1 / 6, '⅙'], [1 / 8, '⅛'],
];

/** "1½", "⅓", "2", or "0.37" when there's no neat fraction. */
export function formatUnits(units: number): string {
  const whole = Math.floor(units + EPS);
  const fraction = units - whole < EPS ? 0 : units - whole;
  if (fraction === 0) return String(whole);
  const glyph = FRACTION_GLYPHS.find(([v]) => Math.abs(v - fraction) < 1e-3)?.[1];
  if (glyph) return whole > 0 ? `${whole}${glyph}` : glyph;
  return String(Math.round(units * 100) / 100);
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
