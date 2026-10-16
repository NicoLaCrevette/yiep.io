/**
 * Modèle de données et validation, partagés entre le serveur et l'admin :
 * le navigateur affiche les mêmes erreurs que celles que l'API renverrait.
 */
import { isValidDate, isValidTime } from "./dates.js";

export const LIMITS = {
  title: 80,
  game: 40,
  guests: 8,
  guestName: 40,
  displayName: 40,
  bio: 160,
  url: 300
};

export const DEFAULT_ACCENT = "#9146ff";

/** Réseaux proposés, dans l'ordre d'affichage. Un lien vide n'est pas affiché. */
export const NETWORKS = [
  { key: "twitch", label: "Twitch", color: "#9146ff" },
  { key: "discord", label: "Discord", color: "#5865f2" },
  { key: "x", label: "X (Twitter)", color: "#e7e7ea" },
  { key: "instagram", label: "Instagram", color: "#e1306c" },
  { key: "youtube", label: "YouTube", color: "#ff2d2d" },
  { key: "tiktok", label: "TikTok", color: "#25f4ee" },
  { key: "kick", label: "Kick", color: "#53fc18" }
];

const TWITCH_LOGIN_RE = /^[a-z0-9_]{1,25}$/;

const clean = value => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
const fail = error => ({ error });

/**
 * Accepte « pseudo », « @pseudo », « twitch.tv/pseudo » ou une URL complète
 * et renvoie le login Twitch en minuscules, ou null s'il est invalide.
 */
export function normalizeTwitch(input) {
  if (typeof input !== "string") return null;
  let value = input.trim();
  const url = value.match(/^(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/([^/?#\s]+)/i);
  value = (url ? url[1] : value.replace(/^@/, "")).toLowerCase();
  return TWITCH_LOGIN_RE.test(value) ? value : null;
}

/** Ajoute https:// si besoin ; renvoie null pour tout ce qui n'est pas une URL https. */
export function normalizeUrl(input) {
  let value = clean(input);
  if (!value) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname.includes(".")) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function validateEvent(raw) {
  if (!raw || typeof raw !== "object") return fail("Données invalides.");

  const { date, start, end } = raw;
  if (!isValidDate(date)) return fail("Date invalide.");
  if (!isValidTime(start) || !isValidTime(end)) return fail("Horaire invalide (format HH:MM).");
  if (start === end) return fail("L'heure de fin doit être différente de l'heure de début.");

  const title = clean(raw.title);
  if (!title) return fail("Le titre est obligatoire.");
  if (title.length > LIMITS.title) return fail(`Titre trop long (${LIMITS.title} caractères max).`);

  const game = clean(raw.game);
  if (game.length > LIMITS.game) return fail(`Jeu trop long (${LIMITS.game} caractères max).`);

  const rawGuests = raw.guests ?? [];
  if (!Array.isArray(rawGuests) || rawGuests.length > LIMITS.guests * 4) return fail("Liste d'invités invalide.");

  const guests = [];
  const seen = new Set();
  for (const guest of rawGuests) {
    const name = clean(guest?.name);
    const twitchInput = clean(guest?.twitch);
    if (!name && !twitchInput) continue; // ligne laissée vide dans le formulaire

    const twitch = twitchInput ? normalizeTwitch(twitchInput) : "";
    if (twitch === null) return fail(`Pseudo Twitch invalide pour ${name || "un invité"}.`);
    if (name.length > LIMITS.guestName) return fail(`Nom d'invité trop long (${LIMITS.guestName} caractères max).`);
    const key = twitch || name.toLowerCase();
    if (seen.has(key)) continue; // même invité saisi deux fois
    seen.add(key);
    guests.push({ name: name || twitch, twitch });
  }
  if (guests.length > LIMITS.guests) return fail(`${LIMITS.guests} invités maximum par live.`);

  return { value: { date, start, end, title, game, guests } };
}

export function validateSettings(raw) {
  if (!raw || typeof raw !== "object") return fail("Données invalides.");

  const displayName = clean(raw.displayName);
  if (!displayName) return fail("Le nom affiché est obligatoire.");
  if (displayName.length > LIMITS.displayName) return fail(`Nom trop long (${LIMITS.displayName} caractères max).`);

  const bio = clean(raw.bio);
  if (bio.length > LIMITS.bio) return fail(`Bio trop longue (${LIMITS.bio} caractères max).`);

  const accent = typeof raw.accent === "string" && /^#[0-9a-f]{6}$/i.test(raw.accent)
    ? raw.accent.toLowerCase()
    : DEFAULT_ACCENT;

  const links = {};
  for (const { key, label } of NETWORKS) {
    const url = normalizeUrl(raw.links?.[key]);
    if (url === null) return fail(`Lien ${label} invalide : il doit s'agir d'une adresse https.`);
    if (url.length > LIMITS.url) return fail(`Lien ${label} trop long.`);
    links[key] = url;
  }

  return { value: { displayName, bio, accent, links } };
}

/** Pseudo Twitch du streamer, déduit de son lien Twitch. */
export const ownerTwitch = settings => (settings.links?.twitch ? normalizeTwitch(settings.links.twitch) : null);

/** Texte secondaire affiché sous chaque bouton de réseau. */
export function linkSubtitle(key, url) {
  let parsed;
  try { parsed = new URL(url); } catch { return url; }
  const first = parsed.pathname.split("/").filter(Boolean)[0] || "";

  switch (key) {
    case "discord": return "Rejoins la communauté";
    case "twitch":
    case "kick": return `${parsed.hostname.replace(/^www\./, "")}/${first}`;
    case "youtube":
    case "tiktok": return first.startsWith("@") ? first : parsed.hostname.replace(/^www\./, "");
    default: return first ? `@${first.replace(/^@/, "")}` : parsed.hostname.replace(/^www\./, "");
  }
}

/** Tri chronologique : date puis heure de début. */
export const compareEvents = (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start);
