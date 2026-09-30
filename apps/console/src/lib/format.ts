export function pkr(amount: number) {
  return `Rs. ${amount.toLocaleString("en-PK")}`;
}

export function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function mediaUrl(url?: string | null) {
  if (!url) return "";
  const api = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
  if (url.startsWith("/")) return `${api}${url}`;
  return url.replace(/^https?:\/\/localhost:\d+/, api);
}

/** Short money for tiles: Rs. 1.24M, Rs. 85K. Use pkr() where the exact figure matters. */
export function pkrCompact(amount: number) {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `Rs. ${trim(amount / 1_000_000)}M`;
  if (abs >= 10_000) return `Rs. ${trim(amount / 1_000)}K`;
  return pkr(amount);
}

function trim(value: number) {
  return value.toFixed(2).replace(/\.?0+$/, "");
}
