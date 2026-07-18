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

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
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

function Input({ label, value, onChange, type = "text", placeholder }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      />
    </div>
  );
}

// ─── SCREENS ──────────────────────────────────────────────────────────────────
function NewProjectTypeScreen({ onSelect, onBack }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "#1a1a2e" }}>
      <div className="max-w-lg w-full">
        {onBack && (
          <button onClick={onBack} className="text-slate-400 hover:text-white text-xs mb-6 transition-all">
            ← Mes projets
          </button>
        )}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex items-center justify-center" style={{ width: 64, height: 64, background: "#2563eb", borderRadius: "12px" }}>
            <span style={{ fontSize: 32 }}>🏠</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Nouveau projet</h1>
          <p className="text-slate-400 text-sm">Quel type de projet voulez-vous suivre ?</p>
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
        <button onClick={onCreate}
          className="w-full mb-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all shadow-lg">
          + Nouveau projet
        </button>
        <div className="flex flex-col gap-3">
          {projects.map(p => <ProjectCard key={p.id} project={p} onOpen={onOpen} />)}
        </div>
      </div>
    </div>
  );
}

function Dashboard({ project, onToggle, onBack }) {
  const [infoStep, setInfoStep] = useState(null);
  const steps = STEPS_BY_TYPE[project.type] || [];
  const done = steps.filter(s => project.checklist[s.id]).length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
  const typeInfo = PROJECT_TYPES.find(t => t.id === project.type);
  const nextStep = steps.find(s => !project.checklist[s.id]);

  const phases = {};
  steps.forEach(s => {
    const key = s.tag ? `${s.tag} — ${s.phase}` : s.phase;
    if (!phases[key]) phases[key] = [];
    phases[key].push(s);
  });

  return (
    <div className="min-h-screen" style={{ background: "#f8f7f5" }}>
      <InfoModal step={infoStep} onClose={() => setInfoStep(null)} />
      {/* Header */}
      <div className="text-white px-5 pt-8 pb-16" style={{ background: "#1a1a2e" }}>
        <div className="max-w-2xl mx-auto">
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
        {/* Prochaine action */}
        <Card>
          <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
            <span>🎯</span> Prochaine action
          </h3>
          {nextStep ? (
            <div className="flex items-start gap-3">
              <button onClick={() => onToggle(nextStep.id)}
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
                    {items.map(s => (
                      <div key={s.id} className="flex items-center gap-3 group">
                        <button onClick={() => onToggle(s.id)}
                          className="flex items-center gap-3 text-left flex-1 min-w-0">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${project.checklist[s.id] ? "border-green-500 bg-green-500" : "border-slate-200 group-hover:border-blue-400"}`}>
                            {project.checklist[s.id] && <span className="text-white text-xs">✓</span>}
                          </div>
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            <span className={`text-sm transition-all truncate ${project.checklist[s.id] ? "line-through text-slate-400" : "text-slate-700"}`}>
                              {s.label}
                            </span>
                            {s.tag && <Tag color={s.tag === "Vente" ? "vente" : "achat"}>{s.tag}</Tag>}
                          </div>
                        </button>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-xs text-slate-300">{s.month}</span>
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
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
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
      setProjects(projs);
      setActiveId(d?.activeId || null);
      setScreen(projs.length > 0 ? "projects" : "new-type");
    });
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

  const toggleStep = (stepId) => {
    setProjects(prev => {
      const next = prev.map(p => p.id === activeId
        ? { ...p, checklist: { ...p.checklist, [stepId]: !p.checklist[stepId] } }
        : p);
      persist(next, activeId);
      return next;
    });
  };

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
    content = <Dashboard project={activeProject} onToggle={toggleStep} onBack={openProjectsList} />;
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
