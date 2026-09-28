import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

type Capitalize = "first" | "words" | "none"

const NON_TEXT_TYPES = new Set(["email", "password", "url", "tel", "number", "date", "month", "time", "datetime-local", "week", "search", "file", "color", "range", "hidden", "checkbox", "radio"])
// Free text that must stay exactly as typed.
const RAW_FIELDS = /email|website|url|cnic|username|password|search|phone|mobile|whatsapp|code|reference|prefix|slug|color/i

function capitalizeText(value: string, mode: Capitalize) {
  if (mode === "words") return value.replace(/(^|[\s\-'(])(\p{Ll})/gu, (_m, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`)
  return value.replace(/^(\s*)(\p{Ll})/u, (_m, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`)
}

/**
 * Text inputs start with a capital letter ("muhammad" → "Muhammad"). Pass capitalize="words" for
 * names, or "none" to keep text exactly as typed. Emails, URLs, CNIC, phone, search and similar
 * fields are left alone automatically.
 */
function Input({
  className,
  type,
  capitalize,
  onInput,
  ...props
}: React.ComponentProps<"input"> & { capitalize?: Capitalize }) {
  const identity = `${props.name ?? ""} ${props.id ?? ""} ${props.autoComplete ?? ""}`
  const mode: Capitalize =
    capitalize ??
    (NON_TEXT_TYPES.has(type ?? "text") || props.inputMode === "numeric" || props.inputMode === "decimal" || RAW_FIELDS.test(identity)
      ? "none"
      : "first")

  function handleInput(event: React.InputEvent<HTMLInputElement>) {
    if (mode !== "none") {
      const el = event.currentTarget
      const next = capitalizeText(el.value, mode)
      if (next !== el.value) {
        const { selectionStart, selectionEnd } = el
        el.value = next
        el.setSelectionRange(selectionStart, selectionEnd)
      }
    }
    onInput?.(event)
  }

  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      autoCapitalize={mode === "words" ? "words" : mode === "first" ? "sentences" : "off"}
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-2 text-sm transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus:border-primary focus-visible:border-primary focus-visible:ring-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-0 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50",
        className
      )}
      onInput={handleInput}
      {...props}
    />
  )
}

export { Input }
