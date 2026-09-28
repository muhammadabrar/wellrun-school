import { CheckIcon, ChevronDownIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type FeeFrequency = "MONTHLY" | "QUARTERLY" | "ANNUAL" | "ONE_TIME";

/** Titles most Pakistani schools charge, with the frequency they're usually billed at. */
export const COMMON_FEE_TITLES: { title: string; frequency: FeeFrequency }[] = [
  { title: "Tuition Fee", frequency: "MONTHLY" },
  { title: "Admission Fee", frequency: "ONE_TIME" },
  { title: "Registration Fee", frequency: "ONE_TIME" },
  { title: "Exam Fee", frequency: "QUARTERLY" },
  { title: "Computer Fee", frequency: "MONTHLY" },
  { title: "Library Fee", frequency: "MONTHLY" },
  { title: "Lab Fee", frequency: "MONTHLY" },
  { title: "Transport Fee", frequency: "MONTHLY" },
  { title: "Sports Fee", frequency: "MONTHLY" },
  { title: "Annual Charges", frequency: "ANNUAL" },
  { title: "Security Deposit", frequency: "ONE_TIME" },
  { title: "Stationery Fee", frequency: "ANNUAL" },
  { title: "Uniform Fee", frequency: "ONE_TIME" },
  { title: "Event / Picnic Fee", frequency: "ONE_TIME" },
];

const normalize = (value: string) => value.trim().toLowerCase();

/**
 * Pick a common fee title or type a new one. Titles already in the catalog are shown but disabled,
 * so a school can't create "Tuition Fee" twice.
 */
export function FeeTitleSelect({
  id,
  value,
  existingTitles,
  onChange,
  placeholder = "Choose or type a fee title",
}: {
  id?: string;
  value: string;
  existingTitles: string[];
  onChange: (title: string, suggestedFrequency?: FeeFrequency) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const taken = new Set(existingTitles.map(normalize));
  const q = normalize(query);
  const suggestions = COMMON_FEE_TITLES.filter((row) => !q || normalize(row.title).includes(q));
  const exactMatch = COMMON_FEE_TITLES.some((row) => normalize(row.title) === q);
  const customTitle = query.trim();
  const canCreate = customTitle.length > 1 && !exactMatch && !taken.has(q);

  function choose(title: string, frequency?: FeeFrequency) {
    onChange(title, frequency);
    setQuery("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button id={id} type="button" variant="outline" className="w-full justify-between font-normal" />}>
        <span className={value ? "truncate" : "truncate text-muted-foreground"}>{value || placeholder}</span>
        <ChevronDownIcon className="size-4 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-72 gap-1 p-1.5">
        <Input
          capitalize="words"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (canCreate) choose(customTitle);
              else if (suggestions[0] && !taken.has(normalize(suggestions[0].title))) choose(suggestions[0].title, suggestions[0].frequency);
            }
          }}
          placeholder="Search or type a new title"
          aria-label="Search or type a fee title"
        />
        <div className="max-h-64 overflow-y-auto" role="listbox">
          {canCreate ? (
            <button type="button" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-primary hover:bg-muted" onClick={() => choose(customTitle)}>
              <PlusIcon className="size-4" aria-hidden /> Create “{customTitle}”
            </button>
          ) : null}
          {suggestions.map((row) => {
            const used = taken.has(normalize(row.title));
            return (
              <button
                key={row.title}
                type="button"
                role="option"
                aria-selected={value === row.title}
                disabled={used}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                onClick={() => choose(row.title, row.frequency)}
              >
                <span className="flex-1">{row.title}</span>
                <span className="text-xs text-muted-foreground">{used ? "already added" : frequencyLabel(row.frequency)}</span>
                {value === row.title ? <CheckIcon className="size-4 text-primary" aria-hidden /> : null}
              </button>
            );
          })}
          {!suggestions.length && !canCreate ? <p className="px-2.5 py-2 text-sm text-muted-foreground">This title already exists.</p> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function frequencyLabel(frequency: string) {
  return { MONTHLY: "Monthly", QUARTERLY: "Quarterly", ANNUAL: "Once a year", ONE_TIME: "One time" }[frequency] ?? frequency;
}
