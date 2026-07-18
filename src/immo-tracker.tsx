import { useCallback, useEffect, useState } from "react";

// ─── STORAGE HELPERS ───────────────────────────────────────────────────────────
const STORAGE_KEY = "immo-tracker-v1";

async function loadData() {
  try {
    const r = await window.storage.get(STORAGE_KEY);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}

async function saveData(data) {
  try { await window.storage.set(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const PROFILES = [
  { id: "vendeur", label: "Vendeur", icon: "🏷️", desc: "Je vends uniquement" },
  { id: "acheteur", label: "Acheteur", icon: "🔑", desc: "J'achète uniquement" },
  { id: "les-deux", label: "Vente + Achat", icon: "🔄", desc: "Je vends pour acheter" },
  { id: "investisseur", label: "Investisseur", icon: "📈", desc: "Investissement locatif" },
];

const STEPS_BY_PROFILE = {
  vendeur: [
    { id: "v1", phase: "Préparation", label: "Estimer le bien (2-3 agences + outils en ligne)", month: "M1",
      info: { title: "Comment estimer son bien ?", body: "Faites appel à 2-3 agences locales pour des estimations gratuites et sans engagement. Complétez avec des outils en ligne : MeilleursAgents, Meelo, PAP.fr. L'estimation finale doit croiser ces sources. Évitez de surestimer : un bien trop cher reste sur le marché et se déprécie aux yeux des acheteurs.", contacts: ["Agences immobilières locales (sans engagement)", "MeilleursAgents.com", "Meelo.com", "PAP.fr — outil gratuit d'estimation"] } },
    { id: "v2", phase: "Préparation", label: "Choisir le mode de vente (agence ou PAP)", month: "M1",
      info: { title: "Agence ou particulier à particulier ?", body: "En agence : commission de 3 à 8% du prix de vente, mais accompagnement complet (annonce, visites, négociation, paperasse). En PAP (particulier à particulier) : aucune commission, mais vous gérez tout. Si vous manquez de temps ou d'expérience, l'agence est souvent rentable malgré sa commission.", contacts: ["SeLoger, LeBonCoin, PAP.fr pour le PAP", "IAD, Efficity pour les agences en ligne (commission réduite ~3%)", "Agences physiques locales pour un accompagnement complet"] } },
    { id: "v3", phase: "Préparation", label: "Réunir les diagnostics obligatoires (DPE, Carrez…)", month: "M1",
      info: { title: "Diagnostics obligatoires à la vente", body: "La loi impose une liste de diagnostics avant toute vente. Comptez 400 à 700€ pour un pack complet. Ils doivent être réalisés par un diagnostiqueur certifié. Le DPE (performance énergétique) est particulièrement scruté depuis 2023 : un bien F ou G peut impacter le prix.", contacts: ["Diagnostiqueur certifié (trouvez-en un sur diagnostiqueurs.gouv.fr)", "Votre agence immobilière peut recommander un prestataire", "Budget estimé : 400-700€ pour un appartement"] } },
    { id: "v4", phase: "Préparation", label: "Faire des photos professionnelles", month: "M1",
      info: { title: "Pourquoi des photos pro ?", body: "Les biens avec photos professionnelles se vendent en moyenne 30% plus vite et obtiennent plus de visites. Un photographe immobilier coûte 100 à 250€ mais c'est un investissement rentable. Pensez aussi à ranger et dépersonnaliser le bien avant la séance.", contacts: ["Photographes immobiliers indépendants (recherchez sur Google ou Malt)", "Certaines agences incluent les photos dans leur prestation", "Budget : 100-250€ selon la surface"] } },
    { id: "v5", phase: "Mise en vente", label: "Publier l'annonce en ligne (SeLoger, LBC, PAP…)", month: "M2",
      info: { title: "Bien diffuser son annonce", body: "Multipliez les portails pour maximiser la visibilité : SeLoger et Logic-Immo pour les acheteurs actifs, LeBonCoin pour le grand public, PAP.fr si vous vendez entre particuliers. Soignez le titre, décrivez les points forts (luminosité, étage, transports), et mentionnez le DPE.", contacts: ["SeLoger.com", "LeBonCoin Immo", "PAP.fr (sans commission)", "Logic-Immo.com", "Bien'ici.com"] } },
    { id: "v6", phase: "Mise en vente", label: "Organiser les visites", month: "M2",
      info: { title: "Comment bien préparer les visites ?", body: "Proposez des créneaux fixes en semaine et le week-end. Rangez, aérez, maximisez la lumière naturelle. Préparez un dossier avec les diagnostics, les charges de copro et le montant de la taxe foncière. Restez disponible pour répondre aux questions sans pression.", contacts: ["Votre agence gère les visites si vous avez signé un mandat", "En PAP : prévoyez 1h par visite, soyez ponctuel et neutre"] } },
    { id: "v7", phase: "Mise en vente", label: "Analyser et négocier les offres", month: "M2-3",
      info: { title: "Comment évaluer une offre ?", body: "Ne regardez pas seulement le prix : vérifiez que l'acheteur a un financement solide (accord de principe bancaire ou achat comptant). Une offre à 95% du prix avec un dossier béton vaut souvent mieux qu'une offre pleine avec un dossier fragile. Vous pouvez contre-proposer par écrit.", contacts: ["Votre notaire peut vous conseiller sur la solidité d'une offre", "Votre agence négocie en votre nom si mandat exclusif"] } },
    { id: "v8", phase: "Compromis", label: "Signer le compromis de vente", month: "M3",
      info: { title: "Qu'est-ce que le compromis ?", body: "Le compromis (ou promesse synallagmatique) engage vendeur ET acheteur. Il fixe le prix, les conditions suspensives (obtention du prêt, absence de servitude…) et la date de signature de l'acte définitif. Il est rédigé par le notaire ou l'agence. Lisez-le attentivement avant de signer.", contacts: ["Votre notaire (obligatoire pour l'acte définitif, recommandé dès le compromis)", "L'agence immobilière peut rédiger le compromis", "Délai habituel entre compromis et acte : 2 à 3 mois"] } },
    { id: "v9", phase: "Compromis", label: "Suivre le délai de rétractation (10 jours)", month: "M3",
      info: { title: "Le délai de rétractation de l'acheteur", body: "Après signature du compromis, l'acheteur dispose de 10 jours calendaires pour se rétracter sans justification ni pénalité (loi SRU). Vous, en tant que vendeur, n'avez pas ce droit. Pendant ces 10 jours, ne retirez pas votre annonce et ne signez rien avec un autre acheteur.", contacts: ["Votre notaire vous informera de la date exacte de fin du délai", "Aucune démarche particulière de votre côté pendant ce délai"] } },
    { id: "v10", phase: "Compromis", label: "Suivre la condition suspensive de prêt acheteur (45-60j)", month: "M3-4",
      info: { title: "La condition suspensive de prêt", body: "Si l'acheteur finance par emprunt, le compromis inclut une condition suspensive : si son prêt est refusé, la vente est annulée et son dépôt de garantie lui est restitué. Ce délai est généralement de 45 à 60 jours. Restez en contact avec votre notaire pour suivre l'avancement.", contacts: ["Votre notaire suit l'obtention du prêt de l'acheteur", "Si le prêt est refusé : votre notaire vous accompagne pour la suite"] } },
    { id: "v11", phase: "Finalisation", label: "Préparer l'acte définitif avec le notaire", month: "M4",
      info: { title: "L'acte authentique de vente", body: "Le notaire rédige l'acte définitif à partir du compromis et des documents fournis. Il vérifie les titres de propriété, purge les hypothèques et calcule les frais. Vous recevrez une convocation avec la date de signature. Prévoyez d'apporter toutes les clés et documents le jour J.", contacts: ["Votre notaire (vous pouvez avoir le vôtre, l'acheteur le sien — les frais ne sont pas doublés)", "Prévoyez le remboursement du capital restant dû directement le jour de la signature"] } },
    { id: "v12", phase: "Finalisation", label: "Signer l'acte de vente définitif", month: "M4",
      info: { title: "Le jour de la signature", body: "La signature se fait chez le notaire. Le prix vous est versé par virement le jour même ou le lendemain. Vous remettez les clés à l'acheteur. L'acte est lu intégralement — prévoyez 1h à 2h. Pensez à relever les compteurs (eau, gaz, électricité) la veille.", contacts: ["Votre notaire coordonne tout", "Apportez une pièce d'identité valide", "Le virement du produit net de vente arrive sous 24-48h"] } },
    { id: "v13", phase: "Finalisation", label: "Résilier contrats (EDF, gaz, internet, assurance)", month: "M4",
      info: { title: "Résiliation et transfert des contrats", body: "Résiliez ou transférez vos contrats à la date de signature. EDF/Engie : résiliation en ligne avec relevé du compteur. Internet : préavis de 30 jours pour la plupart des opérateurs. Assurance habitation : résiliation immédiate possible lors d'un déménagement.", contacts: ["EDF : edf.fr ou 09 69 32 15 15", "Engie, Free, SFR, Orange, Bouygues : espaces clients en ligne", "Assurance : votre assureur actuel (résiliation loi Hamon possible à tout moment après 1 an)"] } },
    { id: "v14", phase: "Finalisation", label: "Effectuer le changement d'adresse officiel", month: "M4",
      info: { title: "Changement d'adresse : ne rien oublier", body: "Utilisez le service gratuit Service-Public.fr (changement d'adresse mutualisé) pour notifier en une fois : impôts, CAF, Pôle emploi, carte grise. N'oubliez pas votre banque, médecin, employeur, abonnements. La Poste propose une redirection du courrier payante.", contacts: ["Service-Public.fr — changement d'adresse en ligne (gratuit)", "La Poste — redirection de courrier (payant)", "Impôts.gouv.fr, Ameli.fr, CAF.fr à mettre à jour séparément"] } },
  ],
  acheteur: [
    { id: "a1", phase: "Préparation", label: "Calculer son budget et capacité d'emprunt", month: "M1",
      info: { title: "Comment calculer sa capacité d'emprunt ?", body: "La règle de base : vos mensualités de crédit ne doivent pas dépasser 35% de vos revenus nets. Utilisez l'onglet Finances de cette app pour une simulation rapide. Pensez à intégrer les frais de notaire (7,5% dans l'ancien, 2,5% dans le neuf) dans votre budget global.", contacts: ["Votre conseiller bancaire pour une première estimation", "Un courtier immobilier pour comparer plusieurs banques (gratuit pour vous)", "CAFPI, Meilleurtaux, Vousfinancer, Pretto (en ligne)"] } },
    { id: "a2", phase: "Préparation", label: "Consulter un courtier immobilier", month: "M1",
      info: { title: "Pourquoi passer par un courtier ?", body: "Le courtier est rémunéré par la banque, pas par vous. Il compare des dizaines d'offres et négocie les taux, les frais de dossier et l'assurance emprunteur. Il peut vous faire économiser plusieurs dizaines de milliers d'euros sur la durée du prêt. Consultez-le dès le début, même avant d'avoir trouvé un bien.", contacts: ["CAFPI — cafpi.fr", "Meilleurtaux — meilleurtaux.com", "Vousfinancer — vousfinancer.com", "Pretto — pretto.fr (100% en ligne)", "Courtier indépendant local"] } },
    { id: "a3", phase: "Préparation", label: "Obtenir un accord de principe bancaire", month: "M1",
      info: { title: "L'accord de principe : un atout majeur", body: "L'accord de principe est une lettre de votre banque confirmant que votre dossier est finançable pour un montant donné. Il rassure fortement les vendeurs. Avec ce document, vos offres sont prises plus au sérieux face à des acheteurs sans financement confirmé.", contacts: ["Votre conseiller bancaire principal", "Votre courtier immobilier (il peut obtenir cet accord auprès de plusieurs banques)"] } },
    { id: "a4", phase: "Recherche", label: "Définir ses critères (surface, zone, transports…)", month: "M1",
      info: { title: "Bien cadrer sa recherche", body: "Distinguez vos critères impératifs (surface mini, nb de pièces, accès transports) de vos critères souhaitables (étage, balcon, parking). Pensez aussi au DPE : les biens F/G peuvent être difficiles à revendre ou louer à l'avenir.", contacts: ["Bien'ici.com — carte interactive avec filtres avancés", "SeLoger, PAP.fr, LeBonCoin pour affiner par critères", "Google Maps pour évaluer les quartiers et transports"] } },
    { id: "a5", phase: "Recherche", label: "Lancer les recherches actives (SeLoger, PAP, LBC…)", month: "M1-2",
      info: { title: "Comment optimiser sa recherche ?", body: "Créez des alertes email sur tous les portails pour être notifié dès qu'un bien correspond. Contactez aussi des agences locales directement : certains biens ne sont jamais publiés en ligne (off-market). Rejoignez des groupes Facebook locaux d'achat/vente immobilière.", contacts: ["SeLoger.com — alertes email", "PAP.fr — particulier à particulier (sans frais d'agence)", "LeBonCoin Immo", "Bien'ici.com", "Agences locales à contacter directement"] } },
    { id: "a6", phase: "Recherche", label: "Organiser et effectuer les visites", month: "M2",
      info: { title: "Ce qu'il faut vérifier en visite", body: "Au-delà du coup de cœur : vérifiez l'état des fenêtres, de la plomberie, du tableau électrique. Testez les robinets, regardez les plafonds (taches = infiltrations). Dans une copro, observez l'entretien des parties communes. Demandez le montant des charges et la date du dernier ravalement.", contacts: ["Prévoyez un mètre ruban et une lampe torche", "Si vous avez un doute structurel : expert bâtiment (200-500€)", "Association AQC pour trouver un expert — qualiteconstruction.com"] } },
    { id: "a7", phase: "Recherche", label: "Vérifier PV d'AG, charges, état de la copro", month: "M2",
      info: { title: "L'importance des documents de copro", body: "Les 3 derniers PV d'Assemblée Générale révèlent les travaux votés (à votre charge si vous achetez), les litiges en cours, et l'état financier de la copro. Des impayés importants ou des travaux votés peuvent représenter des dizaines de milliers d'euros supplémentaires.", contacts: ["Ces documents doivent vous être remis par le vendeur avant le compromis (loi ALUR)", "Demandez-les systématiquement avant toute offre", "Votre notaire peut vous aider à les analyser"] } },
    { id: "a8", phase: "Offre", label: "Faire une offre d'achat écrite", month: "M2-3",
      info: { title: "Comment formuler une offre ?", body: "L'offre doit être écrite et mentionner : le prix proposé, les modalités de financement, et une date limite de réponse (48-72h). Appuyez-vous sur les prix du marché local pour justifier votre proposition.", contacts: ["PAP.fr — modèle d'offre d'achat gratuit en ligne", "Votre agent immobilier transmet l'offre au vendeur", "DVF (data.gouv.fr) — prix de vente réels dans le secteur"] } },
    { id: "a9", phase: "Offre", label: "Négocier le prix", month: "M3",
      info: { title: "Les bons arguments pour négocier", body: "Appuyez-vous sur des faits : prix au m² du secteur, durée de mise en vente du bien, travaux à prévoir, DPE dégradé. Un bien qui stagne depuis 3 mois+ est souvent négociable. En revanche, un bien récent avec plusieurs visites l'est peu.", contacts: ["MeilleursAgents.com — prix au m² par quartier", "DVF — transactions réelles sur data.gouv.fr", "Votre agent immobilier peut négocier en votre nom"] } },
    { id: "a10", phase: "Compromis", label: "Signer le compromis de vente", month: "M3",
      info: { title: "Le compromis côté acheteur", body: "Vous disposez de 10 jours pour vous rétracter après signature, sans pénalité. Passé ce délai, si vous renoncez (hors condition suspensive de prêt refusé), vous perdez le dépôt de garantie (5-10% du prix). Lisez attentivement les conditions suspensives.", contacts: ["Votre notaire rédige et explique chaque clause", "Vous pouvez avoir votre propre notaire (les frais ne sont pas doublés)", "Délai habituel entre compromis et acte : 2 à 3 mois"] } },
    { id: "a11", phase: "Financement", label: "Déposer le dossier complet à la banque / courtier", month: "M3",
      info: { title: "Constituer un dossier béton", body: "Un dossier complet accélère l'obtention du prêt. Préparez : 3 derniers bulletins de salaire, 2 derniers avis d'imposition, 3 derniers relevés bancaires, pièce d'identité, justificatif de domicile, compromis signé, justificatifs d'épargne. Évitez les découverts dans les 3 mois précédents.", contacts: ["Votre courtier centralise et optimise votre dossier", "Votre conseiller bancaire principal", "Délai d'obtention du prêt : 3 à 6 semaines après dépôt complet"] } },
    { id: "a12", phase: "Financement", label: "Obtenir l'offre de prêt officielle", month: "M4",
      info: { title: "L'offre de prêt : ce qu'il faut vérifier", body: "Vérifiez : le TAEG (taux global incluant assurance et frais), le coût total du crédit, les conditions de remboursement anticipé, et les garanties exigées (hypothèque ou caution). Comparez plusieurs offres si possible.", contacts: ["Votre courtier compare les offres pour vous", "ANIL — anil.org — conseils gratuits", "UFC-Que Choisir pour comprendre les clauses"] } },
    { id: "a13", phase: "Financement", label: "Respecter le délai légal de 11 jours avant acceptation", month: "M4",
      info: { title: "Le délai de réflexion obligatoire", body: "La loi impose un délai incompressible de 11 jours après réception de l'offre de prêt avant de pouvoir l'accepter. Ce délai vous protège et ne peut pas être raccourci. Acceptez l'offre par courrier signé à partir du 12e jour. L'offre est valable 30 jours.", contacts: ["Votre banque ou courtier vous guidera sur la procédure", "Envoyez votre acceptation en recommandé avec accusé de réception"] } },
    { id: "a14", phase: "Finalisation", label: "Signer l'acte authentique d'achat", month: "M5",
      info: { title: "Le jour de la signature", body: "La signature se fait chez le notaire. Vous versez le solde du prix et les frais de notaire. La banque vire les fonds directement au notaire. L'acte est lu — prévoyez 1h à 2h. Vous repartez avec les clés !", contacts: ["Votre notaire coordonne tout avec la banque", "Apportez une pièce d'identité valide", "Les fonds sont virés par la banque au notaire avant la signature"] } },
    { id: "a15", phase: "Finalisation", label: "Souscrire assurance habitation + assurance emprunteur", month: "M5",
      info: { title: "Assurance habitation et emprunteur", body: "L'assurance habitation est indispensable. L'assurance emprunteur est exigée par la banque. Vous pouvez choisir librement votre assureur (délégation d'assurance) — c'est souvent 30 à 50% moins cher qu'en passant par la banque. Vous pouvez changer à tout moment (loi Lemoine, 2022).", contacts: ["Comparateurs : LeLynx.fr, AssurLand.com", "Délégation d'assurance emprunteur : April, Cardif, Generali…", "Loi Lemoine : changement d'assurance possible à tout moment"] } },
    { id: "a16", phase: "Finalisation", label: "Récupérer les clés 🎉", month: "M5",
      info: { title: "Félicitations, vous êtes propriétaire !", body: "À la sortie de l'étude, vous récupérez les clés et l'acte de vente. Photographiez le bien dès votre arrivée, changez les serrures, et souscrivez vos contrats d'énergie et internet dès que possible.", contacts: ["Changement de serrures : serrurier local (200-400€)", "EDF/Engie/Total Énergie pour les contrats d'énergie", "Opérateurs internet : Free, Orange, SFR, Bouygues"] } },
  ],
  investisseur: [
    { id: "i1", phase: "Stratégie", label: "Définir la stratégie (location nue, meublée, coloc…)", month: "M1",
      info: { title: "Quelle stratégie locative choisir ?", body: "Location nue : bail 3 ans, fiscalité au réel ou micro-foncier, locataires stables. Location meublée (LMNP) : bail 1 an, fiscalité avantageuse (amortissements déductibles), loyers plus élevés. Colocation : rendement plus élevé mais gestion plus intensive.", contacts: ["Conseiller fiscal ou expert-comptable spécialisé en immobilier", "ANIL — anil.org — information gratuite", "Votre notaire pour le choix de la structure juridique"] } },
    { id: "i2", phase: "Stratégie", label: "Calculer le rendement locatif brut et net cible", month: "M1",
      info: { title: "Comment calculer le rendement ?", body: "Rendement brut = (loyer annuel / prix d'achat) × 100. Rendement net = ((loyer annuel - charges annuelles) / prix d'achat) × 100. Visez au moins 4% net en Île-de-France. Utilisez l'onglet Finances de cette app pour simuler.", contacts: ["Simulateurs : rendement-locatif.com", "Expert-comptable pour affiner les projections fiscales", "Votre courtier pour optimiser le financement"] } },
    { id: "i3", phase: "Stratégie", label: "Choisir la structure (nom propre, SCI, LMNP…)", month: "M1",
      info: { title: "Nom propre, SCI ou LMNP ?", body: "Nom propre : simple, mais fiscalité IR potentiellement lourde. SCI à l'IS : idéal pour plusieurs biens ou associés, permet l'amortissement. LMNP : statut très avantageux pour la location meublée — amortissements déductibles, souvent 0 impôt pendant 10-15 ans.", contacts: ["Expert-comptable spécialisé immobilier locatif (indispensable)", "Notaire pour la création d'une SCI", "UNPI — unpi.fr — association de propriétaires"] } },
    { id: "i4", phase: "Financement", label: "Consulter un courtier et optimiser le levier bancaire", month: "M1",
      info: { title: "L'effet de levier en investissement", body: "Emprunter pour investir vous permet de vous constituer un patrimoine avec l'argent de la banque (et en partie des loyers). Un courtier spécialisé en investissement locatif connaît les banques les plus ouvertes à ce type de dossier.", contacts: ["CAFPI, Meilleurtaux, Vousfinancer", "Certaines banques (CIC, Crédit Mutuel, Banque Populaire) sont réputées favorables aux investisseurs"] } },
    { id: "i5", phase: "Financement", label: "Calculer la fiscalité selon le régime choisi", month: "M1",
      info: { title: "Optimiser la fiscalité locative", body: "Micro-foncier (revenus < 15k€/an) : abattement de 30%. Régime réel : déduction des charges réelles. LMNP au réel : + amortissement du bien = souvent 0 imposition pendant 10-15 ans. Un expert-comptable est souvent rentabilisé dès la 1re année.", contacts: ["Expert-comptable spécialisé LMNP/SCI (100-300€/an)", "Impôts.gouv.fr — simulateur fiscal", "ANIL — anil.org"] } },
    { id: "i6", phase: "Recherche", label: "Cibler les zones à fort potentiel locatif", month: "M2",
      info: { title: "Comment identifier les bonnes zones ?", body: "Cherchez des villes avec forte demande locative, faible taux de vacance et dynamisme économique. En IDF : privilégiez les zones proches du Grand Paris Express. Évitez les zones tendues où les loyers sont plafonnés si votre rendement en dépend.", contacts: ["Observatoire des loyers — observatoires-des-loyers.fr", "INSEE — données démographiques et emploi", "SeLoger Pro — données de marché locatif"] } },
    { id: "i7", phase: "Recherche", label: "Analyser la demande locative locale", month: "M2",
      info: { title: "Vérifier la demande avant d'acheter", body: "Publiez une fausse annonce de location sur LeBonCoin avant d'acheter : si vous recevez 20+ demandes en 48h, la demande est forte. Renseignez-vous aussi auprès d'agences locales sur les délais de relocation habituels.", contacts: ["LeBonCoin Immo, PAP.fr — tester la demande", "Agences locales de gestion locative pour un avis marché", "Clameur.fr — données de marché locatif"] } },
    { id: "i8", phase: "Recherche", label: "Visiter et évaluer les biens (travaux, charges, DPE)", month: "M2",
      info: { title: "Ce qu'il faut évaluer en visite investisseur", body: "Regardez aussi : le DPE (les biens G sont interdits à la location depuis 2025, F en 2028), l'état général, le montant des charges de copro, et la facilité de gestion. Un DPE dégradé peut être un argument de négociation du prix.", contacts: ["Expert bâtiment pour un audit technique (200-500€)", "Diagnostiqueur certifié pour le DPE", "Artisans locaux pour estimer les travaux avant l'offre"] } },
    { id: "i9", phase: "Acquisition", label: "Faire une offre et signer le compromis", month: "M3",
      info: { title: "Négocier en investisseur", body: "En tant qu'investisseur, vous avez plus de marge de négociation (pas d'urgence émotionnelle, dossier souvent solide). Appuyez-vous sur le rendement cible pour justifier votre prix : 'À ce prix, le rendement ne couvre pas le crédit — je propose X.'", contacts: ["Votre notaire pour la rédaction du compromis", "Votre courtier pour confirmer le financement avant l'offre", "DVF (data.gouv.fr) — prix de vente réels dans le secteur"] } },
    { id: "i10", phase: "Acquisition", label: "Obtenir le financement et signer l'acte", month: "M4",
      info: { title: "Finaliser le financement investisseur", body: "Certaines banques demandent que les loyers couvrent au moins 70% de la mensualité. Votre courtier saura orienter votre dossier vers les établissements les plus favorables aux investisseurs.", contacts: ["Votre courtier immobilier spécialisé investissement", "Votre notaire pour l'acte authentique", "Assurance emprunteur en délégation (économie substantielle)"] } },
    { id: "i11", phase: "Mise en location", label: "Réaliser les travaux si nécessaire", month: "M5",
      info: { title: "Travaux : optimiser et déduire", body: "Les travaux sont déductibles des revenus fonciers au régime réel, ou amortissables en LMNP. Gardez toutes les factures. Priorisez isolation (DPE), salle de bain et cuisine (critères locatifs), peinture. Obtenez 3 devis.", contacts: ["Artisans certifiés RGE pour les aides (MaPrimeRénov')", "MaPrimeRenov.gouv.fr", "Habitissimo, Mon Artisan pour comparer des devis"] } },
    { id: "i12", phase: "Mise en location", label: "Rédiger et publier l'annonce de location", month: "M5",
      info: { title: "Bien rédiger son annonce locative", body: "Mentionnez : surface Carrez, nombre de pièces, étage, DPE, loyer CC, transports. En zone tendue, le loyer est encadré — vérifiez le plafond applicable avant de publier.", contacts: ["PAP.fr (gratuit pour les propriétaires)", "LeBonCoin Immo", "Encadrement des loyers : encadrementdesloyers.gouv.fr"] } },
    { id: "i13", phase: "Mise en location", label: "Sélectionner le locataire (dossier, garant)", month: "M5",
      info: { title: "Comment sélectionner son locataire ?", body: "La loi interdit de discriminer. Vous pouvez demander bulletins de salaire, avis d'imposition, contrat de travail. Ratio habituel : revenus = 3x le loyer. Vérifiez les justificatifs via DossierFacile. Vous pouvez aussi souscrire une GLI (Garantie Loyers Impayés).", contacts: ["DossierFacile.fr — vérification sécurisée (service public)", "GLI : Visale (gratuit, Action Logement) ou assureurs privés", "UNPI — unpi.fr"] } },
    { id: "i14", phase: "Mise en location", label: "Rédiger le bail et faire l'état des lieux d'entrée", month: "M5",
      info: { title: "Bail et état des lieux : les essentiels", body: "Le bail doit être conforme à la loi Alur. L'état des lieux d'entrée est capital : photos datées de chaque pièce, relevé des compteurs. En cas de litige à la sortie, c'est votre seule protection.", contacts: ["Modèle de bail officiel : service-public.fr", "Apps état des lieux : Immo Facile, État des lieux Facile", "Agence de gestion locative si vous préférez déléguer (6-10% des loyers)"] } },
  ],
};

// Merge steps for "les-deux"
STEPS_BY_PROFILE["les-deux"] = [
  ...STEPS_BY_PROFILE.vendeur.map(s => ({ ...s, tag: "Vente" })),
  ...STEPS_BY_PROFILE.acheteur.map(s => ({ ...s, tag: "Achat" })),
];

// ─── CALCULATORS ──────────────────────────────────────────────────────────────
function calcEmprunt(revenus, duree, taux) {
  const mensMax = revenus * 0.35;
  const r = taux / 100 / 12;
  const n = duree * 12;
  if (r === 0) return mensMax * n;
  return mensMax * (1 - Math.pow(1 + r, -n)) / r;
}

function calcNotaire(prix, neuf = false) {
  return neuf ? prix * 0.025 : prix * 0.075;
}

function calcMensualite(capital, duree, taux) {
  const r = taux / 100 / 12;
  const n = duree * 12;
  if (r === 0) return capital / n;
  return capital * r / (1 - Math.pow(1 + r, -n));
}

function calcRendement(prixAchat, loyerMensuel, charges) {
  const loyer = loyerMensuel * 12;
  const brut = (loyer / prixAchat) * 100;
  const net = ((loyer - charges * 12) / prixAchat) * 100;
  return { brut, net };
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

function Input({ label, value, onChange, type = "text", suffix, prefix, placeholder }) {
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

const fmt = n => isNaN(n) || !isFinite(n) ? "—" : Math.round(n).toLocaleString("fr-FR") + " €";
const fmtPct = n => isNaN(n) || !isFinite(n) ? "—" : n.toFixed(2) + " %";

// ─── SCREENS ──────────────────────────────────────────────────────────────────

function WelcomeScreen({ onSelect }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "#1a1a2e" }}>
      <div className="max-w-lg w-full">
        <div className="text-center mb-10">
          <div className="mx-auto mb-4 flex items-center justify-center" style={{ width: 64, height: 64, background: "#2563eb", borderRadius: "12px" }}>
            <span style={{ fontSize: 32 }}>🏠</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Mon Projet Immo
          </h1>
          <p className="text-slate-400 text-sm">Suivez chaque étape de votre projet immobilier, de A à Z</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {PROFILES.map(p => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="group bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/30 p-5 text-left transition-all duration-200 hover:scale-105"
              style={{ borderRadius: "14px" }}
            >
              <div className="text-3xl mb-2">{p.icon}</div>
              <div className="text-white font-semibold text-sm">{p.label}</div>
              <div className="text-slate-400 text-xs mt-0.5">{p.desc}</div>
            </button>
          ))}
        </div>
        <p className="text-center text-slate-500 text-xs mt-6">Vos données sont sauvegardées automatiquement</p>
      </div>
    </div>
  );
}

function OnboardingScreen({ profile, onDone }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    prenom: "", revenus: "", apport: "", prixBien: "", prixVente: "",
    capitalRestant: "", loyerCible: "", chargesCopro: "",
    duree: "25", taux: "3.5", neuf: "non",
    dateDebut: new Date().toISOString().slice(0, 7),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const isVendeur = profile === "vendeur" || profile === "les-deux";
  const isAcheteur = profile === "acheteur" || profile === "les-deux";
  const isInvestisseur = profile === "investisseur";

  const steps = [
    {
      title: "Bienvenue ! Comment vous appelez-vous ?",
      fields: (
        <Input label="Votre prénom" value={form.prenom} onChange={v => set("prenom", v)} placeholder="Ex : Thomas" />
      ),
    },
    isVendeur && {
      title: "Votre bien actuel",
      fields: (
        <div className="flex flex-col gap-4">
          <Input label="Prix de vente estimé" value={form.prixVente} onChange={v => set("prixVente", v)} type="number" suffix="€" placeholder="190000" />
          <Input label="Capital restant dû (crédit en cours)" value={form.capitalRestant} onChange={v => set("capitalRestant", v)} type="number" suffix="€" placeholder="140000" />
        </div>
      ),
    },
    (isAcheteur || isInvestisseur) && {
      title: "Votre situation financière",
      fields: (
        <div className="flex flex-col gap-4">
          <Input label="Revenus nets mensuels du foyer" value={form.revenus} onChange={v => set("revenus", v)} type="number" suffix="€/mois" placeholder="5100" />
          <Input label="Apport disponible" value={form.apport} onChange={v => set("apport", v)} type="number" suffix="€" placeholder="90000" />
        </div>
      ),
    },
    (isAcheteur || isInvestisseur) && {
      title: "Votre projet d'achat",
      fields: (
        <div className="flex flex-col gap-4">
          <Input label="Budget bien cible" value={form.prixBien} onChange={v => set("prixBien", v)} type="number" suffix="€" placeholder="300000" />
          <Select label="Durée du prêt" value={form.duree} onChange={v => set("duree", v)}
            options={[{ value: "15", label: "15 ans" }, { value: "20", label: "20 ans" }, { value: "25", label: "25 ans" }, { value: "30", label: "30 ans" }]} />
          <Input label="Taux d'intérêt estimé" value={form.taux} onChange={v => set("taux", v)} type="number" suffix="%" placeholder="3.5" />
          <Select label="Bien neuf ou ancien ?" value={form.neuf} onChange={v => set("neuf", v)}
            options={[{ value: "non", label: "Ancien (frais notaire 7,5%)" }, { value: "oui", label: "Neuf (frais notaire 2,5%)" }]} />
        </div>
      ),
    },
    isInvestisseur && {
      title: "Objectif locatif",
      fields: (
        <div className="flex flex-col gap-4">
          <Input label="Loyer mensuel cible" value={form.loyerCible} onChange={v => set("loyerCible", v)} type="number" suffix="€/mois" placeholder="900" />
          <Input label="Charges copro mensuelles estimées" value={form.chargesCopro} onChange={v => set("chargesCopro", v)} type="number" suffix="€/mois" placeholder="150" />
        </div>
      ),
    },
    {
      title: "Date de début du projet",
      fields: (
        <Input label="Mois de démarrage" value={form.dateDebut} onChange={v => set("dateDebut", v)} type="month" />
      ),
    },
  ].filter(Boolean);

  const cur = steps[step];

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "#1a1a2e" }}>
      <div className="max-w-md w-full">
        <div className="mb-6">
          <div className="flex gap-1.5 mb-6">
            {steps.map((_, i) => (
              <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300"
                style={{ background: i <= step ? "#3b82f6" : "rgba(255,255,255,0.15)" }} />
            ))}
          </div>
          <p className="text-slate-400 text-xs mb-1">Étape {step + 1} / {steps.length}</p>
          <h2 className="text-xl font-bold text-white">{cur.title}</h2>
        </div>
        <Card>
          {cur.fields}
        </Card>
        <div className="flex gap-3 mt-4">
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)}
              className="flex-1 py-3 rounded-xl border border-white/20 text-white text-sm font-medium hover:bg-white/10 transition-all">
              ← Retour
            </button>
          )}
          <button
            onClick={() => step < steps.length - 1 ? setStep(s => s + 1) : onDone(form)}
            className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all"
          >
            {step < steps.length - 1 ? "Continuer →" : "Démarrer mon projet 🚀"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ profile, form, checklist, onToggle, onReset }) {
  const [tab, setTab] = useState("checklist");
  const [infoStep, setInfoStep] = useState(null);

  const steps = STEPS_BY_PROFILE[profile] || [];
  const done = steps.filter(s => checklist[s.id]).length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;

  // Financial calcs
  const prixVente = parseFloat(form.prixVente) || 0;
  const capitalRestant = parseFloat(form.capitalRestant) || 0;
  const netVendeur = prixVente - capitalRestant;
  const apport = parseFloat(form.apport) || 0;
  const prixBien = parseFloat(form.prixBien) || 0;
  const revenus = parseFloat(form.revenus) || 0;
  const duree = parseFloat(form.duree) || 25;
  const taux = parseFloat(form.taux) || 3.5;
  const neuf = form.neuf === "oui";
  const fraisNotaire = prixBien ? calcNotaire(prixBien, neuf) : 0;
  const capitalEmprunte = Math.max(0, prixBien - apport);
  const mensualite = capitalEmprunte ? calcMensualite(capitalEmprunte, duree, taux) : 0;
  const capacite = revenus ? calcEmprunt(revenus, duree, taux) : 0;
  const loyerCible = parseFloat(form.loyerCible) || 0;
  const chargesCopro = parseFloat(form.chargesCopro) || 0;
  const rendement = prixBien && loyerCible ? calcRendement(prixBien, loyerCible, chargesCopro) : null;

  const isVendeur = profile === "vendeur" || profile === "les-deux";
  const isAcheteur = profile === "acheteur" || profile === "les-deux";
  const isInvestisseur = profile === "investisseur";

  // Group steps by phase
  const phases = {};
  steps.forEach(s => {
    const key = s.tag ? `${s.tag} — ${s.phase}` : s.phase;
    if (!phases[key]) phases[key] = [];
    phases[key].push(s);
  });

  const phaseColors = {
    "Préparation": "#f59e0b",
    "Mise en vente": "#3b82f6",
    "Compromis": "#8b5cf6",
    "Finalisation": "#10b981",
    "Recherche": "#06b6d4",
    "Offre": "#f97316",
    "Financement": "#ec4899",
    "Stratégie": "#84cc16",
    "Acquisition": "#6366f1",
    "Mise en location": "#14b8a6",
  };

  function getPhaseColor(phaseKey) {
    for (const [k, v] of Object.entries(phaseColors)) {
      if (phaseKey.includes(k)) return v;
    }
    return "#94a3b8";
  }

  const TABS = [
    { id: "checklist", label: "Étapes", icon: "✅" },
    { id: "finances", label: "Finances", icon: "💶" },
    { id: "docs", label: "Documents", icon: "📄" },
  ];

  const DOCS = {
    vendeur: [
      "Titre de propriété", "DPE", "Diagnostic loi Carrez", "Diagnostic électricité",
      "Diagnostic gaz", "Diagnostic amiante", "Diagnostic plomb", "ERP (risques)",
      "3 derniers appels de charges copro", "PV des 3 dernières AG",
      "Règlement de copropriété", "Taxe foncière (dernier avis)",
    ],
    acheteur: [
      "3 derniers bulletins de salaire", "2 derniers avis d'imposition",
      "3 derniers relevés bancaires", "CNI ou passeport", "Justificatif de domicile",
      "RIB", "Justificatifs d'épargne", "Tableau d'amortissement crédit en cours",
      "Compromis de vente (si disponible)", "Accord de principe bancaire",
    ],
    investisseur: [
      "3 derniers bulletins de salaire", "2 derniers avis d'imposition",
      "3 derniers relevés bancaires", "CNI ou passeport", "Justificatif de domicile",
      "RIB", "Justificatifs d'épargne", "Business plan locatif",
      "Statuts SCI (si applicable)", "Kbis (si SCI)",
    ],
  };

  const docsToShow = profile === "les-deux"
    ? [...new Set([...DOCS.vendeur, ...DOCS.acheteur])]
    : DOCS[profile] || DOCS.acheteur;

  const [docsDone, setDocsDone] = useState({});
  const toggleDoc = (d) => setDocsDone(prev => ({ ...prev, [d]: !prev[d] }));

  return (
    <div className="min-h-screen" style={{ background: "#f8f7f5" }}>
      <InfoModal step={infoStep} onClose={() => setInfoStep(null)} />
      {/* Header */}
      <div className="text-white px-5 pt-8 pb-16"
        style={{ background: "#1a1a2e" }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-slate-400 text-xs mb-1">Bonjour 👋</p>
              <h1 className="text-2xl font-bold">
                {form.prenom || "Mon projet"}
              </h1>
              <p className="text-slate-400 text-sm mt-0.5">
                {PROFILES.find(p => p.id === profile)?.icon} {PROFILES.find(p => p.id === profile)?.label}
              </p>
            </div>
            <button onClick={onReset}
              className="text-slate-500 hover:text-slate-300 text-xs border border-white/10 px-3 py-1.5 rounded-lg transition-all">
              ↺ Recommencer
            </button>
          </div>
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-slate-300">Progression</span>
            <span className="text-white font-bold">{done}/{steps.length} étapes</span>
          </div>
          <ProgressBar value={done} max={steps.length} color="#3b82f6" />
          <div className="mt-2 text-right text-xs text-blue-300 font-semibold">{pct}% complété</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-2xl mx-auto px-5 -mt-8">
        <div className="bg-white rounded-2xl shadow-lg p-1.5 flex gap-1 mb-5" style={{ border: "0.5px solid #e5e3df" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === t.id ? "bg-blue-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>
              <span>{t.icon}</span> <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* CHECKLIST TAB */}
        {tab === "checklist" && (
          <div className="flex flex-col gap-4 pb-10">
            {Object.entries(phases).map(([phase, items]) => {
              const phaseDone = items.filter(s => checklist[s.id]).length;
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
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${checklist[s.id] ? "border-green-500 bg-green-500" : "border-slate-200 group-hover:border-blue-400"}`}>
                            {checklist[s.id] && <span className="text-white text-xs">✓</span>}
                          </div>
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            <span className={`text-sm transition-all truncate ${checklist[s.id] ? "line-through text-slate-400" : "text-slate-700"}`}>
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
        )}

        {/* FINANCES TAB */}
        {tab === "finances" && (
          <div className="flex flex-col gap-4 pb-10">
            {isVendeur && (
              <Card>
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                  <span className="text-amber-500">🏷️</span> Côté vente
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <Stat label="Prix de vente estimé" value={fmt(prixVente)} />
                  <Stat label="Capital restant dû" value={fmt(capitalRestant)} />
                  <Stat label="Net vendeur estimé" value={fmt(netVendeur)} accent={netVendeur > 0 ? "text-green-600" : "text-red-500"} sub="après remboursement crédit" />
                </div>
              </Card>
            )}

            {(isAcheteur || isInvestisseur) && (
              <>
                <Card>
                  <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <span className="text-blue-500">💰</span> Capacité d'emprunt
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <Stat label="Mensualité max (35%)" value={fmt(revenus * 0.35)} sub="taux d'endettement" />
                    <Stat label="Capacité d'emprunt" value={fmt(capacite)} accent="text-blue-600" sub={`sur ${duree} ans à ${taux}%`} />
                    <Stat label="Apport disponible" value={fmt(apport)} />
                    <Stat label="Budget total possible" value={fmt(capacite + apport)} accent="text-green-600" />
                  </div>
                </Card>

                {prixBien > 0 && (
                  <Card>
                    <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                      <span className="text-purple-500">🔑</span> Simulation achat à {fmt(prixBien)}
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <Stat label="Capital à emprunter" value={fmt(capitalEmprunte)} />
                      <Stat label="Mensualité estimée" value={fmt(mensualite) + "/mois"} accent="text-blue-600" sub={`sur ${duree} ans`} />
                      <Stat label="Frais de notaire" value={fmt(fraisNotaire)} sub={neuf ? "neuf (2,5%)" : "ancien (7,5%)"} />
                      <Stat label="Coût total crédit" value={fmt(mensualite * duree * 12 - capitalEmprunte)} accent="text-red-500" sub="intérêts totaux" />
                    </div>
                    <div className="mt-4 p-3 rounded-xl text-sm"
                      style={{ background: mensualite < revenus * 0.35 ? "#f0fdf4" : "#fef2f2" }}>
                      {mensualite < revenus * 0.35
                        ? <span className="text-green-700">✅ Mensualité dans votre capacité d'emprunt</span>
                        : <span className="text-red-700">⚠️ Mensualité supérieure à votre taux d'endettement max</span>}
                    </div>
                  </Card>
                )}
              </>
            )}

            {isInvestisseur && rendement && (
              <Card>
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                  <span className="text-green-500">📈</span> Rendement locatif
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <Stat label="Loyer annuel" value={fmt(loyerCible * 12)} />
                  <Stat label="Rendement brut" value={fmtPct(rendement.brut)} accent="text-green-600" />
                  <Stat label="Charges annuelles" value={fmt(chargesCopro * 12)} />
                  <Stat label="Rendement net" value={fmtPct(rendement.net)} accent={rendement.net >= 4 ? "text-green-600" : "text-amber-600"} />
                </div>
                <div className="mt-4 p-3 rounded-xl text-sm"
                  style={{ background: rendement.net >= 4 ? "#f0fdf4" : "#fffbeb" }}>
                  {rendement.net >= 4
                    ? <span className="text-green-700">✅ Rendement net attractif (&gt;4%)</span>
                    : <span className="text-amber-700">⚠️ Rendement net faible — à négocier ou revoir les charges</span>}
                </div>
              </Card>
            )}

            {isVendeur && isAcheteur && (
              <Card>
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                  <span className="text-indigo-500">🔄</span> Bilan global vente + achat
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <Stat label="Net vendeur" value={fmt(netVendeur)} />
                  <Stat label="+ Épargne" value={fmt(apport - netVendeur)} sub="apport hors net vendeur" />
                  <Stat label="Apport total" value={fmt(apport)} accent="text-blue-600" />
                  <Stat label="Budget achat net notaire" value={fmt(prixBien + fraisNotaire)} />
                </div>
              </Card>
            )}
          </div>
        )}

        {/* DOCS TAB */}
        {tab === "docs" && (
          <div className="flex flex-col gap-4 pb-10">
            <Card>
              <h3 className="font-bold text-slate-700 mb-1 flex items-center gap-2">
                <span>📄</span> Documents à réunir
              </h3>
              <p className="text-xs text-slate-400 mb-4">Cochez les documents au fur et à mesure</p>
              <div className="mb-2">
                <ProgressBar value={Object.values(docsDone).filter(Boolean).length} max={docsToShow.length} color="#10b981" />
                <div className="text-right text-xs text-slate-400 mt-1">
                  {Object.values(docsDone).filter(Boolean).length}/{docsToShow.length} réunis
                </div>
              </div>
              <div className="flex flex-col gap-2 mt-3">
                {docsToShow.map(d => (
                  <button key={d} onClick={() => toggleDoc(d)}
                    className="flex items-center gap-3 text-left group">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${docsDone[d] ? "border-green-500 bg-green-500" : "border-slate-200 group-hover:border-green-400"}`}>
                      {docsDone[d] && <span className="text-white text-xs">✓</span>}
                    </div>
                    <span className={`text-sm ${docsDone[d] ? "line-through text-slate-400" : "text-slate-700"}`}>{d}</span>
                  </button>
                ))}
              </div>
            </Card>

            <Card>
              <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                <span>💡</span> Conseils clés
              </h3>
              <div className="flex flex-col gap-2">
                {[
                  "Consultez un courtier dès le début — l'accord de principe renforce votre dossier acheteur",
                  "Conservez 10-15k€ de réserve même après l'apport (imprévus, travaux)",
                  "Vérifiez les PV d'AG avant toute offre — travaux votés = charges futures",
                  "Négociez l'assurance emprunteur en délégation (économie de 10-30k€)",
                  "Pour une indivision, rédigez une convention chez le notaire dès l'achat",
                ].map((tip, i) => (
                  <div key={i} className="flex gap-2 text-sm text-slate-600 p-3 bg-blue-50 rounded-xl">
                    <span className="text-blue-400 flex-shrink-0">→</span>
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("loading");
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [checklist, setChecklist] = useState({});

  useEffect(() => {
    loadData().then(d => {
      if (d?.profile && d?.form) {
        setProfile(d.profile);
        setForm(d.form);
        setChecklist(d.checklist || {});
        setScreen("dashboard");
      } else {
        setScreen("welcome");
      }
    });
  }, []);

  const persist = useCallback((p, f, c) => {
    saveData({ profile: p, form: f, checklist: c });
  }, []);

  const handleProfileSelect = (p) => {
    setProfile(p);
    setScreen("onboarding");
  };

  const handleOnboardingDone = (f) => {
    setForm(f);
    setScreen("dashboard");
    persist(profile, f, {});
  };

  const handleToggle = (id) => {
    setChecklist(prev => {
      const next = { ...prev, [id]: !prev[id] };
      persist(profile, form, next);
      return next;
    });
  };

  const handleReset = () => {
    saveData(null);
    setProfile(null);
    setForm({});
    setChecklist({});
    setScreen("welcome");
  };

  let content;
  if (screen === "loading") {
    content = (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: "#1a1a2e" }}>
        <div className="text-white text-center">
          <div className="text-4xl mb-3">🏠</div>
          <p className="text-slate-400 text-sm">Chargement…</p>
        </div>
      </div>
    );
  } else if (screen === "welcome") {
    content = <WelcomeScreen onSelect={handleProfileSelect} />;
  } else if (screen === "onboarding") {
    content = <OnboardingScreen profile={profile} onDone={handleOnboardingDone} />;
  } else {
    content = <Dashboard profile={profile} form={form} checklist={checklist} onToggle={handleToggle} onReset={handleReset} />;
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