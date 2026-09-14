export function AttendanceRing({ value }: { value: number }) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <div className="relative h-11 w-11 shrink-0">
      <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90">
        <circle cx="20" cy="20" r={radius} fill="none" stroke="var(--color-line)" strokeWidth="3.5" />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="var(--color-indigo)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold">
        {value}%
      </span>
    </div>
  );
}
