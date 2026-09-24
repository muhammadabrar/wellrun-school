export function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

export function periodRange(billingPeriod: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(billingPeriod.trim());
  if (!match) {
    const start = new Date();
    return { start, end: start };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

export function dueDateFromPeriod(billingPeriod: string, dueDay: number) {
  const match = /^(\d{4})-(\d{2})$/.exec(billingPeriod.trim());
  const now = new Date();
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const month = match ? Number(match[2]) : now.getUTCMonth() + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(Math.max(dueDay, 1), last);
  return new Date(Date.UTC(year, month - 1, day));
}

export function currentBillingPeriod(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
