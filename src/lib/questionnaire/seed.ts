/**
 * Version 1 du questionnaire (reprise de l'ancienne version, avec les ajustements demandés par l'organisateur).
 * Insérée automatiquement à la première utilisation si la base ne contient aucune version.
 */
import { matrixOptions } from "./definition";
import type { Question, ThemeId } from "./types";

function define(
  id: number,
  theme: ThemeId,
  title: string,
  prompt: string,
  labels: string[],
  hint = "",
  opposite: [string, string][] = [],
  extra: Partial<Question> = {},
): Question {
  return {
    id,
    theme,
    title,
    prompt,
    hint,
    opposite,
    options: Object.fromEntries(labels.map((label, i) => [`c${i + 1}`, label])),
    ...(labels.length || extra.kind ? {} : { optional: true }),
    ...extra,
  };
}

const activites = [
  "Les activités en hauteur",
  "Les activités sur ou dans l’eau",
  "Les activités de vitesse",
  "Les activités physiquement exigeantes",
  "Les expériences stressantes ou effrayantes",
];

export const seedQuestions: Question[] = [
  define(1, "ambiance", "Ambiance générale", "Dans quelles ambiances imagines-tu Valentin passer un bon week-end avec ses amis ?", [
    "Une ambiance calme et détendue",
    "Une ambiance conviviale en petit comité",
    "Une ambiance animée avec du monde",
    "Une ambiance de grande fête",
    "Un mélange de moments calmes et animés",
  ]),
  define(2, "ambiance", "Formats de soirée", "Quels formats de soirée pourraient lui plaire ?", [
    "Plusieurs bars dans la même soirée",
    "Une soirée dansante ou un club",
    "Un concert ou une soirée avec musique live",
    "Une soirée privée entre amis",
    "Une fête en plein air ou dans la rue",
    "Un gros événement local ou culturel (par exemple une grande fête populaire façon Oktoberfest)",
  ]),
  define(3, "experiences", "Activités de groupe", "Quelles activités pourrait-il avoir envie de faire avec le groupe ?", [
    "Des jeux ou des énigmes en équipe",
    "Une activité physique accessible",
    "Une visite ou une découverte culturelle",
    "Une activité humoristique ou insolite",
    "Une aventure immersive avec un scénario à vivre ensemble",
    "Un défi amical par équipes",
  ]),
  define(4, "experiences", "Degré d’originalité", "Quels types d’expériences lui conviendraient pour l’occasion ?", [
    "Une activité familière qu’il apprécie déjà",
    "Une activité classique dans un cadre différent",
    "Une découverte un peu inhabituelle",
    "Une expérience rare ou inattendue",
    "Un mélange de valeurs sûres et de découvertes",
  ], "Qu’est-ce qui rendrait cette expérience mémorable pour lui ?"),
  // Question 5 : matrice de réactions (une réaction par activité).
  define(5, "limites", "Sensations et effort", "Comment Val réagirait-il à chacune de ces activités, d’après ce que tu sais de lui ?", [],
    "Si tu connais un refus clair ou une exception, indique-le en commentaire.", [], {
      kind: "matrix",
      globalSpecial: true,
      options: matrixOptions(activites),
    }),
  define(6, "limites", "Place de Valentin dans le groupe", "Dans quelles situations Valentin pourrait-il être à l’aise ?", [
    "Participer au même titre que les autres",
    "Recevoir une attention discrète en privé",
    "Tenir un rôle annoncé à l’avance, avec son accord",
    "Être mis à l’honneur devant le groupe",
    "Interagir avec des inconnus dans une activité",
    "Relever un défi qui attire l’attention d’inconnus sur lui",
    "Porter un accessoire commun avec les potes",
  ], "Tu peux préciser une situation qui le gênerait."),
  define(7, "experiences", "Centres d’intérêt", "Quels centres d’intérêt pourraient inspirer une activité pendant le séjour ?", [
    "Jeux vidéo ou univers geek",
    "Musique",
    "Technologie",
    "Gastronomie ou boissons",
    "Culture ou traditions locales",
    "Sport ou activités de plein air",
  ], "Un exemple vécu, un jeu ou un artiste peut aider."),
  define(8, "experiences", "Repas et dégustations", "Quels formats autour des repas ou des boissons pourraient lui plaire ?", [
    "Un repas convivial à table",
    "Un chef à domicile ou un repas privé",
    "Un marché ou un parcours avec plusieurs arrêts",
    "Une dégustation ou un atelier",
    "Un repas dans un lieu insolite",
    "Un repas simple et flexible",
  ]),
  define(9, "destination", "Type de destination", "Dans quels types de lieux imagines-tu un week-end qui lui plairait ?", [
    "Une grande ville",
    "Une ville moyenne",
    "Un bord de mer",
    "Un séjour à la campagne ou en pleine nature",
    "Une petite ville animée le temps d’un événement",
    "Un lieu proche et facile d’accès",
  ]),
  define(10, "destination", "Cadre et météo", "Quelles caractéristiques du lieu pourraient compter pour lui ?", [
    "Du soleil et des températures douces",
    "Des activités faisables quelle que soit la météo",
    "Un environnement naturel accessible",
    "Des lieux animés à proximité",
    "Un cadre dépaysant",
    "Un quartier facile à parcourir à pied",
  ]),
  define(11, "ambiance", "Rencontres et vie locale", "Dans quels contextes Valentin profiterait-il de l’ambiance locale ?", [
    "Des moments réservés au groupe",
    "Un lieu animé où le groupe peut rester ensemble",
    "Des échanges spontanés avec d’autres personnes",
    "Une fête ou une tradition locale à partager",
    "Des lieux fréquentés par des publics variés",
  ]),
  define(12, "destination", "Rythme du week-end", "Quel rythme pourrait lui convenir ?", [
    "Un programme principalement libre",
    "Un seul gros temps fort, avec du temps libre autour",
    "Plusieurs expériences originales réparties sur le week-end, avec des pauses",
    "Un programme bien rempli",
    "Du temps de repos après les soirées",
  ], "", [["c1", "c4"]]),
  define(13, "destination", "Logement", "Quelles caractéristiques du logement seraient appréciables pour ce week-end ?", [
    "Un emplacement central",
    "Un logement partagé avec espace commun",
    "Des chambres séparées et du calme",
    "Un lieu confortable où passer du temps",
    "Un hébergement simple pour limiter les frais",
  ], "", [], { extraSpecial: { any: "Peu importe" } }),
  define(14, "destination", "Trajets", "Quelles conditions de déplacement te paraissent adaptées au groupe ?", [
    "Un trajet direct, quel que soit le mode de transport",
    "Un trajet court, même avec une correspondance",
    "Un trajet plus long si le programme le justifie",
    "Peu de déplacements sur place",
    "Plusieurs déplacements sur place si les activités le justifient",
  ], "Précise si tu indiques une préférence ou une contrainte concrète."),
  define(15, "ambiance", "Équilibre des soirées", "Comment imagines-tu la place des soirées dans le week-end ?", [
    "Une soirée centrale dans le programme",
    "Deux soirées animées",
    "Une soirée animée et une soirée plus tranquille",
    "Des soirées libres selon l’envie du groupe",
    "Un programme axé sur la journée",
  ], "Quand une soirée lui plaît, est-ce qu’il aime la prolonger tard ?"),
  define(16, "limites", "Risques pour le séjour", "Qu’est-ce qui pourrait diminuer le plaisir de Valentin pendant le séjour ?", [
    "Un lieu peu animé",
    "Des activités trop familières",
    "Beaucoup de temps passé dans les transports",
    "Des dépenses élevées sur place",
    "Une ambiance d’EVG ressentie comme forcée",
    "Un programme trop chargé",
    "Des lieux très fréquentés ou bruyants",
  ], "Si un point te paraît rédhibitoire, distingue-le d’une simple préférence."),
  define(17, "surprises", "Degré de surprise", "Quelles formes de surprise Valentin pourrait-il apprécier ?", [
    "Découvrir la destination au dernier moment",
    "Découvrir toutes les activités sur place",
    "Connaître le programme général avec une ou deux surprises",
    "Découvrir une attention personnelle préparée par le groupe",
    "Connaître la destination à l’avance",
    "Connaître toutes les activités à l’avance",
  ], "Précise les informations qu’il devrait connaître pour pouvoir décider librement.", [["c1", "c5"], ["c2", "c6"], ["c3", "c6"]]),
  define(18, "experiences", "Événements et destination", "Quels événements pourraient peser dans le choix de la destination ?", [
    "Un grand concert ou un festival musical",
    "Une grande fête populaire locale",
    "Un événement insolite",
    "Une convention ou un événement gaming ou geek",
    "Un festival gastronomique ou de boissons",
    "Un événement sportif",
  ], "Précise si l’événement pourrait suffire à motiver le voyage ou s’il serait un complément."),
  define(19, "surprises", "Attentions du groupe", "Quelles attentions personnelles pourraient lui plaire pendant l’EVG ?", [
    "Un cadeau collectif",
    "Un petit symbole partagé, comme un T-shirt commun",
    "Un souvenir photo ou vidéo avec son accord",
    "Un message privé du groupe",
    "Un clin d’œil à un souvenir commun",
  ], "Ces idées peuvent être préparées quelle que soit la destination."),
  define(20, "experiences", "Un souvenir avec Val", "Tu as un souvenir avec Val qui pourrait nous aider à choisir son EVG ?", [],
    "Une soirée, une activité ou une destination suffit. Qu’avait-il adoré ? Que préférerait-il éviter de refaire ?"),
  define(21, "experiences", "Une envie de Val", "Est-ce que Val t’a déjà dit « un jour, j’aimerais trop faire ça » ? Si oui, c’était quoi ?", [],
    "Un lieu, un concert, un événement ou une expérience dont il t’a parlé."),
];
