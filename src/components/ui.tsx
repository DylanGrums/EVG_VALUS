/**
 * Composants d'interface partagés (Tailwind). À réutiliser dans tous les modules
 * pour garder une apparence cohérente. Mobile d'abord.
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-night",
  secondary: "bg-panel text-ink border border-line hover:border-brand",
  ghost: "text-brand hover:bg-brand-light",
  danger: "bg-panel text-danger border border-danger/40 hover:bg-danger hover:text-white",
};
const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed";

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx(buttonBase, variants[variant], className)} {...props} />;
}

export function LinkButton({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(buttonBase, variants[variant], className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cx("rounded-2xl border border-line bg-panel p-5 sm:p-7", className)} {...props} />;
}

export function Hero({ kicker, title, children }: { kicker?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="rounded-3xl bg-night p-6 text-white sm:p-10">
      {kicker && <p className="mb-2 text-xs font-extrabold uppercase tracking-widest text-lime">{kicker}</p>}
      <h1 className="text-3xl sm:text-5xl">{title}</h1>
      {children && <div className="mt-4 max-w-prose text-[#e1d7ee]">{children}</div>}
    </header>
  );
}

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: "neutral" | "brand" | "ok" | "danger" | "lime" }) {
  const tones = {
    neutral: "bg-paper text-muted border border-line",
    brand: "bg-brand-light text-brand",
    ok: "bg-green-100 text-ok",
    danger: "bg-red-50 text-danger",
    lime: "bg-lime text-night",
  };
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)} {...props} />;
}

const fieldBase = "w-full rounded-xl border border-line bg-panel px-3.5 py-2.5 text-base text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(fieldBase, className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(fieldBase, "min-h-24", className)} {...props} />;
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(fieldBase, className)} {...props} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** Conteneur de page : étroit par défaut, large pour les tableaux de bord. */
export function Shell({ wide, className, ...props }: ComponentProps<"main"> & { wide?: boolean }) {
  return <main className={cx("mx-auto w-full px-4 py-6 sm:py-10", wide ? "max-w-6xl" : "max-w-2xl", "space-y-5", className)} {...props} />;
}

export function SiteHeader({ children, href = "/" }: { children?: ReactNode; href?: string }) {
  return (
    <div className="border-b border-line bg-panel">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href={href} className="flex items-center gap-2 font-extrabold">
          <span className="grid size-9 place-items-center rounded-xl bg-night text-lg text-lime">V</span>
          <span className="text-sm text-muted">Le carnet de l’EVG</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm">{children}</nav>
      </div>
    </div>
  );
}

export { cx };
