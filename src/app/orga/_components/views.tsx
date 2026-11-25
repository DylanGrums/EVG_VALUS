/** Composants d'affichage (serveur) partagés entre l'espace membres et l'admin orga. */
import type { ReactNode } from "react";
import type { TopicOption, TopicType } from "@/db/schema";
import { Badge, Field, Input, Textarea, cx } from "@/components/ui";
import type { ActionState } from "@/lib/orga/errors";
import { formatCommentDate, formatDateTime, formatEuros, formatTime, linkLabel, mapsUrl, toDateTimeInput, dayKey } from "@/lib/orga/format";
import type { MemberPhase, PriceInfo } from "@/lib/orga/rules";
import { PHASE_LABELS } from "@/lib/orga/rules";
import type { CommentView } from "@/lib/orga/topics";
import { ActionForm, ConfirmButton, SubmitButton } from "./forms";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

const PHASE_TONES: Record<MemberPhase, "neutral" | "brand" | "ok" | "danger" | "lime"> = {
  a_venir: "neutral",
  ouvert: "lime",
  vote_termine: "brand",
  clos: "brand",
  decide: "ok",
};

export function PhaseBadge({ phase }: { phase: MemberPhase }) {
  return <Badge tone={PHASE_TONES[phase]}>{phase === "decide" ? "✓ " : ""}{PHASE_LABELS[phase]}</Badge>;
}

export function ExternalLink({ href, children, className }: { href: string; children?: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cx("font-semibold text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand", className)}>
      {children ?? linkLabel(href)} ↗
    </a>
  );
}

export function MapsLink({ address }: { address: string }) {
  return (
    <span>
      {address} · <ExternalLink href={mapsUrl(address)}>Maps</ExternalLink>
    </span>
  );
}

/** Prix par personne mis en avant, total en dessous. */
export function PriceBlock({ price, emphasize }: { price: PriceInfo; emphasize?: boolean }) {
  if (price.perPerson == null && price.total == null) return null;
  return (
    <div className={cx("rounded-xl px-3 py-2", emphasize ? "bg-lime text-night" : "bg-paper")}>
      {price.perPerson != null ? (
        <p className="leading-tight">
          <span className={cx("font-extrabold", emphasize ? "text-2xl" : "text-lg")}>{formatEuros(price.perPerson)}</span>
          <span className="text-sm"> / pers.</span>
        </p>
      ) : (
        <p className="text-sm">Prix par personne : ajoute des participants pour le calculer</p>
      )}
      {price.total != null && (
        <p className="text-xs opacity-80">
          {price.totalEstimated ? "≈ " : ""}
          {formatEuros(price.total)} au total
        </p>
      )}
    </div>
  );
}

/** Plage de dates d'une option, avec des libellés adaptés au type de sujet. */
export function DateRange({ type, startsAt, endsAt }: { type: TopicType; startsAt: string | null; endsAt: string | null }) {
  if (!startsAt && !endsAt) return null;
  const [from, to] = type === "logement" ? ["Arrivée", "Départ"] : type === "transport" ? ["Départ", "Arrivée"] : ["Début", "Fin"];
  if (startsAt && endsAt && dayKey(startsAt) === dayKey(endsAt) && type !== "logement") {
    return <span>🕑 {formatDateTime(startsAt)} → {formatTime(endsAt)}</span>;
  }
  return (
    <span className="space-y-0.5">
      {startsAt && <span className="block">🕑 {from} : {formatDateTime(startsAt)}</span>}
      {endsAt && <span className="block">🕑 {to} : {formatDateTime(endsAt)}</span>}
    </span>
  );
}

/** Détails pratiques d'une option (adresse, dates, horaires, lien, notes). */
export function OptionFacts({ option, type }: { option: TopicOption; type: TopicType }) {
  const rows: ReactNode[] = [];
  if (option.address) rows.push(<span key="a">📍 <MapsLink address={option.address} /></span>);
  if (option.startsAt || option.endsAt) rows.push(<DateRange key="d" type={type} startsAt={option.startsAt} endsAt={option.endsAt} />);
  if (option.openingHours) rows.push(<span key="h">⏰ {option.openingHours}</span>);
  if (option.url) rows.push(<span key="u">🔗 <ExternalLink href={option.url} /></span>);
  if (option.practicalNotes) rows.push(<span key="n" className="whitespace-pre-line">ℹ️ {option.practicalNotes}</span>);
  if (!rows.length) return null;
  return <div className="space-y-1.5 text-sm text-muted [&>span]:block">{rows}</div>;
}

export function CommentList({ comments, deleteAction }: { comments: CommentView[]; deleteAction?: Action }) {
  if (!comments.length) return <p className="text-sm text-muted">Pas encore de commentaire.</p>;
  return (
    <ul className="space-y-3">
      {comments.map((c) => (
        <li key={c.id} className="rounded-xl bg-paper px-3.5 py-2.5">
          <div className="flex items-baseline justify-between gap-2 text-xs text-muted">
            <span>
              <strong className="text-ink">{c.authorName ?? "Quelqu’un"}</strong> · {formatCommentDate(c.createdAt)}
            </span>
            {deleteAction && (
              <ActionForm action={deleteAction}>
                <input type="hidden" name="commentId" value={c.id} />
                <ConfirmButton message="Supprimer ce commentaire ?" variant="ghost" className="px-2 py-1 text-xs" type="submit">
                  Supprimer
                </ConfirmButton>
              </ActionForm>
            )}
          </div>
          <p className="mt-1 whitespace-pre-line break-words text-sm">{c.body}</p>
        </li>
      ))}
    </ul>
  );
}

export function CommentForm({ action, topicId, optionId, placeholder = "Ton avis, une question, une vanne…" }: { action: Action; topicId: string; optionId?: string; placeholder?: string }) {
  return (
    <ActionForm action={action} resetOnSuccess className="space-y-2">
          <input type="hidden" name="topicId" value={topicId} />
          {optionId && <input type="hidden" name="optionId" value={optionId} />}
          <Textarea name="body" required maxLength={2000} rows={2} placeholder={placeholder} className="min-h-16" aria-label="Commentaire" />
          <SubmitButton pendingLabel="Envoi…">Commenter</SubmitButton>
    </ActionForm>
  );
}

const centsToInput = (cents: number | null | undefined) => (cents == null ? "" : (cents / 100).toString().replace(".", ","));

/** Champs d'une option, partagés par « proposer une option » (membres) et l'admin. */
export function OptionFields({ option, type, detailsOpen }: { option?: TopicOption; type: TopicType; detailsOpen?: boolean }) {
  const [startLabel, endLabel] = type === "logement" ? ["Check-in", "Check-out"] : type === "transport" ? ["Départ", "Arrivée"] : ["Début", "Fin"];
  return (
    <div className="space-y-4">
      <Field label="Titre">
        <Input name="title" required maxLength={140} defaultValue={option?.title} placeholder={type === "destination" ? "Lisbonne" : type === "logement" ? "Maison avec piscine à Cascais" : "Karting"} />
      </Field>
      <Field label="Description" hint="Pourquoi c'est bien, ce qui est inclus…">
        <Textarea name="description" maxLength={4000} defaultValue={option?.description} rows={3} />
      </Field>
      <Field label="Lien" hint="Annonce Airbnb, site, billets…">
        <Input name="url" inputMode="url" autoCapitalize="none" defaultValue={option?.url ?? ""} placeholder="https://" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prix total (€)" hint="Le prix par personne est calculé tout seul.">
          <Input name="priceTotal" inputMode="decimal" defaultValue={centsToInput(option?.priceTotalCents)} placeholder="1200" />
        </Field>
        <Field label="…ou prix par personne (€)">
          <Input name="pricePerPerson" inputMode="decimal" defaultValue={centsToInput(option?.pricePerPersonCents)} placeholder="80" />
        </Field>
      </div>
      <details className="rounded-xl border border-line px-4 py-3" open={detailsOpen}>
        <summary className="cursor-pointer text-sm font-semibold text-brand">Adresse, dates, horaires, photo…</summary>
        <div className="mt-4 space-y-4">
          <Field label="Adresse">
            <Input name="address" maxLength={300} defaultValue={option?.address ?? ""} autoComplete="off" />
          </Field>
          <Field label="Image (URL)" hint="Lien direct vers une photo.">
            <Input name="imageUrl" inputMode="url" autoCapitalize="none" defaultValue={option?.imageUrl ?? ""} placeholder="https://" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={startLabel}>
              <Input name="startsAt" type="datetime-local" defaultValue={toDateTimeInput(option?.startsAt)} />
            </Field>
            <Field label={endLabel}>
              <Input name="endsAt" type="datetime-local" defaultValue={toDateTimeInput(option?.endsAt)} />
            </Field>
          </div>
          <Field label="Horaires d’ouverture" hint="Ex. 10h–19h, fermé le lundi">
            <Input name="openingHours" maxLength={300} defaultValue={option?.openingHours ?? ""} />
          </Field>
          <Field label="Infos pratiques" hint="Code d’accès, consignes, qui a réservé…">
            <Textarea name="practicalNotes" maxLength={2000} defaultValue={option?.practicalNotes ?? ""} rows={2} />
          </Field>
        </div>
      </details>
    </div>
  );
}

/** Page neutre affichée à qui n'a pas le bon lien : ne révèle rien du contenu. */
export function NeutralPage({ children }: { children?: ReactNode }) {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-4 py-10 text-center">
      <div className="space-y-3">
        <p className="text-5xl" aria-hidden>
          🔒
        </p>
        <h1 className="text-2xl">Rien à voir ici</h1>
        <p className="text-muted">Ce lien n’est pas (ou plus) valide.</p>
        {children}
      </div>
    </main>
  );
}
