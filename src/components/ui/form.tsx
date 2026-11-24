"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import clsx from "clsx";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-night placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 aria-[invalid=true]:border-danger";

export function Field({
  label, name, error, hint, className, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; error?: string[]; hint?: string }) {
  return (
    <div className={className}>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium">{label}</label>
      <input id={name} name={name} aria-invalid={!!error?.length} aria-describedby={`${name}-msg`} className={inputCls} {...props} />
      <p id={`${name}-msg`} className={clsx("mt-1 text-xs", error?.length ? "text-danger" : "text-slate-500")}>{error?.[0] ?? hint}</p>
    </div>
  );
}

export function PasswordField({
  label, name, error, hint, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; error?: string[]; hint?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium">{label}</label>
      <div className="relative">
        <input id={name} name={name} type={shown ? "text" : "password"} aria-invalid={!!error?.length} aria-describedby={`${name}-msg`} className={clsx(inputCls, "pr-11")} {...props} />
        <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-night">
          {shown ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      <p id={`${name}-msg`} className={clsx("mt-1 text-xs", error?.length ? "text-danger" : "text-slate-500")}>{error?.[0] ?? hint}</p>
    </div>
  );
}

export function Select({
  label, name, children, error, ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; name: string; error?: string[] }) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium">{label}</label>
      <select id={name} name={name} className={inputCls} {...props}>{children}</select>
      {error?.length ? <p className="mt-1 text-xs text-danger">{error[0]}</p> : null}
    </div>
  );
}

export function SubmitButton({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      className={clsx("inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-60", className)}>
      {pending && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Alert({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  return (
    <div role={kind === "error" ? "alert" : "status"}
      className={clsx("rounded-lg border px-3 py-2.5 text-sm", kind === "error" ? "border-danger/30 bg-red-50 text-danger" : "border-ok/30 bg-green-50 text-green-800")}>
      {children}
    </div>
  );
}
