import { useMemo } from "react";
import { FormSelect } from "@/components/form/form-select";

export function formatClock(value: string) {
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** School-day clock times (06:00–19:55) in 5-minute steps, stored as "HH:mm". */
export function TimePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a time",
  disabled,
  from = 6,
  to = 20,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  from?: number;
  to?: number;
}) {
  const options = useMemo(() => {
    const times: string[] = [];
    for (let minutes = from * 60; minutes < to * 60; minutes += 5) {
      times.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
    }
    if (value && !times.includes(value)) times.push(value);
    return times.sort().map((time) => ({ value: time, label: formatClock(time) }));
  }, [from, to, value]);

  return (
    <FormSelect
      id={id}
      value={value || null}
      onValueChange={(next) => next && onChange(next)}
      placeholder={placeholder}
      options={options}
      disabled={disabled}
    />
  );
}
