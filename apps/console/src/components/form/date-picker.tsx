import { format, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function parseIso(value?: string) {
  if (!value) return undefined;
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function DatePicker({
  id,
  name,
  value,
  defaultValue,
  onChange,
  placeholder = "Pick a date",
  required,
  fromYear = 1990,
  toYear = new Date().getFullYear() + 1,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  fromYear?: number;
  toYear?: number;
}) {
  const controlled = value !== undefined;
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(defaultValue ?? "");
  const iso = controlled ? value : internal;
  const selected = parseIso(iso);

  function commit(date?: Date) {
    const next = date ? format(date, "yyyy-MM-dd") : "";
    if (!controlled) setInternal(next);
    onChange?.(next);
    setOpen(false);
  }

  return (
    <>
      {name ? <input id={id} type="hidden" name={name} value={iso} required={required} readOnly /> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              data-slot="date-picker"
              id={name ? undefined : id}
              className="w-full justify-between font-normal focus:border-primary focus-visible:border-primary focus-visible:ring-0"
            />
          }
        >
          {selected ? format(selected, "PPP") : <span className="text-muted-foreground">{placeholder}</span>}
          <CalendarIcon className="size-4 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto overflow-hidden p-0">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            captionLayout="dropdown"
            startMonth={new Date(fromYear, 0)}
            endMonth={new Date(toYear, 11)}
            onSelect={commit}
          />
        </PopoverContent>
      </Popover>
    </>
  );
}
