/** Integer PKR helpers. Never use floating-point for stored amounts. */

export function addPkr(...amounts: number[]) {
  return amounts.reduce((sum, amount) => sum + toPkr(amount), 0);
}

export function subPkr(left: number, right: number) {
  return toPkr(left) - toPkr(right);
}

export function toPkr(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.trunc(value);
}

/** Percent of an integer PKR amount, rounded half-up. `percent` is a whole number (10 = 10%). */
export function percentOfPkr(amountPkr: number, percent: number) {
  const amount = toPkr(amountPkr);
  const pct = toPkr(percent);
  if (amount <= 0 || pct <= 0) return 0;
  return Math.trunc((amount * pct + 50) / 100);
}

export function minPkr(left: number, right: number) {
  return Math.min(toPkr(left), toPkr(right));
}

export function maxPkr(left: number, right: number) {
  return Math.max(toPkr(left), toPkr(right));
}

export function clampPkr(value: number, min = 0) {
  return Math.max(min, toPkr(value));
}
