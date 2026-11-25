"use server";

import { redirect } from "next/navigation";
import { adminPassword, endAdminSession, safeEqual, startAdminSession } from "@/lib/session";

export async function login(_: { error?: string } | undefined, form: FormData) {
  const password = String(form.get("password") ?? "");
  if (!safeEqual(password, adminPassword())) return { error: "Mot de passe incorrect." };
  await startAdminSession();
  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function logout() {
  await endAdminSession();
  redirect("/admin/connexion");
}
