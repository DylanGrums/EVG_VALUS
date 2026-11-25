import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { Card, Shell } from "@/components/ui";
import { requireAdminPage } from "@/lib/orga/auth";
import { getOption, getTopic } from "@/lib/orga/topics";
import { isUuid } from "@/lib/orga/validation";
import { ActionForm, ConfirmButton, SubmitButton } from "@/app/orga/_components/forms";
import { OptionFields } from "@/app/orga/_components/views";
import { deleteOptionAction, updateOptionAction } from "../../actions";

export const metadata: Metadata = { title: "Modifier une option" };

export default async function AdminOption({ params }: PageProps<"/admin/orga/options/[id]">) {
  await requireAdminPage();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const option = await getOption(db, id);
  const topic = option && (await getTopic(db, option.topicId));
  if (!option || !topic) notFound();

  return (
    <Shell>
      <Link href={`/admin/orga/sujets/${topic.id}`} className="text-sm font-semibold text-brand">
        ← {topic.title}
      </Link>
      <Card className="space-y-4">
        <h1 className="text-2xl">Modifier « {option.title} »</h1>
        <ActionForm action={updateOptionAction} className="space-y-4">
              <input type="hidden" name="optionId" value={option.id} />
              <OptionFields option={option} type={topic.type} detailsOpen />
              <SubmitButton>
                Enregistrer
              </SubmitButton>
        </ActionForm>
      </Card>
      <ActionForm action={deleteOptionAction}>
        <input type="hidden" name="optionId" value={option.id} />
        <input type="hidden" name="redirect" value="1" />
        <ConfirmButton message="Supprimer cette option et ses votes ?" variant="danger" type="submit">
          Supprimer l’option
        </ConfirmButton>
      </ActionForm>
    </Shell>
  );
}
