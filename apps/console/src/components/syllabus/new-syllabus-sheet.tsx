import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { syllabusApi, syllabusKeys } from "@/lib/syllabus-api";

export type NewSyllabusTarget = { gradeName: string; subjectId: string; subjectName: string } | null;

/** Start a syllabus for one grade + subject: empty, or copied from last year's or another class's. */
export function NewSyllabusSheet({ target, onClose }: { target: NewSyllabusTarget; onClose: () => void }) {
  return (
    <Sheet open={Boolean(target)} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">{target ? <Form key={`${target.gradeName}:${target.subjectId}`} target={target} onClose={onClose} /> : null}</SheetContent>
    </Sheet>
  );
}

function Form({ target, onClose }: { target: NonNullable<NewSyllabusTarget>; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sources = useQuery({ queryKey: syllabusKeys.sources(target.subjectId), queryFn: () => syllabusApi.sources(target.subjectId) });
  const [copyFromId, setCopyFromId] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Suggest the same grade from an earlier year first — the most likely starting point.
  const suggested = sources.data?.find((s) => s.label.startsWith(`${target.gradeName} ·`));
  const create = useMutation({
    mutationFn: () => syllabusApi.create({ gradeName: target.gradeName, subjectId: target.subjectId, copyFromId: copyFromId || undefined }),
    onSuccess: async (out) => {
      await queryClient.invalidateQueries({ queryKey: syllabusKeys.root });
      onClose();
      navigate(`/syllabus/${out.id}`);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't create the syllabus"),
  });
  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <SheetHeader>
        <SheetTitle>
          New syllabus · {target.gradeName} {target.subjectName}
        </SheetTitle>
        <SheetDescription>One syllabus is shared by every section of {target.gradeName} for the whole academic year.</SheetDescription>
      </SheetHeader>
      <FieldGroup className="flex-1 px-4">
        <Field>
          <FieldLabel htmlFor="syllabus-source">Start from</FieldLabel>
          <FormSelect
            id="syllabus-source"
            value={copyFromId || "blank"}
            onValueChange={(v) => setCopyFromId(v === "blank" ? "" : (v ?? ""))}
            placeholder="Blank syllabus"
            options={[
              { value: "blank", label: "A blank syllabus" },
              ...(sources.data ?? []).map((s) => ({ value: s.id, label: `${s.label} (${s.topics} topics)` })),
            ]}
          />
          <FieldDescription>
            Units and topics are copied; progress and exam links are not. Planned dates move to this year.
            {suggested && !copyFromId ? (
              <>
                {" "}
                <button type="button" className="text-indigo underline" onClick={() => setCopyFromId(suggested.id)}>
                  Use {suggested.label}
                </button>
              </>
            ) : null}
          </FieldDescription>
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={create.isPending}>
          Create syllabus
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </SheetFooter>
    </form>
  );
}
