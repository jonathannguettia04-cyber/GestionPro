export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
        <rect width="30" height="30" rx="7" fill="#2563EB" />
        <path d="M9 21V9h7.2a3.8 3.8 0 0 1 0 7.6H13" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={`text-lg font-semibold tracking-tight ${light ? "text-white" : "text-night"}`}>GestionPro</span>
    </div>
  );
}
