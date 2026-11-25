import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";

/**
 * Sessions par cookies signés (JWT HS256).
 * - evg_admin  : organisateur connecté via ADMIN_PASSWORD (/admin/connexion).
 * - evg_member : membre du groupe entré par le lien secret /rejoindre/<GROUP_ACCESS_CODE>,
 *                avec participantId une fois le prénom choisi.
 * Valentin n'a jamais de lien : rien de l'orga n'est accessible sans evg_member ou evg_admin.
 */
const ADMIN_COOKIE = "evg_admin";
const MEMBER_COOKIE = "evg_member";
const MAX_AGE = 60 * 60 * 24 * 180; // 180 jours

/** Variable d'environnement sans espaces ni retours à la ligne parasites (copier-coller, stdin…). */
function env(name: string) {
  return process.env[name]?.trim() || undefined;
}

function secret() {
  const value = env("SESSION_SECRET");
  if (!value) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET manquant");
    return new TextEncoder().encode("dev-only-secret-ne-pas-utiliser-en-prod");
  }
  return new TextEncoder().encode(value);
}

async function sign(payload: Record<string, unknown>) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(secret());
}

async function read<T>(name: string): Promise<T | null> {
  const token = (await cookies()).get(name)?.value;
  if (!token) return null;
  try {
    return (await jwtVerify(token, secret())).payload as T;
  } catch {
    return null;
  }
}

async function write(name: string, payload: Record<string, unknown>) {
  (await cookies()).set(name, await sign(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** Comparaison en temps constant de deux secrets. */
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// --- Organisateurs ---

export function adminPassword() {
  const value = env("ADMIN_PASSWORD");
  if (!value && process.env.NODE_ENV === "production") throw new Error("ADMIN_PASSWORD manquant");
  return value || "organisateur-local";
}

export async function isAdmin() {
  return (await read<{ admin?: boolean }>(ADMIN_COOKIE))?.admin === true;
}
export async function startAdminSession() {
  await write(ADMIN_COOKIE, { admin: true });
}
export async function endAdminSession() {
  (await cookies()).delete(ADMIN_COOKIE);
}

// --- Membres du groupe (participants de l'EVG) ---

export type MemberSession = { member: true; participantId?: string };

export function groupAccessCode() {
  const value = env("GROUP_ACCESS_CODE");
  if (!value && process.env.NODE_ENV === "production") throw new Error("GROUP_ACCESS_CODE manquant");
  return value || "local";
}

export async function getMember() {
  const session = await read<MemberSession>(MEMBER_COOKIE);
  return session?.member ? session : null;
}
export async function setMember(participantId?: string) {
  await write(MEMBER_COOKIE, participantId ? { member: true, participantId } : { member: true });
}
export async function endMemberSession() {
  (await cookies()).delete(MEMBER_COOKIE);
}
