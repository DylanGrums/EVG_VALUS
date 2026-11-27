/**
 * Préparation de la « recherche approfondie » (admin uniquement) :
 * - synthèse Markdown du questionnaire (pourcentages pondérés ET bruts, commentaires anonymisés, limites, critères) ;
 * - prompt prêt à copier qui demande à l'IA le JSON d'import (voir import.ts et docs/import-idees.md).
 *
 * Anonymisation : aucun prénom de répondant n'est écrit ; les prénoms/pseudos des répondants cités
 * dans les commentaires sont remplacés par « [prénom] » (sauf Val/Valentin, sujet du questionnaire).
 */
import { analyze, parseCell, type LimitItem, type QuestionResult } from "@/lib/questionnaire/analysis";
import { formatPercent } from "@/lib/questionnaire/format";
import { isVigilanceQuestion, REACTION, reactions, themes, type AdminData } from "@/lib/questionnaire/types";
import { IMPORT_EXAMPLE } from "./import";

const KEPT_NAMES = new Set(["val", "valentin"]);

/** Fonction qui remplace les prénoms/pseudos des répondants dans un texte. */
export function makeRedactor(names: string[]) {
  const tokens = new Set<string>();
  for (const name of names) {
    for (const token of name.split(/[^\p{L}\p{N}'’-]+/u)) {
      const t = token.trim();
      if (t.length >= 2 && !KEPT_NAMES.has(t.toLocaleLowerCase("fr"))) tokens.add(t);
    }
  }
  if (!tokens.size) return (text: string) => text;
  const escaped = [...tokens].sort((a, b) => b.length - a.length).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${escaped.join("|")})(?![\\p{L}\\p{N}])`, "giu");
  return (text: string) => text.replace(pattern, "[prénom]");
}

const oneLine = (text: string) => text.replace(/\s*\n+\s*/g, " / ").trim();
const cell = (text: string) => oneLine(text).replaceAll("|", "\\|");
const pct = (ratio: number) => formatPercent(ratio).replace(/ | /g, " ");

function rawShare(count: number, answered: number) {
  return answered ? count / answered : 0;
}

/** « 2 sur 3 » : avec peu de répondants, le pourcentage seul est trompeur. */
const outOf = (count: number, answered: number) => `${count} sur ${answered}`;

function choiceTable(result: QuestionResult) {
  const rows = [...result.choices].sort((a, b) => Number(a.special) - Number(b.special) || b.weight - a.weight || b.count - a.count);
  const lines = ["| Choix | Pondéré | Brut (personnes) |", "| --- | ---: | ---: |"];
  for (const c of rows) {
    lines.push(`| ${cell(c.label)}${c.special ? " *(option générale)*" : ""} | ${pct(c.share)} | ${outOf(c.count, c.answered)} (${pct(rawShare(c.count, c.answered))}) |`);
  }
  return lines.join("\n");
}

/**
 * Matrice (question « Sensations et effort ») : une ligne par activité, une colonne par réaction.
 * Base de chaque ligne : les personnes ayant réagi à cette activité (+ « Je ne sais pas » globaux).
 */
function matrixTable(result: QuestionResult) {
  const header = `| Activité | Répondants | ${reactions.join(" | ")} |`;
  const sep = `| --- | ---: |${reactions.map(() => " ---: |").join("")}`;
  const lines = [header, sep];
  for (const row of result.rows) {
    const values = row.cells.map((c) => `${pct(c.share)} (${outOf(c.count, row.answered)})`);
    lines.push(`| ${cell(row.label)} | ${row.answered} | ${values.join(" | ")} |`);
  }
  const extra = result.choices.filter((c) => c.special && c.count > 0);
  if (extra.length) lines.push("", ...extra.map((c) => `- ${c.label} (pour toutes les activités) : ${pct(c.share)} (${outOf(c.count, c.answered)})`));
  return (
    lines.join("\n") +
    "\n\n*Pourcentages pondérés sur les personnes ayant réagi à l’activité (« Je ne sais pas » global compté dans chaque activité), nombre brut de personnes entre parenthèses.*"
  );
}

/** Libellé d'un consensus : pour la matrice, « Activités en hauteur : il serait partant ». */
function agreementLabel(r: QuestionResult, key: string) {
  const c = parseCell(key);
  const row = r.question.kind === "matrix" && c ? r.rows.find((x) => x.index === c.row) : undefined;
  return row ? `${row.name} : il serait partant` : r.labels[key];
}

/** Ligne de refus d'une activité. */
function refusalLine(r: QuestionResult, limit: LimitItem) {
  const row = r.rows.find((x) => x.index === limit.row)!;
  const cellText = (j: number, name: string) => `« ${name} » ${pct(row.cells[j].share)} (${outOf(row.cells[j].count, row.answered)})`;
  return (
    `- **${limit.label}** (${r.question.title}) : ${limit.detail}${limit.unanimous ? ", **quasi unanime**" : ""} — ` +
    `${cellText(REACTION.dejaNon, "a déjà dit non")}, ${cellText(REACTION.nonPense, "je ne pense pas")}, ${cellText(REACTION.partant, "il serait partant")}.`
  );
}

type Options = { now?: Date; includeOrganizer?: boolean; participantCount?: number | null };

/** Synthèse Markdown du questionnaire pour la recherche. */
export function buildResearchMarkdown(data: AdminData, { now = new Date(), includeOrganizer = false, participantCount = null }: Options = {}) {
  const analysis = analyze(data, { includeOrganizer });
  const redact = makeRedactor([...data.responses.map((r) => r.name), ...(data.organizer ? [data.organizer.name] : [])]);
  const comment = (text: string) => `- « ${oneLine(redact(text))} »`;
  const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(now);
  const out: string[] = [];

  out.push("# Profil de Val : synthèse du questionnaire pour la recherche d’idées d’EVG", "");
  out.push(
    "> Document réservé aux organisateurs : il contient des pourcentages **pondérés** par le niveau de connaissance des répondants " +
      "(poids 1 à 3). Les prénoms des répondants ont été retirés.",
    "",
  );
  out.push(
    `Généré le ${date} · ${analysis.analyzedCount} réponse(s) analysée(s) (poids total ${analysis.weightedCount})` +
      (analysis.organizerIncluded ? ", avis de l’organisation inclus" : "") +
      ".",
    "",
  );
  out.push(
    "**Lecture** : « Pondéré » = part du poids des répondants à la question qui ont coché ce choix ; " +
      "« Brut » = nombre de personnes sur le nombre de répondants à la question. Plusieurs choix étaient possibles, les totaux dépassent donc 100 %.",
    "",
  );

  // --- Critères ---
  out.push("## Critères pour la recherche", "");
  out.push("- **Pour qui** : l’enterrement de vie de garçon de Valentin (« Val »), entre amis" + (participantCount ? ` (environ ${participantCount} participants)` : "") + ".");
  out.push("- **Quand** : un week-end de **mai 2027** (2 à 3 jours, du vendredi soir ou samedi matin au dimanche). Les événements datés doivent avoir lieu en mai 2027.");
  out.push("- **Départ** : France (Paris et grandes villes françaises) ; préciser le temps de trajet et le mode (vol direct, train…).");
  const budgetLines = analysis.results.flatMap((r) => {
    const text = `${r.question.title} ${r.question.prompt}`;
    if (/budget|prix|co[uû]t|d[ée]pense/i.test(text)) {
      const top = r.choices.filter((c) => c.count > 0).sort((a, b) => b.weight - a.weight).slice(0, 3);
      return top.length ? [`${r.question.title} : ${top.map((c) => `${c.label} (${pct(c.share)}, ${outOf(c.count, c.answered)})`).join(", ")}`] : [];
    }
    const prefix = isVigilanceQuestion(r.question) ? "risque cité : " : "";
    return r.choices
      .filter((c) => c.count > 0 && /budget|d[ée]penses?|frais|cher/i.test(c.label))
      .map((c) => `${prefix}« ${c.label} » (${r.question.title}) : ${pct(c.share)} pondéré, ${outOf(c.count, c.answered)} pers.`);
  });
  out.push(
    budgetLines.length
      ? `- **Budget** : pas de montant fixé ; signaux du questionnaire : ${budgetLines.join(" ; ")}.`
      : "- **Budget** : pas de question budget dans le questionnaire ; viser un budget raisonnable pour un groupe d’amis et donner des prix indicatifs.",
  );
  // Consensus POSITIFS seulement (hors vigilance, refus et « ça dépend » de la matrice) : les accords sur des refus sont des limites.
  const strong = analysis.results.flatMap((r) =>
    r.agreements.map((key) => {
      const c = r.choices.find((x) => x.key === key)!;
      return `  - ${r.question.title} : ${agreementLabel(r, key)} (${pct(c.share)}, ${outOf(c.count, c.answered)})`;
    }),
  );
  if (strong.length) out.push("- **Convergences fortes** (≥ 75 % pondéré, au moins 2 personnes) :", ...strong);
  for (const theme of analysis.byTheme) {
    if (theme.id === "limites" || !theme.signals.length) continue;
    out.push(`- **${theme.name}** : ${theme.signals.map((s) => `${s.label} (${pct(s.share)}, ${outOf(s.count, s.answered)})`).join(" ; ")}.`);
  }
  // Questions du thème limites formulées en positif (Q6 « où il serait à l'aise ») : des critères à privilégier.
  const limitResults = analysis.results.filter((r) => r.question.theme === "limites");
  for (const r of limitResults.filter((x) => x.question.kind !== "matrix" && !isVigilanceQuestion(x.question))) {
    const top = r.choices.filter((c) => !c.special && c.count > 0).sort((a, b) => b.weight - a.weight);
    if (top.length) out.push(`- **${r.question.title}, à privilégier** : ${top.map((c) => `${c.label} (${pct(c.share)}, ${outOf(c.count, c.answered)})`).join(" ; ")}.`);
  }
  out.push("");

  // --- Limites ---
  out.push("## Limites et « non » forts", "");
  const strict: string[] = [];
  const soft: string[] = [];
  for (const r of limitResults) {
    if (r.question.kind === "matrix") {
      for (const limit of r.limits) (limit.strict ? strict : soft).push(refusalLine(r, limit));
    } else if (isVigilanceQuestion(r.question)) {
      const risks = r.limits.filter((l) => l.share >= 1 / 3);
      if (risks.length) {
        soft.push(
          `- **${r.question.title}** (risques cités) : ` +
            risks.map((l) => `${l.label} (${pct(l.share)}, ${outOf(l.count, l.answered)}${l.unanimous ? ", quasi unanime" : ""})`).join(" ; ") +
            ".",
        );
      }
    }
  }
  out.push("### Refus connus (strict)", "", "À respecter strictement : aucune proposition ne doit aller contre.", "");
  out.push(...(strict.length ? strict : ["- Aucun refus connu pour l’instant."]), "");
  out.push("### Points de vigilance (préférences)", "", "Des préférences à prendre en compte autant que possible, pas des interdits.", "");
  out.push(...(soft.length ? soft : ["- Aucun point de vigilance marqué pour l’instant."]), "");
  const divergences = analysis.results.flatMap((r) => r.divergences.map((text) => `- **${r.question.title}** : ${text}`));
  if (divergences.length) out.push("### Avis partagés (à manier avec prudence)", "", ...divergences, "");
  const limitComments = limitResults.flatMap((r) => r.comments.map((c) => c.text));
  if (limitComments.length) out.push("Commentaires sur les limites et le confort :", "", ...limitComments.map(comment));
  if (!limitResults.some((r) => r.answered)) out.push("- Pas encore de réponse sur les limites.");
  out.push("");

  // --- Détail ---
  out.push("## Détail par question", "");
  let n = 0;
  for (const r of analysis.results) {
    n++;
    out.push(`### ${n}. ${r.question.title} (${themes[r.question.theme]})`, "");
    out.push(`*${oneLine(r.question.prompt)}*`, "");
    if (!r.answered) {
      out.push("Pas encore de réponse.", "");
      continue;
    }
    out.push(`Répondants : ${r.answered} (poids ${r.weightedAnswered}).`, "");
    if (r.question.kind === "matrix") out.push(matrixTable(r), "");
    else if (r.choices.length) out.push(choiceTable(r), "");
    if (r.comments.length) out.push("Commentaires (anonymisés) :", "", ...r.comments.map((c) => comment(c.text)), "");
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** Description du format d'import, reprise dans le prompt, la page d'import et docs/import-idees.md. */
export const IMPORT_FORMAT_RULES = [
  "Racine : un objet { \"villes\": [ … ] }.",
  "Ville : \"nom\" et \"pays\" obligatoires ; \"resume\", \"pourquoi\", \"acces\" (ex. « 1 h 30 de vol direct depuis Paris »), \"budget_indicatif\" (texte), \"lien\" et \"evenements\" facultatifs.",
  "Événement : \"nom\" obligatoire ; \"categorie\" parmi fête, culture, sport, gastronomie, nature, soirée, autre ; \"description\", \"pourquoi\", \"date_debut\" et \"date_fin\" (AAAA-MM-JJ), \"dates_texte\" (texte libre si pas de date précise), \"prix_texte\", \"prix_min_eur\" (nombre en euros), \"lien\" (https://…) et \"adresse\" facultatifs.",
  "Un champ inconnu est mis à null ou omis. Pas de commentaire dans le JSON.",
  "Une ville est reconnue par son nom + pays : la réimporter met à jour ses informations sans toucher aux votes ni aux commentaires.",
];

/** Prompt de recherche prêt à copier dans un outil de recherche approfondie. */
export function buildResearchPrompt({ participantCount = null as number | null } = {}) {
  return `Tu es un assistant de recherche de voyages, rigoureux sur les sources.

Contexte : nous organisons l’enterrement de vie de garçon (EVG) de notre ami Valentin (« Val »), entre amis${participantCount ? ` (environ ${participantCount} personnes)` : ""}, au départ de la France, pendant un week-end de mai 2027 (2 à 3 jours). Ci-joint (ou collée à la fin de ce message), une synthèse anonymisée du questionnaire rempli par ses proches : ambiances, activités, limites, destination, avec des pourcentages pondérés et bruts et des commentaires.

Mission : mène une recherche approfondie et propose 5 à 8 villes ou lieux (France ou étranger) qui correspondent à son profil, avec pour chacun 4 à 10 événements ou activités concrets (fêtes, festivals, concerts, matchs, visites, expériences gastronomiques, nature, soirées…).

Exigences :
1. Respecte strictement la sous-section « Refus connus (strict) » de la section « Limites et non forts » : aucune proposition qui va contre. Les « Points de vigilance (préférences) » sont des préférences : évite-les autant que possible et, si une proposition s’en approche, explique-le dans "pourquoi". Les critères « à privilégier » sont des situations où il serait à l’aise.
2. Événements datés : uniquement s’ils ont lieu en mai 2027. Donne date_debut et date_fin (AAAA-MM-JJ) seulement si elles sont annoncées. Si les dates 2027 ne sont pas encore publiées, mets date_debut et date_fin à null et explique dans dates_texte (ex. « chaque année le 2e week-end de mai, dates 2027 non confirmées »). N’invente jamais de date.
3. Sources vérifiables : chaque événement a un "lien" vers une source fiable (site officiel, office de tourisme, billetterie). N’invente aucun lien : si tu n’en as pas, mets null.
4. Prix indicatifs en euros : prix_texte (ex. « 25 à 40 € / pers. ») et prix_min_eur (nombre). Pour chaque ville, budget_indicatif par personne pour le week-end, en précisant si les transports sont inclus.
5. "acces" : durée et mode de transport depuis Paris et les grandes villes françaises (vol direct, train…).
6. "pourquoi" : 1 à 3 phrases qui expliquent pourquoi ça colle au profil de Val, en t’appuyant sur la synthèse (cite les signaux).
7. Varie les catégories et les budgets. Tout le texte en français.

Format de réponse : réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans bloc de code, sans commentaire.
${IMPORT_FORMAT_RULES.map((rule) => `- ${rule}`).join("\n")}

Exemple de structure (les valeurs sont fictives) :
${JSON.stringify(IMPORT_EXAMPLE, null, 2)}
`;
}
