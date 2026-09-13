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
