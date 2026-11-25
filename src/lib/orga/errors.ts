/** Erreur métier affichable telle quelle à l'utilisateur (message en français). */
export class OrgaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrgaError";
  }
}

export type ActionState = { error?: string; ok?: boolean; message?: string } | undefined;

/** Exécute une mutation et convertit les OrgaError en état de formulaire. Les autres erreurs remontent. */
export async function toActionState(fn: () => Promise<unknown>, message?: string): Promise<ActionState> {
  try {
    await fn();
    return { ok: true, message };
  } catch (error) {
    if (error instanceof OrgaError) return { error: error.message };
    throw error;
  }
}
