import { useCallback, useEffect, useState } from "react";

// ─── STORAGE HELPERS ───────────────────────────────────────────────────────────
const STORAGE_KEY = "immo-tracker-v2";

async function loadData() {
  try {
    const r = await window.storage.get(STORAGE_KEY);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}

async function saveData(data) {
  try { await window.storage.set(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

// Clé API Anthropic de l'utilisateur — stockée uniquement en local, jamais dans le code ni le repo.
const AI_KEY_STORAGE = "cozimo-ai-key";

async function loadApiKey() {
  try {
    const r = await window.storage.get(AI_KEY_STORAGE);
    return r?.value || null;
  } catch { return null; }
}

async function saveApiKey(key) {
  try { await window.storage.set(AI_KEY_STORAGE, key); } catch {}
}

function uid() {
  return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const PROJECT_TYPES = [
  { id: "achat-rp", label: "Achat résidence principale", icon: "🏡", desc: "Acheter mon logement" },
  { id: "vente", label: "Vente", icon: "🏷️", desc: "Vendre un bien" },
  { id: "vente-achat", label: "Vente + Achat", icon: "🔄", desc: "Vendre pour acheter" },
  { id: "investissement-locatif", label: "Investissement locatif", icon: "📈", desc: "Acheter pour louer" },
  { id: "construction", label: "Construction", icon: "🏗️", desc: "Faire construire" },
  { id: "location", label: "Location", icon: "🔑", desc: "Gérer une location" },
  { id: "mise-en-location", label: "Mise en location", icon: "📋", desc: "Trouver un locataire" },
  { id: "travaux", label: "Travaux", icon: "🔨", desc: "Rénover ou aménager" },
  { id: "renovation-energetique", label: "Rénovation énergétique", icon: "🌱", desc: "Améliorer le DPE" },
  { id: "sci", label: "SCI", icon: "🏢", desc: "Créer une société civile" },
  { id: "lmnp", label: "LMNP", icon: "🛋️", desc: "Location meublée non pro" },
];

const IMPORTANCE = {
  essentielle: { label: "Essentielle", color: "#b91c1c", bg: "#fee2e2" },
  importante: { label: "Importante", color: "#b45309", bg: "#fef3c7" },
  utile: { label: "Utile", color: "#047857", bg: "#d1fae5" },
};

const CONTACT_ROLES = [
  { value: "courtier", label: "Courtier" },
  { value: "notaire", label: "Notaire" },
  { value: "agent", label: "Agent immobilier" },
  { value: "banquier", label: "Banquier" },
  { value: "artisan", label: "Artisan" },
  { value: "diagnostiqueur", label: "Diagnostiqueur" },
  { value: "autre", label: "Autre" },
];

const JOURNAL_TYPES = {
  etape: { label: "Étape accomplie", icon: "✅", color: "#047857", bg: "#d1fae5" },
  note: { label: "Note personnelle", icon: "📝", color: "#1d4ed8", bg: "#dbeafe" },
  document: { label: "Document reçu", icon: "📄", color: "#7c3aed", bg: "#ede9fe" },
  rdv: { label: "RDV", icon: "📅", color: "#b45309", bg: "#fef3c7" },
  autre: { label: "Autre", icon: "🔖", color: "#475569", bg: "#f1f5f9" },
};

const JOURNAL_TYPE_OPTIONS = Object.entries(JOURNAL_TYPES).map(([value, v]) => ({ value, label: `${v.icon} ${v.label}` }));

// Le comparateur de biens n'est proposé que pour ces types de projet.
const BIENS_RESIDENTIEL_TYPES = ["achat-rp", "vente-achat"];
const BIENS_INVESTISSEUR_TYPES = ["investissement-locatif", "sci", "lmnp"];
const BIENS_ENABLED_TYPES = [...BIENS_RESIDENTIEL_TYPES, ...BIENS_INVESTISSEUR_TYPES];

const DPE_LETTERS = ["A", "B", "C", "D", "E", "F", "G"];

const DEMANDE_OPTIONS = [
  { value: "faible", label: "Faible" },
  { value: "moyenne", label: "Moyenne" },
  { value: "forte", label: "Forte" },
];
const DEMANDE_RANK = { faible: 1, moyenne: 2, forte: 3 };

const POTENTIEL_OPTIONS = [
  { value: "faible", label: "Faible" },
  { value: "moyen", label: "Moyen" },
  { value: "fort", label: "Fort" },
];
const POTENTIEL_RANK = { faible: 1, moyen: 2, fort: 3 };

// ─── ASSISTANT IA ───────────────────────────────────────────────────────────────
const AI_MODEL = "claude-sonnet-5";

const AI_SUGGESTIONS = {
  achat: [
    "Pourquoi la banque me demande ce document ?",
    "Comment négocier le prix ?",
    "Quels sont mes recours si le vendeur se rétracte ?",
  ],
  investissement: [
    "Comment calculer mon cash-flow ?",
    "LMNP ou SCI, que choisir ?",
    "Comment optimiser ma fiscalité ?",
  ],
  vente: [
    "Comment fixer le bon prix ?",
    "Faut-il accepter cette offre ?",
    "Que faire si l'acheteur se rétracte ?",
  ],
  travaux: [
    "Comment choisir un artisan ?",
    "Quelles garanties exiger ?",
    "Comment gérer un chantier ?",
  ],
  location: [
    "Comment fixer le bon loyer ?",
    "Quels documents demander à un locataire ?",
    "Que faire en cas de loyer impayé ?",
  ],
};

const AI_SUGGESTION_CATEGORY_BY_TYPE = {
  "achat-rp": "achat",
  "investissement-locatif": "investissement",
  "sci": "investissement",
  "lmnp": "investissement",
  "vente": "vente",
  "travaux": "travaux",
  "renovation-energetique": "travaux",
  "construction": "travaux",
  "location": "location",
  "mise-en-location": "location",
};

function getAISuggestions(type) {
  if (type === "vente-achat") return [...AI_SUGGESTIONS.vente, ...AI_SUGGESTIONS.achat];
  return AI_SUGGESTIONS[AI_SUGGESTION_CATEGORY_BY_TYPE[type]] || AI_SUGGESTIONS.achat;
}

// ─── TROUVER UN PROFESSIONNEL ───────────────────────────────────────────────────
const PRO_TYPES = {
  courtier: {
    label: "Courtier",
    icon: "💰",
    searchTerm: "courtier immobilier",
    links: [
      { name: "CAFPI", url: "https://www.cafpi.fr" },
      { name: "Meilleurtaux", url: "https://www.meilleurtaux.com" },
      { name: "Pretto", url: "https://www.pretto.fr" },
      { name: "Vousfinancer", url: "https://www.vousfinancer.com" },
    ],
  },
  notaire: {
    label: "Notaire",
    icon: "⚖️",
    searchTerm: "notaire",
    links: [
      { name: "Notaires.fr — annuaire officiel", url: "https://www.notaires.fr" },
    ],
  },
  diagnostiqueur: {
    label: "Diagnostiqueur",
    icon: "🔬",
    searchTerm: "diagnostiqueur immobilier",
    links: [
      { name: "diagnostiqueurs.gouv.fr", url: "https://www.diagnostiqueurs.gouv.fr" },
    ],
  },
  agent: {
    label: "Agent immobilier",
    icon: "🏠",
    searchTerm: "agence immobilière",
    links: [
      { name: "SeLoger", url: "https://www.seloger.com" },
      { name: "PAP", url: "https://www.pap.fr" },
      { name: "LeBonCoin", url: "https://www.leboncoin.fr" },
    ],
  },
  artisan: {
    label: "Artisan / entrepreneur",
    icon: "🔨",
    searchTerm: "artisan bâtiment",
    links: [
      { name: "Habitissimo", url: "https://www.habitissimo.fr" },
      { name: "Mon Artisan", url: "https://www.monartisan.fr" },
      { name: "Houzz", url: "https://www.houzz.fr" },
    ],
  },
  architecte: {
    label: "Architecte",
    icon: "📐",
    searchTerm: "architecte",
    links: [
      { name: "Ordre des architectes", url: "https://www.architectes.org" },
    ],
  },
  comptable: {
    label: "Expert-comptable",
    icon: "🧮",
    searchTerm: "expert-comptable",
    links: [
      { name: "Ordre des experts-comptables", url: "https://www.experts-comptables.fr" },
    ],
  },
  assureur: {
    label: "Assureur",
    icon: "🛡️",
    searchTerm: "assurance",
    links: [
      { name: "April", url: "https://www.april.fr" },
      { name: "Cardif", url: "https://www.cardif.fr" },
      { name: "LeLynx — comparateur", url: "https://www.lelynx.fr" },
    ],
  },
  gestionnaire: {
    label: "Gestionnaire locatif",
    icon: "🔑",
    searchTerm: "agence de gestion locative",
    links: [
      { name: "Foncia", url: "https://www.foncia.com" },
      { name: "Nexity", url: "https://www.nexity.fr" },
    ],
  },
};

// Ouvre Google Maps centré sur la position de l'utilisateur (si autorisée) avec une recherche pré-remplie,
// sinon une recherche générique "près de moi" sans coordonnées.
function openNearMeSearch(searchTerm) {
  const openMaps = (lat, lng) => {
    const url = lat != null && lng != null
      ? `https://www.google.com/maps/search/${encodeURIComponent(searchTerm)}/@${lat},${lng},14z`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchTerm + " près de moi")}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (typeof navigator !== "undefined" && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => openMaps(pos.coords.latitude, pos.coords.longitude),
      () => openMaps(null, null),
      { timeout: 8000 }
    );
  } else {
    openMaps(null, null);
  }
}

// Repli par phase, propre à chaque type de projet (les steps sont préfixés par leur type dans leur id).
const PHASE_PRO_MAP = {
  "achat-rp": { "Recherche": "agent", "Prêt": "courtier", "Notaire": "notaire", "Travaux (optionnel)": "artisan" },
  "investissement-locatif": { "Recherche": "agent", "Prêt": "courtier", "Notaire": "notaire", "Travaux (optionnel)": "artisan" },
  "vente": { "Mise en vente": "agent", "Compromis": "notaire" },
  "construction": { "Architecte": "architecte", "Permis": "architecte", "Financement": "courtier", "Chantier": "artisan", "Réception": "artisan" },
  "travaux": { "Devis": "artisan", "Chantier": "artisan", "Financement": "courtier" },
  "renovation-energetique": { "Devis": "artisan", "Chantier": "artisan", "Financement": "courtier" },
  "sci": { "Stratégie": "comptable", "Constitution": "comptable", "Gestion": "comptable" },
  "lmnp": { "Stratégie": "comptable", "Constitution": "comptable", "Gestion": "comptable" },
  "mise-en-location": { "Recherche locataire": "gestionnaire", "Bail": "gestionnaire", "Gestion": "gestionnaire" },
};

// Déduit le professionnel pertinent pour une étape : mots-clés fiables d'abord, puis phase/type, puis mots-clés plus larges.
function detectProType(s) {
  // Volontairement limité au libellé + aux contacts (pas au corps du texte, qui mentionne souvent
  // "frais de notaire" ou "assurance emprunteur" comme simple ligne budgétaire sans rapport avec l'étape).
  const text = [s.label, ...(s.info?.contacts || [])].join(" ").toLowerCase();

  // Tier 1 : signaux très spécifiques et fiables, prioritaires sur la phase.
  if (/diagnostiqueur|diagnostic/.test(text)) return "diagnostiqueur";
  if (/assur/.test(text)) return "assureur";
  if (/notaire|acte authentique|acte de vente|acte d.achat/.test(text)) return "notaire";

  // Tier 2 : repli par phase, propre à chaque type de projet (id préfixé par le type).
  const typeId = Object.keys(PHASE_PRO_MAP).find(t => s.id.startsWith(`${t}-`));
  const byPhase = typeId && PHASE_PRO_MAP[typeId][s.phase];
  if (byPhase) return byPhase;

  // Tier 3 : mots-clés plus larges.
  if (/courtier|cafpi|meilleurtaux|pretto|vousfinancer|crédit|emprunt|taeg|accord de principe|offre de prêt/.test(text)) return "courtier";
  if (/comptable|fiscal|amortissement|\bbic\b|kbis|statuts|immatricul|greffe/.test(text)) return "comptable";
  if (/locataire|bail\b|dossierfacile|\bgli\b|visale|gestion locative/.test(text)) return "gestionnaire";
  if (/architecte|ccmi|permis de construire/.test(text)) return "architecte";
  if (/artisan|devis|\brge\b|maprimerenov|habitissimo|houzz/.test(text)) return "artisan";
  if (/agence immobilière|agent immobilier|seloger|leboncoin|pap\.fr/.test(text)) return "agent";

  return null;
}

// ─── STEP DATA ────────────────────────────────────────────────────────────────
function step(phase, label, month, importance, info) {
  return { phase, label, month, importance, info };
}

function mk(typeId, list) {
  return list.map((s, i) => ({ id: `${typeId}-${i + 1}`, ...s }));
}

const STEPS_BY_TYPE = {};

STEPS_BY_TYPE["achat-rp"] = mk("achat-rp", [
  step("Préparer", "Calculer son budget et sa capacité d'emprunt", "M1", "essentielle", {
    title: "Comment calculer sa capacité d'emprunt ?",
    body: "Vos mensualités de crédit ne doivent pas dépasser 35% de vos revenus nets. Intégrez les frais de notaire (environ 7,5% dans l'ancien, 2,5% dans le neuf) dans votre budget global.",
    contacts: ["Votre conseiller bancaire", "Un courtier immobilier (gratuit pour vous)", "CAFPI, Meilleurtaux, Pretto"],
  }),
  step("Préparer", "Consulter un courtier immobilier", "M1", "importante", {
    title: "Pourquoi passer par un courtier ?",
    body: "Le courtier est rémunéré par la banque, pas par vous. Il compare des dizaines d'offres et négocie taux, frais de dossier et assurance emprunteur.",
    contacts: ["CAFPI — cafpi.fr", "Meilleurtaux.com", "Pretto.fr (100% en ligne)"],
  }),
  step("Préparer", "Obtenir un accord de principe bancaire", "M1", "importante", {
    title: "Un atout pour rassurer le vendeur",
    body: "L'accord de principe confirme que votre dossier est finançable pour un montant donné. Il rassure fortement les vendeurs et les agences.",
    contacts: ["Votre conseiller bancaire", "Votre courtier"],
  }),
  step("Recherche", "Définir ses critères (surface, zone, transports…)", "M1", "importante", {
    title: "Bien cadrer sa recherche",
    body: "Distinguez vos critères impératifs de vos critères souhaitables. Pensez au DPE : les biens F/G peuvent être difficiles à revendre.",
    contacts: ["Bien'ici.com", "SeLoger, PAP.fr, LeBonCoin"],
  }),
  step("Recherche", "Lancer les recherches actives et créer des alertes", "M1-2", "utile", {
    title: "Optimiser sa recherche",
    body: "Créez des alertes email sur tous les portails. Contactez aussi des agences locales directement : certains biens ne sont jamais publiés en ligne (off-market).",
    contacts: ["SeLoger.com — alertes email", "PAP.fr", "Agences locales à contacter directement"],
  }),
  step("Visites", "Organiser et effectuer les visites", "M2", "essentielle", {
    title: "Ce qu'il faut vérifier en visite",
    body: "Vérifiez l'état des fenêtres, de la plomberie, du tableau électrique. Regardez les plafonds (taches = infiltrations). Demandez le montant des charges.",
    contacts: ["Prévoyez un mètre ruban et une lampe torche", "Expert bâtiment en cas de doute structurel (200-500€)"],
  }),
  step("Visites", "Vérifier PV d'AG, charges et état de la copropriété", "M2", "importante", {
    title: "L'importance des documents de copro",
    body: "Les 3 derniers PV d'AG révèlent les travaux votés et les litiges en cours. Des travaux votés peuvent représenter des dizaines de milliers d'euros.",
    contacts: ["Documents à demander au vendeur avant le compromis (loi ALUR)"],
  }),
  step("Offre", "Faire une offre d'achat écrite", "M2-3", "essentielle", {
    title: "Comment formuler une offre ?",
    body: "L'offre doit mentionner le prix proposé, les modalités de financement et une date limite de réponse (48-72h).",
    contacts: ["PAP.fr — modèle d'offre gratuit", "DVF (data.gouv.fr) — prix réels du secteur"],
  }),
  step("Offre", "Négocier le prix", "M3", "utile", {
    title: "Les bons arguments pour négocier",
    body: "Appuyez-vous sur le prix au m² du secteur, la durée de mise en vente et le DPE. Un bien qui stagne depuis 3 mois+ est souvent négociable.",
    contacts: ["MeilleursAgents.com", "DVF — data.gouv.fr"],
  }),
  step("Compromis", "Signer le compromis de vente", "M3", "essentielle", {
    title: "Le compromis côté acheteur",
    body: "Vous disposez de 10 jours pour vous rétracter sans pénalité. Passé ce délai, en cas de renoncement hors clause suspensive, vous perdez le dépôt de garantie.",
    contacts: ["Votre notaire rédige et explique chaque clause"],
  }),
  step("Compromis", "Suivre la condition suspensive de prêt", "M3-4", "importante", {
    title: "La condition suspensive de prêt",
    body: "Si votre prêt est refusé dans le délai prévu (45-60 jours), la vente est annulée et le dépôt de garantie restitué.",
    contacts: ["Votre notaire suit l'avancement du dossier"],
  }),
  step("Prêt", "Déposer le dossier complet à la banque / courtier", "M3-4", "essentielle", {
    title: "Constituer un dossier béton",
    body: "Préparez bulletins de salaire, avis d'imposition, relevés bancaires, compromis signé et justificatifs d'épargne.",
    contacts: ["Votre courtier centralise le dossier", "Délai d'obtention : 3 à 6 semaines"],
  }),
  step("Prêt", "Respecter le délai légal de 11 jours avant acceptation", "M4", "importante", {
    title: "Le délai de réflexion obligatoire",
    body: "La loi impose 11 jours après réception de l'offre de prêt avant de pouvoir l'accepter. L'offre reste valable 30 jours.",
    contacts: ["Acceptez par courrier signé à partir du 12e jour"],
  }),
  step("Notaire", "Préparer l'acte définitif avec le notaire", "M4-5", "importante", {
    title: "L'acte authentique",
    body: "Le notaire vérifie les titres de propriété, purge les hypothèques et calcule les frais avant de vous convoquer pour la signature.",
    contacts: ["Votre notaire (le vôtre ou celui du vendeur, sans frais doublés)"],
  }),
  step("Notaire", "Signer l'acte authentique d'achat", "M5", "essentielle", {
    title: "Le jour de la signature",
    body: "Vous versez le solde du prix et les frais de notaire. La banque vire les fonds directement au notaire. Vous repartez avec les clés !",
    contacts: ["Apportez une pièce d'identité valide"],
  }),
  step("Installation", "Souscrire assurance habitation et emprunteur", "M5", "essentielle", {
    title: "Assurance habitation et emprunteur",
    body: "L'assurance habitation est indispensable, l'emprunteur exigée par la banque. Vous pouvez choisir librement votre assureur (délégation, souvent 30-50% moins cher).",
    contacts: ["Comparateurs : LeLynx.fr, AssurLand.com", "Loi Lemoine : changement possible à tout moment"],
  }),
  step("Installation", "Résilier et transférer les contrats (énergie, internet)", "M5", "importante", {
    title: "Résiliation et transfert des contrats",
    body: "Résiliez ou transférez vos contrats à la date de signature avec un relevé de compteur. Prévoyez un préavis de 30 jours pour internet.",
    contacts: ["EDF, Engie : espaces clients en ligne", "Assurance habitation ancien logement"],
  }),
  step("Installation", "Effectuer le changement d'adresse officiel", "M5", "utile", {
    title: "Ne rien oublier",
    body: "Utilisez Service-Public.fr pour notifier en une fois impôts, CAF, carte grise. N'oubliez pas banque, médecin, employeur.",
    contacts: ["Service-Public.fr — gratuit", "La Poste — redirection de courrier (payant)"],
  }),
  step("Travaux (optionnel)", "Prioriser les travaux nécessaires", "M5-6", "utile", {
    title: "Bien prioriser",
    body: "Isolation, salle de bain et cuisine sont les postes qui apportent le plus de confort et de valeur. Obtenez plusieurs devis avant de commencer.",
    contacts: ["Habitissimo, Mon Artisan pour comparer des devis"],
  }),
  step("Travaux (optionnel)", "Obtenir des devis avant l'emménagement", "M6", "utile", {
    title: "Comparer plusieurs artisans",
    body: "Demandez au moins 3 devis détaillés et vérifiez les assurances (décennale) et certifications (RGE) avant de signer.",
    contacts: ["Artisans certifiés RGE pour les aides"],
  }),
]);

STEPS_BY_TYPE["investissement-locatif"] = mk("investissement-locatif", [
  step("Préparer", "Définir la stratégie locative (nue, meublée, coloc…)", "M1", "essentielle", {
    title: "Quelle stratégie choisir ?",
    body: "Location nue : bail 3 ans, fiscalité simple. Meublée (LMNP) : bail 1 an, fiscalité avantageuse via amortissements. Colocation : rendement plus élevé, gestion plus intensive.",
    contacts: ["Conseiller fiscal spécialisé immobilier"],
  }),
  step("Préparer", "Calculer le rendement locatif brut et net cible", "M1", "essentielle", {
    title: "Comment calculer le rendement ?",
    body: "Rendement brut = (loyer annuel / prix d'achat) × 100. Visez au moins 4% net en zone tendue, davantage en régions moins chères.",
    contacts: ["Simulateurs : rendement-locatif.com"],
  }),
  step("Préparer", "Consulter un courtier pour optimiser le levier bancaire", "M1", "importante", {
    title: "L'effet de levier",
    body: "Emprunter pour investir vous permet de vous constituer un patrimoine avec l'argent de la banque. Un courtier spécialisé connaît les banques favorables aux investisseurs.",
    contacts: ["CAFPI, Meilleurtaux, Vousfinancer"],
  }),
  step("Recherche", "Cibler les zones à fort potentiel locatif", "M2", "importante", {
    title: "Identifier les bonnes zones",
    body: "Cherchez une forte demande locative, un faible taux de vacance et un dynamisme économique. Évitez les zones tendues si votre rendement en dépend.",
    contacts: ["Observatoire des loyers", "INSEE — données démographiques"],
  }),
  step("Recherche", "Analyser la demande locative locale", "M2", "utile", {
    title: "Vérifier la demande avant d'acheter",
    body: "Publiez une fausse annonce de location avant d'acheter : 20+ demandes en 48h indique une forte demande.",
    contacts: ["LeBonCoin Immo, PAP.fr"],
  }),
  step("Visites", "Visiter et évaluer les biens (travaux, charges, DPE)", "M2", "essentielle", {
    title: "Ce qu'il faut évaluer",
    body: "Le DPE conditionne la mise en location (G interdit depuis 2025, F en 2028). Un DPE dégradé peut être un argument de négociation.",
    contacts: ["Expert bâtiment pour un audit (200-500€)"],
  }),
  step("Visites", "Vérifier PV d'AG, charges et travaux votés", "M2", "importante", {
    title: "Anticiper les charges futures",
    body: "Des travaux votés en copropriété peuvent représenter des dizaines de milliers d'euros à votre charge après l'achat.",
    contacts: ["Documents à demander avant toute offre"],
  }),
  step("Offre", "Faire une offre et négocier en investisseur", "M3", "essentielle", {
    title: "Négocier en investisseur",
    body: "Vous avez plus de marge sans urgence émotionnelle. Appuyez-vous sur le rendement cible pour justifier votre prix.",
    contacts: ["DVF (data.gouv.fr) — prix réels du secteur"],
  }),
  step("Compromis", "Signer le compromis de vente", "M3", "essentielle", {
    title: "Le compromis",
    body: "Le compromis fixe le prix et les conditions suspensives. Vérifiez le délai de la clause suspensive de prêt (45-60 jours).",
    contacts: ["Votre notaire"],
  }),
  step("Prêt", "Déposer le dossier banque / courtier", "M3-4", "essentielle", {
    title: "Un dossier investisseur solide",
    body: "Certaines banques demandent que les loyers couvrent au moins 70% de la mensualité. Votre courtier oriente vers les banques les plus favorables.",
    contacts: ["Votre courtier spécialisé investissement"],
  }),
  step("Prêt", "Obtenir l'offre de prêt officielle", "M4", "importante", {
    title: "Vérifier l'offre",
    body: "Vérifiez le TAEG, le coût total du crédit et les conditions de remboursement anticipé avant d'accepter.",
    contacts: ["Votre courtier compare les offres"],
  }),
  step("Notaire", "Signer l'acte authentique d'achat", "M5", "essentielle", {
    title: "Finaliser l'acquisition",
    body: "La banque vire les fonds au notaire avant la signature. Prévoyez l'assurance emprunteur en délégation pour économiser.",
    contacts: ["Votre notaire coordonne avec la banque"],
  }),
  step("Installation", "Choisir la structure fiscale (nom propre, SCI, LMNP)", "M5", "importante", {
    title: "Nom propre, SCI ou LMNP ?",
    body: "Nom propre : simple mais fiscalité IR potentiellement lourde. LMNP : amortissements déductibles, souvent 0 impôt 10-15 ans.",
    contacts: ["Expert-comptable spécialisé locatif"],
  }),
  step("Installation", "Souscrire une assurance propriétaire non-occupant (PNO)", "M5", "importante", {
    title: "Pourquoi une assurance PNO ?",
    body: "Elle couvre les dommages même en l'absence de locataire et complète l'assurance du locataire. Souvent obligatoire en copropriété.",
    contacts: ["Comparateurs : LeLynx.fr, AssurLand.com"],
  }),
  step("Installation", "Publier l'annonce et sélectionner un locataire", "M5-6", "essentielle", {
    title: "Trouver le bon locataire",
    body: "Ratio habituel : revenus = 3x le loyer. Vérifiez les justificatifs via DossierFacile. Une GLI protège contre les impayés.",
    contacts: ["DossierFacile.fr", "GLI : Visale ou assureurs privés"],
  }),
  step("Travaux (optionnel)", "Réaliser les travaux avant mise en location", "M5", "utile", {
    title: "Travaux déductibles",
    body: "Les travaux sont déductibles des revenus fonciers au régime réel, ou amortissables en LMNP. Gardez toutes les factures.",
    contacts: ["Artisans certifiés RGE pour les aides"],
  }),
]);

STEPS_BY_TYPE["vente"] = mk("vente", [
  step("Préparation", "Estimer le bien (2-3 agences + outils en ligne)", "M1", "essentielle", {
    title: "Comment estimer son bien ?",
    body: "Faites appel à 2-3 agences locales pour des estimations gratuites. Complétez avec des outils en ligne. Évitez de surestimer : un bien trop cher se déprécie aux yeux des acheteurs.",
    contacts: ["MeilleursAgents.com", "PAP.fr — outil gratuit d'estimation"],
  }),
  step("Préparation", "Choisir le mode de vente (agence ou PAP)", "M1", "importante", {
    title: "Agence ou particulier à particulier ?",
    body: "En agence : commission de 3 à 8%, mais accompagnement complet. En PAP : aucune commission, mais vous gérez tout.",
    contacts: ["SeLoger, LeBonCoin, PAP.fr", "IAD, Efficity (commission réduite ~3%)"],
  }),
  step("Préparation", "Réunir les diagnostics obligatoires (DPE, Carrez…)", "M1", "essentielle", {
    title: "Diagnostics obligatoires",
    body: "La loi impose une liste de diagnostics avant toute vente. Comptez 400 à 700€ pour un pack complet réalisé par un diagnostiqueur certifié.",
    contacts: ["diagnostiqueurs.gouv.fr"],
  }),
  step("Mise en vente", "Publier l'annonce en ligne (SeLoger, LBC, PAP…)", "M2", "essentielle", {
    title: "Bien diffuser son annonce",
    body: "Multipliez les portails pour maximiser la visibilité. Soignez le titre, décrivez les points forts et mentionnez le DPE.",
    contacts: ["SeLoger.com", "LeBonCoin Immo", "PAP.fr"],
  }),
  step("Mise en vente", "Organiser les visites", "M2", "importante", {
    title: "Bien préparer les visites",
    body: "Proposez des créneaux fixes, rangez et maximisez la lumière naturelle. Préparez un dossier avec diagnostics et charges.",
    contacts: ["1h par visite en moyenne"],
  }),
  step("Mise en vente", "Analyser et négocier les offres", "M2-3", "essentielle", {
    title: "Comment évaluer une offre ?",
    body: "Ne regardez pas seulement le prix : vérifiez la solidité du financement de l'acheteur. Vous pouvez contre-proposer par écrit.",
    contacts: ["Votre notaire peut vous conseiller"],
  }),
  step("Compromis", "Signer le compromis de vente", "M3", "essentielle", {
    title: "Qu'est-ce que le compromis ?",
    body: "Il engage vendeur et acheteur, fixe le prix et les conditions suspensives. Lisez-le attentivement avant de signer.",
    contacts: ["Votre notaire ou l'agence le rédige"],
  }),
  step("Compromis", "Suivre le délai de rétractation (10 jours)", "M3", "importante", {
    title: "Le délai de rétractation",
    body: "L'acheteur dispose de 10 jours pour se rétracter sans justification. Ne retirez pas votre annonce pendant ce délai.",
    contacts: ["Votre notaire vous informe de la date de fin"],
  }),
  step("Compromis", "Suivre la condition suspensive de prêt de l'acheteur", "M3-4", "importante", {
    title: "La condition suspensive de prêt",
    body: "Si le prêt de l'acheteur est refusé, la vente est annulée et son dépôt restitué. Ce délai est de 45 à 60 jours.",
    contacts: ["Restez en contact avec votre notaire"],
  }),
  step("Finalisation", "Signer l'acte de vente définitif", "M4", "essentielle", {
    title: "Le jour de la signature",
    body: "Le prix vous est versé par virement le jour même ou le lendemain. Pensez à relever les compteurs la veille.",
    contacts: ["Votre notaire coordonne tout"],
  }),
  step("Finalisation", "Résilier les contrats (énergie, internet, assurance)", "M4", "importante", {
    title: "Résiliation des contrats",
    body: "Résiliez ou transférez vos contrats à la date de signature avec un relevé de compteur.",
    contacts: ["EDF, Engie, opérateurs internet"],
  }),
  step("Finalisation", "Effectuer le changement d'adresse officiel", "M4", "utile", {
    title: "Ne rien oublier",
    body: "Service-Public.fr permet de notifier en une fois impôts, CAF, carte grise.",
    contacts: ["Service-Public.fr — gratuit"],
  }),
]);

STEPS_BY_TYPE["vente-achat"] = [
  ...STEPS_BY_TYPE["vente"].map(s => ({ ...s, tag: "Vente" })),
  ...STEPS_BY_TYPE["achat-rp"].map(s => ({ ...s, tag: "Achat" })),
];

STEPS_BY_TYPE["construction"] = mk("construction", [
  step("Terrain", "Trouver et acheter le terrain", "M1", "essentielle", {
    title: "Bien choisir son terrain",
    body: "Vérifiez le bornage, la viabilisation (eau, électricité, assainissement) et l'exposition avant de signer une promesse de vente.",
    contacts: ["Géomètre pour le bornage", "Notaire pour la promesse de vente"],
  }),
  step("Terrain", "Vérifier le PLU et la constructibilité", "M1", "essentielle", {
    title: "Le Plan Local d'Urbanisme",
    body: "Le PLU définit ce qu'il est possible de construire (hauteur, emprise au sol, distances). Consultez-le en mairie avant tout achat.",
    contacts: ["Service urbanisme de la mairie", "Certificat d'urbanisme (gratuit)"],
  }),
  step("Architecte", "Choisir un architecte ou un constructeur (CCMI)", "M2", "essentielle", {
    title: "Architecte ou constructeur ?",
    body: "Le CCMI (contrat de construction de maison individuelle) offre des garanties légales fortes : prix et délai fermes, garantie de livraison.",
    contacts: ["Ordre des architectes — architectes.org"],
  }),
  step("Architecte", "Valider les plans et le budget", "M2", "importante", {
    title: "Verrouiller le budget",
    body: "Prévoyez une marge de 10% pour les imprévus. Vérifiez que le contrat inclut tous les postes (VRD, finitions).",
    contacts: ["Votre architecte ou constructeur"],
  }),
  step("Permis", "Déposer le permis de construire", "M2-3", "essentielle", {
    title: "Le dossier de permis",
    body: "Le dossier comprend plans, façades et notice descriptive. L'instruction dure 2 à 3 mois en général.",
    contacts: ["Service urbanisme de la mairie"],
  }),
  step("Permis", "Attendre le délai d'instruction et de recours", "M3-4", "importante", {
    title: "Purger les recours",
    body: "Après l'obtention du permis, un délai de 2 mois de recours des tiers s'applique avant de pouvoir démarrer sereinement.",
    contacts: ["Affichage obligatoire du permis sur le terrain"],
  }),
  step("Financement", "Obtenir le prêt construction à déblocage progressif", "M3-4", "essentielle", {
    title: "Le prêt construction",
    body: "Les fonds sont débloqués au fur et à mesure de l'avancement du chantier, sur présentation d'appels de fonds.",
    contacts: ["Votre banque ou courtier"],
  }),
  step("Financement", "Souscrire la garantie dommages-ouvrage", "M4", "essentielle", {
    title: "Une assurance obligatoire",
    body: "Elle permet d'être indemnisé rapidement en cas de malfaçon, sans attendre une décision de justice contre le constructeur.",
    contacts: ["Votre assureur habituel ou un courtier spécialisé"],
  }),
  step("Chantier", "Suivre les appels de fonds par étape", "M4-8", "importante", {
    title: "Le calendrier de paiement CCMI",
    body: "La loi encadre les pourcentages maximum à verser à chaque étape (fondations, hors d'eau, hors d'air…).",
    contacts: ["Votre constructeur vous transmet les appels de fonds"],
  }),
  step("Chantier", "Suivre les visites de chantier", "M4-8", "utile", {
    title: "Rester présent",
    body: "Visitez régulièrement le chantier et documentez l'avancement par photos. Signalez rapidement toute anomalie.",
    contacts: ["Un expert en bâtiment peut vous accompagner"],
  }),
  step("Réception", "Réceptionner les travaux et émettre des réserves", "M9", "essentielle", {
    title: "La réception des travaux",
    body: "Ce jour marque le point de départ des garanties légales (parfait achèvement, biennale, décennale). Notez toutes les réserves sur le PV.",
    contacts: ["Un expert peut vous assister à la réception"],
  }),
  step("Réception", "Souscrire les assurances habitation", "M9", "essentielle", {
    title: "Assurer votre nouvelle maison",
    body: "Souscrivez l'assurance habitation avant l'emménagement, elle est indispensable dès la réception.",
    contacts: ["Comparateurs : LeLynx.fr, AssurLand.com"],
  }),
]);

STEPS_BY_TYPE["travaux"] = mk("travaux", [
  step("Définir projet", "Définir le périmètre des travaux", "M1", "essentielle", {
    title: "Cadrer le projet",
    body: "Listez précisément les pièces et postes concernés (cuisine, SDB, isolation, électricité) pour obtenir des devis comparables.",
    contacts: ["Faites un plan ou croquis avant de consulter des artisans"],
  }),
  step("Définir projet", "Prioriser les postes de travaux", "M1", "importante", {
    title: "Bien prioriser",
    body: "Isolation, salle de bain et cuisine apportent le plus de confort et de valeur. Traitez d'abord le structurel avant l'esthétique.",
    contacts: ["Habitissimo, Mon Artisan"],
  }),
  step("Devis", "Obtenir plusieurs devis d'artisans", "M1-2", "essentielle", {
    title: "Comparer les devis",
    body: "Demandez au moins 3 devis détaillés poste par poste. Méfiez-vous des écarts de prix trop importants sans explication.",
    contacts: ["Habitissimo, Mon Artisan pour comparer"],
  }),
  step("Devis", "Vérifier les assurances (décennale, RGE)", "M2", "importante", {
    title: "Sécuriser le chantier",
    body: "Vérifiez l'assurance décennale de chaque artisan et sa certification RGE si vous visez des aides énergétiques.",
    contacts: ["qualibat.com pour vérifier une certification"],
  }),
  step("Financement", "Financer les travaux (prêt travaux, apport)", "M2", "essentielle", {
    title: "Choisir le bon financement",
    body: "Un prêt travaux classique convient pour de petits montants ; au-delà, un rachat de crédit ou un prêt immobilier peut être plus avantageux.",
    contacts: ["Votre banque ou un courtier"],
  }),
  step("Financement", "Vérifier les aides mobilisables", "M2", "utile", {
    title: "Aides et subventions",
    body: "Certains travaux (isolation, chauffage) ouvrent droit à des aides même hors rénovation énergétique globale.",
    contacts: ["MaPrimeRenov.gouv.fr", "Aides locales (mairie, région)"],
  }),
  step("Chantier", "Suivre l'avancement du chantier", "M2-4", "importante", {
    title: "Rester impliqué",
    body: "Prévoyez des points réguliers avec l'artisan. Documentez l'avancement par photos avant/pendant/après.",
    contacts: ["Un maître d'œuvre peut coordonner un chantier complexe"],
  }),
  step("Chantier", "Gérer les imprévus", "M2-4", "utile", {
    title: "Prévoir une marge",
    body: "Gardez 10 à 15% du budget en réserve pour les imprévus (découvertes en démolition, délais).",
    contacts: ["Discutez des avenants par écrit avec l'artisan"],
  }),
  step("Réception", "Réceptionner les travaux", "M4", "essentielle", {
    title: "Vérifier avant de payer le solde",
    body: "Contrôlez la conformité aux devis avant de régler le solde. Notez toute réserve par écrit.",
    contacts: ["Un expert peut vous accompagner pour un gros chantier"],
  }),
  step("Réception", "Conserver les factures et garanties", "M4", "utile", {
    title: "Garder une trace",
    body: "Les factures servent de preuve pour la garantie décennale et peuvent être utiles à la revente ou pour les impôts.",
    contacts: ["Classez les factures par poste de travaux"],
  }),
]);

STEPS_BY_TYPE["renovation-energetique"] = mk("renovation-energetique", [
  step("Définir projet", "Faire réaliser un audit énergétique", "M1", "essentielle", {
    title: "Point de départ indispensable",
    body: "L'audit identifie les postes de déperdition (toiture, murs, fenêtres, chauffage) et hiérarchise les travaux les plus rentables.",
    contacts: ["Bureau d'études thermiques certifié"],
  }),
  step("Définir projet", "Définir le bouquet de travaux (isolation, chauffage…)", "M1", "essentielle", {
    title: "Viser un gain de classe DPE",
    body: "Un bouquet cohérent (isolation + ventilation + chauffage) est souvent nécessaire pour gagner plusieurs classes DPE et maximiser les aides.",
    contacts: ["MaPrimeRenov.gouv.fr — simulateur"],
  }),
  step("Devis", "Obtenir des devis d'artisans certifiés RGE", "M1-2", "essentielle", {
    title: "La certification RGE est obligatoire",
    body: "Sans certification RGE de l'artisan, vous perdez l'accès à la quasi-totalité des aides publiques (MaPrimeRénov', CEE, éco-PTZ).",
    contacts: ["France Rénov' — france-renov.gouv.fr"],
  }),
  step("Devis", "Comparer les gains énergétiques attendus", "M2", "importante", {
    title: "Comparer sur la performance, pas que le prix",
    body: "Demandez à chaque artisan une estimation du gain de consommation attendu pour comparer objectivement les devis.",
    contacts: ["Votre bureau d'études ou conseiller France Rénov'"],
  }),
  step("Financement", "Monter le dossier MaPrimeRénov'", "M2", "essentielle", {
    title: "La principale aide de l'État",
    body: "Le montant dépend de vos revenus et du gain énergétique. Le dossier se monte avant le démarrage des travaux, jamais après.",
    contacts: ["maprimerenov.gouv.fr"],
  }),
  step("Financement", "Vérifier l'éco-PTZ et les aides locales / CEE", "M2", "utile", {
    title: "Cumuler les aides",
    body: "L'éco-prêt à taux zéro et les primes CEE (fournisseurs d'énergie) peuvent se cumuler avec MaPrimeRénov' pour réduire le reste à charge.",
    contacts: ["service-public.fr — éco-PTZ", "Primes CEE auprès de votre fournisseur d'énergie"],
  }),
  step("Chantier", "Suivre les travaux avec l'artisan RGE", "M3-5", "importante", {
    title: "Rester vigilant sur la mise en œuvre",
    body: "Une isolation mal posée annule une grande partie du gain attendu. Exigez le respect des règles de l'art (ventilation notamment).",
    contacts: ["Conseiller France Rénov' en cas de doute"],
  }),
  step("Chantier", "Vérifier la conformité aux critères d'aide", "M3-5", "importante", {
    title: "Ne pas perdre l'aide en cours de route",
    body: "Toute modification du devis initial doit être validée pour ne pas remettre en cause l'éligibilité aux aides déjà accordées.",
    contacts: ["Votre conseiller France Rénov'"],
  }),
  step("Réception", "Faire réaliser le nouveau DPE", "M5-6", "essentielle", {
    title: "Mesurer le résultat",
    body: "Un nouveau DPE officialise le gain de classe énergétique, utile pour la revente, la location et le solde des aides.",
    contacts: ["Diagnostiqueur certifié"],
  }),
  step("Réception", "Déclarer les travaux pour les aides et les impôts", "M6", "utile", {
    title: "Finaliser les démarches",
    body: "Conservez toutes les factures et attestations RGE. Certaines aides nécessitent une déclaration a posteriori pour le versement du solde.",
    contacts: ["maprimerenov.gouv.fr — espace personnel"],
  }),
]);

STEPS_BY_TYPE["sci"] = mk("sci", [
  step("Stratégie", "Définir l'objectif de la SCI (gestion, transmission…)", "M1", "essentielle", {
    title: "Pourquoi créer une SCI ?",
    body: "La SCI facilite la gestion à plusieurs, la transmission (donation de parts) et peut offrir une meilleure protection patrimoniale qu'une indivision.",
    contacts: ["Notaire pour évaluer votre situation"],
  }),
  step("Stratégie", "Choisir le régime fiscal (IR ou IS)", "M1", "essentielle", {
    title: "IR ou IS, un choix structurant",
    body: "À l'IR, les revenus sont imposés directement chez les associés. À l'IS, la SCI permet l'amortissement du bien mais la plus-value à la revente est moins favorable.",
    contacts: ["Expert-comptable spécialisé immobilier"],
  }),
  step("Constitution", "Rédiger les statuts", "M1-2", "essentielle", {
    title: "Un document fondateur",
    body: "Les statuts fixent l'objet social, le capital, la répartition des parts et les règles de gouvernance (majorité, gérance).",
    contacts: ["Notaire ou avocat pour la rédaction"],
  }),
  step("Constitution", "Immatriculer la SCI (Kbis)", "M2", "essentielle", {
    title: "L'immatriculation officielle",
    body: "Publiez une annonce légale puis déposez le dossier au greffe pour obtenir le Kbis, indispensable pour agir au nom de la société.",
    contacts: ["guichet-entreprises.fr"],
  }),
  step("Acquisition", "Ouvrir un compte bancaire dédié", "M2", "importante", {
    title: "Séparer les patrimoines",
    body: "Le compte bancaire de la SCI doit être distinct des comptes personnels des associés pour la clarté comptable et juridique.",
    contacts: ["Votre banque habituelle ou une banque en ligne pro"],
  }),
  step("Acquisition", "Acquérir le ou les biens au nom de la SCI", "M2-3", "essentielle", {
    title: "L'acte d'achat au nom de la société",
    body: "Le compromis et l'acte de vente sont signés par le gérant au nom de la SCI, avec pouvoir donné par les statuts ou une décision d'assemblée.",
    contacts: ["Votre notaire"],
  }),
  step("Gestion", "Tenir la comptabilité annuelle", "M4+", "importante", {
    title: "Une obligation légale",
    body: "Même une SCI à l'IR simplifiée doit tenir une comptabilité a minima. À l'IS, la comptabilité est complète et obligatoire.",
    contacts: ["Expert-comptable spécialisé SCI"],
  }),
  step("Gestion", "Organiser l'assemblée générale annuelle", "M4+", "utile", {
    title: "Formaliser les décisions",
    body: "L'AG annuelle approuve les comptes et peut décider de travaux ou de distributions. Rédigez un procès-verbal à chaque fois.",
    contacts: ["Modèles de PV disponibles auprès de votre expert-comptable"],
  }),
]);

STEPS_BY_TYPE["lmnp"] = mk("lmnp", [
  step("Stratégie", "Choisir le régime LMNP (micro-BIC ou réel)", "M1", "essentielle", {
    title: "Micro-BIC ou réel ?",
    body: "Le micro-BIC offre un abattement forfaitaire de 50%. Le régime réel permet de déduire les charges réelles et d'amortir le bien — souvent plus avantageux.",
    contacts: ["Expert-comptable spécialisé LMNP"],
  }),
  step("Stratégie", "Estimer l'avantage fiscal (amortissements)", "M1", "importante", {
    title: "L'atout du régime réel",
    body: "L'amortissement du bien et du mobilier permet souvent de ne payer aucun impôt sur les loyers pendant 10 à 15 ans.",
    contacts: ["Simulateurs LMNP en ligne"],
  }),
  step("Constitution", "S'immatriculer au greffe (activité meublée)", "M1-2", "essentielle", {
    title: "Une déclaration obligatoire",
    body: "Toute activité de location meublée doit être déclarée au greffe du tribunal de commerce dans les 15 jours suivant le début d'activité.",
    contacts: ["guichet-entreprises.fr"],
  }),
  step("Constitution", "Choisir un expert-comptable spécialisé", "M2", "importante", {
    title: "Un investissement rentable",
    body: "Un expert-comptable LMNP (100-300€/an) sécurise vos amortissements et votre liasse fiscale, souvent rentabilisé dès la première année.",
    contacts: ["Cabinets spécialisés LMNP en ligne"],
  }),
  step("Acquisition", "Acheter et meubler le bien selon le décret", "M2-4", "essentielle", {
    title: "Le mobilier obligatoire",
    body: "Un décret liste le mobilier minimum requis (literie, plaques de cuisson, réfrigérateur, vaisselle…) pour qualifier la location de meublée.",
    contacts: ["Liste officielle sur service-public.fr"],
  }),
  step("Acquisition", "Vérifier la conformité du mobilier", "M4", "utile", {
    title: "Éviter la requalification",
    body: "Un logement insuffisamment meublé peut être requalifié en location nue par l'administration, avec un régime fiscal moins favorable.",
    contacts: ["Votre expert-comptable peut vérifier la conformité"],
  }),
  step("Gestion", "Déclarer les revenus BIC chaque année", "M12", "essentielle", {
    title: "La déclaration annuelle",
    body: "Les revenus locatifs meublés se déclarent en BIC (bénéfices industriels et commerciaux), et non en revenus fonciers classiques.",
    contacts: ["Votre expert-comptable prépare la liasse"],
  }),
  step("Gestion", "Suivre les amortissements comptables", "M12+", "importante", {
    title: "Un suivi dans la durée",
    body: "Les amortissements se répartissent sur plusieurs années (bien, mobilier, travaux). Un bon suivi maximise l'optimisation fiscale année après année.",
    contacts: ["Votre expert-comptable LMNP"],
  }),
]);

STEPS_BY_TYPE["mise-en-location"] = mk("mise-en-location", [
  step("Préparation", "Réaliser les diagnostics obligatoires (DPE, électricité…)", "M1", "essentielle", {
    title: "Diagnostics avant mise en location",
    body: "DPE, électricité, gaz et ERP sont obligatoires avant toute mise en location. Le DPE conditionne même la légalité de la location (G interdit depuis 2025).",
    contacts: ["diagnostiqueurs.gouv.fr"],
  }),
  step("Préparation", "Vérifier l'encadrement des loyers", "M1", "importante", {
    title: "Zones tendues : un plafond légal",
    body: "Dans certaines villes, le loyer est encadré par un plafond au m². Vérifiez avant de fixer votre prix pour éviter tout litige.",
    contacts: ["encadrementdesloyers.gouv.fr"],
  }),
  step("Préparation", "Fixer le loyer et les charges", "M1", "essentielle", {
    title: "Bien positionner son loyer",
    body: "Comparez les annonces similaires du quartier. Un loyer trop élevé rallonge la vacance locative, qui coûte plus cher qu'une petite baisse de prix.",
    contacts: ["SeLoger, LeBonCoin pour comparer le marché local"],
  }),
  step("Recherche locataire", "Publier l'annonce de location", "M1-2", "essentielle", {
    title: "Bien rédiger son annonce",
    body: "Mentionnez surface Carrez, nombre de pièces, étage, DPE et loyer charges comprises pour attirer les bons profils.",
    contacts: ["PAP.fr (gratuit pour les propriétaires)", "LeBonCoin Immo"],
  }),
  step("Recherche locataire", "Sélectionner le locataire (dossier, garant)", "M2", "essentielle", {
    title: "Comment sélectionner son locataire ?",
    body: "La loi interdit de discriminer. Ratio habituel : revenus = 3x le loyer. Vérifiez les justificatifs via DossierFacile.",
    contacts: ["DossierFacile.fr — vérification sécurisée", "GLI : Visale (gratuit) ou assureurs privés"],
  }),
  step("Bail", "Rédiger le bail conforme (loi Alur)", "M2", "essentielle", {
    title: "Un bail type obligatoire",
    body: "Le bail doit respecter le modèle type fixé par la loi Alur et mentionner toutes les clauses obligatoires (loyer, charges, durée, préavis).",
    contacts: ["Modèle officiel sur service-public.fr"],
  }),
  step("Bail", "Faire l'état des lieux d'entrée", "M2", "essentielle", {
    title: "Votre seule protection en cas de litige",
    body: "Photos datées de chaque pièce et relevé des compteurs sont indispensables pour comparer avec l'état des lieux de sortie.",
    contacts: ["Apps dédiées : État des lieux Facile, Immo Facile"],
  }),
  step("Gestion", "Encaisser les loyers et régulariser les charges", "M3+", "importante", {
    title: "Le suivi mensuel",
    body: "Prévoyez une régularisation annuelle des charges sur justificatifs. Un logiciel ou une agence de gestion peut automatiser le suivi.",
    contacts: ["Agence de gestion locative (6-10% des loyers) si vous préférez déléguer"],
  }),
  step("Gestion", "Gérer le renouvellement ou le départ du locataire", "M12+", "utile", {
    title: "Anticiper la fin de bail",
    body: "Un préavis de 3 mois s'applique en location vide, 1 mois en meublé. Préparez l'état des lieux de sortie et la restitution du dépôt de garantie.",
    contacts: ["service-public.fr — préavis et restitution du dépôt"],
  }),
]);

// "Location" suit le même parcours que "Mise en location" (mêmes phases, côté bailleur)
STEPS_BY_TYPE["location"] = STEPS_BY_TYPE["mise-en-location"];

// ─── PHASE COLORS ─────────────────────────────────────────────────────────────
const phaseColors = {
  "Préparer": "#f59e0b",
  "Recherche locataire": "#0ea5e9",
  "Recherche": "#06b6d4",
  "Visites": "#3b82f6",
  "Offre": "#f97316",
  "Compromis": "#8b5cf6",
  "Prêt": "#ec4899",
  "Notaire": "#6366f1",
  "Installation": "#10b981",
  "Travaux (optionnel)": "#64748b",
  "Préparation": "#f59e0b",
  "Mise en vente": "#3b82f6",
  "Finalisation": "#10b981",
  "Terrain": "#a16207",
  "Architecte": "#7c3aed",
  "Permis": "#0891b2",
  "Financement": "#ec4899",
  "Chantier": "#f97316",
  "Réception": "#10b981",
  "Définir projet": "#f59e0b",
  "Devis": "#06b6d4",
  "Stratégie": "#84cc16",
  "Constitution": "#8b5cf6",
  "Acquisition": "#6366f1",
  "Gestion": "#14b8a6",
  "Bail": "#f97316",
};

function getPhaseColor(phaseKey) {
  if (phaseColors[phaseKey]) return phaseColors[phaseKey];
  for (const [k, v] of Object.entries(phaseColors)) {
    if (phaseKey.includes(k)) return v;
  }
  return "#94a3b8";
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function calcNotaire(prix, neuf = false) {
  return neuf ? prix * 0.025 : prix * 0.075;
}

const fmt = n => isNaN(n) || !isFinite(n) ? "—" : Math.round(n).toLocaleString("fr-FR") + " €";

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function getDeadlineInfo(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(`${dateStr}T00:00:00`);
  if (isNaN(deadline.getTime())) return null;
  const diffDays = Math.round((deadline - today) / 86400000);
  if (diffDays < 0) return { diffDays, color: "#b91c1c", bg: "#fee2e2", label: "En retard !" };
  if (diffDays < 3) return { diffDays, color: "#b91c1c", bg: "#fee2e2", label: `J-${diffDays}` };
  if (diffDays <= 7) return { diffDays, color: "#b45309", bg: "#fef3c7", label: `J-${diffDays}` };
  return { diffDays, color: "#047857", bg: "#d1fae5", label: `J-${diffDays}` };
}

// Sends browser notifications for deadlines hitting J-7 / J-3 / J-0, once per milestone.
function checkDeadlineNotifications(projects) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return { changed: false, projects };
  }
  let changed = false;
  const next = projects.map(p => {
    const steps = STEPS_BY_TYPE[p.type] || [];
    const deadlines = p.deadlines || {};
    const notified = { ...(p.notifiedDeadlines || {}) };
    let projectChanged = false;
    Object.entries(deadlines).forEach(([stepId, dateStr]) => {
      if (p.checklist[stepId]) return;
      const info = getDeadlineInfo(dateStr);
      if (!info) return;
      const milestone = info.diffDays === 7 ? "d7" : info.diffDays === 3 ? "d3" : info.diffDays === 0 ? "d0" : null;
      if (!milestone) return;
      const key = `${stepId}:${milestone}`;
      if (notified[key]) return;
      const step = steps.find(s => s.id === stepId);
      if (!step) return;
      const messages = {
        d7: `📅 Échéance dans 7 jours : ${step.label}`,
        d3: `⚠️ Échéance dans 3 jours : ${step.label}`,
        d0: `🚨 Échéance aujourd'hui : ${step.label}`,
      };
      new Notification("Cozimo", { body: messages[milestone] });
      notified[key] = true;
      projectChanged = true;
      changed = true;
    });
    return projectChanged ? { ...p, notifiedDeadlines: notified } : p;
  });
  return { changed, projects: next };
}

const fmtPct = n => isNaN(n) || !isFinite(n) ? "—" : n.toFixed(2) + " %";

function calcMensualite(capital, duree, taux) {
  const r = taux / 100 / 12;
  const n = duree * 12;
  if (r === 0) return capital / n;
  return capital * r / (1 - Math.pow(1 + r, -n));
}

// ─── COMPARATEUR DE BIENS — CALCULS ────────────────────────────────────────────
function effectivePrice(b) {
  const v = b.prixNegocie || b.prixAffiche || b.prixAchat;
  const n = parseFloat(v);
  return isNaN(n) || !n ? null : n;
}

function prixM2(b) {
  const prix = effectivePrice(b);
  const surface = parseFloat(b.surface) || 0;
  return prix && surface ? Math.round(prix / surface) : null;
}

function rendementBrut(b) {
  const prix = effectivePrice(b);
  const loyer = parseFloat(b.loyerEstime) || 0;
  return prix && loyer ? (loyer * 12 / prix) * 100 : null;
}

function rendementNet(b) {
  const prix = effectivePrice(b);
  const loyer = parseFloat(b.loyerEstime) || 0;
  const charges = parseFloat(b.charges) || 0;
  return prix ? ((loyer * 12 - charges * 12) / prix) * 100 : null;
}

// Mensualité de crédit estimée sur 25 ans à 3,5%, financement à 100% du prix (aucun apport saisi dans la fiche).
function estimatedMensualite(b) {
  const prix = effectivePrice(b);
  return prix ? calcMensualite(prix, 25, 3.5) : 0;
}

function cashflow(b) {
  if (!effectivePrice(b) && !b.loyerEstime) return null;
  const loyer = parseFloat(b.loyerEstime) || 0;
  const charges = parseFloat(b.charges) || 0;
  return loyer - charges - estimatedMensualite(b);
}

function dpeRank(letter) {
  const idx = DPE_LETTERS.indexOf(letter);
  return idx === -1 ? null : 7 - idx; // A=7 … G=1, plus haut = meilleur
}

function demandeRank(v) { return DEMANDE_RANK[v] ?? null; }
function potentielRank(v) { return POTENTIEL_RANK[v] ?? null; }

// Ramène une série de valeurs sur une échelle 0–10 relative au groupe comparé.
function normalizeScores(values, higherIsBetter) {
  const valid = values.filter(v => v != null && !isNaN(v));
  if (valid.length === 0) return values.map(() => null);
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  return values.map(v => {
    if (v == null || isNaN(v)) return null;
    if (max === min) return 10;
    const norm = (v - min) / (max - min);
    return higherIsBetter ? norm * 10 : (1 - norm) * 10;
  });
}

const RESIDENTIEL_SCORE_CRITERIA = [
  { weight: 0.30, higherIsBetter: true, get: b => parseFloat(b.coupDeCoeur) },
  { weight: 0.20, higherIsBetter: false, get: prixM2 },
  { weight: 0.15, higherIsBetter: true, get: b => dpeRank(b.dpe) },
  { weight: 0.15, higherIsBetter: false, get: b => parseFloat(b.estimationTravaux) },
  { weight: 0.10, higherIsBetter: false, get: b => parseFloat(b.distanceTransports) },
  { weight: 0.10, higherIsBetter: false, get: b => parseFloat(b.charges) },
];

const INVESTISSEUR_SCORE_CRITERIA = [
  { weight: 0.30, higherIsBetter: true, get: rendementNet },
  { weight: 0.25, higherIsBetter: true, get: cashflow },
  { weight: 0.15, higherIsBetter: true, get: b => demandeRank(b.demandeLocative) },
  { weight: 0.15, higherIsBetter: true, get: b => potentielRank(b.potentielValorisation) },
  { weight: 0.15, higherIsBetter: false, get: prixM2 },
];

// Score global /10 = moyenne pondérée des critères clés, normalisés relativement aux biens comparés.
function computeScores(biens, criteria) {
  const columns = criteria.map(c => normalizeScores(biens.map(c.get), c.higherIsBetter));
  return biens.map((_, bi) => {
    let total = 0, weightSum = 0;
    criteria.forEach((c, ci) => {
      const n = columns[ci][bi];
      if (n != null) { total += n * c.weight; weightSum += c.weight; }
    });
    return weightSum > 0 ? total / weightSum : null;
  });
}

function residentielRows(biens) {
  return [
    { label: "Prix", values: biens.map(effectivePrice), higherIsBetter: false, format: v => v != null ? fmt(v) : "—" },
    { label: "Surface", values: biens.map(b => parseFloat(b.surface) || null), higherIsBetter: true, format: v => v != null ? `${v} m²` : "—" },
    { label: "Prix/m²", values: biens.map(prixM2), higherIsBetter: false, format: v => v != null ? fmt(v) : "—" },
    { label: "DPE", values: biens.map(b => dpeRank(b.dpe)), higherIsBetter: true, format: (v, b) => b.dpe || "—" },
    { label: "Charges mensuelles", values: biens.map(b => parseFloat(b.charges) || null), higherIsBetter: false, format: v => v != null ? fmt(v) : "—" },
    { label: "Taxe foncière", values: biens.map(b => parseFloat(b.taxeFonciere) || null), higherIsBetter: false, format: v => v != null ? fmt(v) : "—" },
    { label: "Distance transports", values: biens.map(b => parseFloat(b.distanceTransports) || null), higherIsBetter: false, format: v => v != null ? `${v} min` : "—" },
    { label: "Travaux estimés", values: biens.map(b => parseFloat(b.estimationTravaux) || null), higherIsBetter: false, format: v => v != null ? fmt(v) : "—" },
    { label: "Coup de cœur", values: biens.map(b => parseFloat(b.coupDeCoeur) || null), higherIsBetter: true, format: v => v != null ? `${v}/10` : "—" },
  ];
}

function investisseurRows(biens) {
  return [
    { label: "Prix d'achat", values: biens.map(effectivePrice), higherIsBetter: false, format: v => v != null ? fmt(v) : "—" },
    { label: "Surface", values: biens.map(b => parseFloat(b.surface) || null), higherIsBetter: true, format: v => v != null ? `${v} m²` : "—" },
    { label: "Prix/m²", values: biens.map(prixM2), higherIsBetter: false, format: v => v != null ? fmt(v) : "—" },
    { label: "DPE", values: biens.map(b => dpeRank(b.dpe)), higherIsBetter: true, format: (v, b) => b.dpe || "—" },
    { label: "Loyer estimé", values: biens.map(b => parseFloat(b.loyerEstime) || null), higherIsBetter: true, format: v => v != null ? fmt(v) + "/mois" : "—" },
    { label: "Rendement brut", values: biens.map(rendementBrut), higherIsBetter: true, format: v => v != null ? fmtPct(v) : "—" },
    { label: "Rendement net", values: biens.map(rendementNet), higherIsBetter: true, format: v => v != null ? fmtPct(v) : "—" },
    { label: "Cash-flow mensuel", values: biens.map(cashflow), higherIsBetter: true, format: v => v != null ? fmt(v) : "—" },
    { label: "Demande locative", values: biens.map(b => demandeRank(b.demandeLocative)), higherIsBetter: true, format: (v, b) => DEMANDE_OPTIONS.find(o => o.value === b.demandeLocative)?.label || "—" },
    { label: "Potentiel valorisation", values: biens.map(b => potentielRank(b.potentielValorisation)), higherIsBetter: true, format: (v, b) => POTENTIEL_OPTIONS.find(o => o.value === b.potentielValorisation)?.label || "—" },
  ];
}

function buildAISystemPrompt(project) {
  const steps = STEPS_BY_TYPE[project.type] || [];
  const done = steps.filter(s => project.checklist[s.id]).length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
  const typeLabel = PROJECT_TYPES.find(t => t.id === project.type)?.label || project.type;
  const nextStep = steps.find(s => !project.checklist[s.id]);

  const b = project.budget || {};
  const budgetTotal = (parseFloat(b.apportPersonnel) || 0) + (parseFloat(b.capaciteEmprunt) || 0);
  const prixAchat = parseFloat(b.prixAchat) || 0;
  let budgetLine = "non renseigné";
  if (budgetTotal > 0) budgetLine = `${fmt(budgetTotal)} de budget total (apport + capacité d'emprunt)`;
  else if (prixAchat > 0) budgetLine = `prix d'achat prévu de ${fmt(prixAchat)}`;

  return `Tu es un assistant immobilier expert intégré dans Cozimo.
L'utilisateur a un projet de type ${typeLabel}.
Il en est à ${pct}% de son projet (${done}/${steps.length} étapes cochées).
Sa prochaine étape est : ${nextStep ? nextStep.label : "toutes les étapes sont complétées"}.
Son budget est : ${budgetLine}.
Réponds de façon concise, pratique et bienveillante en français.`;
}

async function callAnthropic(apiKey, systemPrompt, history, question) {
  const messages = [];
  history.slice(-5).forEach(h => {
    messages.push({ role: "user", content: h.question });
    messages.push({ role: "assistant", content: h.answer });
  });
  messages.push({ role: "user", content: question });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.error?.message || `Erreur API (${res.status})`;
    throw new Error(msg);
  }
  const data = await res.json();
  return data.content?.[0]?.text || "Pas de réponse.";
}

// ─── EXPORT PDF ───────────────────────────────────────────────────────────────
const JSPDF_CDN_URL = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
let jsPDFLoadPromise = null;

function loadJsPDF() {
  if (typeof window !== "undefined" && window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (jsPDFLoadPromise) return jsPDFLoadPromise;
  jsPDFLoadPromise = new Promise((resolve, reject) => {
    if (typeof document === "undefined") { reject(new Error("Export PDF disponible uniquement sur le web.")); return; }
    const script = document.createElement("script");
    script.src = JSPDF_CDN_URL;
    script.onload = () => {
      if (window.jspdf?.jsPDF) resolve(window.jspdf.jsPDF);
      else reject(new Error("jsPDF n'a pas pu être initialisé."));
    };
    script.onerror = () => reject(new Error("Impossible de charger jsPDF depuis le CDN."));
    document.head.appendChild(script);
  });
  return jsPDFLoadPromise;
}

function sanitizeFilename(str) {
  return (str || "projet")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "projet";
}

async function generateProjectPDF(project) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ unit: "mm", format: "a4" });

  const marginX = 15;
  const pageWidth = 210;
  const pageHeight = 297;
  let y = 20;

  const ensureSpace = (needed) => {
    if (y + needed > pageHeight - 15) { doc.addPage(); y = 20; }
  };

  const sectionTitle = (title) => {
    ensureSpace(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(26, 26, 46);
    doc.text(title, marginX, y);
    y += 3;
    doc.setDrawColor(229, 227, 223);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 7;
  };

  const line = (text, { bold = false, size = 10, color = [51, 65, 85], indent = 0, gap = 5.5 } = {}) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const wrapped = doc.splitTextToSize(text, pageWidth - marginX * 2 - indent);
    wrapped.forEach(l => {
      ensureSpace(gap + 1);
      doc.text(l, marginX + indent, y);
      y += gap;
    });
  };

  // toLocaleString("fr-FR") sépare les milliers avec une espace insécable/fine (U+00A0, U+202F)
  // que la police Helvetica de jsPDF ne sait pas afficher — on la remplace par une espace normale.
  const pdfAmount = (n) => fmt(n).replace(/[  ]/g, " ");

  // ── En-tête ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(185, 64, 64);
  doc.text("Cozimo", marginX, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Exporté le ${new Date().toLocaleDateString("fr-FR")}`, pageWidth - marginX, y - 2, { align: "right" });
  y += 12;

  const steps = STEPS_BY_TYPE[project.type] || [];
  const done = steps.filter(s => project.checklist[s.id]).length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
  const typeLabel = PROJECT_TYPES.find(t => t.id === project.type)?.label || project.type;

  line(project.name, { bold: true, size: 16, color: [26, 26, 46], gap: 7 });
  line(`${typeLabel} — ${pct}% complété (${done}/${steps.length} étapes)`, { size: 11, color: [71, 85, 105], gap: 9 });

  // ── Étapes ──
  sectionTitle("Étapes");
  const phases = {};
  steps.forEach(s => {
    const key = s.tag ? `${s.tag} — ${s.phase}` : s.phase;
    if (!phases[key]) phases[key] = [];
    phases[key].push(s);
  });
  (project.customSteps || []).forEach(cs => {
    if (!phases[cs.phaseKey]) phases[cs.phaseKey] = [];
    phases[cs.phaseKey].push({ id: cs.id, label: cs.label, custom: true });
  });
  Object.entries(phases).forEach(([phase, items]) => {
    const phaseDone = items.filter(s => project.checklist[s.id]).length;
    line(`${phase} (${phaseDone}/${items.length})`, { bold: true, size: 11, color: [51, 65, 85], gap: 6 });
    items.forEach(s => {
      const checked = !!project.checklist[s.id];
      const deadline = project.deadlines?.[s.id];
      const deadlineText = deadline ? ` — échéance : ${fmtDate(deadline)}` : "";
      const customText = s.custom ? " (Personnalisée)" : "";
      line(`${checked ? "[x]" : "[ ]"} ${s.label}${customText}${deadlineText}`, { indent: 4, color: checked ? [16, 185, 129] : [71, 85, 105] });
    });
    y += 2;
  });

  // ── Budget ──
  sectionTitle("Budget");
  const b = project.budget || {};

  const apportPersonnel = parseFloat(b.apportPersonnel) || 0;
  const capaciteEmprunt = parseFloat(b.capaciteEmprunt) || 0;
  const budgetTotal = apportPersonnel + capaciteEmprunt;

  const prixAchat = parseFloat(b.prixAchat) || 0;
  const neuf = !!b.neuf;
  const fraisNotaire = calcNotaire(prixAchat, neuf);
  const fraisAgence = parseFloat(b.fraisAgence) || 0;
  const fraisDossierBancaire = parseFloat(b.fraisDossierBancaire) || 0;
  const fraisCourtier = parseFloat(b.fraisCourtier) || 0;
  const totalAcquisition = prixAchat + fraisNotaire + fraisAgence + fraisDossierBancaire + fraisCourtier;

  const budgetTravaux = parseFloat(b.budgetTravaux) || 0;
  const cuisineElectromenager = parseFloat(b.cuisineElectromenager) || 0;
  const mobilier = parseFloat(b.mobilier) || 0;
  const decoration = parseFloat(b.decoration) || 0;
  const totalInstallation = budgetTravaux + cuisineElectromenager + mobilier + decoration;

  const chargesCopro = parseFloat(b.chargesCopro) || 0;
  const taxeFonciereBudget = parseFloat(b.taxeFonciere) || 0;
  const assuranceHabitation = parseFloat(b.assuranceHabitation) || 0;
  const canComputeMensualite = apportPersonnel > 0 && capaciteEmprunt > 0 && prixAchat > 0;
  const capitalEmprunte = Math.max(0, prixAchat - apportPersonnel);
  const mensualiteCredit = canComputeMensualite ? calcMensualite(capitalEmprunte, 25, 3.5) : 0;
  const totalMensuel = chargesCopro + taxeFonciereBudget / 12 + assuranceHabitation + mensualiteCredit;

  const resteDisponible = budgetTotal - totalAcquisition - totalInstallation;
  const restePct = budgetTotal > 0 ? (resteDisponible / budgetTotal) * 100 : null;

  if (budgetTotal === 0 && totalAcquisition === 0 && totalInstallation === 0) {
    line("Aucune information budgétaire renseignée.", { color: [148, 163, 184] });
  } else {
    line("Financement", { bold: true, size: 11, color: [51, 65, 85], gap: 6 });
    if (apportPersonnel > 0) line(`Apport personnel : ${pdfAmount(apportPersonnel)}`, { indent: 4 });
    if (capaciteEmprunt > 0) line(`Capacité d'emprunt estimée : ${pdfAmount(capaciteEmprunt)}`, { indent: 4 });
    line(`Budget total : ${pdfAmount(budgetTotal)}`, { bold: true, indent: 4 });
    y += 2;

    line("Coûts d'acquisition", { bold: true, size: 11, color: [51, 65, 85], gap: 6 });
    if (prixAchat > 0) line(`Prix d'achat : ${pdfAmount(prixAchat)}`, { indent: 4 });
    if (prixAchat > 0) line(`Frais de notaire : ${pdfAmount(fraisNotaire)}`, { indent: 4 });
    if (fraisAgence > 0) line(`Frais d'agence : ${pdfAmount(fraisAgence)}`, { indent: 4 });
    if (fraisDossierBancaire > 0) line(`Frais de dossier bancaire : ${pdfAmount(fraisDossierBancaire)}`, { indent: 4 });
    if (fraisCourtier > 0) line(`Frais de courtier : ${pdfAmount(fraisCourtier)}`, { indent: 4 });
    line(`Total acquisition : ${pdfAmount(totalAcquisition)}`, { bold: true, indent: 4 });
    y += 2;

    line("Coûts d'installation", { bold: true, size: 11, color: [51, 65, 85], gap: 6 });
    if (budgetTravaux > 0) line(`Budget travaux : ${pdfAmount(budgetTravaux)}`, { indent: 4 });
    if (cuisineElectromenager > 0) line(`Cuisine / électroménager : ${pdfAmount(cuisineElectromenager)}`, { indent: 4 });
    if (mobilier > 0) line(`Mobilier : ${pdfAmount(mobilier)}`, { indent: 4 });
    if (decoration > 0) line(`Décoration : ${pdfAmount(decoration)}`, { indent: 4 });
    line(`Total installation : ${pdfAmount(totalInstallation)}`, { bold: true, indent: 4 });
    y += 2;

    line("Coûts récurrents", { bold: true, size: 11, color: [51, 65, 85], gap: 6 });
    if (chargesCopro > 0) line(`Charges de copropriété : ${pdfAmount(chargesCopro)}/mois`, { indent: 4 });
    if (taxeFonciereBudget > 0) line(`Taxe foncière : ${pdfAmount(taxeFonciereBudget)}/an`, { indent: 4 });
    if (assuranceHabitation > 0) line(`Assurance habitation : ${pdfAmount(assuranceHabitation)}/mois`, { indent: 4 });
    if (canComputeMensualite) line(`Mensualité crédit estimée : ${pdfAmount(mensualiteCredit)}/mois`, { indent: 4 });
    line(`Total mensuel : ${pdfAmount(totalMensuel)}/mois`, { bold: true, indent: 4 });
    y += 3;

    line("Récapitulatif", { bold: true, size: 11, color: [51, 65, 85], gap: 6 });
    line(`Budget total : ${pdfAmount(budgetTotal)}`, { indent: 4 });
    line(`- Total acquisition : ${pdfAmount(totalAcquisition)}`, { indent: 4 });
    line(`- Total installation : ${pdfAmount(totalInstallation)}`, { indent: 4 });
    const recapColorPdf = resteDisponible < 0 ? [185, 28, 28] : (restePct != null && restePct <= 10 ? [180, 83, 9] : [4, 120, 87]);
    line(`= Reste disponible : ${pdfAmount(resteDisponible)}`, { bold: true, size: 11, color: recapColorPdf, indent: 4 });
  }

  // ── Contacts ──
  sectionTitle("Contacts");
  const contacts = project.contacts || [];
  if (contacts.length === 0) {
    line("Aucun contact enregistré.", { color: [148, 163, 184] });
  } else {
    contacts.forEach(c => {
      const roleLabel = CONTACT_ROLES.find(r => r.value === c.role)?.label || "Autre";
      line(`${c.nom || "Sans nom"} — ${roleLabel}`, { bold: true, gap: 6 });
      if (c.telephone) line(`Tél. : ${c.telephone}`, { indent: 4 });
      if (c.email) line(`Email : ${c.email}`, { indent: 4 });
      if (c.notes) line(`Notes : ${c.notes}`, { indent: 4, color: [100, 116, 139] });
      y += 2;
    });
  }

  // ── Journal ──
  sectionTitle("Journal");
  const stepEntries = steps
    .filter(s => project.checklist[s.id])
    .map(s => ({ date: project.checklist[s.id], title: s.label, type: "etape" }));
  const manualEntries = (project.journal || []).map(e => ({ date: e.date, title: e.title, type: e.type, description: e.description }));
  const allEntries = [...stepEntries, ...manualEntries].sort((a, b2) => (a.date < b2.date ? -1 : 1));
  if (allEntries.length === 0) {
    line("Aucune entrée dans le journal.", { color: [148, 163, 184] });
  } else {
    allEntries.forEach(e => {
      const typeLabel2 = JOURNAL_TYPES[e.type]?.label || "Autre";
      line(`${fmtDate(e.date)} — [${typeLabel2}] ${e.title}`, { bold: true, gap: 6 });
      if (e.description) line(e.description, { indent: 4, color: [100, 116, 139] });
    });
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `Cozimo-${sanitizeFilename(project.name)}-${dateStr}.pdf`;
  doc.save(filename);
}

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
function CozimoLogo({ width = 160, height = 48, dark = false }) {
  const fill = dark ? "#1a1a2e" : "white";
  return (
    <svg width={width} height={height} viewBox="0 0 160 48" xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="38" fontFamily="Outfit, sans-serif" fontSize="40" fontWeight="600" fill={fill}>C</text>
      <text x="26" y="38" fontFamily="Outfit, sans-serif" fontSize="40" fontWeight="600" fill={fill}>o</text>
      <text x="52" y="38" fontFamily="Outfit, sans-serif" fontSize="40" fontWeight="600" fill={fill}>z</text>
      <circle cx="82" cy="12" r="7" stroke="#B94040" strokeWidth="3.5" fill="none" />
      <rect x="79" y="19" width="6" height="20" rx="3" fill="#B94040" />
      <rect x="79" y="29" width="10" height="4" rx="2" fill="#B94040" />
      <rect x="79" y="35" width="7" height="4" rx="2" fill="#B94040" />
      <text x="93" y="38" fontFamily="Outfit, sans-serif" fontSize="40" fontWeight="600" fill={fill}>m</text>
      <text x="131" y="38" fontFamily="Outfit, sans-serif" fontSize="40" fontWeight="600" fill={fill}>o</text>
    </svg>
  );
}

function CozimoIcon({ size = 64 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <rect width="80" height="80" rx="20" fill="#B94040" />
      <path
        d="M40 11 C33 11 27 17 27 24 C27 30 31 35 36 36.5 L36 60 C36 62 38 64 40 64 C42 64 44 62 44 60 L44 57 L48 57 L48 52 L44 52 L44 48 L49 48 L49 43 L44 43 L44 36.5 C49 35 53 30 53 24 C53 17 47 11 40 11 Z M40 17 C44 17 47 20 47 24 C47 28 44 31 40 31 C36 31 33 28 33 24 C33 20 36 17 40 17 Z"
        fill="white"
      />
    </svg>
  );
}

function InfoModal({ step, onClose }) {
  if (!step?.info) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: "80vh", overflowY: "auto" }}>
        <div className="px-5 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-1">ℹ️ Plus d'infos</div>
            <h3 className="font-bold text-slate-800 text-base leading-snug">{step.info.title}</h3>
          </div>
          <button onClick={onClose}
            className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-all text-sm">
            ✕
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-slate-600 leading-relaxed mb-4">{step.info.body}</p>
          {step.info.contacts?.length > 0 && (
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">À contacter / ressources utiles</div>
              <div className="flex flex-col gap-2">
                {step.info.contacts.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 bg-blue-50 rounded-xl px-3 py-2">
                    <span className="text-blue-400 text-xs mt-0.5 flex-shrink-0">→</span>
                    <span className="text-sm text-blue-800">{c}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-5 pb-5">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 transition-all">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function ProModal({ step, proType, onClose }) {
  if (!proType) return null;
  const pro = PRO_TYPES[proType];
  if (!pro) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: "80vh", overflowY: "auto" }}>
        <div className="px-5 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-1">🔍 Trouver un professionnel</div>
            <h3 className="font-bold text-slate-800 text-base leading-snug">{pro.icon} {pro.label}</h3>
            {step?.label && <p className="text-xs text-slate-400 mt-1">Pour l'étape : {step.label}</p>}
          </div>
          <button onClick={onClose}
            className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-all text-sm">
            ✕
          </button>
        </div>
        <div className="px-5 pt-4">
          <button onClick={() => openNearMeSearch(pro.searchTerm)}
            className="w-full py-2.5 rounded-xl text-white text-sm font-bold transition-all hover:opacity-90"
            style={{ background: "#2563eb" }}>
            📍 Trouver près de moi
          </button>
        </div>
        <div className="px-5 py-4">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Liens utiles</div>
          <div className="flex flex-col gap-2">
            {pro.links.map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 bg-blue-50 rounded-xl px-3 py-2.5 text-sm text-blue-800 hover:bg-blue-100 transition-all">
                <span>{l.name}</span>
                <span className="text-blue-400 text-xs">↗</span>
              </a>
            ))}
          </div>
        </div>
        <div className="px-5 pb-5">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 transition-all">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function AIModal({ project, apiKey, onSaveKey, history, onAddExchange, onClose }) {
  const [screen, setScreen] = useState(apiKey ? "chat" : "config");
  const [keyInput, setKeyInput] = useState("");
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const suggestions = getAISuggestions(project.type);

  const saveKey = () => {
    const trimmed = keyInput.trim();
    if (!trimmed.startsWith("sk-ant-")) {
      setError("La clé doit commencer par sk-ant-…");
      return;
    }
    onSaveKey(trimmed);
    setKeyInput("");
    setError("");
    setScreen("chat");
  };

  const ask = async (q) => {
    const text = (q || question).trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      const systemPrompt = buildAISystemPrompt(project);
      const answer = await callAnthropic(apiKey, systemPrompt, history, text);
      onAddExchange({ question: text, answer });
      setQuestion("");
    } catch (e) {
      setError(e.message || "Une erreur est survenue.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: "85vh" }}>
        <div className="px-5 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <div className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-1">✨ Assistant IA</div>
            <h3 className="font-bold text-slate-800 text-base leading-snug">
              {screen === "config" ? "Configurer votre clé API" : "Posez votre question"}
            </h3>
          </div>
          <button onClick={onClose}
            className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-all text-sm">
            ✕
          </button>
        </div>

        {screen === "config" ? (
          <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto">
            <p className="text-sm text-slate-600 leading-relaxed">
              Pour utiliser l'assistant IA, entrez votre clé API Anthropic (obtenue sur console.anthropic.com).
            </p>
            {apiKey && <p className="text-xs text-slate-400">Clé actuelle : sk-ant-••••{apiKey.slice(-4)}</p>}
            <Input label="Clé API Anthropic" value={keyInput} onChange={setKeyInput} type="password" placeholder="sk-ant-…" />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="bg-blue-50 rounded-xl px-3 py-2.5 text-xs text-blue-800">
              🔒 Votre clé API est stockée localement sur votre appareil et n'est jamais partagée.
            </div>
            <div className="flex gap-3">
              {apiKey && (
                <button onClick={() => { setError(""); setScreen("chat"); }}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-all">
                  Annuler
                </button>
              )}
              <button onClick={saveKey}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all">
                Enregistrer
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 pt-3 flex-shrink-0">
              <button onClick={() => { setError(""); setScreen("config"); }} className="text-xs text-slate-400 hover:text-blue-600 transition-all">
                Modifier la clé
              </button>
            </div>
            <div className="px-5 py-3 overflow-y-auto flex-1 flex flex-col gap-3">
              {history.length === 0 && (
                <p className="text-sm text-slate-400">Posez une question sur votre projet, ou choisissez une suggestion ci-dessous.</p>
              )}
              {history.map((h, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className="self-end max-w-[85%] bg-blue-600 text-white text-sm rounded-2xl rounded-br-sm px-3 py-2" style={{ marginLeft: "auto" }}>
                    {h.question}
                  </div>
                  <div className="max-w-[85%] bg-slate-100 text-slate-700 text-sm rounded-2xl rounded-bl-sm px-3 py-2 whitespace-pre-wrap">
                    {h.answer}
                  </div>
                </div>
              ))}
              {sending && <div className="text-xs text-slate-400">L'assistant réfléchit…</div>}
              {error && <div className="text-xs text-red-500">{error}</div>}
            </div>

            {history.length === 0 && suggestions.length > 0 && (
              <div className="px-5 pb-2 flex flex-wrap gap-2 flex-shrink-0">
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => ask(s)} disabled={sending}
                    className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-all disabled:opacity-50">
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div className="px-5 pb-5 pt-2 border-t border-slate-100 flex gap-2 flex-shrink-0">
              <input
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); ask(); } }}
                placeholder="Votre question…"
                disabled={sending}
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <button onClick={() => ask()} disabled={sending || !question.trim()}
                className="px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all disabled:opacity-50 flex-shrink-0">
                Envoyer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Tag({ children, color }) {
  const colors = {
    vente: "bg-amber-100 text-amber-800",
    achat: "bg-blue-100 text-blue-800",
    default: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors[color] || colors.default}`}>
      {children}
    </span>
  );
}

function ProgressBar({ value, max, color = "#2563eb" }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
      <div
        className="h-2 rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

function Card({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm p-5 ${className}`} style={{ border: "0.5px solid #e5e3df" }}>
      {children}
    </div>
  );
}

function Input({ label, value, onChange, type = "text", suffix, prefix, placeholder, hint }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 bg-white">
        {prefix && <span className="px-3 text-slate-400 text-sm bg-slate-50 border-r border-slate-200 py-2.5">{prefix}</span>}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-3 py-2.5 text-sm outline-none bg-transparent"
        />
        {suffix && <span className="px-3 text-slate-400 text-sm bg-slate-50 border-l border-slate-200 py-2.5">{suffix}</span>}
      </div>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Stat({ label, value, sub, accent }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-xl font-bold ${accent || "text-slate-800"}`}>{value}</span>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </div>
  );
}

// ─── SCREENS ──────────────────────────────────────────────────────────────────
function NewProjectTypeScreen({ onSelect, onBack }) {
  const isHome = !onBack;
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "#1a1a2e", paddingTop: "3.5rem" }}>
      <div className="max-w-lg w-full">
        {onBack && (
          <button onClick={onBack} className="text-slate-400 hover:text-white text-xs mb-6 transition-all">
            ← Mes projets
          </button>
        )}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex items-center justify-center" style={{ paddingTop: 4 }}>
            <CozimoIcon size={64} />
          </div>
          {isHome ? (
            <div className="flex justify-center mb-2">
              <CozimoLogo width={160} height={48} />
            </div>
          ) : (
            <h1 className="text-2xl font-bold text-white mb-2">Nouveau projet</h1>
          )}
          <p className="text-slate-400 text-sm">{isHome ? "Tout votre projet immo dans une seule app" : "Quel type de projet voulez-vous suivre ?"}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {PROJECT_TYPES.map(t => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className="group bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/30 p-4 text-left transition-all duration-200 hover:scale-105"
              style={{ borderRadius: "14px" }}
            >
              <div className="text-2xl mb-1.5">{t.icon}</div>
              <div className="text-white font-semibold text-sm leading-snug">{t.label}</div>
              <div className="text-slate-400 text-xs mt-0.5">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function NewProjectDetailsScreen({ type, onCreate, onBack }) {
  const typeInfo = PROJECT_TYPES.find(t => t.id === type);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 7));

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "#1a1a2e" }}>
      <div className="max-w-md w-full">
        <button onClick={onBack} className="text-slate-400 hover:text-white text-xs mb-6 transition-all">
          ← Changer de type
        </button>
        <div className="mb-6">
          <p className="text-slate-400 text-xs mb-1">{typeInfo?.icon} {typeInfo?.label}</p>
          <h2 className="text-xl font-bold text-white">Donnez un nom à votre projet</h2>
        </div>
        <Card>
          <div className="flex flex-col gap-4">
            <Input label="Nom du projet" value={name} onChange={setName} placeholder={`Ex : ${typeInfo?.label}`} />
            <Input label="Date de début" value={startDate} onChange={setStartDate} type="month" />
          </div>
        </Card>
        <button
          onClick={() => onCreate({ name: name.trim() || typeInfo?.label, startDate })}
          className="w-full mt-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all"
        >
          Créer le projet 🚀
        </button>
      </div>
    </div>
  );
}

function ProjectCard({ project, onOpen }) {
  const steps = STEPS_BY_TYPE[project.type] || [];
  const done = steps.filter(s => project.checklist[s.id]).length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
  const typeInfo = PROJECT_TYPES.find(t => t.id === project.type);
  return (
    <button onClick={() => onOpen(project.id)} className="text-left w-full">
      <Card className="hover:shadow-md transition-all">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, background: "#2563eb", borderRadius: "10px", fontSize: 20 }}>
              {typeInfo?.icon}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-slate-800 text-sm truncate">{project.name}</div>
              <div className="text-xs text-slate-400">{typeInfo?.label}</div>
            </div>
          </div>
          <span className="text-xs font-semibold text-blue-600 flex-shrink-0">{pct}%</span>
        </div>
        <ProgressBar value={done} max={steps.length} />
      </Card>
    </button>
  );
}

function ProjectsScreen({ projects, onOpen, onCreate }) {
  return (
    <div className="min-h-screen" style={{ background: "#f8f7f5" }}>
      <div className="text-white px-5 pt-8 pb-12" style={{ background: "#1a1a2e" }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, background: "#2563eb", borderRadius: "10px" }}>
              <span style={{ fontSize: 20 }}>🏠</span>
            </div>
            <h1 className="text-2xl font-bold">Mes projets</h1>
          </div>
          <p className="text-slate-400 text-sm">{projects.length} projet{projects.length > 1 ? "s" : ""} en cours</p>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-5 -mt-6 pb-10">
        <div className="flex gap-2 mb-4">
          <button onClick={onCreate}
            className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all shadow-lg">
            + Nouveau projet
          </button>
          <button onClick={onCreate}
            className="px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-500 text-sm font-semibold hover:bg-slate-50 transition-all"
            title="Revenir à l'écran d'accueil">
            🏠 Accueil
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {projects.map(p => <ProjectCard key={p.id} project={p} onOpen={onOpen} />)}
        </div>
      </div>
    </div>
  );
}

function BudgetTab({ project, onUpdate }) {
  const b = project.budget || {};
  const set = (k, v) => onUpdate(p => ({ ...p, budget: { ...(p.budget || {}), [k]: v } }));

  // Section 1 — Financement
  const apportPersonnel = parseFloat(b.apportPersonnel) || 0;
  const capaciteEmprunt = parseFloat(b.capaciteEmprunt) || 0;
  const budgetTotal = apportPersonnel + capaciteEmprunt;

  // Section 2 — Coûts d'acquisition
  const prixAchat = parseFloat(b.prixAchat) || 0;
  const neuf = !!b.neuf;
  const fraisNotaire = calcNotaire(prixAchat, neuf);
  const fraisAgence = parseFloat(b.fraisAgence) || 0;
  const fraisDossierBancaire = parseFloat(b.fraisDossierBancaire) || 0;
  const fraisCourtier = parseFloat(b.fraisCourtier) || 0;
  const totalAcquisition = prixAchat + fraisNotaire + fraisAgence + fraisDossierBancaire + fraisCourtier;

  // Section 3 — Coûts d'installation
  const budgetTravaux = parseFloat(b.budgetTravaux) || 0;
  const cuisineElectromenager = parseFloat(b.cuisineElectromenager) || 0;
  const mobilier = parseFloat(b.mobilier) || 0;
  const decoration = parseFloat(b.decoration) || 0;
  const totalInstallation = budgetTravaux + cuisineElectromenager + mobilier + decoration;

  // Section 4 — Coûts récurrents
  const chargesCopro = parseFloat(b.chargesCopro) || 0;
  const taxeFonciere = parseFloat(b.taxeFonciere) || 0;
  const assuranceHabitation = parseFloat(b.assuranceHabitation) || 0;
  const canComputeMensualite = apportPersonnel > 0 && capaciteEmprunt > 0 && prixAchat > 0;
  const capitalEmprunte = Math.max(0, prixAchat - apportPersonnel);
  const mensualiteCredit = canComputeMensualite ? calcMensualite(capitalEmprunte, 25, 3.5) : 0;
  const totalMensuel = chargesCopro + taxeFonciere / 12 + assuranceHabitation + mensualiteCredit;

  // Récapitulatif final
  const resteDisponible = budgetTotal - totalAcquisition - totalInstallation;
  const restePct = budgetTotal > 0 ? (resteDisponible / budgetTotal) * 100 : null;
  let recapColor = "#64748b", recapBg = "#f1f5f9";
  if (budgetTotal > 0) {
    if (resteDisponible < 0) { recapColor = "#b91c1c"; recapBg = "#fee2e2"; }
    else if (restePct <= 10) { recapColor = "#b45309"; recapBg = "#fef3c7"; }
    else { recapColor = "#047857"; recapBg = "#d1fae5"; }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
          <span>💰</span> Financement (ce qui rentre)
        </h3>
        <div className="flex flex-col gap-4">
          <Input label="Apport personnel" value={b.apportPersonnel || ""} onChange={v => set("apportPersonnel", v)}
            type="number" suffix="€" hint="Votre épargne investie directement" />
          <Input label="Capacité d'emprunt estimée" value={b.capaciteEmprunt || ""} onChange={v => set("capaciteEmprunt", v)}
            type="number" suffix="€" hint="Montant estimé par votre banque ou courtier" />
          <Stat label="Budget total = Apport + Capacité d'emprunt" value={fmt(budgetTotal)} accent="text-blue-600" />
        </div>
      </Card>

      <Card>
        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
          <span>🏠</span> Coûts d'acquisition
        </h3>
        <div className="flex flex-col gap-4">
          <Input label="Prix d'achat" value={b.prixAchat || ""} onChange={v => set("prixAchat", v)} type="number" suffix="€" />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={neuf} onChange={e => set("neuf", e.target.checked)} />
            Bien neuf (frais de notaire à 2,5% au lieu de 7,5%)
          </label>
          <Stat label="Frais de notaire (calculé auto)" value={fmt(fraisNotaire)} sub={neuf ? "2,5% — neuf" : "7,5% — ancien"} />
          <Input label="Frais d'agence" value={b.fraisAgence || ""} onChange={v => set("fraisAgence", v)} type="number" suffix="€" />
          <Input label="Frais de dossier bancaire" value={b.fraisDossierBancaire || ""} onChange={v => set("fraisDossierBancaire", v)} type="number" suffix="€" />
          <Input label="Frais de courtier" value={b.fraisCourtier || ""} onChange={v => set("fraisCourtier", v)} type="number" suffix="€" />
          <Stat label="Total acquisition" value={fmt(totalAcquisition)} accent="text-blue-600" />
        </div>
      </Card>

      <Card>
        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
          <span>🛋️</span> Coûts d'installation
        </h3>
        <div className="flex flex-col gap-4">
          <Input label="Budget travaux" value={b.budgetTravaux || ""} onChange={v => set("budgetTravaux", v)} type="number" suffix="€" />
          <Input label="Cuisine / électroménager" value={b.cuisineElectromenager || ""} onChange={v => set("cuisineElectromenager", v)} type="number" suffix="€" />
          <Input label="Mobilier" value={b.mobilier || ""} onChange={v => set("mobilier", v)} type="number" suffix="€" />
          <Input label="Décoration" value={b.decoration || ""} onChange={v => set("decoration", v)} type="number" suffix="€" />
          <Stat label="Total installation" value={fmt(totalInstallation)} accent="text-blue-600" />
        </div>
      </Card>

      <Card>
        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
          <span>📆</span> Coûts récurrents
        </h3>
        <div className="flex flex-col gap-4">
          <Input label="Charges de copropriété" value={b.chargesCopro || ""} onChange={v => set("chargesCopro", v)} type="number" suffix="€/mois" />
          <Input label="Taxe foncière" value={b.taxeFonciere || ""} onChange={v => set("taxeFonciere", v)} type="number" suffix="€/an" />
          <Input label="Assurance habitation" value={b.assuranceHabitation || ""} onChange={v => set("assuranceHabitation", v)} type="number" suffix="€/mois" />
          <Stat label="Mensualité crédit (calculée auto)" value={canComputeMensualite ? fmt(mensualiteCredit) : "—"}
            sub="sur 25 ans à 3,5% — nécessite apport, capacité d'emprunt et prix d'achat" />
          <Stat label="Total mensuel" value={fmt(totalMensuel)} accent="text-blue-600" />
        </div>
      </Card>

      {/* Récapitulatif final */}
      <Card>
        <h3 className="font-bold text-slate-700 mb-4">Récapitulatif</h3>
        <div className="flex flex-col gap-2 text-sm text-slate-600 mb-3">
          <div className="flex justify-between">
            <span>Budget total</span>
            <span className="font-semibold text-slate-800">{fmt(budgetTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>− Total acquisition</span>
            <span>{fmt(totalAcquisition)}</span>
          </div>
          <div className="flex justify-between">
            <span>− Total installation</span>
            <span>{fmt(totalInstallation)}</span>
          </div>
        </div>
        <div className="p-4 rounded-xl" style={{ background: recapBg }}>
          <div className="text-xs font-bold uppercase tracking-wide" style={{ color: recapColor }}>= Reste disponible</div>
          <div className="text-2xl font-bold mt-0.5" style={{ color: recapColor }}>{fmt(resteDisponible)}</div>
          {restePct != null && (
            <div className="text-xs mt-1" style={{ color: recapColor }}>{restePct.toFixed(1)}% du budget total</div>
          )}
        </div>
      </Card>
    </div>
  );
}

function ContactCard({ contact, onDelete }) {
  const roleLabel = CONTACT_ROLES.find(r => r.value === contact.role)?.label || "Autre";
  return (
    <Card>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="font-bold text-slate-800 text-sm">{contact.nom}</div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">{roleLabel}</span>
        </div>
        <button onClick={() => onDelete(contact.id)}
          className="text-slate-300 hover:text-red-500 text-xs w-6 h-6 flex items-center justify-center flex-shrink-0 transition-all">
          ✕
        </button>
      </div>
      <div className="flex flex-col gap-1.5 mt-2">
        {contact.telephone && (
          <a href={`tel:${contact.telephone}`} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
            📞 {contact.telephone}
          </a>
        )}
        {contact.email && (
          <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
            ✉️ {contact.email}
          </a>
        )}
        {contact.notes && <p className="text-xs text-slate-500 mt-1">{contact.notes}</p>}
      </div>
    </Card>
  );
}

function ContactsTab({ project, onAdd, onDelete }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nom: "", role: "courtier", telephone: "", email: "", notes: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const contacts = project.contacts || [];

  const submit = () => {
    if (!form.nom.trim()) return;
    onAdd({ id: uid(), ...form });
    setForm({ nom: "", role: "courtier", telephone: "", email: "", notes: "" });
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <button onClick={() => setOpen(o => !o)}
        className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all">
        {open ? "✕ Annuler" : "+ Ajouter un contact"}
      </button>
      {open && (
        <Card>
          <div className="flex flex-col gap-4">
            <Input label="Nom" value={form.nom} onChange={v => set("nom", v)} placeholder="Ex : Marie Dupont" />
            <Select label="Rôle" value={form.role} onChange={v => set("role", v)} options={CONTACT_ROLES} />
            <Input label="Téléphone" value={form.telephone} onChange={v => set("telephone", v)} type="tel" placeholder="06 12 34 56 78" />
            <Input label="Email" value={form.email} onChange={v => set("email", v)} type="email" placeholder="marie@exemple.fr" />
            <Input label="Notes" value={form.notes} onChange={v => set("notes", v)} placeholder="Optionnel" />
            <button onClick={submit}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition-all">
              Enregistrer le contact
            </button>
          </div>
        </Card>
      )}
      {contacts.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">Aucun contact pour ce projet pour l'instant.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {contacts.map(c => <ContactCard key={c.id} contact={c} onDelete={onDelete} />)}
        </div>
      )}
    </div>
  );
}

function JournalTab({ project, onAdd }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), title: "", description: "", type: "note" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const steps = STEPS_BY_TYPE[project.type] || [];
  const stepEntries = steps
    .filter(s => project.checklist[s.id])
    .map(s => ({
      id: `auto-${s.id}`,
      date: project.checklist[s.id],
      title: s.label,
      description: s.tag ? `${s.tag} — ${s.phase}` : s.phase,
      type: "etape",
    }));

  const manualEntries = project.journal || [];
  const allEntries = [...stepEntries, ...manualEntries].sort((a, b) => (a.date < b.date ? 1 : -1));

  const submit = () => {
    if (!form.title.trim()) return;
    onAdd({ id: uid(), ...form });
    setForm({ date: new Date().toISOString().slice(0, 10), title: "", description: "", type: "note" });
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <button onClick={() => setOpen(o => !o)}
        className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all">
        {open ? "✕ Annuler" : "+ Ajouter une entrée"}
      </button>
      {open && (
        <Card>
          <div className="flex flex-col gap-4">
            <Input label="Date" value={form.date} onChange={v => set("date", v)} type="date" />
            <Select label="Type" value={form.type} onChange={v => set("type", v)} options={JOURNAL_TYPE_OPTIONS} />
            <Input label="Titre" value={form.title} onChange={v => set("title", v)} placeholder="Ex : Signature du compromis" />
            <Input label="Description" value={form.description} onChange={v => set("description", v)} placeholder="Optionnel" />
            <button onClick={submit}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition-all">
              Ajouter au journal
            </button>
          </div>
        </Card>
      )}
      {allEntries.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">Aucune entrée pour l'instant.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {allEntries.map(e => {
            const meta = JOURNAL_TYPES[e.type] || JOURNAL_TYPES.autre;
            return (
              <Card key={e.id}>
                <div className="flex items-start gap-3">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: meta.bg, color: meta.color }}>
                    {meta.icon} {meta.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-slate-800 text-sm">{e.title}</div>
                      <span className="text-xs text-slate-400 flex-shrink-0">{fmtDate(e.date)}</span>
                    </div>
                    {e.description && <p className="text-xs text-slate-500 mt-1">{e.description}</p>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TagListEditor({ label, items, onChange, placeholder }) {
  const [val, setVal] = useState("");
  const add = () => {
    if (!val.trim()) return;
    onChange([...(items || []), val.trim()]);
    setVal("");
  };
  const remove = (i) => onChange((items || []).filter((_, idx) => idx !== i));
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <div className="flex gap-2">
        <input
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
        <button type="button" onClick={add}
          className="px-3 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 transition-all">
          +
        </button>
      </div>
      {items?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {items.map((it, i) => (
            <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full flex items-center gap-1">
              {it}
              <button type="button" onClick={() => remove(i)} className="text-slate-400 hover:text-red-500">✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BienForm({ group, initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || {});
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const prixLive = group === "investisseur" ? (parseFloat(form.prixAchat) || 0) : (parseFloat(form.prixNegocie) || parseFloat(form.prixAffiche) || 0);
  const surfaceLive = parseFloat(form.surface) || 0;
  const prixM2Live = prixLive && surfaceLive ? Math.round(prixLive / surfaceLive) : 0;

  const loyerLive = parseFloat(form.loyerEstime) || 0;
  const chargesLive = parseFloat(form.charges) || 0;
  const rendBrutLive = prixLive && loyerLive ? (loyerLive * 12 / prixLive) * 100 : 0;
  const rendNetLive = prixLive ? ((loyerLive * 12 - chargesLive * 12) / prixLive) * 100 : 0;
  const mensualiteLive = prixLive ? calcMensualite(prixLive, 25, 3.5) : 0;
  const cashflowLive = loyerLive - chargesLive - mensualiteLive;

  const submit = () => {
    if (!form.adresse?.trim()) return;
    onSave({ id: form.id || uid(), ...form });
  };

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <Input label="Adresse" value={form.adresse || ""} onChange={v => set("adresse", v)} placeholder="12 rue de la Paix, Paris" />

        {group === "residentiel" ? (
          <>
            <Input label="Prix affiché" value={form.prixAffiche || ""} onChange={v => set("prixAffiche", v)} type="number" suffix="€" />
            <Input label="Prix négocié" value={form.prixNegocie || ""} onChange={v => set("prixNegocie", v)} type="number" suffix="€" placeholder="Optionnel" />
            <Input label="Surface" value={form.surface || ""} onChange={v => set("surface", v)} type="number" suffix="m²" />
            <Stat label="Prix au m² (calculé)" value={prixM2Live ? fmt(prixM2Live) : "—"} />
            <Select label="Type" value={form.typeBien || "appartement"} onChange={v => set("typeBien", v)}
              options={[{ value: "appartement", label: "Appartement" }, { value: "maison", label: "Maison" }]} />
            <Input label="Étage" value={form.etage || ""} onChange={v => set("etage", v)} placeholder="Ex : 3e étage" />
            <Input label="Année de construction" value={form.anneeConstruction || ""} onChange={v => set("anneeConstruction", v)} type="number" placeholder="1990" />
            <Select label="DPE" value={form.dpe || "D"} onChange={v => set("dpe", v)} options={DPE_LETTERS.map(l => ({ value: l, label: l }))} />
            <Input label="Charges mensuelles" value={form.charges || ""} onChange={v => set("charges", v)} type="number" suffix="€" />
            <Input label="Taxe foncière annuelle" value={form.taxeFonciere || ""} onChange={v => set("taxeFonciere", v)} type="number" suffix="€" />
            <Input label="Distance transports (à pied)" value={form.distanceTransports || ""} onChange={v => set("distanceTransports", v)} type="number" suffix="min" />
            <Input label="Commerces / écoles à proximité" value={form.commercesEcoles || ""} onChange={v => set("commercesEcoles", v)} placeholder="Optionnel" />
            <Input label="Estimation travaux" value={form.estimationTravaux || ""} onChange={v => set("estimationTravaux", v)} type="number" suffix="€" />
            <TagListEditor label="Points positifs" items={form.pointsPositifs} onChange={v => set("pointsPositifs", v)} placeholder="Ex : lumineux, calme…" />
            <TagListEditor label="Points négatifs" items={form.pointsNegatifs} onChange={v => set("pointsNegatifs", v)} placeholder="Ex : travaux à prévoir…" />
            <Input label="Coup de cœur" value={form.coupDeCoeur || ""} onChange={v => set("coupDeCoeur", v)} type="number" suffix="/10" placeholder="0 à 10" />
          </>
        ) : (
          <>
            <Input label="Prix d'achat" value={form.prixAchat || ""} onChange={v => set("prixAchat", v)} type="number" suffix="€" />
            <Input label="Surface" value={form.surface || ""} onChange={v => set("surface", v)} type="number" suffix="m²" />
            <Stat label="Prix au m² (calculé)" value={prixM2Live ? fmt(prixM2Live) : "—"} />
            <Select label="DPE" value={form.dpe || "D"} onChange={v => set("dpe", v)} options={DPE_LETTERS.map(l => ({ value: l, label: l }))} />
            <Input label="Charges mensuelles" value={form.charges || ""} onChange={v => set("charges", v)} type="number" suffix="€" />
            <Input label="Taxe foncière annuelle" value={form.taxeFonciere || ""} onChange={v => set("taxeFonciere", v)} type="number" suffix="€" />
            <Input label="Loyer estimé" value={form.loyerEstime || ""} onChange={v => set("loyerEstime", v)} type="number" suffix="€/mois" />
            <Stat label="Rendement brut (calculé)" value={fmtPct(rendBrutLive)} accent="text-blue-600" />
            <Stat label="Rendement net (calculé)" value={fmtPct(rendNetLive)} accent={rendNetLive >= 4 ? "text-green-600" : "text-amber-600"} />
            <Stat label="Cash-flow mensuel estimé (calculé)" value={fmt(cashflowLive)} accent={cashflowLive >= 0 ? "text-green-600" : "text-red-500"}
              sub="mensualité crédit estimée sur 25 ans à 3,5%, sans apport" />
            <Select label="Demande locative" value={form.demandeLocative || "moyenne"} onChange={v => set("demandeLocative", v)} options={DEMANDE_OPTIONS} />
            <Select label="Potentiel de valorisation" value={form.potentielValorisation || "moyen"} onChange={v => set("potentielValorisation", v)} options={POTENTIEL_OPTIONS} />
          </>
        )}

        <Input label="Note personnelle" value={form.notePersonnelle || ""} onChange={v => set("notePersonnelle", v)} placeholder="Optionnel" />

        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-all">
            Annuler
          </button>
          <button onClick={submit}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all">
            Enregistrer
          </button>
        </div>
      </div>
    </Card>
  );
}

function BienCard({ bien, group, onEdit, onDelete, selectable, selected, onToggleSelect }) {
  const prix = effectivePrice(bien);
  const surface = parseFloat(bien.surface) || null;
  const rendNet = rendementNet(bien);
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {selectable && (
            <input type="checkbox" checked={selected} onChange={onToggleSelect} className="mt-1 flex-shrink-0" />
          )}
          <div className="min-w-0">
            <div className="font-bold text-slate-800 text-sm truncate">{bien.adresse || "Sans adresse"}</div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-slate-500">
              {prix != null && <span>{fmt(prix)}</span>}
              {surface != null && <span>{surface} m²</span>}
              {group === "residentiel"
                ? (bien.coupDeCoeur !== undefined && bien.coupDeCoeur !== "" && <span>❤️ {bien.coupDeCoeur}/10</span>)
                : (rendNet != null && <span>📈 {fmtPct(rendNet)} net</span>)}
            </div>
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={() => onEdit(bien)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all">
            ✎
          </button>
          <button onClick={() => onDelete(bien.id)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-500 transition-all">
            ✕
          </button>
        </div>
      </div>
    </Card>
  );
}

function ComparatorTable({ biens, group, onBack }) {
  const criteria = group === "investisseur" ? INVESTISSEUR_SCORE_CRITERIA : RESIDENTIEL_SCORE_CRITERIA;
  const scores = computeScores(biens, criteria);
  const rows = group === "investisseur" ? investisseurRows(biens) : residentielRows(biens);

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onBack} className="text-sm text-blue-600 font-semibold self-start hover:underline">← Retour à la liste</button>
      <Card className="overflow-x-auto">
        <table className="text-sm border-separate" style={{ borderSpacing: "0 4px", minWidth: "100%" }}>
          <thead>
            <tr>
              <th className="text-left text-xs text-slate-400 font-semibold p-2"></th>
              {biens.map(b => (
                <th key={b.id} className="text-left p-2 align-bottom" style={{ minWidth: 140 }}>
                  <div className="font-bold text-slate-800 text-sm truncate">{b.adresse || "Sans adresse"}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const nums = row.values.map(v => (typeof v === "number" && !isNaN(v) ? v : null));
              const valid = nums.filter(v => v != null);
              const best = valid.length ? (row.higherIsBetter ? Math.max(...valid) : Math.min(...valid)) : null;
              const worst = valid.length ? (row.higherIsBetter ? Math.min(...valid) : Math.max(...valid)) : null;
              return (
                <tr key={row.label}>
                  <td className="text-xs font-semibold text-slate-500 p-2 whitespace-nowrap">{row.label}</td>
                  {row.values.map((v, i) => {
                    const num = nums[i];
                    let bg = "transparent", color = "#334155";
                    if (num != null && valid.length > 1 && best !== worst) {
                      if (num === best) { bg = "#d1fae5"; color = "#047857"; }
                      else if (num === worst) { bg = "#fee2e2"; color = "#b91c1c"; }
                    }
                    return (
                      <td key={i} className="p-2 rounded-lg font-semibold" style={{ background: bg, color }}>
                        {row.format(v, biens[i])}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr>
              <td className="text-xs font-bold text-slate-700 p-2">Score global</td>
              {scores.map((s, i) => (
                <td key={i} className="p-2 font-bold rounded-lg" style={{ background: "#dbeafe", color: "#1d4ed8" }}>
                  {s != null ? `${s.toFixed(1)}/10` : "—"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function BiensTab({ project, onUpdate }) {
  const group = BIENS_INVESTISSEUR_TYPES.includes(project.type) ? "investisseur" : "residentiel";
  const biens = project.biens || [];
  const [formOpen, setFormOpen] = useState(false);
  const [editingBien, setEditingBien] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [view, setView] = useState("list");

  const saveBien = (bien) => {
    onUpdate(p => {
      const already = (p.biens || []).some(b => b.id === bien.id);
      const nextBiens = already ? p.biens.map(b => (b.id === bien.id ? bien : b)) : [...(p.biens || []), bien];
      return { ...p, biens: nextBiens };
    });
    setFormOpen(false);
    setEditingBien(null);
  };

  const deleteBien = (id) => {
    onUpdate(p => ({ ...p, biens: (p.biens || []).filter(b => b.id !== id) }));
    setSelectedIds(ids => ids.filter(i => i !== id));
  };

  const toggleSelect = (id) => {
    setSelectedIds(ids => {
      if (ids.includes(id)) return ids.filter(i => i !== id);
      if (ids.length >= 4) return ids;
      return [...ids, id];
    });
  };

  if (view === "compare") {
    const selectedBiens = biens.filter(b => selectedIds.includes(b.id));
    return <ComparatorTable biens={selectedBiens} group={group} onBack={() => setView("list")} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {!formOpen && (
        <div className="flex gap-3">
          <button onClick={() => { setEditingBien(null); setFormOpen(true); }}
            className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all">
            + Ajouter un bien
          </button>
          {biens.length >= 2 && (
            <button onClick={() => setCompareMode(m => !m)}
              className={`px-4 py-3 rounded-xl text-sm font-bold transition-all ${compareMode ? "bg-slate-800 text-white" : "border border-slate-200 text-slate-600"}`}>
              Comparer
            </button>
          )}
        </div>
      )}

      {formOpen && (
        <BienForm group={group} initial={editingBien}
          onSave={saveBien}
          onCancel={() => { setFormOpen(false); setEditingBien(null); }} />
      )}

      {compareMode && !formOpen && (
        <div className="flex items-center justify-between bg-blue-50 rounded-xl px-4 py-2.5 text-sm text-blue-700">
          <span>{selectedIds.length}/4 sélectionné{selectedIds.length > 1 ? "s" : ""}</span>
          <button
            disabled={selectedIds.length < 2}
            onClick={() => setView("compare")}
            className={`font-bold ${selectedIds.length < 2 ? "text-blue-300 cursor-not-allowed" : "text-blue-700 hover:underline"}`}>
            Voir la comparaison →
          </button>
        </div>
      )}

      {!formOpen && (
        biens.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">Aucun bien enregistré pour ce projet pour l'instant.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {biens.map(b => (
              <BienCard key={b.id} bien={b} group={group}
                onEdit={(bien) => { setEditingBien(bien); setFormOpen(true); }}
                onDelete={deleteBien}
                selectable={compareMode}
                selected={selectedIds.includes(b.id)}
                onToggleSelect={() => toggleSelect(b.id)} />
            ))}
          </div>
        )
      )}
    </div>
  );
}

const DASHBOARD_TABS_BASE = [
  { id: "accueil", label: "Accueil", icon: "🏠" },
  { id: "budget", label: "Budget", icon: "💶" },
  { id: "contacts", label: "Contacts", icon: "📇" },
  { id: "journal", label: "Journal", icon: "📓" },
];
const BIENS_TAB = { id: "biens", label: "Biens", icon: "🏘️" };

function Dashboard({ project, onUpdate, onBack }) {
  const [tab, setTab] = useState("accueil");
  const [infoStep, setInfoStep] = useState(null);
  const [proStep, setProStep] = useState(null);
  const [editingDeadline, setEditingDeadline] = useState(null);
  const [tempDate, setTempDate] = useState("");
  const [addingStepPhase, setAddingStepPhase] = useState(null);
  const [newStepLabel, setNewStepLabel] = useState("");
  const [newStepImportance, setNewStepImportance] = useState("importante");
  const [aiOpen, setAiOpen] = useState(false);
  const [apiKey, setApiKey] = useState(null);
  const [aiHistory, setAiHistory] = useState([]);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfError, setPdfError] = useState("");

  useEffect(() => {
    loadApiKey().then(setApiKey);
  }, []);

  const saveApiKeyHandler = (key) => {
    setApiKey(key);
    saveApiKey(key);
  };
  const addAiExchange = (exchange) => {
    setAiHistory(prev => [...prev, exchange].slice(-5));
  };

  const handleExportPDF = async () => {
    setPdfGenerating(true);
    setPdfError("");
    try {
      await generateProjectPDF(project);
    } catch (e) {
      setPdfError(e.message || "Impossible de générer le PDF.");
    } finally {
      setPdfGenerating(false);
    }
  };

  const steps = STEPS_BY_TYPE[project.type] || [];
  const done = steps.filter(s => project.checklist[s.id]).length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
  const typeInfo = PROJECT_TYPES.find(t => t.id === project.type);
  const nextStep = steps.find(s => !project.checklist[s.id]);
  const tabs = BIENS_ENABLED_TYPES.includes(project.type)
    ? [DASHBOARD_TABS_BASE[0], BIENS_TAB, ...DASHBOARD_TABS_BASE.slice(1)]
    : DASHBOARD_TABS_BASE;

  const phases = {};
  steps.forEach(s => {
    const key = s.tag ? `${s.tag} — ${s.phase}` : s.phase;
    if (!phases[key]) phases[key] = [];
    phases[key].push(s);
  });
  (project.customSteps || []).forEach(cs => {
    if (!phases[cs.phaseKey]) phases[cs.phaseKey] = [];
    phases[cs.phaseKey].push({ id: cs.id, label: cs.label, importance: cs.importance, phase: cs.phaseKey, month: null, info: null, custom: true });
  });

  const upcomingDeadlines = steps
    .filter(s => project.deadlines?.[s.id] && !project.checklist[s.id])
    .map(s => ({ step: s, info: getDeadlineInfo(project.deadlines[s.id]) }))
    .sort((a, b) => a.info.diffDays - b.info.diffDays)
    .slice(0, 3);

  const toggleStep = (stepId) => {
    onUpdate(p => ({
      ...p,
      checklist: { ...p.checklist, [stepId]: p.checklist[stepId] ? false : new Date().toISOString() },
    }));
  };
  const addContact = (contact) => onUpdate(p => ({ ...p, contacts: [...(p.contacts || []), contact] }));
  const deleteContact = (id) => onUpdate(p => ({ ...p, contacts: (p.contacts || []).filter(c => c.id !== id) }));
  const addJournalEntry = (entry) => onUpdate(p => ({ ...p, journal: [...(p.journal || []), entry] }));

  const openAddStepForm = (phaseKey) => {
    setNewStepLabel("");
    setNewStepImportance("importante");
    setAddingStepPhase(addingStepPhase === phaseKey ? null : phaseKey);
  };
  const addCustomStep = (phaseKey) => {
    if (!newStepLabel.trim()) return;
    const newStep = { id: `custom-${uid()}`, phaseKey, label: newStepLabel.trim(), importance: newStepImportance };
    onUpdate(p => ({ ...p, customSteps: [...(p.customSteps || []), newStep] }));
    setNewStepLabel("");
    setNewStepImportance("importante");
    setAddingStepPhase(null);
  };
  const deleteCustomStep = (stepId) => {
    onUpdate(p => {
      const nextChecklist = { ...p.checklist };
      delete nextChecklist[stepId];
      return {
        ...p,
        customSteps: (p.customSteps || []).filter(cs => cs.id !== stepId),
        checklist: nextChecklist,
      };
    });
  };

  const openDeadlineEditor = (stepId) => {
    setTempDate(project.deadlines?.[stepId] || "");
    setEditingDeadline(editingDeadline === stepId ? null : stepId);
  };
  const saveDeadline = (stepId, dateStr) => {
    if (!dateStr) return;
    onUpdate(p => ({ ...p, deadlines: { ...(p.deadlines || {}), [stepId]: dateStr } }));
    setEditingDeadline(null);
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      if (window.confirm("Voulez-vous activer les notifications pour être prévenu avant cette échéance ?")) {
        Notification.requestPermission();
      }
    }
  };
  const removeDeadline = (stepId) => {
    onUpdate(p => {
      const next = { ...(p.deadlines || {}) };
      delete next[stepId];
      return { ...p, deadlines: next };
    });
    setEditingDeadline(null);
  };

  return (
    <div className="min-h-screen" style={{ background: "#f8f7f5" }}>
      <InfoModal step={infoStep} onClose={() => setInfoStep(null)} />
      <ProModal step={proStep} proType={proStep ? detectProType(proStep) : null} onClose={() => setProStep(null)} />
      {aiOpen && (
        <AIModal
          project={project}
          apiKey={apiKey}
          onSaveKey={saveApiKeyHandler}
          history={aiHistory}
          onAddExchange={addAiExchange}
          onClose={() => setAiOpen(false)}
        />
      )}
      {/* Header */}
      <div className="text-white px-5 pt-8 pb-16" style={{ background: "#1a1a2e" }}>
        <div className="max-w-2xl mx-auto">
          <div className="mb-4"><CozimoLogo width={90} height={27} /></div>
          <button onClick={onBack} className="text-slate-400 hover:text-white text-xs mb-4 transition-all">
            ← Mes projets
          </button>
          <div className="flex justify-between items-start mb-6">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold truncate">{project.name}</h1>
              <p className="text-slate-400 text-sm mt-0.5">{typeInfo?.icon} {typeInfo?.label}</p>
            </div>
          </div>
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-slate-300">Progression</span>
            <span className="text-white font-bold">{done}/{steps.length} étapes</span>
          </div>
          <ProgressBar value={done} max={steps.length} color="#3b82f6" />
          <div className="mt-2 text-right text-xs text-blue-300 font-semibold">{pct}% complété</div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 -mt-8 pb-10 flex flex-col gap-4">
        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-lg p-1.5 flex gap-1" style={{ border: "0.5px solid #e5e3df" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${tab === t.id ? "bg-blue-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>
              <span>{t.icon}</span> <span>{t.label}</span>
            </button>
          ))}
        </div>

        {tab === "accueil" && (
          <>
            {/* Prochaine action */}
            <Card>
              <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                <span>🎯</span> Prochaine action
              </h3>
              {nextStep ? (
                <div className="flex items-start gap-3">
                  <button onClick={() => toggleStep(nextStep.id)}
                    className="w-6 h-6 rounded-full border-2 border-slate-200 hover:border-blue-400 flex-shrink-0 mt-0.5 transition-all" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: IMPORTANCE[nextStep.importance]?.bg, color: IMPORTANCE[nextStep.importance]?.color }}>
                        {IMPORTANCE[nextStep.importance]?.label}
                      </span>
                      <span className="text-xs text-slate-400">{nextStep.phase} · {nextStep.month}</span>
                    </div>
                    <div className="text-sm font-semibold text-slate-800">{nextStep.label}</div>
                  </div>
                  {nextStep.info && (
                    <button
                      onClick={() => setInfoStep(nextStep)}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: "#e0f2fe", color: "#0369a1" }}
                      title="Plus d'infos">
                      i
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-sm text-green-700">🎉 Toutes les étapes sont complétées !</div>
              )}
            </Card>

            <button onClick={() => setAiOpen(true)}
              className="w-full py-3 rounded-xl text-white text-sm font-bold transition-all hover:opacity-90"
              style={{ background: "#2563eb" }}>
              ✨ Poser une question à l'IA
            </button>

            {/* Échéances proches */}
            {upcomingDeadlines.length > 0 && (
              <Card>
                <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <span>⏰</span> Échéances proches
                </h3>
                <div className="flex flex-col gap-2">
                  {upcomingDeadlines.map(({ step: s, info }) => (
                    <div key={s.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm text-slate-700 truncate">{s.label}</div>
                        <div className="text-xs text-slate-400">{s.phase}</div>
                      </div>
                      <span className="text-xs font-bold px-2 py-1 rounded-full flex-shrink-0" style={{ background: info.bg, color: info.color }}>
                        {info.label}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Étapes */}
            <div>
              <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2 px-1">
                <span>📋</span> Étapes
              </h3>
              <div className="flex flex-col gap-4">
                {Object.entries(phases).map(([phase, items]) => {
                  const phaseDone = items.filter(s => project.checklist[s.id]).length;
                  const phaseColor = getPhaseColor(phase);
                  return (
                    <Card key={phase}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ background: phaseColor }} />
                          <span className="font-bold text-slate-700 text-sm">{phase}</span>
                        </div>
                        <span className="text-xs text-slate-400">{phaseDone}/{items.length}</span>
                      </div>
                      <ProgressBar value={phaseDone} max={items.length} color={phaseColor} />
                      <div className="flex flex-col gap-2 mt-3">
                        {items.map(s => {
                          const deadline = project.deadlines?.[s.id];
                          const deadlineInfo = deadline ? getDeadlineInfo(deadline) : null;
                          const proType = detectProType(s);
                          return (
                          <div key={s.id} className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-3 group">
                            <button onClick={() => toggleStep(s.id)}
                              className="flex items-center gap-3 text-left flex-1 min-w-0">
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${project.checklist[s.id] ? "border-green-500 bg-green-500" : "border-slate-200 group-hover:border-blue-400"}`}>
                                {project.checklist[s.id] && <span className="text-white text-xs">✓</span>}
                              </div>
                              <div className="flex-1 flex items-center gap-2 min-w-0">
                                <span className={`text-sm transition-all truncate ${project.checklist[s.id] ? "line-through text-slate-400" : "text-slate-700"}`}>
                                  {s.label}
                                </span>
                                {s.tag && <Tag color={s.tag === "Vente" ? "vente" : "achat"}>{s.tag}</Tag>}
                                {s.custom && <Tag color="default">Personnalisée</Tag>}
                              </div>
                            </button>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="text-xs text-slate-300">{s.month}</span>
                              {s.custom && (
                                <button
                                  onClick={() => deleteCustomStep(s.id)}
                                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs transition-all flex-shrink-0 bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-500"
                                  title="Supprimer cette étape">
                                  ✕
                                </button>
                              )}
                              {deadlineInfo && (
                                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: deadlineInfo.bg, color: deadlineInfo.color }}>
                                  {deadlineInfo.label}
                                </span>
                              )}
                              <button
                                onClick={() => openDeadlineEditor(s.id)}
                                className="w-5 h-5 rounded-full flex items-center justify-center text-xs transition-all flex-shrink-0"
                                style={{ background: deadline ? "#fef3c7" : "#f1f5f9", color: deadline ? "#b45309" : "#64748b" }}
                                title="Définir une échéance">
                                📅
                              </button>
                              {proType && (
                                <button
                                  onClick={() => setProStep(s)}
                                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs transition-all flex-shrink-0"
                                  style={{ background: "#ede9fe", color: "#6d28d9" }}
                                  title="Trouver un professionnel">
                                  🔍
                                </button>
                              )}
                              {s.info && (
                                <button
                                  onClick={() => setInfoStep(s)}
                                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition-all flex-shrink-0"
                                  style={{ background: "#e0f2fe", color: "#0369a1" }}
                                  title="Plus d'infos">
                                  i
                                </button>
                              )}
                            </div>
                          </div>
                          {editingDeadline === s.id && (
                            <div className="flex items-center gap-2 ml-8 flex-wrap">
                              <input
                                type="date"
                                value={tempDate}
                                onChange={e => setTempDate(e.target.value)}
                                className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                              />
                              <button onClick={() => saveDeadline(s.id, tempDate)}
                                className="text-xs font-semibold text-blue-600 hover:underline">
                                Enregistrer
                              </button>
                              {deadline && (
                                <button onClick={() => removeDeadline(s.id)}
                                  className="text-xs font-semibold text-red-500 hover:underline">
                                  Supprimer
                                </button>
                              )}
                              <button onClick={() => setEditingDeadline(null)}
                                className="text-xs text-slate-400 hover:underline">
                                Annuler
                              </button>
                            </div>
                          )}
                          </div>
                          );
                        })}
                      </div>

                      {addingStepPhase === phase ? (
                        <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-slate-100">
                          <input
                            value={newStepLabel}
                            onChange={e => setNewStepLabel(e.target.value)}
                            placeholder="Nom de l'étape"
                            className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                          />
                          <select
                            value={newStepImportance}
                            onChange={e => setNewStepImportance(e.target.value)}
                            className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                          >
                            <option value="essentielle">Essentielle</option>
                            <option value="importante">Importante</option>
                            <option value="utile">Utile</option>
                          </select>
                          <div className="flex gap-2">
                            <button onClick={() => setAddingStepPhase(null)}
                              className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-500 text-xs font-semibold hover:bg-slate-50 transition-all">
                              Annuler
                            </button>
                            <button onClick={() => addCustomStep(phase)}
                              className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all">
                              Ajouter
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => openAddStepForm(phase)}
                          className="mt-3 pt-3 border-t border-slate-100 w-full text-left text-xs font-semibold text-blue-600 hover:text-blue-700 transition-all">
                          + Ajouter une étape
                        </button>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Export PDF */}
            <button onClick={handleExportPDF} disabled={pdfGenerating}
              className="w-full py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold transition-all hover:bg-slate-50 disabled:opacity-50">
              {pdfGenerating ? "Génération du PDF…" : "📄 Exporter en PDF"}
            </button>
            {pdfError && <p className="text-xs text-red-500 text-center -mt-2">{pdfError}</p>}
          </>
        )}

        {tab === "budget" && <BudgetTab project={project} onUpdate={onUpdate} />}
        {tab === "contacts" && <ContactsTab project={project} onAdd={addContact} onDelete={deleteContact} />}
        {tab === "journal" && <JournalTab project={project} onAdd={addJournalEntry} />}
        {tab === "biens" && <BiensTab project={project} onUpdate={onUpdate} />}
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("loading");
  const [projects, setProjects] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [draftType, setDraftType] = useState(null);

  useEffect(() => {
    loadData().then(d => {
      const projs = d?.projects || [];
      const activeIdLoaded = d?.activeId || null;
      setActiveId(activeIdLoaded);
      setScreen(projs.length > 0 ? "projects" : "new-type");

      // Vérifie les échéances au chargement de l'app et notifie si nécessaire.
      const { changed, projects: checked } = checkDeadlineNotifications(projs);
      setProjects(checked);
      if (changed) saveData({ projects: checked, activeId: activeIdLoaded });
    });
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.title = "Cozimo";
  }, []);

  const persist = useCallback((projs, active) => {
    saveData({ projects: projs, activeId: active });
  }, []);

  const openProjectsList = () => setScreen("projects");

  const startNewProject = () => {
    setDraftType(null);
    setScreen("new-type");
  };

  const selectType = (typeId) => {
    setDraftType(typeId);
    setScreen("new-details");
  };

  const createProject = ({ name, startDate }) => {
    const typeLabel = PROJECT_TYPES.find(t => t.id === draftType)?.label || "Projet";
    const project = {
      id: uid(),
      name: name || typeLabel,
      type: draftType,
      createdAt: new Date().toISOString(),
      startDate,
      checklist: {},
      budget: {},
      contacts: [],
      journal: [],
      deadlines: {},
      notifiedDeadlines: {},
      biens: [],
      customSteps: [],
    };
    const next = [...projects, project];
    setProjects(next);
    setActiveId(project.id);
    persist(next, project.id);
    setScreen("dashboard");
  };

  const openProject = (id) => {
    setActiveId(id);
    persist(projects, id);
    setScreen("dashboard");
  };

  const updateActiveProject = useCallback((updater) => {
    setProjects(prev => {
      const next = prev.map(p => p.id === activeId ? updater(p) : p);
      persist(next, activeId);
      return next;
    });
  }, [activeId, persist]);

  const activeProject = projects.find(p => p.id === activeId);

  let content;
  if (screen === "loading") {
    content = (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#1a1a2e" }}>
        <div className="text-white text-center">
          <div className="text-4xl mb-3">🏠</div>
          <p className="text-slate-400 text-sm">Chargement…</p>
        </div>
      </div>
    );
  } else if (screen === "new-type") {
    content = <NewProjectTypeScreen onSelect={selectType} onBack={projects.length > 0 ? openProjectsList : null} />;
  } else if (screen === "new-details") {
    content = <NewProjectDetailsScreen type={draftType} onCreate={createProject} onBack={() => setScreen("new-type")} />;
  } else if (screen === "dashboard" && activeProject) {
    content = <Dashboard project={activeProject} onUpdate={updateActiveProject} onBack={openProjectsList} />;
  } else {
    content = <ProjectsScreen projects={projects} onOpen={openProject} onCreate={startNewProject} />;
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        * { font-family: 'Outfit', sans-serif; }
      `}</style>
      {content}
    </>
  );
}
