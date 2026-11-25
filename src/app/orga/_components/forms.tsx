"use client";

/**
 * Formulaires client du module orga (membres et admin).
 * ActionForm n'utilise pas `<form action>` directement pour éviter que React 19 vide les champs
 * en cas d'erreur : on n'efface le formulaire qu'en cas de succès (si `resetOnSuccess`).
 * L'état « en cours » est transmis par contexte à SubmitButton (utilisable depuis un composant serveur).
 */
import { createContext, use, useActionState, useEffect, useRef, useState, useTransition, type ComponentProps, type ReactNode } from "react";
import { Button, cx } from "@/components/ui";
import type { ActionState } from "@/lib/orga/errors";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

const PendingContext = createContext(false);

/** Bouton d'envoi désactivé pendant l'envoi du ActionForm parent. */
export function SubmitButton({ pendingLabel, children, disabled, ...props }: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const pending = use(PendingContext);
  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  onSuccess,
}: {
  action: Action;
  children: ReactNode | ((pending: boolean) => ReactNode);
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const lastState = useRef<ActionState>(undefined);

  useEffect(() => {
    if (state && state !== lastState.current) {
      lastState.current = state;
      if (state.ok) {
        if (resetOnSuccess) ref.current?.reset();
        onSuccess?.();
      }
    }
  }, [state, resetOnSuccess, onSuccess]);

  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(data));
      }}
    >
      <PendingContext value={pending}>{typeof children === "function" ? children(pending) : children}</PendingContext>
      {state?.error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger">
          {state.error}
        </p>
      )}
      {state?.ok && state.message && !pending && <p className="mt-2 text-sm font-semibold text-ok">{state.message}</p>}
    </form>
  );
}

/** Bouton qui demande confirmation avant d'envoyer le formulaire. */
export function ConfirmButton({ message, disabled, ...props }: ComponentProps<typeof Button> & { message: string }) {
  const pending = use(PendingContext);
  return (
    <Button
      {...props}
      disabled={pending || disabled}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    />
  );
}

/** Copie un texte dans le presse-papiers (lien du groupe). */
export function CopyButton({ text, label = "Copier le lien" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copie ce lien :", text);
        }
      }}
    >
      {copied ? "Copié ✓" : label}
    </Button>
  );
}

/** Bouton de vote (bascule) : formulaire compact avec message d'erreur. */
export function VoteButton({ action, optionId, voted, count }: { action: Action; optionId: string; voted: boolean; count: number }) {
  return (
    <ActionForm action={action}>
      {(pending) => (
        <>
          <input type="hidden" name="optionId" value={optionId} />
          <button
            type="submit"
            disabled={pending}
            aria-pressed={voted}
            className={cx(
              "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition disabled:opacity-60",
              voted ? "bg-brand text-white hover:bg-night" : "border-2 border-brand bg-panel text-brand hover:bg-brand-light",
            )}
          >
            {pending ? "…" : voted ? "✓ J’ai voté" : "Je vote pour ça"}
            <span className={cx("rounded-full px-2 py-0.5 text-xs", voted ? "bg-white/20" : "bg-brand-light")}>{count}</span>
          </button>
        </>
      )}
    </ActionForm>
  );
}

/** Formulaire repliable (« + Proposer une option », « Modifier »…). */
export function Collapsible({ summary, children, defaultOpen = false, className }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  return (
    <details className={cx("group rounded-2xl border border-line bg-panel", className)} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-4 font-semibold text-brand [&::-webkit-details-marker]:hidden">
        <span>{summary}</span>
        <span className="text-muted transition group-open:rotate-45">＋</span>
      </summary>
      <div className="border-t border-line px-5 py-4">{children}</div>
    </details>
  );
}
