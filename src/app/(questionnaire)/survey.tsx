"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Card, Field, Hero, Input, LinkButton, Textarea, cx } from "@/components/ui";
import type { PublicQuestion } from "@/lib/questionnaire/store";
import type { Answer, Draft, SaveResult } from "@/lib/questionnaire/types";

type Props = {
  /** « public » : répondant ; « organizer » : avis privé de l'organisateur (page admin). */
  mode: "public" | "organizer";
  version: number;
  questions: PublicQuestion[];
  initialDraft: Draft | null;
  initialRevision: number;
  initialSubmitted: boolean;
  save: (draft: Draft, revision: number, submit: boolean) => Promise<SaveResult>;
  startAnother?: () => Promise<void>;
  backHref?: string;
  /** Prénom du membre identifié : imposé (le serveur l'impose aussi), pas de champ à ressaisir. */
  memberName?: string;
  /** Lien « Ce n'est pas toi ? » vers l'identification. */
  changeNameHref?: string;
  /** Où aller automatiquement une fois les réponses envoyées (accueil). */
  doneHref?: string;
};

const answered = (answer?: Answer) => Boolean(answer && (answer.choices.length || answer.comment.trim()));

/** Libellé lisible d'un choix (pour la relecture). */
function choiceLabel(question: PublicQuestion, key: string) {
  if (question.matrix && /^\d+-\d+$/.test(key)) {
    const [row, reaction] = key.split("-").map(Number);
    return `${question.rows[row]} : ${question.reactions[reaction]}`;
  }
  return [...question.choices, ...question.exclusive].find(([id]) => id === key)?.[1] ?? key;
}

const optionClass = "flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-panel p-3.5 has-[:checked]:border-brand has-[:checked]:bg-brand-light";

export function Survey({ mode, version, questions, initialDraft, initialRevision, initialSubmitted, save, startAnother, backHref, memberName, changeNameHref, doneHref }: Props) {
  const organizer = mode === "organizer";
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => {
    const start = initialDraft ?? { version, name: organizer ? "Organisateur" : "", step: 0, answers: {} };
    return memberName ? { ...start, name: memberName } : start;
  });
  const [done, setDone] = useState(initialSubmitted);
  const [lost, setLost] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean }>({ text: "" });

  // Valeurs « vivantes » lues par les sauvegardes asynchrones (jamais pendant le rendu).
  const latest = useRef(draft);
  const revision = useRef(initialRevision);
  const saved = useRef(JSON.stringify(draft));
  const finished = useRef(initialSubmitted);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const last = questions.length + 1;

  // Avertit avant de quitter la page avec des modifications non enregistrées.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!finished.current && saved.current !== JSON.stringify(latest.current)) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // À chaque changement d'étape : focus sur le titre et retour en haut.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [draft.step]);

  /** Enregistre en file (une requête à la fois, révision respectée). Retourne true si tout est enregistré. */
  function persist(submit = false): Promise<boolean> {
    clearTimeout(timer.current);
    const job = queue.current.then(async () => {
      if (finished.current) return true;
      const snapshot = JSON.stringify(latest.current);
      if (!submit && snapshot === saved.current) return true;
      setStatus({ text: submit ? "Envoi en cours…" : "Sauvegarde en cours…" });
      let result: SaveResult;
      try {
        result = await save(JSON.parse(snapshot) as Draft, revision.current, submit);
      } catch {
        setStatus({ text: "Sauvegarde impossible : vérifie ta connexion, on réessaie dès que tu continues.", error: true });
        return false;
      }
      if (!result.ok) {
        if (result.code === "deleted") setLost(true);
        setStatus({ text: result.message, error: true });
        return false;
      }
      revision.current = result.revision;
      saved.current = snapshot;
      if (result.submitted) {
        finished.current = true;
        setDone(true);
        setStatus({ text: "Réponse envoyée." });
        // Retour automatique à l'accueil (qui affiche un message de remerciement).
        if (doneHref) {
          router.replace(doneHref);
          router.refresh();
        }
      } else {
        setStatus({ text: saved.current === JSON.stringify(latest.current) ? "Brouillon enregistré." : "Modifications en cours…" });
      }
      return true;
    });
    queue.current = job;
    return job;
  }

  function schedule() {
    clearTimeout(timer.current);
    setStatus({ text: "Modifications en cours…" });
    timer.current = setTimeout(() => void persist(), 650);
  }

  function update(change: (current: Draft) => Draft) {
    const next = change(latest.current);
    latest.current = next;
    setDraft(next);
    schedule();
  }

  const setAnswer = (id: string, change: (current: Answer) => Answer) =>
    update((d) => ({ ...d, answers: { ...d.answers, [id]: change(d.answers[id] ?? { choices: [], comment: "" }) } }));

  const go = (step: number) => update((d) => ({ ...d, step }));

  async function another() {
    await startAnother?.();
    window.location.reload(); // recharge à blanc : le cookie de reprise a été oublié
  }

  async function submit() {
    const missing = questions.findIndex((q) => !q.optional && !answered(latest.current.answers[q.id]));
    if (!organizer && missing >= 0) {
      go(missing + 1);
      setStatus({ text: "Renseigne cette question avant l’envoi.", error: true });
      return;
    }
    if (!organizer && !latest.current.name.trim()) {
      go(0);
      return;
    }
    const ok = await persist(!organizer);
    if (ok && organizer && backHref) router.push(backHref);
  }

  const progress = questions.filter((q) => answered(draft.answers[q.id])).length;
  const statusLine = (
    <p role="status" className={cx("min-h-5 text-sm", status.error ? "text-danger" : "text-muted")}>
      {status.text}
    </p>
  );
  const back = organizer && backHref && (
    <Link href={backHref} className="text-sm font-semibold text-brand underline">
      Retour au tableau de bord
    </Link>
  );

  if (lost) {
    return (
      <Card className="space-y-4">
        <h1 className="text-2xl">Cette participation n’existe plus</h1>
        <p className="text-muted">Elle a été retirée par l’organisateur. Tu peux recommencer un nouveau questionnaire.</p>
        <Button onClick={another}>Recommencer</Button>
      </Card>
    );
  }

  if (done) {
    return (
      <div className="space-y-5">
        <Hero kicker="Questionnaire" title="Merci pour ton avis !">
          <p>Tes réponses ont bien été transmises. Elles vont aider à imaginer un week-end qui lui ressemble.</p>
        </Hero>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <LinkButton href="/" className="sm:flex-1">
            Retour à l’accueil
          </LinkButton>
          {changeNameHref && (
            <LinkButton href={changeNameHref} variant="secondary" className="sm:flex-1">
              Ce n’est pas toi ? Changer de prénom
            </LinkButton>
          )}
        </div>
      </div>
    );
  }

  // --- Accueil et prénom ---
  if (draft.step === 0) {
    return (
      <div className="space-y-5">
        {organizer ? (
          <Hero kicker="Espace privé" title="Ajouter ton avis">
            Renseigne seulement les réponses dont tu disposes. Tu pourras les inclure dans les analyses depuis le tableau de bord.
          </Hero>
        ) : (
          <Hero kicker="Questionnaire EVG" title="Quel EVG pour Valentin ?">
            Ton avis aidera à imaginer un week-end qui lui ressemble. Réponds d’après ce que tu connais de lui et précise les points qui dépendent du contexte.
          </Hero>
        )}
        <Card>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!draft.name.trim()) {
                setStatus({ text: "Indique un prénom ou un pseudonyme.", error: true });
                return;
              }
              go(1);
            }}
          >
            <h2 ref={heading} tabIndex={-1} className="text-xl">
              {organizer ? "Réponses de l’organisateur" : "Avant de commencer"}
            </h2>
            {memberName ? (
              <p className="rounded-xl bg-paper p-3.5">
                Tu réponds en tant que <strong>{memberName}</strong>.{" "}
                {changeNameHref && (
                  <Link href={changeNameHref} className="text-sm font-semibold text-brand underline">
                    Ce n’est pas toi ?
                  </Link>
                )}
              </p>
            ) : (
              <Field label="Ton prénom ou pseudonyme">
                <Input
                  name="name"
                  maxLength={60}
                  required
                  autoComplete="nickname"
                  value={draft.name}
                  onChange={(event) => update((d) => ({ ...d, name: event.target.value }))}
                />
              </Field>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {back ||
                (memberName ? (
                  <Link href="/" className="text-sm font-semibold text-brand underline">
                    Plus tard, aller à l’accueil
                  </Link>
                ) : (
                  <span />
                ))}
              <Button type="submit">Commencer</Button>
            </div>
            {statusLine}
          </form>
        </Card>
        {!organizer && (
          <p className="text-sm text-muted">
            {questions.length} questions, environ cinq minutes. Seul l’organisateur peut lire tes réponses ; le groupe ne voit que des tendances anonymes (sans prénoms ni commentaires), à partir de trois réponses. Tu peux revenir plus tard avec ce navigateur : ton brouillon est enregistré au fur et à mesure.
          </p>
        )}
      </div>
    );
  }

  const progressBar = (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm text-muted">
        <span>Progression</span>
        <span>
          {progress} / {questions.length}
        </span>
      </div>
      <progress className="h-2 w-full accent-brand" max={questions.length} value={progress} aria-label="Questions renseignées" />
    </div>
  );

  // --- Relecture ---
  if (draft.step === last) {
    const missing = questions.find((q) => !q.optional && !answered(draft.answers[q.id]));
    return (
      <div className="space-y-5">
        {progressBar}
        <Card className="space-y-4">
          <p className="text-xs font-extrabold uppercase tracking-widest text-brand">Relecture</p>
          <h2 ref={heading} tabIndex={-1} className="text-2xl">
            Tes réponses
          </h2>
          <p>
            Prénom ou pseudonyme : <strong>{draft.name || "—"}</strong>{" "}
            {!memberName && (
              <button type="button" className="text-sm font-semibold text-brand underline" onClick={() => go(0)}>
                Modifier
              </button>
            )}
          </p>
          {!organizer && (
            <p className="text-muted">
              {missing ? "Tu peux répondre avec un choix, « Je ne sais pas » ou un commentaire seul." : "Après l’envoi, tes réponses seront transmises à l’organisateur."}
            </p>
          )}
          <ul className="divide-y divide-line">
            {questions.map((question, index) => {
              const answer = draft.answers[question.id];
              return (
                <li key={question.id} className="py-3">
                  <button type="button" className="text-left font-semibold text-brand underline" onClick={() => go(index + 1)}>
                    {index + 1}. {question.title}
                  </button>
                  <div className="mt-1 text-sm whitespace-pre-wrap text-muted">
                    {answered(answer) ? (
                      <>
                        {answer.choices.map((key) => choiceLabel(question, key)).join(" · ")}
                        {answer.comment && <div className="mt-1 text-ink">{answer.comment}</div>}
                      </>
                    ) : question.optional ? (
                      "Facultatif"
                    ) : (
                      "À renseigner"
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="secondary" onClick={() => go(last - 1)}>
              Retour
            </Button>
            <Button onClick={submit}>{organizer ? "Enregistrer mon avis" : "Envoyer mes réponses"}</Button>
          </div>
          {statusLine}
          {back}
        </Card>
      </div>
    );
  }

  // --- Une question ---
  const question = questions[draft.step - 1];
  const answer = draft.answers[question.id] ?? { choices: [], comment: "" };
  const exclusiveKeys = question.exclusive.map(([key]) => key);

  function toggle(key: string, checked: boolean) {
    setAnswer(question.id, (a) => {
      const others = a.choices.filter((c) => c !== key && !exclusiveKeys.includes(c));
      if (!checked) return { ...a, choices: others };
      return { ...a, choices: exclusiveKeys.includes(key) ? [key] : [...others, key] };
    });
  }

  function pickReaction(row: number, value: string) {
    setAnswer(question.id, (a) => {
      const others = a.choices.filter((c) => !c.startsWith(`${row}-`) && !exclusiveKeys.includes(c));
      return { ...a, choices: value ? [...others, `${row}-${value}`] : others };
    });
  }

  return (
    <div className="space-y-5">
      {progressBar}
      <Card className="space-y-5">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-brand">
            Question {draft.step} · {question.themeLabel}
          </p>
          <h2 ref={heading} tabIndex={-1} className="mt-1 text-2xl">
            {question.prompt}
          </h2>
        </div>

        {!question.optional && (
          <fieldset className="space-y-2.5">
            <legend className="mb-2 text-sm text-muted">
              {question.matrix ? "Choisis une réponse pour chaque activité que tu connais." : "Plusieurs choix possibles."}
            </legend>
            {question.matrix &&
              question.rows.map((label, row) => {
                const current = answer.choices.find((c) => c.startsWith(`${row}-`));
                return (
                  <label key={label} className="block space-y-1.5 rounded-xl border border-line bg-panel p-3.5">
                    <span className="font-medium">{label}</span>
                    <select
                      className="w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-base focus:border-brand focus:outline-none"
                      value={current ? current.split("-")[1] : ""}
                      onChange={(event) => pickReaction(row, event.target.value)}
                    >
                      <option value="">Choisir une réponse</option>
                      {question.reactions.map((reaction, j) => (
                        <option key={reaction} value={j}>
                          {reaction}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            {question.choices.map(([key, label]) => (
              <label key={key} className={optionClass}>
                <input type="checkbox" className="mt-0.5 size-5 accent-brand" checked={answer.choices.includes(key)} onChange={(event) => toggle(key, event.target.checked)} />
                <span>{label}</span>
              </label>
            ))}
            {question.exclusive.map(([key, label]) => (
              <label key={key} className={cx(optionClass, "border-dashed text-muted")}>
                <input type="checkbox" className="mt-0.5 size-5 accent-brand" checked={answer.choices.includes(key)} onChange={(event) => toggle(key, event.target.checked)} />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
        )}

        <div className="space-y-1.5">
          <label htmlFor="comment" className="text-sm font-semibold">
            {question.optional ? "Ta réponse (facultative)" : "Commentaire ou autre idée (facultatif)"}
          </label>
          {question.hint && (
            <p id="hint" className="text-sm text-muted">
              {question.hint}
            </p>
          )}
          <Textarea
            id="comment"
            rows={question.optional ? 5 : 2}
            maxLength={2000}
            aria-describedby={question.hint ? "hint" : undefined}
            value={answer.comment}
            onChange={(event) => setAnswer(question.id, (a) => ({ ...a, comment: event.target.value }))}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => go(draft.step - 1)}>
              Retour
            </Button>
            <Button variant="ghost" onClick={() => void persist().then((ok) => ok && setStatus({ text: "Brouillon enregistré." }))}>
              Enregistrer
            </Button>
          </div>
          <Button onClick={() => go(draft.step + 1)}>{draft.step === questions.length ? "Relire mes réponses" : "Continuer"}</Button>
        </div>
        {statusLine}
        {back}
      </Card>
    </div>
  );
}
