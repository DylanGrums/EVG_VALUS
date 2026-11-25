import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { INFO_CATEGORIES, type PracticalInfo } from "@/db/schema";
import { Badge, Card, Field, Input, Select, Shell, Textarea } from "@/components/ui";
import { requireAdminPage } from "@/lib/orga/auth";
import { INFO_CATEGORY_LABELS, formatDateTime, toDateTimeInput } from "@/lib/orga/format";
import { listInfos } from "@/lib/orga/infos";
import { ActionForm, Collapsible, ConfirmButton, SubmitButton } from "@/app/orga/_components/forms";
import { createInfoAction, deleteInfoAction, updateInfoAction } from "../actions";

export const metadata: Metadata = { title: "Infos pratiques" };

export default async function AdminInfos() {
  await requireAdminPage();
  const infos = await listInfos(await getDb());
  return (
    <Shell>
      <Link href="/admin/orga" className="text-sm font-semibold text-brand">
        ← Orga
      </Link>
      <Card className="space-y-2">
        <h1 className="text-2xl">Infos pratiques du carnet</h1>
        <p className="text-sm text-muted">
          Contacts, numéros d’urgence, resto réservé, code du portail… Elles apparaissent dans{" "}
          <Link href="/orga/sur-place" className="text-brand underline">
            le carnet sur place
          </Link>
          , et dans le planning si une date est indiquée.
        </p>
      </Card>

      <Collapsible summary="＋ Nouvelle info" defaultOpen={infos.length === 0}>
        <ActionForm action={createInfoAction} resetOnSuccess className="space-y-4">
              <InfoFields />
              <SubmitButton>
                Ajouter
              </SubmitButton>
        </ActionForm>
      </Collapsible>

      {infos.map((info) => (
        <Card key={info.id} className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg">{info.title}</h2>
            <Badge>{INFO_CATEGORY_LABELS[info.category]}</Badge>
            {info.at && <Badge tone="brand">{formatDateTime(info.at)}</Badge>}
          </div>
          {info.body && <p className="whitespace-pre-line text-sm text-muted">{info.body}</p>}
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-brand">Modifier</summary>
            <ActionForm action={updateInfoAction} className="mt-3 space-y-4">
                  <input type="hidden" name="infoId" value={info.id} />
                  <InfoFields info={info} />
                  <SubmitButton>
                    Enregistrer
                  </SubmitButton>
            </ActionForm>
          </details>
          <ActionForm action={deleteInfoAction}>
            <input type="hidden" name="infoId" value={info.id} />
            <ConfirmButton message={`Supprimer « ${info.title} » ?`} variant="danger" className="py-1.5" type="submit">
              Supprimer
            </ConfirmButton>
          </ActionForm>
        </Card>
      ))}
    </Shell>
  );
}

function InfoFields({ info }: { info?: PracticalInfo }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Titre">
          <Input name="title" required maxLength={140} defaultValue={info?.title} placeholder="Taxi de nuit" />
        </Field>
        <Field label="Catégorie">
          <Select name="category" defaultValue={info?.category ?? "autre"}>
            {INFO_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {INFO_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Texte">
        <Textarea name="body" maxLength={4000} defaultValue={info?.body} rows={3} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Téléphone">
          <Input name="phone" type="tel" maxLength={40} defaultValue={info?.phone ?? ""} />
        </Field>
        <Field label="Date / heure (facultatif)" hint="Apparaît alors dans le planning.">
          <Input name="at" type="datetime-local" defaultValue={toDateTimeInput(info?.at)} />
        </Field>
      </div>
      <Field label="Adresse">
        <Input name="address" maxLength={300} defaultValue={info?.address ?? ""} />
      </Field>
      <Field label="Lien">
        <Input name="url" inputMode="url" autoCapitalize="none" defaultValue={info?.url ?? ""} placeholder="https://" />
      </Field>
    </div>
  );
}
