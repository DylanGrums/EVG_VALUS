import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/session";
import { Shell, SiteHeader } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata = { title: "Connexion organisateur" };

export default async function Page({ searchParams }: PageProps<"/admin/connexion">) {
  if (await isAdmin()) redirect("/admin");
  const { next } = await searchParams;
  return (
    <>
      <SiteHeader />
      <Shell>
        <LoginForm next={typeof next === "string" ? next : ""} />
      </Shell>
    </>
  );
}
