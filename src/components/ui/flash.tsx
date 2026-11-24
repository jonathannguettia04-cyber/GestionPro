import { Alert } from "@/components/ui/form";

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return <div className="mb-4">{err ? <Alert kind="error">{err}</Alert> : <Alert kind="success">{ok}</Alert>}</div>;
}
