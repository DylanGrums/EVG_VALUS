"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import type { EditorQuestion } from "@/lib/questionnaire/definition";
import { themes } from "@/lib/questionnaire/types";
import { publishAction } from "../actions";

/**
 * Éditeur versionné : ajouter, modifier, masquer et déplacer des questions, puis publier une nouvelle version.
 * Les brouillons et réponses existants gardent leur version ; une question jamais supprimée, seulement masquée.
 */
export function QuestionEditor({ version, initial }: { version: number; initial: EditorQuestion[] }) {
  const router = useRouter();
  const [questions, setQuestions] = useState(initial);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ text: string; error?: boolean }>({ text: "" });

  const patch = (index: number, change: Partial<EditorQuestion>) => setQuestions((list) => list.map((q, i) => (i === index ? { ...q, ...change } : q)));
  const move = (index: number, step: number) =>
    setQuestions((list) => {
      const target = index + step;
      if (target < 0 || target >= list.length) return list;
      const copy = [...list];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });

  function publish() {
    setMessage({ text: "" });
    start(async () => {
      const result = await publishAction(version, questions.map((q) => ({ ...q, labels: q.labels.map((l) => l.trim()).filter(Boolean) })));
      if (result.ok) {
        setMessage({ text: `Version ${result.version} publiée.` });
        router.refresh();
      } else {
        setMessage({ text: result.message, error: true });
      }
    });
  }

  return (
    <Card className="space-y-4">
      <div>
        <h1 className="text-2xl">Modifier le questionnaire</h1>
        <p className="text-sm text-muted">Version {version} en ligne. Les brouillons et les réponses existantes gardent leur version ; les analyses séparent les questions modifiées.</p>
      </div>
      <div className="space-y-2">
        {questions.map((question, index) => (
          <details key={String(question.id)} className="rounded-xl border border-line bg-panel p-3.5">
            <summary className="cursor-pointer font-semibold">
              {index + 1}. {question.title || "Nouvelle question"}
              {question.hidden && <span className="ml-2 text-xs font-normal text-danger">(masquée)</span>}
            </summary>
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" disabled={index === 0} onClick={() => move(index, -1)}>
                  Monter
                </Button>
                <Button variant="secondary" disabled={index === questions.length - 1} onClick={() => move(index, 1)}>
                  Descendre
                </Button>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-brand" checked={Boolean(question.hidden)} onChange={(event) => patch(index, { hidden: event.target.checked })} />
                  Masquer
                </label>
              </div>
              <Field label="Titre">
                <Input maxLength={160} value={question.title} onChange={(event) => patch(index, { title: event.target.value })} />
              </Field>
              <Field label="Question">
                <Textarea rows={2} maxLength={600} value={question.prompt} onChange={(event) => patch(index, { prompt: event.target.value })} />
              </Field>
              <Field label="Précision facultative">
                <Input maxLength={600} value={question.hint} onChange={(event) => patch(index, { hint: event.target.value })} />
              </Field>
              <Field label="Thème">
                <Select value={question.theme} onChange={(event) => patch(index, { theme: event.target.value })}>
                  {Object.entries(themes).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={question.kind === "matrix" ? "Activités, une par ligne" : "Choix, un par ligne"}
                hint={question.kind === "matrix" ? undefined : "Laisse vide pour une réponse libre facultative. « Aucune de ces propositions » et « Je ne sais pas » sont ajoutés automatiquement."}
              >
                <Textarea
                  rows={5}
                  value={question.labels.join("\n")}
                  onChange={(event) => patch(index, { labels: event.target.value.split("\n") })}
                  onBlur={(event) => patch(index, { labels: event.target.value.split("\n").map((l) => l.trim()).filter(Boolean) })}
                />
              </Field>
            </div>
          </details>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          onClick={() =>
            setQuestions((list) => [...list, { id: `q-${crypto.randomUUID()}`, theme: "experiences", title: "", prompt: "", hint: "", labels: [] }])
          }
        >
          Ajouter une question
        </Button>
        <Button onClick={publish} disabled={pending}>
          Publier les modifications
        </Button>
      </div>
      <p role="status" className={message.error ? "text-sm text-danger" : "text-sm text-ok"}>
        {message.text}
      </p>
    </Card>
  );
}
