"use client";

/**
 * Import du JSON de la recherche : coller ou choisir un fichier → aperçu → « Importer ».
 * Le serveur revalide le texte à chaque étape (l'aperçu n'est qu'informatif).
 */
import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Badge, Button, Textarea, cx } from "@/components/ui";
import { importAction, type ImportState } from "../actions";

export function ImportForm() {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importAction, undefined);
  const [, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  // Texte envoyé au dernier aperçu : l'aperçu ne vaut que pour ce texte.
  const [previewedText, setPreviewedText] = useState<string | null>(null);

  const send = (confirm: boolean) => {
    const data = new FormData();
    data.set("json", text);
    if (confirm) data.set("confirm", "1");
    else setPreviewedText(text);
    startTransition(() => formAction(data));
  };

  const preview = state?.step === "preview" && previewedText === text ? state : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-panel px-4 py-2.5 text-sm font-semibold hover:border-brand">
          📄 Choisir un fichier .json
          <input
            type="file"
            accept=".json,.txt,.md,application/json,text/plain"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setFileError(null);
              if (file.size > 1_000_000) {
                setFileError("Fichier trop gros (1 Mo maximum).");
                return;
              }
              setText(await file.text());
            }}
          />
        </label>
        <span className="text-sm text-muted">ou collez le JSON ci-dessous</span>
      </div>
      {fileError && <p className="text-sm font-semibold text-danger">{fileError}</p>}
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={14}
        spellCheck={false}
        placeholder='{ "villes": [ … ] }'
        className="font-mono text-xs"
        aria-label="JSON à importer"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={pending || !text.trim()} onClick={() => send(false)}>
          {pending && !preview ? "Analyse…" : "👀 Aperçu"}
        </Button>
        <Button type="button" disabled={pending || !preview} onClick={() => send(true)} title={preview ? undefined : "Faites d’abord un aperçu"}>
          {pending && preview ? "Import…" : "📥 Importer"}
        </Button>
      </div>

      {state?.step === "error" && (
        <div role="alert" className="space-y-2 rounded-2xl border border-danger/40 bg-red-50 p-4">
          <p className="font-semibold text-danger">
            {state.errors.length} erreur{state.errors.length > 1 ? "s" : ""} : rien n’a été importé.
          </p>
          <ul className="space-y-1 text-sm">
            {state.errors.slice(0, 100).map((e, i) => (
              <li key={i}>
                <strong>{e.line ? `Ligne ${e.line}` : "—"}</strong> · {e.where} : {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(state?.step === "preview" || state?.step === "done") && state.warnings.length > 0 && (
        <ul className="space-y-1 rounded-2xl bg-paper p-4 text-sm text-muted">
          {state.warnings.map((w, i) => (
            <li key={i}>⚠️ {w}</li>
          ))}
        </ul>
      )}

      {state?.step === "preview" && !preview && <p className="text-sm text-muted">Le texte a changé depuis l’aperçu : relancez « Aperçu ».</p>}

      {preview && (
        <div className="space-y-3 rounded-2xl border border-line bg-panel p-4">
          <p className="font-semibold">
            Aperçu : {preview.preview.counts.newCities} ville(s) nouvelle(s), {preview.preview.counts.existingCities} déjà présente(s) (mise à jour) ·{" "}
            {preview.preview.counts.newEvents} événement(s) nouveau(x), {preview.preview.counts.existingEvents} déjà présent(s).
          </p>
          <p className="text-xs text-muted">Les votes, commentaires, villes masquées ou retenues ne sont pas touchés. Seuls les champs présents dans le fichier sont mis à jour.</p>
          <ul className="space-y-2">
            {preview.preview.cities.map((c) => (
              <li key={`${c.name}|${c.country}`} className="rounded-xl bg-paper px-3 py-2 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {c.name} <span className="font-normal text-muted">· {c.country}</span>
                  <Badge tone={c.status === "nouvelle" ? "lime" : "neutral"}>{c.status === "nouvelle" ? "Nouvelle" : "Déjà présente"}</Badge>
                </p>
                {c.events.length > 0 && (
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {c.events.map((e) => (
                      <li key={e.name} className={cx("rounded-full px-2 py-0.5 text-xs", e.status === "nouveau" ? "bg-lime text-night" : "border border-line text-muted")}>
                        {e.status === "nouveau" ? "＋ " : "↻ "}
                        {e.name}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state?.step === "done" && (
        <p className="rounded-2xl bg-green-100 px-4 py-3 font-semibold text-ok">
          ✓ Import terminé : {state.counts.newCities} ville(s) et {state.counts.newEvents} événement(s) ajoutés, {state.counts.existingCities} ville(s) et {state.counts.existingEvents} événement(s) mis à jour.{" "}
          <Link href="/admin/idees" className="underline">
            Voir la liste
          </Link>
        </p>
      )}
    </div>
  );
}
