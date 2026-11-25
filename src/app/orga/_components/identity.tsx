"use client";

/**
 * Identification des membres par prénom.
 * - Premier passage : la personne entre son prénom (inscription).
 * - Prénom déjà pris : fenêtre « C'est toi ? » → reprendre (questionnaire ou orga) ou ajouter une initiale.
 * - « J'ai déjà renseigné mon prénom » : elle le choisit dans la liste.
 * - Le prénom choisi est mémorisé dans le localStorage : au retour (cookie perdu, autre navigateur
 *   du même téléphone…), on la reconnaît automatiquement.
 */
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, cx } from "@/components/ui";
import { chooseParticipantAction, registerAction, restoreParticipantAction, type IdentityState } from "../actions";

const STORAGE_KEY = "evg-participant";
type Person = { id: string; name: string };

function readRemembered(): Person | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return value && typeof value.id === "string" && typeof value.name === "string" ? value : null;
  } catch {
    return null;
  }
}

function remember(participant: Person) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: participant.id, name: participant.name }));
  } catch {
    // Navigation privée ou stockage indisponible : le cookie suffit.
  }
}

/** Placé dans le layout membre : garde le localStorage à jour avec le prénom de la session. */
export function RememberMe({ id, name }: Person) {
  useEffect(() => remember({ id, name }), [id, name]);
  return null;
}

export function IdentityPicker({ people, currentId, autoRestore }: { people: Person[]; currentId?: string; autoRestore: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"nouveau" | "liste">(currentId ? "liste" : "nouveau");
  const [restoring, setRestoring] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Person | null>(null);
  const [name, setName] = useState("");
  const [resuming, setResuming] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const tried = useRef(false);

  function finish(state: IdentityState, target = "/orga") {
    if (state?.ok) {
      remember(state.participant);
      router.replace(target);
      router.refresh();
    }
    return state;
  }

  const [registerState, register, registering] = useActionState(
    async (prev: IdentityState, form: FormData) => {
      const state = await registerAction(prev, form);
      if (state && !state.ok && state.taken) setConflict(state.taken);
      return finish(state, "/orga/bienvenue");
    },
    undefined,
  );
  const [chooseState, choose, choosing] = useActionState(
    async (prev: IdentityState, form: FormData) => finish(await chooseParticipantAction(prev, form)),
    undefined,
  );

  // Reprise automatique : prénom mémorisé sur ce téléphone et toujours dans la liste.
  useEffect(() => {
    if (!autoRestore || tried.current) return;
    tried.current = true;
    const saved = readRemembered();
    const match = saved ? people.find((p) => p.id === saved.id) : undefined;
    if (!match) return;
    setRestoring(match.name); // eslint-disable-line react-hooks/set-state-in-effect
    restoreParticipantAction(match.id).then((state) => {
      if (state?.ok) finish(state);
      else setRestoring(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRestore, people]);

  /** « C'est moi » : on reprend la fiche existante, puis questionnaire ou orga. */
  async function resumeAs(target: "/questionnaire" | "/orga") {
    if (!conflict) return;
    setResuming(true);
    const state = await restoreParticipantAction(conflict.id);
    setResuming(false);
    if (state?.ok) {
      setConflict(null);
      finish(state, target);
    }
  }

  /** « Ce n'est pas moi » : on garde le prénom et on place le curseur pour ajouter une initiale. */
  function addInitial() {
    if (!conflict) return;
    setName(`${conflict.name} `);
    setConflict(null);
    requestAnimationFrame(() => {
      const input = nameInput.current;
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    });
  }

  if (restoring) {
    return <p className="rounded-xl bg-brand-light p-4 font-semibold text-brand">Content de te revoir, {restoring} ! 👋</p>;
  }

  const tab = (value: "nouveau" | "liste", label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={cx(
        "flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition",
        mode === value ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex gap-1 rounded-2xl bg-paper p-1">
        {tab("nouveau", "Première fois")}
        {tab("liste", "J’ai déjà renseigné mon prénom")}
      </div>

      {mode === "nouveau" ? (
        <form action={register} className="space-y-3">
          <Field label="Ton prénom" hint="Il apparaîtra sur tes votes et tes commentaires.">
            <Input
              ref={nameInput}
              name="name"
              required
              maxLength={40}
              autoComplete="given-name"
              autoFocus
              placeholder="Ex. Thomas"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          {registerState && !registerState.ok && (
            <div className="space-y-2 text-sm text-danger">
              {registerState.taken ? (
                <p>
                  « {registerState.taken.name} » est déjà inscrit.{" "}
                  <button type="button" className="font-semibold text-brand underline" onClick={() => setConflict(registerState.taken ?? null)}>
                    C’est toi ?
                  </button>
                </p>
              ) : (
                <p>{registerState.error}</p>
              )}
            </div>
          )}
          <Button type="submit" disabled={registering} className="w-full sm:w-auto">
            {registering ? "Un instant…" : "C’est parti"}
          </Button>
        </form>
      ) : people.length === 0 ? (
        <p className="rounded-xl bg-paper p-4 text-muted">
          Personne n’est encore inscrit. Choisis « Première fois » pour entrer ton prénom.
        </p>
      ) : (
        <form action={choose} className="space-y-3">
          <p className="text-sm text-muted">Touche ton prénom :</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {people.map((p) => (
              <button
                key={p.id}
                type="submit"
                name="participantId"
                value={p.id}
                disabled={choosing}
                className={cx(
                  "min-h-14 rounded-2xl border-2 px-3 text-base font-bold transition disabled:opacity-60",
                  p.id === currentId ? "border-brand bg-brand text-white" : "border-line bg-panel hover:border-brand hover:bg-brand-light",
                )}
              >
                {p.name}
                {p.id === currentId && <span className="block text-xs font-medium opacity-80">c’est toi</span>}
              </button>
            ))}
          </div>
          {chooseState && !chooseState.ok && <p className="text-sm text-danger">{chooseState.error}</p>}
        </form>
      )}

      {conflict && (
        <NameTakenDialog
          name={conflict.name}
          busy={resuming}
          onResume={resumeAs}
          onAddInitial={addInitial}
          onClose={() => setConflict(null)}
        />
      )}
    </div>
  );
}

/** Fenêtre affichée quand le prénom saisi est déjà dans la liste. */
function NameTakenDialog({
  name,
  busy,
  onResume,
  onAddInitial,
  onClose,
}: {
  name: string;
  busy: boolean;
  onResume: (target: "/questionnaire" | "/orga") => void;
  onAddInitial: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-labelledby="name-taken-title"
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-3xl bg-panel p-0 text-ink shadow-xl backdrop:bg-night/60"
    >
      <div className="space-y-5 p-6">
        <div className="space-y-1">
          <h2 id="name-taken-title" className="text-2xl">
            « {name} » est déjà inscrit
          </h2>
          <p className="text-muted">C’est toi ? Reprends là où tu en étais. Sinon, ajoute l’initiale de ton nom.</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-extrabold uppercase tracking-widest text-brand">C’est moi, {name}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" disabled={busy} onClick={() => onResume("/questionnaire")}>
              📝 Reprendre le questionnaire
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => onResume("/orga")}>
              🗳️ Aller sur l’orga
            </Button>
          </div>
        </div>

        <div className="space-y-2 border-t border-line pt-4">
          <p className="text-xs font-extrabold uppercase tracking-widest text-muted">Ce n’est pas moi</p>
          <Button type="button" variant="ghost" disabled={busy} onClick={onAddInitial} className="w-full">
            Ajouter une initiale (ex. « {name} B. »)
          </Button>
        </div>
      </div>
    </dialog>
  );
}
