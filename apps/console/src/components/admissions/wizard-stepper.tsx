import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress, ProgressLabel } from "@/components/ui/progress";

export type WizardStepItem = {
  id: number;
  label: string;
};

export function WizardStepper({
  steps,
  current,
  onSelect,
}: {
  steps: WizardStepItem[];
  current: number;
  onSelect: (id: number) => void;
}) {
  const percent = Math.round((current / steps.length) * 100);
  const currentLabel = steps.find((step) => step.id === current)?.label ?? "";

  return (
    <nav aria-label="Application steps" className="mt-6">
      <Progress value={percent} className="md:hidden">
        <ProgressLabel>
          Step {current} of {steps.length} · {currentLabel}
        </ProgressLabel>
      </Progress>
      <ol className="hidden md:flex md:items-start">
        {steps.map((step, index) => {
          const complete = step.id < current;
          const active = step.id === current;
          return (
            <li key={step.id} className="flex flex-1 items-start">
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                className="flex flex-col items-center gap-2 text-center"
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full border text-sm font-medium [&_svg]:size-4",
                    complete && "border-primary bg-primary text-primary-foreground",
                    active && "border-primary bg-primary text-primary-foreground",
                    !complete && !active && "border-border bg-background text-muted-foreground",
                  )}
                >
                  {complete ? <CheckIcon /> : step.id}
                </span>
                <span className={cn("max-w-20 text-xs", active ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {step.label}
                </span>
              </button>
              {index < steps.length - 1 ? (
                <div
                  className={cn("mt-4 h-px min-w-4 flex-1", complete ? "bg-primary" : "bg-border")}
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
