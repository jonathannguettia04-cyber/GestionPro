// Anti open-redirect : uniquement des chemins internes.
export function safeNext(value: FormDataEntryValue | string | null | undefined, fallback = "/dashboard"): string {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") ? v : fallback;
}
