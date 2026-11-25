"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button, Select } from "@/components/ui";
import { KNOWLEDGE_LEVELS, knowledgeLabels, type KnowledgeLevel } from "@/lib/questionnaire/types";
import { deleteParticipationAction, setExcludedAction, setKnowledgeAction } from "../actions";

/** Rafraîchit les données du tableau de bord toutes les 15 s (onglet visible uniquement). */
export function AutoRefresh({ every = 15000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) router.refresh();
    };
    const timer = window.setInterval(tick, every);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, every]);
  return null;
}

/** Lien public du questionnaire, à copier. */
export function CopyLink({ url }: { url: string }) {
  const [message, setMessage] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input readOnly aria-label="Lien public du questionnaire" value={url} onFocus={(event) => event.currentTarget.select()} className="min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 py-2.5 text-sm" />
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setMessage("Lien copié.");
            } catch {
              setMessage("Sélectionne le lien pour le copier.");
            }
          }}
        >
          Copier le lien
        </Button>
        <a href={url} target="_blank" rel="noopener" className="inline-flex items-center px-2 text-sm font-semibold text-brand underline">
          Ouvrir
        </a>
      </div>
      <p role="status" className="min-h-4 text-xs text-muted">
        {message}
      </p>
    </div>
  );
}

/** Sélecteur du niveau de connaissance (admin uniquement). « À classer » = non classé, poids 2. */
export function KnowledgeSelect({ id, value, compact }: { id: string; value: KnowledgeLevel | null; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <span className="inline-flex flex-col gap-1">
      <Select
        aria-label="Niveau de connaissance"
        disabled={pending}
        value={value ?? ""}
        className={compact ? "py-1.5 text-sm" : undefined}
        onChange={(event) => {
          const level = event.target.value || null;
          start(async () => {
            const result = await setKnowledgeAction(id, level);
            setError(result.ok ? "" : (result.message ?? "Échec."));
            router.refresh();
          });
        }}
      >
        <option value="">À classer</option>
        {KNOWLEDGE_LEVELS.map((level) => (
          <option key={level} value={level}>
            {knowledgeLabels[level]}
          </option>
        ))}
      </Select>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

/** Exclusion réversible et suppression (avec confirmation). */
export function ParticipationActions({ id, name, excluded, onDeleteRedirect }: { id: string; name: string; excluded: boolean; onDeleteRedirect?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await setExcludedAction(id, !excluded);
              setError(result.ok ? "" : (result.message ?? "Échec."));
              router.refresh();
            })
          }
        >
          {excluded ? "Réintégrer" : "Exclure des statistiques"}
        </Button>
        <Button
          variant="danger"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Supprimer définitivement la participation de ${name || "cette personne"} ? Cette action est irréversible.`)) return;
            start(async () => {
              const result = await deleteParticipationAction(id, onDeleteRedirect);
              setError(result?.ok === false ? (result.message ?? "Échec.") : "");
              router.refresh();
            });
          }}
        >
          Supprimer
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
