import { Upload } from "lucide-react";
import { useId } from "react";

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
    <div className="block text-sm font-medium">
      {label}
      <label
        htmlFor={id}
        className="mt-2 flex min-h-28 cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-line bg-paper px-4 py-3 transition-colors hover:border-indigo/40"
      >
        {preview ? (
          <img
            src={preview}
            alt=""
            className={previewWide ? "h-16 w-28 shrink-0 rounded-xl object-cover" : "h-16 w-16 shrink-0 rounded-xl object-cover"}
          />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface text-indigo">
            <Upload size={20} />
          </span>
        )}
        <span className="min-w-0">
          <span className="text-indigo">{fileName || preview ? "Replace file" : "Choose file"}</span>
          <span className="mt-1 block truncate text-xs font-normal text-muted">{fileName || hint}</span>
        </span>
        <input
          id={id}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
          }}
        />
      </label>
    </div>
  );
}
