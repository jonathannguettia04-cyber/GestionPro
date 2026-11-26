const TONES: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700", blue: "bg-brand-soft text-brand", green: "bg-green-50 text-green-700",
  orange: "bg-orange-50 text-orange-700", red: "bg-red-50 text-red-700",
};
export function StatusBadge({ status, map }: { status: string; map: Record<string, { label: string; tone: string }> }) {
  const s = map[status] ?? { label: status, tone: "slate" };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[s.tone]}`}>{s.label}</span>;
}
