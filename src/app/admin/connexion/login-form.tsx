"use client";

import { useActionState } from "react";
import { login } from "../actions";
import { Button, Card, Field, Input } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <Card>
      <h1 className="mb-1 text-2xl">Espace organisateurs</h1>
      <p className="mb-5 text-muted">Réservé aux organisateurs de l’EVG.</p>
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Mot de passe">
          <Input type="password" name="password" required autoComplete="current-password" autoFocus />
        </Field>
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <Button type="submit" disabled={pending}>Se connecter</Button>
      </form>
    </Card>
  );
}
