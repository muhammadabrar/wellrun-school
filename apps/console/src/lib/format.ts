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
