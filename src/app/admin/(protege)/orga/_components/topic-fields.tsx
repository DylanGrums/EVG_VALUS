import type { DecisionTopic } from "@/db/schema";
import { TOPIC_TYPES, VOTE_MODES } from "@/db/schema";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { TOPIC_TYPE_LABELS, VOTE_MODE_LABELS, toDateTimeInput } from "@/lib/orga/format";

/** Champs d'un sujet de décision (création et édition). */
export function TopicFields({ topic, topics }: { topic?: DecisionTopic; topics: DecisionTopic[] }) {
  const others = topics.filter((t) => t.id !== topic?.id);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type">
          <Select name="type" defaultValue={topic?.type ?? "autre"}>
            {TOPIC_TYPES.map((t) => (
              <option key={t} value={t}>
                {TOPIC_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Titre">
          <Input name="title" required maxLength={120} defaultValue={topic?.title} placeholder="Où part-on ?" />
        </Field>
      </div>
      <Field label="Description">
        <Textarea name="description" maxLength={4000} defaultValue={topic?.description} rows={3} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mode de vote">
          <Select name="voteMode" defaultValue={topic?.voteMode ?? "unique"}>
            {VOTE_MODES.map((m) => (
              <option key={m} value={m}>
                {VOTE_MODE_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date limite (facultatif)" hint="Heure de Paris. Après, les votes sont figés.">
          <Input name="deadline" type="datetime-local" defaultValue={toDateTimeInput(topic?.deadline)} />
        </Field>
      </div>
      <Field label="Dépend de (facultatif)" hint="Le sujet reste « à venir » tant que celui-ci n'est pas décidé.">
        <Select name="dependsOnId" defaultValue={topic?.dependsOnId ?? ""}>
          <option value="">— Aucun —</option>
          {others.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex items-center gap-3 text-sm font-semibold">
        <input type="checkbox" name="allowProposals" defaultChecked={topic?.allowProposals ?? true} className="size-5 accent-brand" />
        Les membres peuvent proposer des options
      </label>
    </div>
  );
}
