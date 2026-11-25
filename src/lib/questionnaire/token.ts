import { createHash, randomBytes } from "node:crypto";

/** Nom du cookie httpOnly qui garde le jeton de reprise du répondant (jamais lisible côté navigateur). */
export const PARTICIPATION_COOKIE = "evg_reponse";

const TOKEN_FORMAT = /^[a-f0-9]{64}$/;

export const newToken = () => randomBytes(32).toString("hex");
export const isToken = (value: unknown): value is string => typeof value === "string" && TOKEN_FORMAT.test(value);
/** L'identifiant en base est l'empreinte du jeton : une fuite de la base ne permet pas de reprendre une participation. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
