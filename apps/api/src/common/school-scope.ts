export type SchoolScope = {
  campusId?: string;
  yearId?: string;
};

export function schoolScope(headers: Record<string, unknown> | { [key: string]: unknown }): SchoolScope {
  const campusId = headerValue(headers, "x-campus-id");
  const yearId = headerValue(headers, "x-year-id");
  return {
    campusId: campusId || undefined,
    yearId: yearId || undefined,
  };
}

function headerValue(headers: Record<string, unknown>, name: string) {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) return String(raw[0] ?? "").trim();
  if (typeof raw === "string") return raw.trim();
  return "";
}
