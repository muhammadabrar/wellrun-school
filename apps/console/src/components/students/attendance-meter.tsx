export function AttendanceMeter({ value, marked }: { value: number; marked: boolean }) {
  const pct = marked ? Math.min(100, Math.max(0, value)) : 0;
  const tone = !marked ? "neutral" : pct > 80 ? "success" : pct >= 70 ? "warning" : "danger";
  const track =
    tone === "success" ? "bg-success/20" : tone === "warning" ? "bg-orange/20" : tone === "danger" ? "bg-danger/20" : "bg-line";
  const fill =
    tone === "success" ? "bg-success" : tone === "warning" ? "bg-orange" : tone === "danger" ? "bg-danger" : "bg-line";
  const label = !marked ? "text-muted-foreground" : pct >= 45 ? "text-white" : tone === "success" ? "text-success" : tone === "warning" ? "text-orange" : "text-danger";

  return (
    <span
      className={`relative inline-flex h-7 w-[4.75rem] overflow-hidden rounded-full ${track}`}
      title={marked ? `${pct}% attendance` : "No attendance marked yet"}
    >
      <span className={`absolute inset-y-0 left-0 ${fill}`} style={{ width: `${pct}%` }} />
      <span className={`relative z-10 flex h-full w-full items-center justify-center text-xs font-semibold ${label}`}>
        {marked ? `${pct}%` : "—"}
      </span>
    </span>
  );
}
