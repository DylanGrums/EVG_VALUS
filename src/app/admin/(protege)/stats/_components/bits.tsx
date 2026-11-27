import { cx } from "@/components/ui";

/** Pastille verte « en ligne » (activité dans les 5 dernières minutes). */
export function OnlineDot({ online, className }: { online: boolean; className?: string }) {
  return (
    <span
      className={cx("inline-block size-2.5 shrink-0 rounded-full", online ? "bg-green-500 ring-2 ring-green-200" : "bg-line", className)}
      title={online ? "En ligne (actif dans les 5 dernières minutes)" : "Hors ligne"}
      aria-label={online ? "En ligne" : "Hors ligne"}
      role="img"
    />
  );
}

/** Petit chiffre clé. */
export function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl bg-paper px-4 py-3">
      <p className="text-2xl font-bold text-ink">{value}</p>
      <p className="text-sm font-semibold text-muted">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
