"use server";

/** Server actions admin du module orga. Chacune revérifie la session organisateur. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { TOPIC_STATUSES, type TopicStatus } from "@/db/schema";
import { requireAdmin } from "@/lib/orga/auth";
import { OrgaError, toActionState, type ActionState } from "@/lib/orga/errors";
import { createInfo, deleteInfo, updateInfo } from "@/lib/orga/infos";
import {
  createOrgaOption,
  createTopic,
  deleteComment,
  deleteOption,
  deleteTopic,
  getOption,
  moveTopic,
  setOptionSelected,
  setTopicStatus,
  updateOption,
  updateTopic,
} from "@/lib/orga/topics";
import { firstError, isUuid, parseInfoForm, parseOptionForm, parseTopicForm } from "@/lib/orga/validation";

function refresh() {
  revalidatePath("/orga", "layout");
  revalidatePath("/admin", "layout");
}

function idFrom(form: FormData, key: string) {
  const value = form.get(key);
  if (!isUuid(value)) throw new OrgaError("Élément introuvable.");
  return value;
}

/** Enveloppe commune : contrôle admin, exécution, rafraîchissement. */
async function run(fn: () => Promise<unknown>, message?: string): Promise<ActionState> {
  const state = await toActionState(async () => {
    await requireAdmin();
    await fn();
  }, message);
  refresh();
  return state;
}

// --- Sujets ---

export async function createTopicAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseTopicForm(form);
  if (!parsed.success) return { error: firstError(parsed.error) };
  let id: string;
  try {
    id = (await createTopic(await getDb(), parsed.data)).id;
  } catch (error) {
    if (error instanceof OrgaError) return { error: error.message };
    throw error;
  }
  refresh();
  redirect(`/admin/orga/sujets/${id}`);
}

export async function updateTopicAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const parsed = parseTopicForm(form);
    if (!parsed.success) throw new OrgaError(firstError(parsed.error));
    await updateTopic(await getDb(), idFrom(form, "topicId"), parsed.data);
  }, "Sujet enregistré.");
}

export async function setStatusAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const status = String(form.get("status")) as TopicStatus;
    if (!TOPIC_STATUSES.includes(status)) throw new OrgaError("Statut inconnu.");
    await setTopicStatus(await getDb(), idFrom(form, "topicId"), status);
  });
}

export async function moveTopicAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    await moveTopic(await getDb(), idFrom(form, "topicId"), form.get("direction") === "up" ? -1 : 1);
  });
}

export async function deleteTopicAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = form.get("topicId");
  if (!isUuid(id)) return { error: "Sujet introuvable." };
  await deleteTopic(await getDb(), id);
  refresh();
  redirect("/admin/orga");
}

// --- Options ---

export async function createOptionAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const parsed = parseOptionForm(form);
    if (!parsed.success) throw new OrgaError(firstError(parsed.error));
    await createOrgaOption(await getDb(), idFrom(form, "topicId"), parsed.data);
  }, "Option ajoutée.");
}

export async function updateOptionAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const parsed = parseOptionForm(form);
    if (!parsed.success) throw new OrgaError(firstError(parsed.error));
    await updateOption(await getDb(), idFrom(form, "optionId"), parsed.data);
  }, "Option enregistrée.");
}

export async function deleteOptionAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = form.get("optionId");
  if (!isUuid(id)) return { error: "Option introuvable." };
  const db = await getDb();
  const option = await getOption(db, id);
  await deleteOption(db, id);
  refresh();
  if (form.get("redirect") === "1" && option) redirect(`/admin/orga/sujets/${option.topicId}`);
  return { ok: true };
}

export async function toggleSelectedAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    await setOptionSelected(await getDb(), idFrom(form, "optionId"), form.get("selected") === "1");
  });
}

// --- Commentaires ---

export async function deleteCommentAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    await deleteComment(await getDb(), idFrom(form, "commentId"));
  });
}

// --- Infos pratiques ---

export async function createInfoAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const parsed = parseInfoForm(form);
    if (!parsed.success) throw new OrgaError(firstError(parsed.error));
    await createInfo(await getDb(), parsed.data);
  }, "Info ajoutée.");
}

export async function updateInfoAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const parsed = parseInfoForm(form);
    if (!parsed.success) throw new OrgaError(firstError(parsed.error));
    await updateInfo(await getDb(), idFrom(form, "infoId"), parsed.data);
  }, "Info enregistrée.");
}

export async function deleteInfoAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    await deleteInfo(await getDb(), idFrom(form, "infoId"));
  });
}
