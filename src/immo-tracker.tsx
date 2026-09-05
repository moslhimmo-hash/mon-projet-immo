import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

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

// Bibliothèque d'inspirations — commune à tous les projets, stockage dédié.
const INSPIRATIONS_STORAGE = "cozimo-inspirations";

async function loadInspirations() {
  try {
    const r = await window.storage.get(INSPIRATIONS_STORAGE);
    return r ? JSON.parse(r.value) : [];
  } catch { return []; }
}

async function saveInspirations(list) {
  try { await window.storage.set(INSPIRATIONS_STORAGE, JSON.stringify(list)); } catch {}
}

// Marqueur "onboarding vu" — n'affiche le guide qu'au tout premier lancement.
const ONBOARDING_STORAGE = "cozimo-onboarding-done";

async function loadOnboardingDone() {
  try {
    const r = await window.storage.get(ONBOARDING_STORAGE);
    return r?.value === "true";
  } catch { return false; }
}

async function saveOnboardingDone() {
  try { await window.storage.set(ONBOARDING_STORAGE, "true"); } catch {}
}

// Fermeture définitive de la bannière d'installation PWA — localStorage (pas window.storage),
// pour rester synchrone et disponible dès le tout premier rendu.
const INSTALL_BANNER_DISMISSED_KEY = "cozimo-install-dismissed";

function uid() {
  return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─── PARTAGE EN LECTURE SEULE ───────────────────────────────────────────────────
// Encode un sous-ensemble "essentiel" du projet (étapes, budget, contacts, journal)
// en base64url dans l'URL — pas de backend, le lien contient toute la donnée.
function buildShareData(project) {
  return {
    name: project.name,
    type: project.type,
    icon: project.icon || null,
    startDate: project.startDate,
    checklist: project.checklist || {},
    customSteps: project.customSteps || [],
    budget: project.budget || {},
    contacts: project.contacts || [],
    journal: project.journal || [],
    deadlines: project.deadlines || {},
  };
}

function toBase64Url(b64) {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(b64url) {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return b64;
}

function encodeShareData(project) {
  const json = JSON.stringify(buildShareData(project));
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return toBase64Url(btoa(binary));
}

function decodeShareData(encoded) {
  try {
    const binary = atob(fromBase64Url(encoded));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

// ─── AUTH OPTIONNELLE (SUPABASE) ────────────────────────────────────────────────
// Principe : Cozimo fonctionne entièrement sans compte (localStorage). Le compte
// est une option pour sauvegarder dans le cloud — jamais bloquant. Si les variables
// d'environnement ne sont pas configurées, `supabase` reste null et toutes les
// fonctions ci-dessous se comportent en no-op / erreur explicite plutôt que de planter.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
// Google OAuth passe entièrement par Supabase (le client ID Google est configuré côté
// dashboard Supabase, pas ici) — cette variable sert uniquement de signal côté app pour
// savoir si le développeur a déjà mis en place l'intégration, afin d'afficher un message
// clair plutôt que de laisser échouer silencieusement.
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || "";

// Décode le payload d'un JWT Supabase (legacy anon/service_role) pour en lire le
// "role" sans dépendance — renvoie null pour les nouvelles clés sb_publishable_/sb_secret_
// (qui ne sont pas des JWT) ou tout autre format non reconnu.
function decodeSupabaseKeyRole(key) {
  try {
    const parts = key.split(".");
    if (parts.length !== 3) return null;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const payload = JSON.parse(atob(b64));
    return payload.role || null;
  } catch {
    return null;
  }
}

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Diagnostic au démarrage — aide à repérer immédiatement une clé mal configurée
// (service_role au lieu d'anon, clé secret côté client, etc.) plutôt que de
// découvrir le problème après coup via des échecs de synchronisation silencieux.
if (supabase) {
  const keyRole = decodeSupabaseKeyRole(SUPABASE_ANON_KEY);
  let keyFormat = "inconnu";
  if (SUPABASE_ANON_KEY.startsWith("sb_publishable_")) keyFormat = "publishable (nouveau format)";
  else if (SUPABASE_ANON_KEY.startsWith("sb_secret_")) keyFormat = "secret (nouveau format)";
  else if (keyRole) keyFormat = `JWT legacy — role="${keyRole}"`;
  console.log("[Supabase] Client initialisé.", { url: SUPABASE_URL, keyFormat });
  if (keyRole === "service_role") {
    console.error(
      "[Supabase] ⚠️ EXPO_PUBLIC_SUPABASE_ANON_KEY contient une clé service_role, pas anon ! " +
      "Cette clé contourne toute la sécurité RLS et ne doit JAMAIS être exposée côté client. " +
      "Dans Supabase → Project Settings → API : utilisez soit la clé \"anon public\" de l'onglet " +
      "\"Legacy anon, service_role API keys\", soit la clé \"publishable\" (sb_publishable_...) du nouvel onglet API Keys."
    );
  } else if (SUPABASE_ANON_KEY.startsWith("sb_secret_")) {
    console.error(
      "[Supabase] ⚠️ EXPO_PUBLIC_SUPABASE_ANON_KEY contient une clé secret (sb_secret_...) — jamais côté client ! " +
      "Utilisez la clé publishable (sb_publishable_...) à la place."
    );
  }
} else {
  console.warn("[Supabase] Non configuré (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY manquants) — mode local uniquement.");
}

const ACCOUNT_BANNER_DISMISSED_KEY = "cozimo-account-banner-dismissed";

// Priorité aux codes d'erreur stables de Supabase (error.code) plutôt qu'au texte du
// message (error.message), qui peut changer de formulation. Voir la référence :
// https://supabase.com/docs/guides/auth/debugging/error-codes
function authErrorMessage(error) {
  const code = error?.code || "";
  const msg = error?.message || "";
  if (code === "invalid_credentials") return "Email ou mot de passe incorrect.";
  if (code === "user_already_exists") return "Un compte existe déjà avec cet email.";
  if (code === "weak_password") return "Le mot de passe doit contenir au moins 6 caractères.";
  if (code === "email_address_invalid") return "Adresse email invalide.";
  if (code === "email_not_confirmed") return "Merci de confirmer votre email avant de vous connecter.";
  if (code === "over_email_send_rate_limit") return "Trop de tentatives récentes. Merci de réessayer dans quelques minutes.";
  if (code === "over_request_rate_limit") return "Trop de tentatives. Merci de réessayer dans quelques minutes.";
  if (code === "signup_disabled") return "Les inscriptions sont actuellement désactivées.";
  if (code === "user_banned") return "Ce compte est temporairement bloqué.";
  if (code === "validation_failed" && msg.includes("provider is not enabled")) {
    return "La connexion Google n'est pas encore activée pour cette app.";
  }
  // Filet de sécurité si Supabase ne renvoie pas de code (anciennes versions, erreurs réseau…).
  if (msg.includes("provider is not enabled") || msg.includes("Unsupported provider")) {
    return "La connexion Google n'est pas encore activée pour cette app.";
  }
  if (msg.includes("Invalid login credentials")) return "Email ou mot de passe incorrect.";
  if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("User already registered")) {
    return "Un compte existe déjà avec cet email.";
  }
  if (msg.includes("Password should be at least")) return "Le mot de passe doit contenir au moins 6 caractères.";
  if (msg.includes("rate limit")) return "Trop de tentatives récentes. Merci de réessayer dans quelques minutes.";
  if (msg.includes("Unable to validate email") || msg.includes("invalid")) return "Adresse email invalide.";
  if (msg.includes("Email not confirmed")) return "Merci de confirmer votre email avant de vous connecter.";
  if (msg.includes("network") || msg.includes("fetch")) return "Problème de connexion. Vérifiez votre connexion internet.";
  return "Une erreur est survenue. Veuillez réessayer.";
}

async function signUpWithEmail(email, password) {
  console.log("[Supabase][auth] signUp →", email);
  if (!supabase) {
    console.error("[Supabase][auth] signUp annulé : client non configuré (voir avertissement au démarrage).");
    throw new Error("Service d'authentification non configuré.");
  }
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    console.error("[Supabase][auth] signUp ÉCHEC :", error);
    throw new Error(authErrorMessage(error));
  }
  console.log("[Supabase][auth] signUp OK →", { userId: data?.user?.id, hasSession: !!data?.session });
  return data;
}

async function signInWithEmail(email, password) {
  console.log("[Supabase][auth] signIn →", email);
  if (!supabase) {
    console.error("[Supabase][auth] signIn annulé : client non configuré (voir avertissement au démarrage).");
    throw new Error("Service d'authentification non configuré.");
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error("[Supabase][auth] signIn ÉCHEC :", error);
    const err = new Error(authErrorMessage(error));
    err.code = error.code;
    throw err;
  }
  console.log("[Supabase][auth] signIn OK →", { userId: data?.user?.id });
  return data;
}

async function sendPasswordResetEmail(email) {
  console.log("[Supabase][auth] resetPasswordForEmail →", email);
  if (!supabase) {
    console.error("[Supabase][auth] resetPasswordForEmail annulé : client non configuré.");
    throw new Error("Service d'authentification non configuré.");
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: "https://cozimo.fr" });
  if (error) {
    console.error("[Supabase][auth] resetPasswordForEmail ÉCHEC :", error);
    throw new Error(authErrorMessage(error));
  }
  console.log("[Supabase][auth] resetPasswordForEmail OK →", email);
}

async function signInWithGoogle() {
  console.log("[Supabase][auth] signInWithGoogle →");
  if (!supabase) {
    console.error("[Supabase][auth] signInWithGoogle annulé : client non configuré.");
    throw new Error("Service d'authentification non configuré.");
  }
  if (!GOOGLE_CLIENT_ID) {
    console.warn("[Supabase][auth] signInWithGoogle annulé : EXPO_PUBLIC_GOOGLE_CLIENT_ID non configuré.");
    throw new Error("La connexion avec Google n'est pas encore configurée pour cette app.");
  }
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google" });
  if (error) {
    console.error("[Supabase][auth] signInWithGoogle ÉCHEC :", error);
    throw new Error(authErrorMessage(error));
  }
}

async function signOutUser() {
  if (!supabase) return;
  console.log("[Supabase][auth] signOut →");
  try {
    const { error } = await supabase.auth.signOut();
    if (error) console.error("[Supabase][auth] signOut ÉCHEC :", error);
    else console.log("[Supabase][auth] signOut OK");
  } catch (e) {
    console.error("[Supabase][auth] signOut EXCEPTION :", e);
  }
}

// Retire cloudId (référence locale à la ligne Supabase) avant de stocker dans la colonne JSONB.
function stripCloudId(project) {
  const { cloudId, ...rest } = project;
  return rest;
}

async function fetchCloudProjects(userId) {
  console.log(`[Supabase][projects] fetchCloudProjects → userId utilisé pour CHARGER = "${userId}" (table projects, filtre user_id = eq.${userId})`);
  if (!supabase) {
    console.warn("[Supabase][projects] fetchCloudProjects annulé : client non configuré.");
    return [];
  }
  try {
    const { data, error } = await supabase.from("projects").select("*").eq("user_id", userId);
    if (error) throw error;
    console.log(`[Supabase][projects] fetchCloudProjects OK → ${data?.length || 0} ligne(s) reçue(s) de Supabase :`,
      (data || []).map(row => ({ rowId: row.id, name: row.name, user_id: row.user_id, matchUserId: row.user_id === userId })));
    return (data || []).map(row => ({ ...row.data, cloudId: row.id }));
  } catch (e) {
    console.error("[Supabase][projects] fetchCloudProjects ÉCHEC (fallback : aucun projet cloud chargé) :", e);
    return [];
  }
}

async function insertCloudProject(project, userId) {
  console.log(`[Supabase][projects] insertCloudProject → userId utilisé pour SAUVEGARDER = "${userId}"`, { name: project.name, type: project.type });
  if (!supabase) {
    console.warn("[Supabase][projects] insertCloudProject annulé : client non configuré.");
    return null;
  }
  try {
    const { data, error } = await supabase
      .from("projects")
      .insert({ user_id: userId, name: project.name, type: project.type, data: stripCloudId(project) })
      .select()
      .single();
    if (error) throw error;
    console.log("[Supabase][projects] insertCloudProject OK →", { cloudId: data.id, user_id_enregistré: data.user_id });
    return data.id;
  } catch (e) {
    console.error("[Supabase][projects] insertCloudProject ÉCHEC (le projet reste local uniquement) :", e);
    return null;
  }
}

// Sauvegarde en temps réel des projets cloud — échec réseau : fallback silencieux côté UI
// (le localStorage, déjà à jour via persist(), reste la source de vérité locale), mais
// l'erreur est toujours loguée pour rester diagnosticable.
async function updateCloudProject(project) {
  if (!supabase || !project.cloudId) return;
  console.log("[Supabase][projects] updateCloudProject →", { cloudId: project.cloudId, name: project.name });
  try {
    const { error } = await supabase
      .from("projects")
      .update({ name: project.name, type: project.type, data: stripCloudId(project), updated_at: new Date().toISOString() })
      .eq("id", project.cloudId);
    if (error) throw error;
    console.log("[Supabase][projects] updateCloudProject OK → cloudId =", project.cloudId);
  } catch (e) {
    console.error("[Supabase][projects] updateCloudProject ÉCHEC (fallback localStorage) :", e);
  }
}

async function deleteCloudProject(cloudId) {
  if (!supabase || !cloudId) return;
  console.log("[Supabase][projects] deleteCloudProject →", cloudId);
  try {
    const { error } = await supabase.from("projects").delete().eq("id", cloudId);
    if (error) throw error;
    console.log("[Supabase][projects] deleteCloudProject OK →", cloudId);
  } catch (e) {
    console.error("[Supabase][projects] deleteCloudProject ÉCHEC :", e);
  }
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

// Icônes proposées pour personnaliser un projet — remplace l'emoji par défaut du type.
const CUSTOM_PROJECT_ICONS = ["🏠", "🏡", "🏢", "🏗️", "🔑", "🏷️", "🔄", "📈", "🌱", "🔨", "🏖️", "🌆", "🏘️", "💼", "🎯", "⭐", "🚀", "💡"];

const IMPORTANCE = {
  essentielle: { label: "Essentielle", color: "#b91c1c", bg: "#fee2e2" },
  importante: { label: "Importante", color: "#b45309", bg: "#fef3c7" },
  utile: { label: "Utile", color: "#047857", bg: "#d1fae5" },
};

// Palette cyclique utilisée pour distinguer visuellement les badges projet (inspirations, etc.)
const PROJECT_COLORS = [
  { color: "#1d4ed8", bg: "#dbeafe" },
  { color: "#047857", bg: "#d1fae5" },
  { color: "#b45309", bg: "#fef3c7" },
  { color: "#7c3aed", bg: "#ede9fe" },
  { color: "#be185d", bg: "#fce7f3" },
  { color: "#0e7490", bg: "#cffafe" },
  { color: "#b91c1c", bg: "#fee2e2" },
  { color: "#4d7c0f", bg: "#ecfccb" },
];

function projectColor(projects, projectId) {
  const idx = projects.findIndex(p => p.id === projectId);
  return PROJECT_COLORS[(idx >= 0 ? idx : 0) % PROJECT_COLORS.length];
}

const CONTACT_STATUSES = [
  { value: "a_contacter", label: "À contacter", icon: "🟡", bg: "#fef3c7", color: "#92400e" },
  { value: "en_discussion", label: "En discussion", icon: "🔵", bg: "#dbeafe", color: "#1e40af" },
  { value: "valide", label: "Validé", icon: "🟢", bg: "#d1fae5", color: "#047857" },
  { value: "ecarte", label: "Écarté", icon: "🔴", bg: "#fee2e2", color: "#b91c1c" },
];

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

// ─── GÉNÉRATEUR DE PROMPT IA ────────────────────────────────────────────────────
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

// Représente une étape personnalisée sous la même forme qu'une étape STEPS_BY_TYPE,
// pour qu'elle se mélange naturellement aux calculs de progression et à "Prochaine action".
function mapCustomStep(cs) {
  return { id: cs.id, label: cs.label, importance: cs.importance, phase: cs.phaseKey, month: null, info: null, custom: true };
}

// Nombre d'étapes cochées / total, étapes personnalisées comprises.
function getProjectStepCount(project) {
  const steps = STEPS_BY_TYPE[project.type] || [];
  const customs = (project.customSteps || []).map(mapCustomStep);
  const all = [...steps, ...customs];
  const done = all.filter(s => project.checklist[s.id]).length;
  return { done, total: all.length };
}

const fmtPct = n => isNaN(n) || !isFinite(n) ? "—" : n.toFixed(2) + " %";

function calcMensualite(capital, duree, taux) {
  const r = taux / 100 / 12;
  const n = duree * 12;
  if (r === 0) return capital / n;
  return capital * r / (1 - Math.pow(1 + r, -n));
}

// Inverse de calcMensualite : capital empruntable pour une mensualité cible donnée
// (utilisé pour l'estimation indicative de la capacité d'emprunt).
function calcCapaciteEmprunt(mensualiteMax, duree, taux) {
  if (mensualiteMax <= 0 || duree <= 0) return 0;
  const r = taux / 100 / 12;
  const n = duree * 12;
  if (r === 0) return mensualiteMax * n;
  return mensualiteMax * (1 - Math.pow(1 + r, -n)) / r;
}

// ─── MOTEUR BUDGÉTAIRE DYNAMIQUE ────────────────────────────────────────────────
// Un même jeu de sections/champs est partagé entre les familles de projet qui en
// ont besoin (ex : "Acquisition" et "Financement" sont identiques pour l'achat RP
// et l'investissement locatif), au lieu de dupliquer 8 budgets indépendants.
const BUDGET_FAMILY_BY_TYPE = {
  "achat-rp": "achat",
  "vente": "vente",
  "investissement-locatif": "investissement",
  "vente-achat": "vente-achat",
};

function getBudgetFamily(type) {
  return BUDGET_FAMILY_BY_TYPE[type] || "generic";
}

const REGIME_FISCAL_OPTIONS = [
  { value: "micro-foncier", label: "Micro-foncier" },
  { value: "reel", label: "Réel" },
  { value: "lmnp", label: "LMNP" },
  { value: "sci", label: "SCI" },
];

const BUDGET_SECTIONS = {
  financement: {
    id: "financement", title: "Financement", icon: "💰", defaultOpen: false,
    // Rendu par un composant dédié (FinancementSectionCard) plutôt que le mapping
    // générique de champs — ce tableau reste la source de vérité pour l'export PDF.
    fields: [
      { key: "revenusNetsMensuels", label: "Revenus nets mensuels du foyer (avant impôts)", suffix: "€/mois" },
      { key: "capaciteEmpruntEstimee", label: "Capacité d'emprunt estimée", type: "computed", suffix: "€", sub: "Indicatif — 35% des revenus sur 25 ans à 3,5%" },
      { key: "sourcesApport", label: "Sources d'apport", type: "sources-apport" },
      { key: "totalApport", label: "Total apport", type: "computed", suffix: "€" },
      { key: "epargneTotaleDisponible", label: "Épargne totale disponible", suffix: "€", hint: "Épargne globale du foyer, projet compris" },
      { key: "epargneInvestie", label: "Épargne investie dans le projet", type: "computed", suffix: "€", sub: "= Total apport" },
      { key: "montantEmprunte", label: "Montant emprunté", suffix: "€" },
      { key: "tauxNominal", label: "Taux nominal", suffix: "%", placeholder: "3.5" },
      { key: "dureeAns", label: "Durée", suffix: "ans", placeholder: "25" },
      { key: "mensualiteHorsAssurance", label: "Mensualité hors assurance", type: "computed", suffix: "€/mois" },
      { key: "assuranceEmprunteur", label: "Assurance emprunteur", suffix: "€/mois" },
      { key: "coutTotalCredit", label: "Coût total du crédit", type: "computed", suffix: "€" },
    ],
  },
  acquisition: {
    id: "acquisition", title: "Acquisition", icon: "🏠", defaultOpen: false,
    fields: [
      { key: "prixAchat", label: "Prix d'achat", suffix: "€" },
      { key: "neuf", label: "Bien neuf (frais de notaire à 2,5% au lieu de 7,5%)", type: "checkbox" },
      { key: "fraisNotaire", label: "Frais de notaire", type: "computed", suffix: "€" },
      { key: "fraisAgence", label: "Frais d'agence", suffix: "€" },
      { key: "fraisCourtage", label: "Frais de courtage", suffix: "€" },
      { key: "fraisDossierBancaire", label: "Frais de dossier bancaire", suffix: "€" },
      { key: "fraisGarantiePret", label: "Frais de garantie du prêt", suffix: "€" },
      { key: "totalAcquisition", label: "Total acquisition", type: "computed", suffix: "€" },
    ],
  },
  "avant-emenagement": {
    id: "avant-emenagement", title: "Avant emménagement", icon: "🎁", defaultOpen: false,
    fields: [
      { key: "travauxGlobal", label: "Travaux (global)", suffix: "€" },
      { key: "electromenager", label: "Électroménager", suffix: "€" },
      { key: "mobilier", label: "Mobilier", suffix: "€" },
      { key: "decoration", label: "Décoration", suffix: "€" },
      { key: "totalAvantEmenagement", label: "Total avant emménagement", type: "computed", suffix: "€" },
    ],
  },
  installation: {
    id: "installation", title: "Installation", icon: "🔑", defaultOpen: false,
    fields: [
      { key: "demenagement", label: "Déménagement", suffix: "€" },
      { key: "assuranceHabitationSetup", label: "Assurance habitation", suffix: "€" },
      { key: "serrurerie", label: "Serrurerie", suffix: "€" },
      { key: "petitsEquipements", label: "Petits équipements", suffix: "€" },
      { key: "totalInstallation", label: "Total installation", type: "computed", suffix: "€" },
    ],
  },
  "couts-recurrents": {
    id: "couts-recurrents", title: "Coûts récurrents", icon: "📆", defaultOpen: false,
    fields: [
      { key: "mensualiteCredit", label: "Mensualité crédit", type: "computed", suffix: "€/mois", sub: "reprise auto du financement" },
      { key: "assuranceEmprunteurRecurrent", label: "Assurance emprunteur", type: "computed", suffix: "€/mois", sub: "reprise auto du financement" },
      { key: "chargesCopro", label: "Charges de copropriété", suffix: "€/mois" },
      { key: "taxeFonciereAnnuelle", label: "Taxe foncière", suffix: "€/an" },
      { key: "assuranceHabitationMensuelle", label: "Assurance habitation", suffix: "€/mois" },
      { key: "energie", label: "Énergie", suffix: "€/mois" },
      { key: "internet", label: "Internet", suffix: "€/mois" },
      { key: "totalMensuel", label: "Total mensuel", type: "computed", suffix: "€/mois" },
    ],
  },
  "valeur-vente": {
    id: "valeur-vente", title: "Valeur de vente", icon: "🏷️", defaultOpen: false,
    fields: [
      { key: "prixAffiche", label: "Prix affiché", suffix: "€" },
      { key: "prixVenteEstime", label: "Prix de vente estimé", suffix: "€" },
      { key: "prixMinimumAcceptable", label: "Prix minimum acceptable", suffix: "€" },
    ],
  },
  "frais-vente": {
    id: "frais-vente", title: "Frais de vente", icon: "💸", defaultOpen: false,
    fields: [
      { key: "commissionAgence", label: "Commission agence", suffix: "€" },
      { key: "diagnostics", label: "Diagnostics", suffix: "€" },
      { key: "homeStaging", label: "Home staging / petits travaux", suffix: "€" },
      { key: "photographe", label: "Photographe", suffix: "€" },
      { key: "demenagementVente", label: "Déménagement", suffix: "€" },
      { key: "mainleveeHypothecaire", label: "Mainlevée hypothécaire éventuelle", suffix: "€" },
      { key: "totalFraisVente", label: "Total frais de vente", type: "computed", suffix: "€" },
    ],
  },
  "credit-existant": {
    id: "credit-existant", title: "Crédit existant", icon: "🏦", defaultOpen: false,
    fields: [
      { key: "capitalRestantDu", label: "Capital restant dû", suffix: "€" },
      { key: "indemnitesRemboursementAnticipe", label: "Indemnités de remboursement anticipé", suffix: "€" },
      { key: "totalCreditExistant", label: "Total crédit", type: "computed", suffix: "€" },
    ],
  },
  "fiscalite-vente": {
    id: "fiscalite-vente", title: "Fiscalité", icon: "🧾", defaultOpen: false,
    fields: [
      { key: "plusValueEventuelle", label: "Plus-value éventuelle", suffix: "€" },
      { key: "exonerationRP", label: "Exonération résidence principale", type: "checkbox" },
      { key: "impotsEstimesVente", label: "Impôts estimés", suffix: "€" },
    ],
  },
  "travaux-invest": {
    id: "travaux-invest", title: "Travaux", icon: "🔨", defaultOpen: false,
    fields: [
      { key: "travauxImmediats", label: "Travaux immédiats", suffix: "€" },
      { key: "travauxDifferes", label: "Travaux différés", suffix: "€" },
      { key: "ameublementEquipement", label: "Ameublement / équipement", suffix: "€" },
      { key: "totalTravauxInvest", label: "Total travaux", type: "computed", suffix: "€" },
    ],
  },
  revenus: {
    id: "revenus", title: "Revenus", icon: "📈", defaultOpen: false,
    fields: [
      { key: "loyerMensuel", label: "Loyer mensuel", suffix: "€/mois" },
      { key: "chargesRecuperables", label: "Charges récupérables", suffix: "€/mois" },
      { key: "autresRevenus", label: "Autres revenus", suffix: "€/mois" },
      { key: "vacanceLocativeEstimee", label: "Vacance locative estimée", suffix: "%" },
      { key: "loyerEffectif", label: "Loyer effectif", type: "computed", suffix: "€/mois" },
    ],
  },
  "charges-invest": {
    id: "charges-invest", title: "Charges", icon: "📉", defaultOpen: false,
    fields: [
      { key: "chargesCoproNonRecuperables", label: "Charges copro non récupérables", suffix: "€/mois" },
      { key: "taxeFonciereInvest", label: "Taxe foncière", suffix: "€/an" },
      { key: "assurancePNO", label: "Assurance PNO", suffix: "€/mois" },
      { key: "assuranceGLI", label: "Assurance GLI", suffix: "€/mois" },
      { key: "gestionLocativePct", label: "Gestion locative", suffix: "%" },
      { key: "entretienProvision", label: "Entretien / provision travaux", suffix: "€/mois" },
      { key: "totalChargesInvest", label: "Total charges", type: "computed", suffix: "€/mois" },
    ],
  },
  "fiscalite-invest": {
    id: "fiscalite-invest", title: "Fiscalité", icon: "🧾", defaultOpen: false,
    fields: [
      { key: "regimeFiscal", label: "Régime fiscal", type: "select", options: REGIME_FISCAL_OPTIONS },
      { key: "impotEstimeInvest", label: "Impôt estimé", suffix: "€" },
    ],
  },
  transition: {
    id: "transition", title: "Transition", icon: "↔️", defaultOpen: false,
    fields: [
      { key: "netVendeurReprise", label: "Net vendeur", type: "computed", suffix: "€", sub: "repris du module Vente" },
      { key: "capitalRestantDuReprise", label: "Capital restant dû", type: "computed", suffix: "€", sub: "repris du module Vente" },
      { key: "cashDisponibleApresVente", label: "Cash disponible après vente", type: "computed", suffix: "€" },
      { key: "apportUtiliseReprise", label: "Apport utilisé pour le nouvel achat", type: "computed", suffix: "€", sub: "repris du module Achat" },
      { key: "epargneConservee", label: "Épargne conservée", type: "computed", suffix: "€" },
      { key: "fraisDoubleResidence", label: "Frais de double résidence", suffix: "€" },
      { key: "fraisDemenagementTransition", label: "Frais de déménagement", suffix: "€" },
      { key: "pretRelaisActif", label: "Prêt relais", type: "checkbox" },
      { key: "pretRelaisMontant", label: "Montant du prêt relais", suffix: "€" },
      { key: "pretRelaisTaux", label: "Taux du prêt relais", suffix: "%" },
      { key: "pretRelaisDureeMois", label: "Durée du prêt relais", suffix: "mois" },
      { key: "interetsPretRelais", label: "Intérêts du prêt relais", type: "computed", suffix: "€" },
      { key: "dureeChevauchementMois", label: "Durée estimée du chevauchement", suffix: "mois" },
      { key: "seuilEpargneMin", label: "Seuil de sécurité — épargne minimale souhaitée", suffix: "€", hint: "Je veux conserver au minimum ce montant d'épargne" },
    ],
  },
};

const BUDGET_SCHEMA = {
  achat: ["financement", "acquisition", "avant-emenagement", "installation", "couts-recurrents"],
  vente: ["valeur-vente", "frais-vente", "credit-existant", "fiscalite-vente"],
  investissement: ["acquisition", "travaux-invest", "financement", "revenus", "charges-invest", "fiscalite-invest"],
  "vente-achat": ["financement", "acquisition", "avant-emenagement", "installation", "couts-recurrents", "valeur-vente", "frais-vente", "credit-existant", "fiscalite-vente", "transition"],
};

function formatFieldValue(value, suffix) {
  if (suffix === "%") return fmtPct(value);
  if (suffix === "€/mois") return `${fmt(value)}/mois`;
  if (suffix === "€/an") return `${fmt(value)}/an`;
  return fmt(value);
}

// Calcule tous les champs "calculé auto" + les indicateurs (budgetTotal/dejaEngage/resteDisponible)
// pour une famille de projet donnée, à partir des données brutes saisies (project.budget).
function computeBudgetDerived(family, b) {
  const d = {};

  // Apport = somme des sources d'apport (multi-acheteurs) — remplace l'ancien champ
  // manuel unique "apportPersonnel", mais alimente exactement les mêmes calculs en aval.
  const sourcesApport = Array.isArray(b.sourcesApport) ? b.sourcesApport : [];
  const apportPersonnel = sourcesApport.reduce((sum, s) => sum + (parseFloat(s.montant) || 0), 0);
  d.totalApport = apportPersonnel;
  d.epargneInvestie = apportPersonnel;
  const revenusNetsMensuels = parseFloat(b.revenusNetsMensuels) || 0;
  d.capaciteEmpruntEstimee = calcCapaciteEmprunt(revenusNetsMensuels * 0.35, 25, 3.5);

  const montantEmprunte = parseFloat(b.montantEmprunte) || 0;
  const tauxNominal = parseFloat(b.tauxNominal) || 0;
  const dureeAns = parseFloat(b.dureeAns) || 0;
  const assuranceEmprunteur = parseFloat(b.assuranceEmprunteur) || 0;
  d.mensualiteHorsAssurance = (montantEmprunte > 0 && dureeAns > 0) ? calcMensualite(montantEmprunte, dureeAns, tauxNominal) : 0;
  d.coutTotalCredit = dureeAns > 0 ? Math.max(0, (d.mensualiteHorsAssurance + assuranceEmprunteur) * dureeAns * 12 - montantEmprunte) : 0;

  const prixAchat = parseFloat(b.prixAchat) || 0;
  const neuf = !!b.neuf;
  d.fraisNotaire = calcNotaire(prixAchat, neuf);
  const fraisAgence = parseFloat(b.fraisAgence) || 0;
  const fraisCourtage = parseFloat(b.fraisCourtage) || 0;
  const fraisDossierBancaire = parseFloat(b.fraisDossierBancaire) || 0;
  const fraisGarantiePret = parseFloat(b.fraisGarantiePret) || 0;
  d.totalAcquisition = prixAchat + d.fraisNotaire + fraisAgence + fraisCourtage + fraisDossierBancaire + fraisGarantiePret;
  d.montantEmprunteSuggere = Math.max(0, prixAchat - apportPersonnel);

  if (family === "achat" || family === "vente-achat") {
    const travauxGlobal = parseFloat(b.travauxGlobal) || 0;
    const electromenager = parseFloat(b.electromenager) || 0;
    const mobilier = parseFloat(b.mobilier) || 0;
    const decoration = parseFloat(b.decoration) || 0;
    d.totalAvantEmenagement = travauxGlobal + electromenager + mobilier + decoration;

    const demenagement = parseFloat(b.demenagement) || 0;
    const assuranceHabitationSetup = parseFloat(b.assuranceHabitationSetup) || 0;
    const serrurerie = parseFloat(b.serrurerie) || 0;
    const petitsEquipements = parseFloat(b.petitsEquipements) || 0;
    d.totalInstallation = demenagement + assuranceHabitationSetup + serrurerie + petitsEquipements;

    d.mensualiteCredit = d.mensualiteHorsAssurance;
    d.assuranceEmprunteurRecurrent = assuranceEmprunteur;
    const chargesCopro = parseFloat(b.chargesCopro) || 0;
    const taxeFonciereAnnuelle = parseFloat(b.taxeFonciereAnnuelle) || 0;
    const assuranceHabitationMensuelle = parseFloat(b.assuranceHabitationMensuelle) || 0;
    const energie = parseFloat(b.energie) || 0;
    const internet = parseFloat(b.internet) || 0;
    d.totalMensuel = d.mensualiteCredit + d.assuranceEmprunteurRecurrent + chargesCopro + taxeFonciereAnnuelle / 12 + assuranceHabitationMensuelle + energie + internet;

    d.coutTotalProjet = d.totalAcquisition + d.totalAvantEmenagement + d.totalInstallation;
    d.tresorerieRestanteApresAcquisition = (apportPersonnel + montantEmprunte) - d.coutTotalProjet;
    d.coutMensuelReelLogement = d.totalMensuel;
  }

  if (family === "vente" || family === "vente-achat") {
    const commissionAgence = parseFloat(b.commissionAgence) || 0;
    const diagnostics = parseFloat(b.diagnostics) || 0;
    const homeStaging = parseFloat(b.homeStaging) || 0;
    const photographe = parseFloat(b.photographe) || 0;
    const demenagementVente = parseFloat(b.demenagementVente) || 0;
    const mainleveeHypothecaire = parseFloat(b.mainleveeHypothecaire) || 0;
    d.totalFraisVente = commissionAgence + diagnostics + homeStaging + photographe + demenagementVente + mainleveeHypothecaire;

    const capitalRestantDu = parseFloat(b.capitalRestantDu) || 0;
    const indemnitesRemboursementAnticipe = parseFloat(b.indemnitesRemboursementAnticipe) || 0;
    d.totalCreditExistant = capitalRestantDu + indemnitesRemboursementAnticipe;

    const prixVenteEstime = parseFloat(b.prixVenteEstime) || 0;
    const exonerationRP = !!b.exonerationRP;
    const impotsEstimesVente = parseFloat(b.impotsEstimesVente) || 0;
    const impotsEffectifs = exonerationRP ? 0 : impotsEstimesVente;

    d.cashDisponibleApresRemboursement = prixVenteEstime - d.totalCreditExistant;
    d.netVendeur = prixVenteEstime - d.totalFraisVente - d.totalCreditExistant - impotsEffectifs;
    d.coutTotalVente = d.totalFraisVente + d.totalCreditExistant;
    d.pctFraisSurPrix = prixVenteEstime > 0 ? (d.totalFraisVente / prixVenteEstime) * 100 : 0;
  }

  if (family === "investissement") {
    const travauxImmediats = parseFloat(b.travauxImmediats) || 0;
    const travauxDifferes = parseFloat(b.travauxDifferes) || 0;
    const ameublementEquipement = parseFloat(b.ameublementEquipement) || 0;
    d.totalTravauxInvest = travauxImmediats + travauxDifferes + ameublementEquipement;

    const loyerMensuel = parseFloat(b.loyerMensuel) || 0;
    const chargesRecuperables = parseFloat(b.chargesRecuperables) || 0;
    const autresRevenus = parseFloat(b.autresRevenus) || 0;
    const vacanceLocativeEstimee = parseFloat(b.vacanceLocativeEstimee) || 0;
    d.loyerEffectif = (loyerMensuel + chargesRecuperables + autresRevenus) * (1 - vacanceLocativeEstimee / 100);

    const chargesCoproNonRecuperables = parseFloat(b.chargesCoproNonRecuperables) || 0;
    const taxeFonciereInvest = parseFloat(b.taxeFonciereInvest) || 0;
    const assurancePNO = parseFloat(b.assurancePNO) || 0;
    const assuranceGLI = parseFloat(b.assuranceGLI) || 0;
    const gestionLocativePct = parseFloat(b.gestionLocativePct) || 0;
    const entretienProvision = parseFloat(b.entretienProvision) || 0;
    const gestionLocativeCout = d.loyerEffectif * (gestionLocativePct / 100);
    d.totalChargesInvest = chargesCoproNonRecuperables + taxeFonciereInvest / 12 + assurancePNO + assuranceGLI + gestionLocativeCout + entretienProvision;

    const impotEstimeInvest = parseFloat(b.impotEstimeInvest) || 0;

    d.rendementBrut = prixAchat > 0 ? (loyerMensuel * 12 / prixAchat) * 100 : 0;
    d.rendementNet = d.totalAcquisition > 0 ? ((loyerMensuel * 12 - d.totalChargesInvest * 12) / d.totalAcquisition) * 100 : 0;
    d.cashflowMensuel = d.loyerEffectif - d.totalChargesInvest - d.mensualiteHorsAssurance - assuranceEmprunteur - impotEstimeInvest / 12;
    d.cashflowAnnuel = d.cashflowMensuel * 12;
    d.effortEpargneMensuel = d.cashflowMensuel < 0 ? -d.cashflowMensuel : 0;
    d.seuilRentabilite = d.totalChargesInvest + d.mensualiteHorsAssurance + assuranceEmprunteur;
  }

  if (family === "vente-achat") {
    d.netVendeurReprise = d.netVendeur;
    d.capitalRestantDuReprise = parseFloat(b.capitalRestantDu) || 0;
    d.cashDisponibleApresVente = d.netVendeur;
    d.apportUtiliseReprise = apportPersonnel;

    const fraisDoubleResidence = parseFloat(b.fraisDoubleResidence) || 0;
    const fraisDemenagementTransition = parseFloat(b.fraisDemenagementTransition) || 0;
    const pretRelaisActif = !!b.pretRelaisActif;
    const pretRelaisMontant = parseFloat(b.pretRelaisMontant) || 0;
    const pretRelaisTaux = parseFloat(b.pretRelaisTaux) || 0;
    const pretRelaisDureeMois = parseFloat(b.pretRelaisDureeMois) || 0;
    d.interetsPretRelais = pretRelaisActif ? pretRelaisMontant * (pretRelaisTaux / 100) * (pretRelaisDureeMois / 12) : 0;

    d.cashNecessairePourAchat = apportPersonnel + fraisDoubleResidence + fraisDemenagementTransition;
    d.epargneConservee = d.cashDisponibleApresVente - apportPersonnel;
    d.ecartAFinancer = d.cashNecessairePourAchat - d.cashDisponibleApresVente - (pretRelaisActif ? pretRelaisMontant : 0);
    d.epargneRestanteApresOperation = d.cashDisponibleApresVente + (pretRelaisActif ? pretRelaisMontant : 0) - d.cashNecessairePourAchat;
    d.pctApportCouverture = d.cashNecessairePourAchat > 0 ? (d.cashDisponibleApresVente / d.cashNecessairePourAchat) * 100 : 0;
  }

  if (family === "achat") {
    d.budgetTotal = apportPersonnel + montantEmprunte;
    d.dejaEngage = d.coutTotalProjet;
    d.resteDisponible = d.tresorerieRestanteApresAcquisition;
  } else if (family === "vente") {
    d.budgetTotal = parseFloat(b.prixVenteEstime) || 0;
    d.dejaEngage = d.coutTotalVente + (b.exonerationRP ? 0 : (parseFloat(b.impotsEstimesVente) || 0));
    d.resteDisponible = d.netVendeur;
  } else if (family === "investissement") {
    d.budgetTotal = apportPersonnel + montantEmprunte;
    d.dejaEngage = d.totalAcquisition + d.totalTravauxInvest;
    d.resteDisponible = d.budgetTotal - d.dejaEngage;
  } else if (family === "vente-achat") {
    d.budgetTotal = d.cashDisponibleApresVente + montantEmprunte + (b.pretRelaisActif ? (parseFloat(b.pretRelaisMontant) || 0) : 0);
    d.dejaEngage = d.coutTotalProjet + d.coutTotalVente;
    d.resteDisponible = d.epargneRestanteApresOperation;
  }

  return d;
}

function getBudgetAlert(family, b, d) {
  if (family === "vente-achat" && (parseFloat(b.seuilEpargneMin) || 0) > 0) {
    const seuil = parseFloat(b.seuilEpargneMin);
    const reste = d.epargneRestanteApresOperation;
    if (reste < seuil) return { level: "danger", label: "Sous le seuil de sécurité" };
    if (reste < seuil * 1.5) return { level: "warning", label: "Proche du seuil de sécurité" };
    return { level: "ok", label: "Au-dessus du seuil de sécurité" };
  }
  if (d.budgetTotal > 0) {
    const pct = (d.resteDisponible / d.budgetTotal) * 100;
    if (d.resteDisponible < 0) return { level: "danger", label: "Dépassement de budget" };
    if (pct < 10) return { level: "warning", label: "Marge faible (< 10%)" };
    return { level: "ok", label: "Budget maîtrisé" };
  }
  return { level: "neutral", label: "Renseignez votre budget" };
}

function getBudgetIndicators(family, d) {
  if (family === "achat") {
    return [
      { label: "Coût total du projet", value: fmt(d.coutTotalProjet) },
      { label: "Trésorerie restante après acquisition", value: fmt(d.tresorerieRestanteApresAcquisition) },
      { label: "Coût mensuel réel du logement", value: `${fmt(d.coutMensuelReelLogement)}/mois` },
    ];
  }
  if (family === "vente") {
    return [
      { label: "Net vendeur", value: fmt(d.netVendeur) },
      { label: "Cash disponible après remboursement", value: fmt(d.cashDisponibleApresRemboursement) },
      { label: "Coût total de la vente", value: fmt(d.coutTotalVente) },
      { label: "% de frais / prix de vente", value: fmtPct(d.pctFraisSurPrix) },
    ];
  }
  if (family === "investissement") {
    return [
      { label: "Rendement brut", value: fmtPct(d.rendementBrut) },
      { label: "Rendement net", value: fmtPct(d.rendementNet) },
      { label: "Cash-flow mensuel", value: fmt(d.cashflowMensuel), alert: d.cashflowMensuel < 0 },
      { label: "Cash-flow annuel", value: fmt(d.cashflowAnnuel) },
      { label: "Effort d'épargne mensuel", value: fmt(d.effortEpargneMensuel) },
      { label: "Seuil de rentabilité", value: `${fmt(d.seuilRentabilite)}/mois` },
    ];
  }
  if (family === "vente-achat") {
    return [
      { label: "💰 Cash disponible après vente", value: fmt(d.cashDisponibleApresVente) },
      { label: "🏡 Cash nécessaire pour l'achat", value: fmt(d.cashNecessairePourAchat) },
      { label: "↔️ Écart à financer", value: fmt(d.ecartAFinancer), alert: d.ecartAFinancer > 0 },
      { label: "🛟 Épargne restante après l'opération", value: fmt(d.epargneRestanteApresOperation) },
      { label: "📊 Couverture apport", value: `Votre apport couvre ${fmtPct(d.pctApportCouverture)} de votre nouveau projet` },
    ];
  }
  return [];
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

// Résumé budget (total + mensualité) toutes familles confondues, réutilisé pour le
// contexte affiché dans la modale et pour le prompt généré.
function getPromptBudgetSummary(project) {
  const b = project.budget || {};
  const family = getBudgetFamily(project.type);
  if (family === "generic") {
    const apportPersonnel = parseFloat(b.apportPersonnel) || 0;
    const capaciteEmprunt = parseFloat(b.capaciteEmprunt) || 0;
    const budgetTotal = apportPersonnel + capaciteEmprunt;
    const prixAchat = parseFloat(b.prixAchat) || 0;
    const capitalEmprunte = Math.max(0, prixAchat - apportPersonnel);
    const canComputeMensualite = apportPersonnel > 0 && capaciteEmprunt > 0 && prixAchat > 0;
    const mensualite = canComputeMensualite ? calcMensualite(capitalEmprunte, 25, 3.5) : 0;
    return { budgetTotal, mensualite };
  }
  const derived = computeBudgetDerived(family, b);
  const mensualite = (derived.mensualiteHorsAssurance || 0) + (parseFloat(b.assuranceEmprunteur) || 0);
  return { budgetTotal: derived.budgetTotal || 0, mensualite };
}

// Données de contexte du projet affichées en lecture seule dans la modale de génération de prompt.
function buildPromptContext(project) {
  const steps = STEPS_BY_TYPE[project.type] || [];
  const allSteps = [...steps, ...(project.customSteps || []).map(mapCustomStep)];
  const done = allSteps.filter(s => project.checklist[s.id]).length;
  const pct = allSteps.length ? Math.round((done / allSteps.length) * 100) : 0;
  const typeLabel = PROJECT_TYPES.find(t => t.id === project.type)?.label || project.type;
  const nextStep = allSteps.find(s => !project.checklist[s.id]);
  const completedLabels = allSteps.filter(s => project.checklist[s.id]).map(s => s.label);
  const { budgetTotal, mensualite } = getPromptBudgetSummary(project);
  const journal = [...(project.journal || [])].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
  return { typeLabel, done, total: allSteps.length, pct, nextStep, completedLabels, budgetTotal, mensualite, journal };
}

// Assemble le prompt final selon les infos cochées par l'utilisateur.
function buildGeneratedPrompt(project, include, question) {
  const ctx = buildPromptContext(project);
  const contacts = project.contacts || [];

  let prompt = `Je gère un projet immobilier ${ctx.typeLabel} sur Cozimo.\n\nVoici ma situation :`;
  if (include.typeProgress) {
    prompt += `\n- Progression : ${ctx.pct}% (${ctx.done}/${ctx.total} étapes complétées)`;
    prompt += `\n- Prochaine étape : ${ctx.nextStep ? ctx.nextStep.label : "toutes les étapes sont complétées"}`;
  }
  if (include.budget && ctx.budgetTotal > 0) {
    prompt += `\n- Budget total : ${fmt(ctx.budgetTotal)}`;
    if (ctx.mensualite > 0) prompt += `\n- Mensualité estimée : ${fmt(ctx.mensualite)}/mois`;
  }
  if (include.doneSteps && ctx.completedLabels.length > 0) {
    prompt += `\n- Étapes complétées : ${ctx.completedLabels.join(", ")}`;
  }
  if (include.contacts && contacts.length > 0) {
    prompt += `\n- Contacts : ${contacts.map(c => `${c.nom} (${CONTACT_ROLES.find(r => r.value === c.role)?.label || "Autre"})`).join(", ")}`;
  }
  if (include.journal && ctx.journal.length > 0) {
    prompt += `\n- Dernières actions : ${ctx.journal.map(e => e.title).join(", ")}`;
  }
  prompt += `\n\nMa question : ${question.trim() || "…"}`;
  return prompt;
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
  const { done, total } = getProjectStepCount(project);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const typeLabel = PROJECT_TYPES.find(t => t.id === project.type)?.label || project.type;

  line(project.name, { bold: true, size: 16, color: [26, 26, 46], gap: 7 });
  line(`${typeLabel} — ${pct}% complété (${done}/${total} étapes)`, { size: 11, color: [71, 85, 105], gap: 9 });

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
  const budgetFamily = getBudgetFamily(project.type);

  if (budgetFamily === "generic") {
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
  } else {
    const pdfFieldValue = (value, suffix) => {
      if (suffix === "%") return fmtPct(value);
      if (suffix === "€/mois") return `${pdfAmount(value)}/mois`;
      if (suffix === "€/an") return `${pdfAmount(value)}/an`;
      return pdfAmount(value);
    };

    const derived = computeBudgetDerived(budgetFamily, b);
    const alert = getBudgetAlert(budgetFamily, b, derived);

    line(`Budget total : ${pdfAmount(derived.budgetTotal)}`, { bold: true, gap: 6 });
    line(`Déjà engagé : ${pdfAmount(derived.dejaEngage)}`, { indent: 4 });
    const resteColorPdf = derived.resteDisponible < 0 ? [185, 28, 28] : [4, 120, 87];
    line(`Reste disponible : ${pdfAmount(derived.resteDisponible)}`, { bold: true, indent: 4, color: resteColorPdf });
    const alertColorPdf = alert.level === "danger" ? [185, 28, 28] : alert.level === "warning" ? [180, 83, 9] : [71, 85, 105];
    line(`Alerte : ${alert.label}`, { indent: 4, color: alertColorPdf });
    y += 2;

    (BUDGET_SCHEMA[budgetFamily] || []).forEach(id => {
      const section = BUDGET_SECTIONS[id];
      line(section.title, { bold: true, size: 11, color: [51, 65, 85], gap: 6 });
      section.fields.forEach(f => {
        if (f.type === "computed") {
          line(`${f.label} : ${pdfFieldValue(derived[f.key], f.suffix)}`, { indent: 4, bold: true });
        } else if (f.type === "checkbox") {
          if (b[f.key]) line(`${f.label} : Oui`, { indent: 4 });
        } else if (f.type === "select") {
          const opt = f.options.find(o => o.value === b[f.key]);
          if (opt) line(`${f.label} : ${opt.label}`, { indent: 4 });
        } else if (f.type === "sources-apport") {
          const sources = Array.isArray(b[f.key]) ? b[f.key] : [];
          sources.forEach(s => {
            const montant = parseFloat(s.montant) || 0;
            if (montant > 0) {
              line(`${s.label || "Sans nom"} : ${pdfAmount(montant)}${s.participePret === false ? " (hors prêt)" : ""}`, { indent: 4 });
            }
          });
        } else {
          const v = parseFloat(b[f.key]) || 0;
          if (v > 0) line(`${f.label} : ${pdfFieldValue(v, f.suffix)}`, { indent: 4 });
        }
      });
      y += 2;
    });

    const indicators = getBudgetIndicators(budgetFamily, derived);
    if (indicators.length > 0) {
      line("Indicateurs", { bold: true, size: 11, color: [51, 65, 85], gap: 6 });
      // Helvetica/WinAnsi ne sait pas afficher les emoji (mêmes limites que pdfAmount) — on les retire des libellés.
      indicators.forEach(ind => line(`${ind.label.replace(/^\p{Extended_Pictographic}️?\s*/u, "")} : ${ind.value}`, { indent: 4 }));
    }
  }

  // ── Contacts ──
  sectionTitle("Contacts");
  const contacts = project.contacts || [];
  if (contacts.length === 0) {
    line("Aucun contact enregistré.", { color: [148, 163, 184] });
  } else {
    contacts.forEach(c => {
      const roleLabel = CONTACT_ROLES.find(r => r.value === c.role)?.label || "Autre";
      const statusLabel = CONTACT_STATUSES.find(s => s.value === c.statut)?.label || CONTACT_STATUSES[0].label;
      line(`${c.nom || "Sans nom"} — ${roleLabel}`, { bold: true, gap: 6 });
      line(`Statut : ${statusLabel}`, { indent: 4 });
      if (c.note > 0) line(`Note : ${c.note}/5`, { indent: 4 });
      if (c.telephone) line(`Tél. : ${c.telephone}`, { indent: 4 });
      if (c.email) line(`Email : ${c.email}`, { indent: 4 });
      if (c.notes) line(`Mes notes : ${c.notes}`, { indent: 4, color: [100, 116, 139] });
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
      <path
        d="M40 11 C33 11 27 17 27 24 C27 30 31 35 36 36.5 L36 60 C36 62 38 64 40 64 C42 64 44 62 44 60 L44 57 L48 57 L48 52 L44 52 L44 48 L49 48 L49 43 L44 43 L44 36.5 C49 35 53 30 53 24 C53 17 47 11 40 11 Z M40 17 C44 17 47 20 47 24 C47 28 44 31 40 31 C36 31 33 28 33 24 C33 20 36 17 40 17 Z"
        fill="#B94040"
        transform="translate(60.46 3.54) scale(0.5385)"
      />
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

function AuthModal({ onClose, defaultTab = "signup" }) {
  const [tab, setTab] = useState(defaultTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [invalidCredentials, setInvalidCredentials] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetInfo, setResetInfo] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const switchTab = (t) => {
    setTab(t);
    setError("");
    setInfo("");
    setInvalidCredentials(false);
  };

  const changeEmail = (v) => {
    setEmail(v);
    setInvalidCredentials(false);
  };
  const changePassword = (v) => {
    setPassword(v);
    setInvalidCredentials(false);
  };

  const submit = async () => {
    setError("");
    setInfo("");
    setInvalidCredentials(false);
    if (!email.trim() || !password) {
      setError("Merci de renseigner votre email et votre mot de passe.");
      return;
    }
    if (tab === "signup" && password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    try {
      if (tab === "signup") {
        const data = await signUpWithEmail(email.trim(), password);
        if (data?.session) {
          onClose();
        } else {
          setInfo("Compte créé ! Vérifiez votre email pour confirmer votre compte, puis connectez-vous.");
        }
      } else {
        await signInWithEmail(email.trim(), password);
        onClose();
      }
    } catch (e) {
      setError(e.message || "Une erreur est survenue.");
      setInvalidCredentials(e.code === "invalid_credentials");
    } finally {
      setLoading(false);
    }
  };

  const openResetMode = () => {
    setResetMode(true);
    setResetEmail(email);
    setResetError("");
    setResetInfo("");
  };
  const closeResetMode = () => {
    setResetMode(false);
    setResetError("");
    setResetInfo("");
  };

  const sendResetLink = async () => {
    setResetError("");
    setResetInfo("");
    if (!resetEmail.trim()) {
      setResetError("Merci de renseigner votre email.");
      return;
    }
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(resetEmail.trim());
      setResetInfo("Un lien de réinitialisation a été envoyé à votre adresse email.");
    } catch (e) {
      setResetError(e.message || "Une erreur est survenue.");
    } finally {
      setResetLoading(false);
    }
  };

  const google = async () => {
    setError("");
    setInfo("");
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e.message || "Une erreur est survenue.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5" onClick={e => e.stopPropagation()}>
        {resetMode ? (
          <div className="flex flex-col gap-3">
            <h3 className="font-bold text-slate-800 text-sm mb-1">Réinitialiser le mot de passe</h3>
            <Input label="Email" value={resetEmail} onChange={setResetEmail} type="email" placeholder="vous@exemple.fr" />
            {resetError && <p className="text-xs text-red-500">{resetError}</p>}
            {resetInfo && <p className="text-xs text-emerald-600">{resetInfo}</p>}
            <button onClick={sendResetLink} disabled={resetLoading}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all disabled:opacity-50">
              {resetLoading ? "…" : "Envoyer le lien de réinitialisation"}
            </button>
            <button onClick={closeResetMode}
              className="w-full py-2 text-slate-400 hover:text-slate-600 text-xs font-semibold transition-all">
              ← Retour
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-1 mb-5 bg-slate-100 rounded-xl p-1">
              <button onClick={() => switchTab("signup")}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === "signup" ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
                Créer un compte
              </button>
              <button onClick={() => switchTab("signin")}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === "signin" ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>
                Se connecter
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <Input label="Email" value={email} onChange={changeEmail} type="email" placeholder="vous@exemple.fr" error={invalidCredentials} />
              <Input label="Mot de passe" value={password} onChange={changePassword} type="password" placeholder="••••••••" error={invalidCredentials} />
              {tab === "signin" && (
                <button type="button" onClick={openResetMode}
                  className="text-xs text-blue-600 hover:underline self-end -mt-2">
                  Mot de passe oublié ?
                </button>
              )}
              {tab === "signup" && (
                <Input label="Confirmer le mot de passe" value={confirmPassword} onChange={setConfirmPassword} type="password" placeholder="••••••••" />
              )}
              {error && <p className="text-xs text-red-500">{error}</p>}
              {info && <p className="text-xs text-emerald-600">{info}</p>}
              <button onClick={submit} disabled={loading}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all disabled:opacity-50">
                {loading ? "…" : tab === "signup" ? "Créer mon compte" : "Se connecter"}
              </button>
              <div className="flex items-center gap-2 my-1">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400">ou</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              <button onClick={google}
                className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-all">
                Continuer avec Google
              </button>
              <button onClick={onClose}
                className="w-full py-2 text-slate-400 hover:text-slate-600 text-xs font-semibold transition-all">
                Continuer sans compte
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MigrationModal({ count, onSync, onSkip, syncing }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5">
        <h3 className="font-bold text-slate-800 text-base mb-2">☁️ Synchroniser vos projets ?</h3>
        <p className="text-sm text-slate-600 leading-relaxed mb-5">
          Nous avons trouvé {count} projet{count > 1 ? "s" : ""} {count > 1 ? "locaux" : "local"}. Voulez-vous les synchroniser avec votre compte ?
        </p>
        <div className="flex gap-2">
          <button onClick={onSkip} disabled={syncing}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-sm font-semibold hover:bg-slate-50 transition-all disabled:opacity-50">
            Non merci
          </button>
          <button onClick={onSync} disabled={syncing}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all disabled:opacity-50">
            {syncing ? "Synchronisation…" : "Synchroniser"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ShareModal({ link, onClose }) {
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="font-bold text-slate-800 text-base">🔗 Partager le projet</h3>
          <button onClick={onClose}
            className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-all text-sm">
            ✕
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-4">Ce lien permet de consulter votre projet en lecture seule.</p>
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 mb-3">
          <input readOnly value={link} onFocus={e => e.target.select()}
            className="flex-1 bg-transparent text-xs text-slate-600 outline-none truncate" />
        </div>
        <button onClick={copyLink}
          className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all">
          {copied ? "✓ Lien copié !" : "Copier le lien"}
        </button>
      </div>
    </div>
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

const PROMPT_INCLUDE_OPTIONS = [
  { key: "typeProgress", label: "Type et progression" },
  { key: "budget", label: "Budget détaillé" },
  { key: "doneSteps", label: "Liste des étapes complétées" },
  { key: "contacts", label: "Contacts du projet" },
  { key: "journal", label: "Dernières entrées du journal" },
];

function PromptModal({ project, onClose }) {
  const ctx = buildPromptContext(project);
  const [include, setInclude] = useState({ typeProgress: true, budget: false, doneSteps: false, contacts: false, journal: false });
  const [question, setQuestion] = useState("");
  const [copied, setCopied] = useState(false);

  const suggestions = getAISuggestions(project.type);
  const generatedPrompt = buildGeneratedPrompt(project, include, question);
  const toggleInclude = (key) => setInclude(prev => ({ ...prev, [key]: !prev[key] }));

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: "90vh" }}>
        <div className="px-5 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <div className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-1">📋 Générateur de prompt</div>
            <h3 className="font-bold text-slate-800 text-base leading-snug">Générer un prompt IA</h3>
          </div>
          <button onClick={onClose}
            className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-all text-sm">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 flex flex-col gap-4">
          {/* Contexte du projet — lecture seule */}
          <div className="bg-slate-50 rounded-xl px-4 py-3 flex flex-col gap-1">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Contexte du projet</div>
            <div className="text-xs text-slate-600">Type : {ctx.typeLabel}</div>
            <div className="text-xs text-slate-600">Progression : {ctx.pct}% — {ctx.done}/{ctx.total} étapes</div>
            <div className="text-xs text-slate-600">
              Prochaine étape : {ctx.nextStep ? ctx.nextStep.label : "toutes les étapes sont complétées"}
            </div>
            {ctx.budgetTotal > 0 && <div className="text-xs text-slate-600">Budget total : {fmt(ctx.budgetTotal)}</div>}
            {ctx.mensualite > 0 && <div className="text-xs text-slate-600">Mensualité estimée : {fmt(ctx.mensualite)}/mois</div>}
          </div>

          {/* Informations à inclure */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Informations à inclure</div>
            <div className="flex flex-col gap-2">
              {PROMPT_INCLUDE_OPTIONS.map(opt => (
                <label key={opt.key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={include[opt.key]} onChange={() => toggleInclude(opt.key)}
                    className="w-4 h-4 accent-blue-600" />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Question */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ma question</label>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder={"Ex: Pourquoi la banque me demande ce document ?\nComment négocier le prix ? Quels sont mes recours si..."}
              rows={3}
              className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-none"
            />
          </div>

          {/* Suggestions selon le type de projet */}
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => setQuestion(s)}
                  className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-all">
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Prompt généré */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Prompt généré</label>
            <textarea
              readOnly
              value={generatedPrompt}
              rows={8}
              className="border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-600 outline-none bg-slate-50 resize-none"
            />
          </div>

          <button onClick={copyPrompt}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all">
            {copied ? "✓ Copié !" : "📋 Copier le prompt"}
          </button>

          <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center pt-1">
            <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
              Ouvrir dans Claude →
            </a>
            <a href="https://chat.openai.com" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
              Ouvrir dans ChatGPT →
            </a>
            <a href="https://gemini.google.com" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
              Ouvrir dans Gemini →
            </a>
          </div>
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

function Input({ label, value, onChange, type = "text", suffix, prefix, placeholder, hint, error }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <div className={`flex items-center border rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 bg-white ${error ? "border-red-500" : "border-slate-200"}`}>
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

function StarRating({ value = 0, onChange }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i === value ? 0 : i)}
          className="text-base leading-none cursor-pointer hover:scale-110 transition-transform"
        >
          {i <= value ? "⭐" : "☆"}
        </button>
      ))}
    </div>
  );
}

function IconPicker({ value, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Icône</label>
      <div className="grid grid-cols-6 gap-2">
        {CUSTOM_PROJECT_ICONS.map(ic => (
          <button
            key={ic}
            type="button"
            onClick={() => onChange(ic)}
            className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all ${value === ic ? "bg-blue-100 ring-2 ring-blue-500" : "bg-slate-50 hover:bg-slate-100"}`}
          >
            {ic}
          </button>
        ))}
      </div>
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
const ONBOARDING_SLIDES = [
  {
    icon: "🏠",
    title: "Bienvenue sur Cozimo !",
    text: "Votre assistant immobilier de A à Z. Suivez chaque étape de votre projet, gérez votre budget et prenez les bonnes décisions.",
  },
  {
    icon: "📋",
    title: "Des étapes guidées",
    text: "Chaque type de projet génère automatiquement vos étapes. Cliquez sur ℹ️ pour des conseils détaillés sur chaque action.",
  },
  {
    icon: "💰",
    title: "Budget & finances",
    text: "Suivez tous vos coûts en temps réel. Frais de notaire, travaux, mensualités — tout est calculé automatiquement.",
  },
  {
    icon: "✨",
    title: "Votre assistant IA",
    text: "Posez vos questions immobilières directement dans l'app. Analyse de compromis, conseils personnalisés, réponses expertes.",
  },
];

function OnboardingScreen({ onFinish }) {
  const [index, setIndex] = useState(0);
  const slide = ONBOARDING_SLIDES[index];
  const isLast = index === ONBOARDING_SLIDES.length - 1;

  const next = () => {
    if (isLast) onFinish();
    else setIndex(i => i + 1);
  };

  return (
    <div className="min-h-screen flex flex-col p-6" style={{ background: "#1a1a2e" }}>
      <div className="flex justify-end">
        <button onClick={onFinish} className="text-slate-400 hover:text-white text-xs transition-all">
          Passer
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto w-full px-4">
        <div className="text-7xl mb-6">{slide.icon}</div>
        <h1 className="text-2xl font-bold text-white mb-3">{slide.title}</h1>
        <p className="text-slate-300 text-sm leading-relaxed">{slide.text}</p>
      </div>
      <div className="flex flex-col items-center gap-6 max-w-md mx-auto w-full">
        <div className="flex gap-2">
          {ONBOARDING_SLIDES.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all"
              style={{ width: i === index ? 20 : 8, height: 8, background: i === index ? "#2563eb" : "rgba(255,255,255,0.2)" }}
            />
          ))}
        </div>
        <button onClick={next}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all">
          {isLast ? "Commencer 🚀" : "Suivant →"}
        </button>
      </div>
    </div>
  );
}

function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(true);
  const [installed, setInstalled] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(INSTALL_BANNER_DISMISSED_KEY) === "true");
    } catch {
      setDismissed(false);
    }
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
    setInstalled(!!standalone);

    const onBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onAppInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  const dismiss = () => {
    try { localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, "true"); } catch {}
    setDismissed(true);
  };

  if (installed || dismissed || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 px-4 py-3 flex items-center justify-between gap-3"
      style={{ background: "#1a1a2e", borderTop: "0.5px solid rgba(255,255,255,0.12)" }}>
      <p className="text-white text-xs flex-1">📲 Installez Cozimo sur votre écran d'accueil !</p>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button onClick={install}
          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all">
          Installer
        </button>
        <button onClick={dismiss}
          className="text-slate-400 hover:text-white text-xs w-6 h-6 flex items-center justify-center transition-all">
          ✕
        </button>
      </div>
    </div>
  );
}

function NewProjectTypeScreen({ onSelect, onBack, onLegal }) {
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
          {isHome && <p className="text-slate-400 text-xs mt-1">La to-do list sous stéroïdes de votre projet immo 🏠</p>}
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
        <div className="text-center mt-8">
          <button onClick={onLegal} className="text-xs text-slate-500 hover:text-slate-300 transition-all">
            Mentions légales
          </button>
        </div>
      </div>
      {isHome && <InstallBanner />}
    </div>
  );
}

function NewProjectDetailsScreen({ type, onCreate, onBack }) {
  const typeInfo = PROJECT_TYPES.find(t => t.id === type);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 7));
  const [icon, setIcon] = useState(typeInfo?.icon || CUSTOM_PROJECT_ICONS[0]);

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
            <IconPicker value={icon} onChange={setIcon} />
          </div>
        </Card>
        <button
          onClick={() => onCreate({ name: name.trim() || typeInfo?.label, startDate, icon })}
          className="w-full mt-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all"
        >
          Créer le projet 🚀
        </button>
      </div>
    </div>
  );
}

function ProjectCard({ project, onOpen, menuOpen, onToggleMenu, onRename, onArchive, onDelete, showSyncBadge }) {
  const { done, total } = getProjectStepCount(project);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const typeInfo = PROJECT_TYPES.find(t => t.id === project.type);
  const icon = project.icon || typeInfo?.icon;
  return (
    <div className="relative">
      <div onClick={() => onOpen(project.id)} role="button" tabIndex={0} className="cursor-pointer">
        <Card className="hover:shadow-md transition-all">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, background: "#2563eb", borderRadius: "10px", fontSize: 20 }}>
                {icon}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-slate-800 text-sm truncate">{project.name}</div>
                <div className="flex items-center gap-1.5">
                  <div className="text-xs text-slate-400">{typeInfo?.label}</div>
                  {showSyncBadge && (
                    <span
                      className="text-xs font-semibold px-1.5 rounded-full flex-shrink-0"
                      style={project.cloudId ? { background: "#dbeafe", color: "#1d4ed8" } : { background: "#f1f5f9", color: "#475569" }}
                    >
                      {project.cloudId ? "☁️ Cloud" : "💾 Local"}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-xs font-semibold text-blue-600">{pct}%</span>
              <button
                onClick={e => { e.stopPropagation(); onToggleMenu(); }}
                className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 text-sm transition-all"
              >
                ⋯
              </button>
            </div>
          </div>
          <ProgressBar value={done} max={total} />
        </Card>
      </div>
      {menuOpen && (
        <div
          onClick={e => e.stopPropagation()}
          className="absolute right-3 top-14 z-10 bg-white rounded-xl shadow-lg overflow-hidden"
          style={{ border: "0.5px solid #e5e3df", minWidth: 170 }}
        >
          <button onClick={onRename} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-all">
            ✏️ Renommer
          </button>
          <button onClick={onArchive} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-all">
            📦 Archiver
          </button>
          <button onClick={onDelete} className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-all">
            🗑️ Supprimer
          </button>
        </div>
      )}
    </div>
  );
}

function RenameProjectModal({ project, onSave, onClose }) {
  const typeInfo = PROJECT_TYPES.find(t => t.id === project.type);
  const [name, setName] = useState(project.name);
  const [icon, setIcon] = useState(project.icon || typeInfo?.icon || CUSTOM_PROJECT_ICONS[0]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-slate-800 text-base mb-4">Renommer le projet</h3>
        <div className="flex flex-col gap-4">
          <Input label="Nom du projet" value={name} onChange={setName} />
          <IconPicker value={icon} onChange={setIcon} />
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-sm font-semibold hover:bg-slate-50 transition-all">
            Annuler
          </button>
          <button onClick={() => onSave({ name: name.trim() || project.name, icon })}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all">
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

function ArchivedProjectCard({ project, onUnarchive }) {
  const typeInfo = PROJECT_TYPES.find(t => t.id === project.type);
  const icon = project.icon || typeInfo?.icon;
  return (
    <Card className="opacity-70">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, background: "#94a3b8", borderRadius: "10px", fontSize: 20 }}>
            {icon}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-slate-700 text-sm truncate">{project.name}</div>
            <div className="text-xs text-slate-400">{typeInfo?.label}</div>
          </div>
        </div>
        <button onClick={() => onUnarchive(project.id)}
          className="text-xs font-semibold text-blue-600 hover:underline flex-shrink-0">
          Désarchiver
        </button>
      </div>
    </Card>
  );
}

function AccountBanner({ onOpenAuth, onDismiss }) {
  return (
    <div className="px-5 py-3 flex items-center justify-between gap-3" style={{ background: "#1a1a2e" }}>
      <p className="text-white text-xs flex-1">💾 Sauvegardez vos projets sur tous vos appareils</p>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button onClick={onOpenAuth}
          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all">
          Créer un compte
        </button>
        <button onClick={onDismiss}
          className="text-slate-400 hover:text-white text-xs w-6 h-6 flex items-center justify-center transition-all">
          ✕
        </button>
      </div>
    </div>
  );
}

function ProjectsScreen({
  projects, onOpen, onCreate, onInspirations, onLegal, onRename, onArchive, onDelete,
  user, onOpenAuth, onSignOut,
}) {
  const [openMenuId, setOpenMenuId] = useState(null);
  const [renamingProject, setRenamingProject] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const activeProjects = projects.filter(p => !p.archived);
  const archivedProjects = projects.filter(p => p.archived);
  const closeMenu = () => setOpenMenuId(null);

  const confirmDelete = (project) => {
    if (window.confirm(`Supprimer définitivement "${project.name}" ? Cette action est irréversible.`)) {
      onDelete(project.id);
    }
    closeMenu();
  };

  return (
    <div className="min-h-screen" style={{ background: "#f8f7f5" }} onClick={closeMenu}>
      <div className="text-white px-5 pt-8 pb-12" style={{ background: "#1a1a2e" }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, background: "#2563eb", borderRadius: "10px" }}>
                <span style={{ fontSize: 20 }}>🏠</span>
              </div>
              <h1 className="text-2xl font-bold">Mes projets</h1>
            </div>
            {user ? (
              <div className="flex items-center gap-2 flex-shrink-0 mt-2">
                <span className="text-xs text-slate-400 truncate max-w-[140px]">{user.email}</span>
                <button onClick={onSignOut} className="text-xs text-slate-400 hover:text-white transition-all whitespace-nowrap">
                  Se déconnecter
                </button>
              </div>
            ) : (
              <button onClick={() => onOpenAuth("signin")} className="text-xs text-slate-400 hover:text-white transition-all flex-shrink-0 mt-2">
                Se connecter
              </button>
            )}
          </div>
          <p className="text-slate-400 text-sm">{activeProjects.length} projet{activeProjects.length > 1 ? "s" : ""} en cours</p>
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
          <button onClick={onInspirations}
            className="px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-500 text-sm font-semibold hover:bg-slate-50 transition-all"
            title="Bibliothèque d'inspirations">
            💡 Inspirations
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {activeProjects.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              onOpen={onOpen}
              menuOpen={openMenuId === p.id}
              onToggleMenu={() => setOpenMenuId(openMenuId === p.id ? null : p.id)}
              onRename={() => { setRenamingProject(p); closeMenu(); }}
              onArchive={() => { onArchive(p.id); closeMenu(); }}
              onDelete={() => confirmDelete(p)}
              showSyncBadge={!!user}
            />
          ))}
        </div>
        {archivedProjects.length > 0 && (
          <div className="text-center mt-6" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowArchived(s => !s)} className="text-xs text-slate-400 hover:text-slate-600 transition-all">
              📦 Projets archivés ({archivedProjects.length})
            </button>
            {showArchived && (
              <div className="flex flex-col gap-3 mt-4 text-left">
                {archivedProjects.map(p => <ArchivedProjectCard key={p.id} project={p} onUnarchive={onArchive} />)}
              </div>
            )}
          </div>
        )}
        <div className="text-center mt-8">
          <button onClick={onLegal} className="text-xs text-slate-400 hover:text-slate-600 transition-all">
            Mentions légales
          </button>
        </div>
      </div>
      {renamingProject && (
        <RenameProjectModal
          project={renamingProject}
          onClose={() => setRenamingProject(null)}
          onSave={(patch) => { onRename(renamingProject.id, patch); setRenamingProject(null); }}
        />
      )}
    </div>
  );
}

function LegalSection({ title, children }) {
  return (
    <Card>
      <h2 className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "#2563eb" }}>{title}</h2>
      <div className="flex flex-col gap-2 text-sm text-slate-600 leading-relaxed">{children}</div>
    </Card>
  );
}

function LegalScreen({ onBack }) {
  return (
    <div className="min-h-screen" style={{ background: "#f8f7f5" }}>
      <div className="max-w-2xl mx-auto px-5 py-8">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-600 text-xs mb-6 transition-all">
          ← Retour
        </button>
        <h1 className="text-2xl font-bold mb-6" style={{ color: "#1a1a2e" }}>Mentions légales</h1>
        <div className="flex flex-col gap-4">
          <LegalSection title="Mentions légales">
            <p>Éditeur : [NOM COMPLET À REMPLACER]</p>
            <p>Email : contact@cozimo.fr</p>
            <p>Hébergeur : Vercel Inc, 340 Pine Street, Suite 900, San Francisco, CA 94104, États-Unis</p>
          </LegalSection>
          <LegalSection title="Données & confidentialité">
            <p>Vos données sont stockées localement sur votre appareil (localStorage).</p>
            <p>Aucune donnée personnelle n'est collectée ni transmise à nos serveurs.</p>
            <p>Aucun cookie de tracking n'est utilisé.</p>
            <p>Pour toute question : contact@cozimo.fr</p>
          </LegalSection>
          <LegalSection title="Propriété intellectuelle">
            <p>Cozimo est une marque déposée à l'INPI.</p>
            <p>Tout le contenu de cette application est protégé par le droit d'auteur.</p>
            <p>© 2025 Cozimo — Tous droits réservés.</p>
          </LegalSection>
        </div>
      </div>
    </div>
  );
}

// Vue en lecture seule d'un projet reçu via ?share= — mêmes données (étapes,
// budget, contacts, journal) que le dashboard, sans aucun moyen de modification.
function SharedProjectScreen({ data, onCreateOwn }) {
  const [openPhases, setOpenPhases] = useState({});
  const togglePhase = (phase) => setOpenPhases(prev => ({ ...prev, [phase]: !prev[phase] }));
  const typeInfo = PROJECT_TYPES.find(t => t.id === data.type);
  const steps = STEPS_BY_TYPE[data.type] || [];
  const checklist = data.checklist || {};

  const phases = {};
  steps.forEach(s => {
    const key = s.tag ? `${s.tag} — ${s.phase}` : s.phase;
    if (!phases[key]) phases[key] = [];
    phases[key].push(s);
  });
  (data.customSteps || []).forEach(cs => {
    if (!phases[cs.phaseKey]) phases[cs.phaseKey] = [];
    phases[cs.phaseKey].push(mapCustomStep(cs));
  });
  const allSteps = Object.values(phases).flat();
  const done = allSteps.filter(s => checklist[s.id]).length;

  const b = data.budget || {};
  const budgetFamily = getBudgetFamily(data.type);
  let budgetTotal = 0, resteDisponible = 0, indicators = [];
  if (budgetFamily !== "generic") {
    const derived = computeBudgetDerived(budgetFamily, b);
    budgetTotal = derived.budgetTotal;
    resteDisponible = derived.resteDisponible;
    indicators = getBudgetIndicators(budgetFamily, derived);
  } else {
    // Même calcul que le budget générique (Financement/Acquisition/Installation) de GenericBudgetTab.
    const apportPersonnel = parseFloat(b.apportPersonnel) || 0;
    const capaciteEmprunt = parseFloat(b.capaciteEmprunt) || 0;
    budgetTotal = apportPersonnel + capaciteEmprunt;
    const prixAchat = parseFloat(b.prixAchat) || 0;
    const fraisNotaire = calcNotaire(prixAchat, !!b.neuf);
    const fraisAgence = parseFloat(b.fraisAgence) || 0;
    const fraisDossierBancaire = parseFloat(b.fraisDossierBancaire) || 0;
    const fraisCourtier = parseFloat(b.fraisCourtier) || 0;
    const totalAcquisition = prixAchat + fraisNotaire + fraisAgence + fraisDossierBancaire + fraisCourtier;
    const budgetTravaux = parseFloat(b.budgetTravaux) || 0;
    const cuisineElectromenager = parseFloat(b.cuisineElectromenager) || 0;
    const mobilier = parseFloat(b.mobilier) || 0;
    const decoration = parseFloat(b.decoration) || 0;
    const totalInstallation = budgetTravaux + cuisineElectromenager + mobilier + decoration;
    resteDisponible = budgetTotal - totalAcquisition - totalInstallation;
  }
  const hasBudgetData = budgetTotal > 0 || resteDisponible !== 0;

  const contacts = data.contacts || [];
  const journal = [...(data.journal || [])].sort((a, b2) => (a.date < b2.date ? 1 : -1));

  return (
    <div className="min-h-screen" style={{ background: "#f8f7f5" }}>
      <div className="text-white px-5 pt-8 pb-10" style={{ background: "#1a1a2e" }}>
        <div className="max-w-2xl mx-auto">
          <div className="mb-4"><CozimoLogo width={90} height={27} /></div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-4"
            style={{ background: "rgba(255,255,255,0.12)", color: "#fbbf24" }}>
            👁 Mode lecture seule
          </div>
          <h1 className="text-2xl font-bold truncate">{data.icon || typeInfo?.icon} {data.name}</h1>
          <p className="text-slate-400 text-sm mt-0.5">{typeInfo?.label}</p>
          <div className="mt-4 mb-2 flex justify-between text-sm">
            <span className="text-slate-300">Progression</span>
            <span className="text-white font-bold">{done}/{allSteps.length} étapes</span>
          </div>
          <ProgressBar value={done} max={allSteps.length} color="#3b82f6" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 -mt-4 pb-10 flex flex-col gap-4">
        <Card>
          <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2"><span>📋</span> Étapes</h3>
          <div className="flex flex-col gap-2">
            {Object.entries(phases).map(([phase, items]) => {
              const phaseDone = items.filter(s => checklist[s.id]).length;
              const isOpen = !!openPhases[phase];
              return (
                <div key={phase} className="border-b border-slate-100 last:border-b-0 pb-2 last:pb-0">
                  <button onClick={() => togglePhase(phase)} className="w-full flex items-center justify-between gap-2 py-1.5 text-left">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{phase}</span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-semibold text-blue-600">{phaseDone}/{items.length}</span>
                      <span className="text-xs text-slate-400 transition-transform inline-block" style={{ transform: isOpen ? "rotate(90deg)" : "none" }}>▶</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="flex flex-col gap-1.5 mt-2 pl-1">
                      {items.map(s => (
                        <div key={s.id} className="flex items-center gap-2 text-sm">
                          <span>{checklist[s.id] ? "✅" : "⬜"}</span>
                          <span className={checklist[s.id] ? "text-slate-400 line-through" : "text-slate-700"}>{s.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {hasBudgetData && (
          <Card>
            <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2"><span>💶</span> Budget</h3>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <Stat label="Budget total" value={fmt(budgetTotal)} />
              <Stat label="Reste disponible" value={fmt(resteDisponible)} accent={resteDisponible < 0 ? "text-red-600" : "text-emerald-600"} />
            </div>
            {indicators.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-2 pt-3 border-t border-slate-100">
                {indicators.map((ind, i) => (
                  <div key={i} className="flex justify-between gap-3 text-sm">
                    <span className="text-slate-500">{ind.label}</span>
                    <span className="font-semibold text-slate-700 flex-shrink-0">{ind.value}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {contacts.length > 0 && (
          <Card>
            <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2"><span>📇</span> Contacts</h3>
            <div className="flex flex-col gap-3">
              {contacts.map(c => (
                <div key={c.id} className="text-sm">
                  <div className="font-semibold text-slate-800">{c.nom}</div>
                  <div className="text-xs text-slate-400">
                    {CONTACT_ROLES.find(r => r.value === c.role)?.label || "Autre"}
                    {c.telephone ? ` · ${c.telephone}` : ""}
                    {c.email ? ` · ${c.email}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {journal.length > 0 && (
          <Card>
            <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2"><span>📓</span> Journal</h3>
            <div className="flex flex-col gap-3">
              {journal.map((e, i) => (
                <div key={i} className="text-sm">
                  <div className="text-xs text-slate-400">{fmtDate(e.date)}</div>
                  <div className="font-semibold text-slate-700">{e.title}</div>
                  {e.description && <div className="text-xs text-slate-500">{e.description}</div>}
                </div>
              ))}
            </div>
          </Card>
        )}

        <button onClick={onCreateOwn}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all">
          Créer mon propre projet
        </button>
      </div>
    </div>
  );
}

function InspirationForm({ projects, initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || { url: "", title: "", description: "", projectId: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.url.trim() || !form.title.trim()) return;
    onSave({
      id: form.id || uid(),
      url: form.url.trim(),
      title: form.title.trim(),
      description: form.description || "",
      projectId: form.projectId || null,
      createdAt: form.createdAt || new Date().toISOString(),
    });
  };

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <Input label="URL" value={form.url} onChange={v => set("url", v)} placeholder="https://..." />
        <Input label="Titre" value={form.title} onChange={v => set("title", v)} placeholder="Ex : Canapé en velours vert" />
        <Input label="Description" value={form.description} onChange={v => set("description", v)}
          placeholder="Ex: canapé pour salon, artisan pour salle de bain, carrelage chambre..." />
        <p className="text-xs text-slate-400 -mt-2">💡 Plus vous détaillez, plus vous vous en souviendrez dans 3 mois !</p>
        <Select label="Rattacher à un projet" value={form.projectId || ""} onChange={v => set("projectId", v)}
          options={[{ value: "", label: "Aucun projet" }, ...projects.map(p => ({ value: p.id, label: p.name }))]} />
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

function InspirationCard({ inspiration, projects, onEdit, onDelete }) {
  const project = projects.find(p => p.id === inspiration.projectId);
  const colors = project ? projectColor(projects, project.id) : null;
  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="font-bold text-slate-800 text-sm truncate">{inspiration.title}</div>
          <a href={inspiration.url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline truncate block">
            {inspiration.url}
          </a>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={() => onEdit(inspiration)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all">
            ✎
          </button>
          <button onClick={() => onDelete(inspiration.id)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-500 transition-all">
            ✕
          </button>
        </div>
      </div>
      {inspiration.description && <p className="text-sm text-slate-600 mb-2">{inspiration.description}</p>}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {project ? (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: colors.bg, color: colors.color }}>
            {project.name}
          </span>
        ) : <span />}
        <span className="text-xs text-slate-400">{fmtDate(inspiration.createdAt)}</span>
      </div>
    </Card>
  );
}

function InspirationsScreen({ inspirations, projects, onBack, onSave, onDelete }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("all");

  const filtered = filter === "all" ? inspirations : inspirations.filter(i => i.projectId === filter);
  const sorted = [...filtered].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const handleSave = (insp) => {
    onSave(insp);
    setFormOpen(false);
    setEditing(null);
  };

  return (
    <div className="min-h-screen" style={{ background: "#f8f7f5" }}>
      <div className="text-white px-5 pt-8 pb-12" style={{ background: "#1a1a2e" }}>
        <div className="max-w-2xl mx-auto">
          <button onClick={onBack} className="text-slate-400 hover:text-white text-xs mb-4 transition-all">
            ← Mes projets
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, background: "#2563eb", borderRadius: "10px" }}>
              <span style={{ fontSize: 20 }}>💡</span>
            </div>
            <h1 className="text-2xl font-bold">Inspirations</h1>
          </div>
          <p className="text-slate-400 text-sm">
            {inspirations.length} inspiration{inspirations.length > 1 ? "s" : ""} enregistrée{inspirations.length > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 -mt-6 pb-10 flex flex-col gap-4">
        {!formOpen && (
          <button onClick={() => { setEditing(null); setFormOpen(true); }}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all shadow-lg">
            + Ajouter une inspiration
          </button>
        )}

        {formOpen && (
          <InspirationForm projects={projects} initial={editing}
            onSave={handleSave}
            onCancel={() => { setFormOpen(false); setEditing(null); }} />
        )}

        {!formOpen && projects.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setFilter("all")}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${filter === "all" ? "bg-blue-600 text-white" : "border border-slate-200 text-slate-500 bg-white"}`}>
              Toutes
            </button>
            {projects.map(p => (
              <button key={p.id} onClick={() => setFilter(p.id)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${filter === p.id ? "bg-blue-600 text-white" : "border border-slate-200 text-slate-500 bg-white"}`}>
                {p.name}
              </button>
            ))}
          </div>
        )}

        {!formOpen && (
          sorted.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Aucune inspiration pour l'instant.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {sorted.map(insp => (
                <InspirationCard key={insp.id} inspiration={insp} projects={projects}
                  onEdit={(i) => { setEditing(i); setFormOpen(true); }}
                  onDelete={onDelete} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// Budget générique à 4 sections, conservé pour les types sans moteur dédié
// (Construction, Travaux, Rénovation énergétique, Location, Mise en location, SCI, LMNP).
function GenericBudgetTab({ project, onUpdate }) {
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

function BudgetTopIndicators({ budgetTotal, dejaEngage, resteDisponible, alert }) {
  const ALERT_COLORS = {
    danger: { bg: "#fee2e2", color: "#b91c1c" },
    warning: { bg: "#fef3c7", color: "#b45309" },
    ok: { bg: "#d1fae5", color: "#047857" },
    neutral: { bg: "#f8f7f5", color: "#64748b" },
  };
  const ac = ALERT_COLORS[alert.level];
  const cardStyle = { border: "0.5px solid #e5e3df", background: "white" };
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-2xl shadow-sm p-4" style={cardStyle}>
        <div className="text-xs text-slate-400 mb-1">💰 Budget total</div>
        <div className="text-lg font-bold text-slate-800 truncate">{fmt(budgetTotal)}</div>
      </div>
      <div className="rounded-2xl shadow-sm p-4" style={cardStyle}>
        <div className="text-xs text-slate-400 mb-1">💸 Déjà engagé</div>
        <div className="text-lg font-bold text-slate-800 truncate">{fmt(dejaEngage)}</div>
      </div>
      <div className="rounded-2xl shadow-sm p-4" style={cardStyle}>
        <div className="text-xs text-slate-400 mb-1">📋 Reste disponible</div>
        <div className="text-lg font-bold truncate" style={{ color: resteDisponible < 0 ? "#b91c1c" : "#1a1a2e" }}>{fmt(resteDisponible)}</div>
      </div>
      <div className="rounded-2xl shadow-sm p-4" style={{ background: ac.bg, border: `0.5px solid ${ac.color}33` }}>
        <div className="text-xs mb-1" style={{ color: ac.color }}>⚠️ Alerte</div>
        <div className="text-sm font-bold truncate" style={{ color: ac.color }}>{alert.label}</div>
      </div>
    </div>
  );
}

// Rendu dédié pour la section "Financement" (Achat RP, Vente+Achat, Investissement) —
// remplace l'apport unique par des sources d'apport multi-acheteurs, ajoute l'estimation
// de capacité d'emprunt à partir des revenus. Ne suit pas le mapping générique de champs
// (section.fields reste néanmoins à jour pour l'export PDF).
function FinancementSectionCard({ section, budget: b, derived, open, onToggle, onSet }) {
  const sources = Array.isArray(b.sourcesApport) ? b.sourcesApport : [];

  const addSource = () => {
    onSet("sourcesApport", [...sources, { id: uid(), label: "", montant: "", participePret: true }]);
  };
  const updateSource = (id, patch) => {
    onSet("sourcesApport", sources.map(s => (s.id === id ? { ...s, ...patch } : s)));
  };
  const removeSource = (id) => {
    onSet("sourcesApport", sources.filter(s => s.id !== id));
  };

  return (
    <Card>
      <button onClick={onToggle} className="w-full flex items-center justify-between text-left">
        <h3 className="font-bold text-slate-700 flex items-center gap-2 text-sm">
          <span>{section.icon}</span> {section.title}
        </h3>
        <span className="text-slate-400 text-xs flex-shrink-0">{open ? "▲ Réduire" : "▼ Déplier"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-5 mt-4 pt-4 border-t border-slate-100">
          <div className="flex flex-col gap-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Revenus</div>
            <Input label="Revenus nets mensuels du foyer (avant impôts)" value={b.revenusNetsMensuels || ""}
              onChange={v => onSet("revenusNetsMensuels", v)} type="number" suffix="€/mois" />
            <Stat label="Capacité d'emprunt estimée" value={fmt(derived.capaciteEmpruntEstimee)}
              sub="Indicatif — 35% des revenus sur 25 ans à 3,5%" accent="text-blue-600" />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Sources d'apport</div>
              <button onClick={addSource} className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-all flex-shrink-0">
                + Ajouter une source d'apport
              </button>
            </div>
            {sources.length === 0 ? (
              <p className="text-xs text-slate-400">Aucune source d'apport pour l'instant.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {sources.map(s => (
                  <div key={s.id} className="flex flex-col gap-2 bg-slate-50 rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <input
                        value={s.label}
                        onChange={e => updateSource(s.id, { label: e.target.value })}
                        placeholder="Ex : Morad, Conjoint, Donation parents…"
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                      <button onClick={() => removeSource(s.id)}
                        className="text-slate-300 hover:text-red-500 text-sm w-7 h-7 flex items-center justify-center flex-shrink-0 transition-all">
                        ✕
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={s.montant}
                        onChange={e => updateSource(s.id, { montant: e.target.value })}
                        placeholder="Montant de l'apport"
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                      <span className="text-slate-400 text-sm flex-shrink-0">€</span>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={s.participePret !== false}
                        onChange={e => updateSource(s.id, { participePret: e.target.checked })} />
                      Participe au prêt
                    </label>
                  </div>
                ))}
              </div>
            )}
            <Stat label="Total apport" value={fmt(derived.totalApport)} accent="text-blue-600" />
            <Input label="Épargne totale disponible" value={b.epargneTotaleDisponible || ""}
              onChange={v => onSet("epargneTotaleDisponible", v)} type="number" suffix="€"
              hint="Épargne globale du foyer, projet compris" />
            <Stat label="Épargne investie dans le projet" value={fmt(derived.epargneInvestie)} sub="= Total apport" accent="text-blue-600" />
          </div>

          <div className="flex flex-col gap-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Prêt</div>
            <Input label="Montant emprunté" value={b.montantEmprunte || ""} onChange={v => onSet("montantEmprunte", v)}
              type="number" suffix="€" hint={`Suggestion : prix d'achat − total apport = ${fmt(derived.montantEmprunteSuggere)}`} />
            <Input label="Taux nominal" value={b.tauxNominal || ""} onChange={v => onSet("tauxNominal", v)}
              type="number" suffix="%" placeholder="3.5" />
            <Input label="Durée" value={b.dureeAns || ""} onChange={v => onSet("dureeAns", v)}
              type="number" suffix="ans" placeholder="25" />
            <Stat label="Mensualité hors assurance" value={formatFieldValue(derived.mensualiteHorsAssurance, "€/mois")} accent="text-blue-600" />
            <Input label="Assurance emprunteur" value={b.assuranceEmprunteur || ""} onChange={v => onSet("assuranceEmprunteur", v)}
              type="number" suffix="€/mois" />
            <Stat label="Coût total du crédit" value={formatFieldValue(derived.coutTotalCredit, "€")} accent="text-blue-600" />
          </div>
        </div>
      )}
    </Card>
  );
}

function BudgetSectionCard({ section, budget, derived, open, onToggle, onSet }) {
  return (
    <Card>
      <button onClick={onToggle} className="w-full flex items-center justify-between text-left">
        <h3 className="font-bold text-slate-700 flex items-center gap-2 text-sm">
          <span>{section.icon}</span> {section.title}
        </h3>
        <span className="text-slate-400 text-xs flex-shrink-0">{open ? "▲ Réduire" : "▼ Déplier"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-4 mt-4 pt-4 border-t border-slate-100">
          {section.fields.map(f => {
            if (f.type === "computed") {
              return (
                <Stat key={f.key} label={f.label} value={formatFieldValue(derived[f.key], f.suffix)}
                  sub={typeof f.sub === "function" ? f.sub(budget, derived) : f.sub} accent="text-blue-600" />
              );
            }
            if (f.type === "checkbox") {
              return (
                <label key={f.key} className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={!!budget[f.key]} onChange={e => onSet(f.key, e.target.checked)} />
                  {f.label}
                </label>
              );
            }
            if (f.type === "select") {
              return (
                <Select key={f.key} label={f.label} value={budget[f.key] || f.options[0].value}
                  onChange={v => onSet(f.key, v)} options={f.options} />
              );
            }
            return (
              <Input key={f.key} label={f.label} value={budget[f.key] || ""} onChange={v => onSet(f.key, v)}
                type="number" suffix={f.suffix} hint={f.hint} placeholder={f.placeholder} />
            );
          })}
        </div>
      )}
    </Card>
  );
}

function BudgetTab({ project, onUpdate }) {
  const family = getBudgetFamily(project.type);
  const [openSections, setOpenSections] = useState({});

  if (family === "generic") {
    return <GenericBudgetTab project={project} onUpdate={onUpdate} />;
  }

  const b = project.budget || {};
  const set = (k, v) => onUpdate(p => ({ ...p, budget: { ...(p.budget || {}), [k]: v } }));
  const toggleSection = (id, defaultOpen) => {
    setOpenSections(prev => ({ ...prev, [id]: !(prev[id] ?? defaultOpen) }));
  };

  const derived = computeBudgetDerived(family, b);
  const alert = getBudgetAlert(family, b, derived);
  const indicators = getBudgetIndicators(family, derived);
  const sectionIds = BUDGET_SCHEMA[family] || [];

  return (
    <div className="flex flex-col gap-4">
      <BudgetTopIndicators
        budgetTotal={derived.budgetTotal}
        dejaEngage={derived.dejaEngage}
        resteDisponible={derived.resteDisponible}
        alert={alert}
      />

      {sectionIds.map(id => {
        const section = BUDGET_SECTIONS[id];
        const isOpen = openSections[id] ?? section.defaultOpen;
        const SectionComponent = id === "financement" ? FinancementSectionCard : BudgetSectionCard;
        return (
          <SectionComponent
            key={id}
            section={section}
            budget={b}
            derived={derived}
            open={isOpen}
            onToggle={() => toggleSection(id, section.defaultOpen)}
            onSet={set}
          />
        );
      })}

      {indicators.length > 0 && (
        <Card>
          <h3 className="font-bold text-slate-700 mb-4">Indicateurs</h3>
          <div className="flex flex-col gap-3">
            {indicators.map((ind, i) => (
              <div key={i} className="flex justify-between items-center gap-3 text-sm">
                <span className="text-slate-500">{ind.label}</span>
                <span className={`font-semibold text-right ${ind.alert ? "text-red-600" : "text-slate-800"}`}>{ind.value}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function ContactCard({ contact, onDelete, onUpdate, onEdit }) {
  const roleLabel = CONTACT_ROLES.find(r => r.value === contact.role)?.label || "Autre";
  const status = CONTACT_STATUSES.find(s => s.value === contact.statut) || CONTACT_STATUSES[0];
  return (
    <Card>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex flex-col gap-1.5">
          <div className="font-bold text-slate-800 text-sm">{contact.nom}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">{roleLabel}</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: status.bg, color: status.color }}>
              {status.icon} {status.label}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => onEdit(contact)}
            className="text-slate-300 hover:text-blue-600 text-xs w-6 h-6 flex items-center justify-center transition-all">
            ✎
          </button>
          <button onClick={() => onDelete(contact.id)}
            className="text-slate-300 hover:text-red-500 text-xs w-6 h-6 flex items-center justify-center transition-all">
            ✕
          </button>
        </div>
      </div>
      <StarRating value={contact.note || 0} onChange={n => onUpdate(contact.id, { note: n })} />
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

const EMPTY_CONTACT_FORM = { nom: "", role: "courtier", telephone: "", email: "", notes: "", note: 0, statut: "a_contacter" };

function ContactsTab({ project, onAdd, onDelete, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_CONTACT_FORM);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const contacts = project.contacts || [];

  const startAdd = () => {
    if (open) { cancel(); return; }
    setEditingId(null);
    setForm(EMPTY_CONTACT_FORM);
    setOpen(true);
  };

  const startEdit = (contact) => {
    setEditingId(contact.id);
    setForm({ ...EMPTY_CONTACT_FORM, ...contact });
    setOpen(true);
  };

  const cancel = () => {
    setOpen(false);
    setEditingId(null);
    setForm(EMPTY_CONTACT_FORM);
  };

  const submit = () => {
    if (!form.nom.trim()) return;
    if (editingId) {
      onUpdate(editingId, form);
    } else {
      onAdd({ id: uid(), ...form });
    }
    cancel();
  };

  return (
    <div className="flex flex-col gap-4">
      <button onClick={startAdd}
        className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all">
        {open ? "✕ Annuler" : "+ Ajouter un contact"}
      </button>
      {open && (
        <Card>
          <div className="flex flex-col gap-4">
            <Input label="Nom" value={form.nom} onChange={v => set("nom", v)} placeholder="Ex : Marie Dupont" />
            <Select label="Rôle" value={form.role} onChange={v => set("role", v)} options={CONTACT_ROLES} />
            <Select label="Statut" value={form.statut} onChange={v => set("statut", v)}
              options={CONTACT_STATUSES.map(s => ({ value: s.value, label: `${s.icon} ${s.label}` }))} />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Note</label>
              <StarRating value={form.note} onChange={n => set("note", n)} />
            </div>
            <Input label="Téléphone" value={form.telephone} onChange={v => set("telephone", v)} type="tel" placeholder="06 12 34 56 78" />
            <Input label="Email" value={form.email} onChange={v => set("email", v)} type="email" placeholder="marie@exemple.fr" />
            <Input label="Mes notes" value={form.notes} onChange={v => set("notes", v)} placeholder="Impressions, points clés, tarifs discutés..." />
            <button onClick={submit}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition-all">
              {editingId ? "Modifier le contact" : "Enregistrer le contact"}
            </button>
          </div>
        </Card>
      )}
      {contacts.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">Aucun contact pour ce projet pour l'instant.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {contacts.map(c => (
            <ContactCard key={c.id} contact={c} onDelete={onDelete} onUpdate={onUpdate} onEdit={startEdit} />
          ))}
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
  const [promptOpen, setPromptOpen] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLink, setShareLink] = useState("");

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

  const handleShare = () => {
    const encoded = encodeShareData(project);
    setShareLink(`${window.location.origin}${window.location.pathname}?share=${encoded}`);
    setShareOpen(true);
  };

  const steps = STEPS_BY_TYPE[project.type] || [];
  const typeInfo = PROJECT_TYPES.find(t => t.id === project.type);
  const tabs = BIENS_ENABLED_TYPES.includes(project.type)
    ? [DASHBOARD_TABS_BASE[0], BIENS_TAB, ...DASHBOARD_TABS_BASE.slice(1)]
    : DASHBOARD_TABS_BASE;

  // Phases affichées dans l'onglet Accueil, étapes personnalisées incluses dans leur phase.
  const phases = {};
  steps.forEach(s => {
    const key = s.tag ? `${s.tag} — ${s.phase}` : s.phase;
    if (!phases[key]) phases[key] = [];
    phases[key].push(s);
  });
  (project.customSteps || []).forEach(cs => {
    if (!phases[cs.phaseKey]) phases[cs.phaseKey] = [];
    phases[cs.phaseKey].push(mapCustomStep(cs));
  });

  // Liste combinée (ordre d'affichage) utilisée pour la progression globale et "Prochaine action".
  const allSteps = Object.values(phases).flat();
  const done = allSteps.filter(s => project.checklist[s.id]).length;
  const pct = allSteps.length ? Math.round((done / allSteps.length) * 100) : 0;
  const nextStep = allSteps.find(s => !project.checklist[s.id]);

  const upcomingDeadlines = allSteps
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
  const updateContact = (id, patch) => onUpdate(p => ({ ...p, contacts: (p.contacts || []).map(c => (c.id === id ? { ...c, ...patch } : c)) }));
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
      {promptOpen && <PromptModal project={project} onClose={() => setPromptOpen(false)} />}
      {shareOpen && <ShareModal link={shareLink} onClose={() => setShareOpen(false)} />}
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
              <p className="text-slate-400 text-sm mt-0.5">{project.icon || typeInfo?.icon} {typeInfo?.label}</p>
            </div>
            <button onClick={handleShare}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all">
              🔗 Partager
            </button>
          </div>
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-slate-300">Progression</span>
            <span className="text-white font-bold">{done}/{allSteps.length} étapes</span>
          </div>
          <ProgressBar value={done} max={allSteps.length} color="#3b82f6" />
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
                      <span className="text-xs text-slate-400">{nextStep.phase}{nextStep.month ? ` · ${nextStep.month}` : ""}</span>
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

            <button onClick={() => setPromptOpen(true)}
              className="w-full py-3 rounded-xl text-white text-sm font-bold transition-all hover:opacity-90"
              style={{ background: "#2563eb" }}>
              📋 Générer un prompt IA
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
        {tab === "contacts" && <ContactsTab project={project} onAdd={addContact} onDelete={deleteContact} onUpdate={updateContact} />}
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
  const [inspirations, setInspirations] = useState([]);
  const [previousScreen, setPreviousScreen] = useState("new-type");
  const [sharedProject, setSharedProject] = useState(null);
  const [user, setUser] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState("signup");
  const [accountBannerDismissed, setAccountBannerDismissed] = useState(true);
  const [migrationCandidates, setMigrationCandidates] = useState(null);
  const [migrating, setMigrating] = useState(false);
  const activeIdRef = useRef(null);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    try {
      setAccountBannerDismissed(localStorage.getItem(ACCOUNT_BANNER_DISMISSED_KEY) === "true");
    } catch {
      setAccountBannerDismissed(false);
    }
  }, []);

  const persist = useCallback((projs, active) => {
    saveData({ projects: projs, activeId: active });
  }, []);

  // Auth optionnelle — réagit aux connexions/déconnexions qui arrivent APRÈS le montage
  // (login explicite via la modale, retour de redirection OAuth Google, déconnexion).
  // La session déjà existante au tout premier chargement est gérée séparément dans
  // l'effet d'initialisation ci-dessous, dans la MÊME chaîne async que le chargement
  // local — jamais dans un effet séparé, pour éviter la course entre "charger le
  // local" et "fusionner le cloud" qui faisait disparaître les projets cloud à la
  // reconnexion (le chargement local, résolu en second, écrasait sans le savoir
  // l'état déjà fusionné par le cloud).
  const handleAuthenticated = async (authUser, source = "événement auth") => {
    console.log(`[Supabase][app] handleAuthenticated (${source}) → userId=${authUser.id} email=${authUser.email}`);
    setUser({ id: authUser.id, email: authUser.email });
    setAuthModalOpen(false);
    const cloudProjects = await fetchCloudProjects(authUser.id);
    setProjects(prev => {
      console.log("[Supabase][app] AVANT fusion → projets locaux actuels en mémoire :",
        prev.map(p => ({ id: p.id, name: p.name, cloudId: p.cloudId || null })));
      const localOnly = prev.filter(p => !p.cloudId && !cloudProjects.some(cp => cp.id === p.id));
      const merged = [...cloudProjects, ...localOnly];
      console.log("[Supabase][app] APRÈS fusion →", {
        cloudReçusDeSupabase: cloudProjects.length,
        localSeulementConservés: localOnly.length,
        totalAffiché: merged.length,
        projets: merged.map(p => ({ id: p.id, name: p.name, cloudId: p.cloudId || null })),
      });
      persist(merged, activeIdRef.current);
      if (localOnly.length > 0) setMigrationCandidates(localOnly);
      return merged;
    });
  };

  // Déconnexion — les projets cloud (identifiés par cloudId) doivent disparaître de
  // l'écran et du localStorage : sans session, on ne peut plus les synchroniser, et
  // les garder affichés donnerait l'illusion qu'ils sont toujours accessibles/à jour.
  // Seuls les projets réellement locaux (jamais synchronisés, pas de cloudId) restent.
  const clearCloudProjectsFromMemory = (reason) => {
    setProjects(prev => {
      const cloudCount = prev.filter(p => p.cloudId).length;
      const localOnly = prev.filter(p => !p.cloudId);
      console.log(`[Supabase][app] Déconnexion (${reason}) → retrait des projets cloud de la mémoire.`, {
        avantTotal: prev.length,
        projetsCloudRetirés: cloudCount,
        projetsLocauxConservés: localOnly.length,
      });
      persist(localOnly, activeIdRef.current);
      return localOnly;
    });
  };

  useEffect(() => {
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[Supabase][app] onAuthStateChange →", event);
      if (event === "SIGNED_IN" && session?.user) {
        handleAuthenticated(session.user, "onAuthStateChange SIGNED_IN");
      } else if (event === "SIGNED_OUT") {
        console.log("[Supabase][app] SIGNED_OUT → réinitialisation de l'utilisateur en mémoire.");
        setUser(null);
        setMigrationCandidates(null);
        clearCloudProjectsFromMemory("onAuthStateChange SIGNED_OUT");
      }
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    const shareParam = new URLSearchParams(window.location.search).get("share");
    let sharedOk = false;
    if (shareParam) {
      const decoded = decodeShareData(shareParam);
      if (decoded) {
        setSharedProject(decoded);
        setScreen("shared");
        sharedOk = true;
      }
    }

    async function init() {
      const [d, onboardingDone] = await Promise.all([loadData(), loadOnboardingDone()]);
      const activeIdLoaded = d?.activeId || null;
      setActiveId(activeIdLoaded);

      // Vérifie les échéances au chargement de l'app et notifie si nécessaire.
      const { projects: checked } = checkDeadlineNotifications(d?.projects || []);
      let finalProjects = checked;
      console.log("[Supabase][app] 1/3 — Chargement local terminé →",
        finalProjects.map(p => ({ id: p.id, name: p.name, cloudId: p.cloudId || null })));

      // Fusion cloud faite ICI, dans la continuité directe du chargement local (pas
      // dans un effet séparé) : impossible qu'un chargement local tardif écrase le résultat.
      if (supabase) {
        const { data: sessionData } = await supabase.auth.getSession();
        console.log("[Supabase][app] 2/3 — Session existante au démarrage ? →", !!sessionData?.session);
        if (sessionData?.session?.user) {
          const authUser = sessionData.session.user;
          console.log(`[Supabase][app] LOGIN (session reprise) → userId utilisé pour CHARGER les projets = ${authUser.id} (email: ${authUser.email})`);
          setUser({ id: authUser.id, email: authUser.email });
          const cloudProjects = await fetchCloudProjects(authUser.id);
          const localOnly = finalProjects.filter(p => !p.cloudId && !cloudProjects.some(cp => cp.id === p.id));
          finalProjects = [...cloudProjects, ...localOnly];
          console.log("[Supabase][app] 3/3 — Fusion démarrage →", {
            cloudReçusDeSupabase: cloudProjects.length,
            localSeulementConservés: localOnly.length,
            totalAffiché: finalProjects.length,
            projets: finalProjects.map(p => ({ id: p.id, name: p.name, cloudId: p.cloudId || null })),
          });
          if (localOnly.length > 0) setMigrationCandidates(localOnly);
        }
      }

      setProjects(finalProjects);
      persist(finalProjects, activeIdLoaded);
      console.log("[Supabase][app] État final posé à l'écran →", finalProjects.length, "projet(s).");

      if (!sharedOk) {
        setScreen(!onboardingDone ? "onboarding" : (finalProjects.length > 0 ? "projects" : "new-type"));
      }
    }
    init();

    loadInspirations().then(setInspirations);
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.title = "Cozimo — La to-do list sous stéroïdes de votre projet immo";
  }, []);

  // PWA — enregistrement du service worker (cache hors ligne). L'écran de
  // chargement asynchrone fait que ce composant monte après l'évènement "load"
  // de la page : on enregistre immédiatement si c'est déjà le cas.
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const register = () => navigator.serviceWorker.register("/sw.js");
      if (document.readyState === "complete") {
        register();
      } else {
        window.addEventListener("load", register);
        return () => window.removeEventListener("load", register);
      }
    }
  }, []);

  const openProjectsList = () => setScreen("projects");
  const openInspirations = () => setScreen("inspirations");
  const openLegal = () => { setPreviousScreen(screen); setScreen("legal"); };
  const closeLegal = () => setScreen(previousScreen);

  const finishOnboarding = () => {
    saveOnboardingDone();
    setScreen(projects.length > 0 ? "projects" : "new-type");
  };

  const saveInspiration = (insp) => {
    setInspirations(prev => {
      const already = prev.some(i => i.id === insp.id);
      const next = already ? prev.map(i => (i.id === insp.id ? insp : i)) : [...prev, insp];
      saveInspirations(next);
      return next;
    });
  };
  const deleteInspiration = (id) => {
    setInspirations(prev => {
      const next = prev.filter(i => i.id !== id);
      saveInspirations(next);
      return next;
    });
  };

  const startNewProject = () => {
    setDraftType(null);
    setSharedProject(null);
    setScreen("new-type");
  };

  const selectType = (typeId) => {
    setDraftType(typeId);
    setScreen("new-details");
  };

  const createProject = ({ name, startDate, icon }) => {
    const typeLabel = PROJECT_TYPES.find(t => t.id === draftType)?.label || "Projet";
    const project = {
      id: uid(),
      name: name || typeLabel,
      type: draftType,
      icon: icon || null,
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
    if (user) {
      console.log("[Supabase][app] Nouveau projet créé en étant connecté → envoi vers le cloud…", project.name);
      insertCloudProject(project, user.id).then(cloudId => {
        if (!cloudId) {
          console.warn("[Supabase][app] Le nouveau projet reste local uniquement (échec de l'envoi cloud — voir logs ci-dessus).");
          return;
        }
        console.log("[Supabase][app] Nouveau projet rattaché au cloud →", { projectId: project.id, cloudId });
        setProjects(prev => {
          const updated = prev.map(p => (p.id === project.id ? { ...p, cloudId } : p));
          persist(updated, activeIdRef.current);
          return updated;
        });
      });
    } else {
      console.log("[Supabase][app] Nouveau projet créé hors connexion → local uniquement.", project.name);
    }
  };

  const openProject = (id) => {
    setActiveId(id);
    persist(projects, id);
    setScreen("dashboard");
  };

  const renameProject = (id, patch) => {
    const next = projects.map(p => (p.id === id ? { ...p, ...patch } : p));
    setProjects(next);
    persist(next, activeId);
    const updated = next.find(p => p.id === id);
    if (user && updated?.cloudId) updateCloudProject(updated);
  };
  const toggleArchiveProject = (id) => {
    const next = projects.map(p => (p.id === id ? { ...p, archived: !p.archived } : p));
    setProjects(next);
    persist(next, activeId);
    const updated = next.find(p => p.id === id);
    if (user && updated?.cloudId) updateCloudProject(updated);
  };
  const deleteProject = (id) => {
    const target = projects.find(p => p.id === id);
    const next = projects.filter(p => p.id !== id);
    const nextActive = activeId === id ? null : activeId;
    setProjects(next);
    setActiveId(nextActive);
    persist(next, nextActive);
    if (user && target?.cloudId) deleteCloudProject(target.cloudId);
  };

  const updateActiveProject = useCallback((updater) => {
    setProjects(prev => {
      const next = prev.map(p => {
        if (p.id !== activeId) return p;
        const updated = updater(p);
        if (user && updated.cloudId) updateCloudProject(updated);
        return updated;
      });
      persist(next, activeId);
      return next;
    });
  }, [activeId, persist, user]);

  const activeProject = projects.find(p => p.id === activeId);

  const openAuthModal = (tab) => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  };
  const dismissAccountBanner = () => {
    try { localStorage.setItem(ACCOUNT_BANNER_DISMISSED_KEY, "true"); } catch {}
    setAccountBannerDismissed(true);
  };
  const handleSignOut = async () => {
    await signOutUser();
    setUser(null);
    setMigrationCandidates(null);
    clearCloudProjectsFromMemory("bouton Se déconnecter");
  };
  const syncMigration = async () => {
    if (!user || !migrationCandidates) return;
    console.log(`[Supabase][app] Migration → envoi de ${migrationCandidates.length} projet(s) local/aux vers le cloud…`);
    setMigrating(true);
    const updates = [];
    for (const p of migrationCandidates) {
      const cloudId = await insertCloudProject(p, user.id);
      if (cloudId) updates.push({ id: p.id, cloudId });
    }
    console.log(`[Supabase][app] Migration terminée → ${updates.length}/${migrationCandidates.length} projet(s) synchronisé(s).`);
    setProjects(prev => {
      const next = prev.map(p => {
        const found = updates.find(u => u.id === p.id);
        return found ? { ...p, cloudId: found.cloudId } : p;
      });
      persist(next, activeIdRef.current);
      return next;
    });
    setMigrating(false);
    setMigrationCandidates(null);
  };
  const skipMigration = () => setMigrationCandidates(null);

  const exitSharedMode = () => {
    if (typeof window !== "undefined" && window.history?.replaceState) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    startNewProject();
  };

  let content;
  if (screen === "shared" && sharedProject) {
    content = <SharedProjectScreen data={sharedProject} onCreateOwn={exitSharedMode} />;
  } else if (screen === "onboarding") {
    content = <OnboardingScreen onFinish={finishOnboarding} />;
  } else if (screen === "loading") {
    content = (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#1a1a2e" }}>
        <div className="text-white text-center">
          <div className="text-4xl mb-3">🏠</div>
          <p className="text-slate-400 text-sm">Chargement…</p>
        </div>
      </div>
    );
  } else if (screen === "legal") {
    content = <LegalScreen onBack={closeLegal} />;
  } else if (screen === "new-type") {
    content = <NewProjectTypeScreen onSelect={selectType} onBack={projects.length > 0 ? openProjectsList : null} onLegal={openLegal} />;
  } else if (screen === "new-details") {
    content = <NewProjectDetailsScreen type={draftType} onCreate={createProject} onBack={() => setScreen("new-type")} />;
  } else if (screen === "dashboard" && activeProject) {
    content = <Dashboard project={activeProject} onUpdate={updateActiveProject} onBack={openProjectsList} />;
  } else if (screen === "inspirations") {
    content = (
      <InspirationsScreen
        inspirations={inspirations}
        projects={projects}
        onBack={openProjectsList}
        onSave={saveInspiration}
        onDelete={deleteInspiration}
      />
    );
  } else {
    content = (
      <ProjectsScreen
        projects={projects}
        onOpen={openProject}
        onCreate={startNewProject}
        onInspirations={openInspirations}
        onLegal={openLegal}
        onRename={renameProject}
        onArchive={toggleArchiveProject}
        onDelete={deleteProject}
        user={user}
        onOpenAuth={openAuthModal}
        onSignOut={handleSignOut}
      />
    );
  }

  // Bandeau "Créer un compte" — persiste sur toute la navigation (accueil, mes
  // projets, dashboard, etc.) tant que non connecté et non fermé. Masqué sur les
  // écrans techniques/transitoires (chargement, onboarding) et la vue "lecture
  // seule" d'un visiteur externe (screen "shared", pas le propriétaire du projet).
  const showAccountBanner = !user && !accountBannerDismissed && !["loading", "onboarding", "shared"].includes(screen);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        * { font-family: 'Outfit', sans-serif; }
      `}</style>
      {showAccountBanner && <AccountBanner onOpenAuth={() => openAuthModal("signup")} onDismiss={dismissAccountBanner} />}
      {content}
      {authModalOpen && <AuthModal defaultTab={authModalTab} onClose={() => setAuthModalOpen(false)} />}
      {migrationCandidates && (
        <MigrationModal
          count={migrationCandidates.length}
          syncing={migrating}
          onSync={syncMigration}
          onSkip={skipMigration}
        />
      )}
    </>
  );
}
