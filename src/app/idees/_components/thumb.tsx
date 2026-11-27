"use client";

import { cx } from "@/components/ui";
import { ActionForm } from "@/app/orga/_components/forms";
import type { ActionState } from "@/lib/orga/errors";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

/** Bouton 👍 (bascule) d'une ville ou d'un événement. On peut soutenir autant d'idées qu'on veut. */
export function ThumbButton({ action, name, id, voted, count, compact }: { action: Action; name: "cityId" | "eventId"; id: string; voted: boolean; count: number; compact?: boolean }) {
  return (
    <ActionForm action={action}>
      {(pending) => (
        <>
          <input type="hidden" name={name} value={id} />
          <button
            type="submit"
            disabled={pending}
            aria-pressed={voted}
            title={voted ? "Retirer mon 👍" : "Je soutiens cette idée"}
            className={cx(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition disabled:opacity-60",
              compact ? "" : "w-full",
              voted ? "bg-brand text-white hover:bg-night" : "border-2 border-brand bg-panel text-brand hover:bg-brand-light",
            )}
          >
            <span aria-hidden>👍</span>
            {pending ? "…" : voted ? "Je soutiens" : compact ? "" : "Ça me tente"}
            <span className={cx("rounded-full px-2 py-0.5 text-xs", voted ? "bg-white/20" : "bg-brand-light")}>{count}</span>
          </button>
        </>
      )}
    </ActionForm>
  );
}
