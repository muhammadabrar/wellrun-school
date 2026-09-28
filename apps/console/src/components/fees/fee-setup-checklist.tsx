import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query";

/** Shown on the dashboard until the school can bill: fee heads added and every class has a fee structure. */
export function FeeSetupChecklist() {
  const { data } = useQuery({ queryKey: queryKeys.feeSetupStatus, queryFn: api.feeSetupStatus });
  if (!data) return null;
  const headsDone = data.feeHeads > 0;
  const structuresDone = data.classes > 0 && data.classesWithoutStructure.length === 0;
  if (headsDone && structuresDone) return null;
  const missing = data.classesWithoutStructure;

  const steps = [
    {
      done: headsDone,
      title: "Add your fees",
      body: "Tuition, admission, exam — each type of fee and its usual amount.",
      action: <Button size="sm" render={<Link to="/fees/heads" />}>Open Fee Heads</Button>,
    },
    {
      done: structuresDone,
      title: data.classes ? `Set fees for ${missing.length} more class${missing.length === 1 ? "" : "es"}` : "Set fees for each class",
      body: missing.length
        ? `Still missing: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? ` and ${missing.length - 6} more` : ""}. “Copy fee heads to all classes” does it in one click.`
        : "Add classes first in Classes & subjects.",
      action: (
        <Button size="sm" variant={headsDone ? "default" : "outline"} disabled={!headsDone} render={headsDone ? <Link to="/fees/structures" /> : undefined}>
          Open Fee structures
        </Button>
      ),
    },
    {
      done: false,
      title: "Generate this month's invoices",
      body: "Once fees are set, bill every student in one step.",
      action: (
        <Button size="sm" variant="outline" disabled={!structuresDone} render={structuresDone ? <Link to="/fees/generate" /> : undefined}>
          Generate monthly fees
        </Button>
      ),
    },
  ];

  return (
    <section aria-labelledby="fee-setup-title" className="rounded-3xl border border-indigo/20 bg-indigo/5 p-6">
      <h2 id="fee-setup-title" className="font-display text-2xl">
        Set up fees
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Three steps before you can send fee invoices. You can also create a missing class fee structure while admitting a student.</p>
      <ol className="mt-5 grid gap-3 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
            <div className="flex items-center gap-2">
              <span
                className={`flex size-7 items-center justify-center rounded-full text-sm font-semibold ${
                  step.done ? "bg-success text-white" : "bg-indigo/10 text-indigo"
                }`}
              >
                {step.done ? <Check className="size-4" aria-label="Done" /> : index + 1}
              </span>
              <p className="font-medium">{step.title}</p>
            </div>
            <p className="flex-1 text-sm text-muted-foreground">{step.body}</p>
            {step.done ? <p className="text-sm text-success">Done</p> : step.action}
          </li>
        ))}
      </ol>
    </section>
  );
}
