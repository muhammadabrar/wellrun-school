import { UploadIcon } from "lucide-react";
import { useId } from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

export function FileUpload({
  label,
  accept,
  hint,
  preview,
  previewWide,
  fileName,
  onFile,
}: {
  label: string;
  accept: string;
  hint: string;
  preview?: string;
  previewWide?: boolean;
  fileName?: string;
  onFile: (file: File) => void;
}) {
  const id = useId();

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {preview ? (
        <img
          src={preview}
          alt=""
          className={previewWide ? "h-16 w-28 rounded-lg object-cover" : "h-16 w-16 rounded-lg object-cover"}
        />
      ) : null}
      <InputGroup className="h-auto min-h-8 py-1">
        <InputGroupAddon>
          <UploadIcon />
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          type="file"
          accept={accept}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
          }}
        />
      </InputGroup>
      <FieldDescription>{fileName || hint}</FieldDescription>
    </Field>
  );
}
