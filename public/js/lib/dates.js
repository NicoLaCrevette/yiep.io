/**
 * Utilitaires de dates partagés entre le serveur (Node) et le navigateur.
 *
 * Toutes les dates du planning sont des chaînes "YYYY-MM-DD" et les heures
 * des chaînes "HH:MM", exprimées en heure murale de Paris. On ne manipule
 * jamais d'objets Date « locaux » : les calculs se font en UTC pur, ce qui
 * évite les surprises liées au fuseau du visiteur ou au changement d'heure.
 */

export const TIME_ZONE = "Europe/Paris";

export const DAY_NAMES = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
export const DAY_SHORT = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
export const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_MS = 86_400_000;

function split(date) {
  const m = DATE_RE.exec(date);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function toUtc(date) {
  const [y, m, d] = split(date);
  return new Date(Date.UTC(y, m - 1, d));
}

export function isValidDate(date) {
  if (typeof date !== "string") return false;
  const p = split(date);
  if (!p) return false;
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
}

export const isValidTime = time => typeof time === "string" && TIME_RE.test(time);

export function addDays(date, days) {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = dimanche … 6 = samedi */
export const weekday = date => toUtc(date).getUTCDay();

/** Lundi de la semaine contenant `date`. */
export const mondayOf = date => addDays(date, -((weekday(date) + 6) % 7));

export const toMinutes = time => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

/** Minutes « murales » depuis l'epoch : permet de comparer date + heure d'un bloc. */
export const wallMinutes = (date, time) => (toUtc(date).getTime() / DAY_MS) * 1440 + toMinutes(time);

/** Date et minutes actuelles dans le fuseau du planning, quel que soit celui de la machine. */
export function zonedNow(now = new Date(), timeZone = TIME_ZONE) {
  const parts = {};
  for (const { type, value } of new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(now)) parts[type] = value;

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

/** Début et fin d'un live en minutes murales. Une fin ≤ début signifie « après minuit ». */
export function eventSpan(event) {
  const start = wallMinutes(event.date, event.start);
  let end = wallMinutes(event.date, event.end);
  if (end <= start) end += 1440;
  return { start, end };
}

/* ---------- Formatage ---------- */

export function formatDayLong(date) {
  const [, m, d] = split(date);
  return `${DAY_NAMES[weekday(date)]} ${d} ${MONTHS[m - 1]}`;
}

export function formatDayShort(date) {
  const [, m, d] = split(date);
  return `${DAY_SHORT[weekday(date)]} ${d} ${MONTHS_SHORT[m - 1]}`;
}

/** « 13 – 19 octobre », « 29 sept. – 5 oct. » ou « 29 déc. 2025 – 4 janv. 2026 ». */
export function formatWeekRange(monday) {
  const sunday = addDays(monday, 6);
  const [y1, m1, d1] = split(monday);
  const [y2, m2, d2] = split(sunday);
  if (y1 !== y2) return `${d1} ${MONTHS_SHORT[m1 - 1]} ${y1} – ${d2} ${MONTHS_SHORT[m2 - 1]} ${y2}`;
  if (m1 !== m2) return `${d1} ${MONTHS_SHORT[m1 - 1]} – ${d2} ${MONTHS_SHORT[m2 - 1]}`;
  return `${d1} – ${d2} ${MONTHS[m1 - 1]}`;
}

export const formatTimeRange = event => `${event.start} – ${event.end}`;

export const daysBetween = (from, to) => Math.round((toUtc(to) - toUtc(from)) / DAY_MS);

/**
 * « dans 12 min », « dans 3 h », « demain », « dans 4 jours ».
 * `days` est l'écart en jours calendaires, pour que « demain » soit exact.
 */
export function formatDelay(minutes, days) {
  if (minutes < 60) return `dans ${Math.max(1, minutes)} min`;
  if (days === 0 || minutes < 6 * 60) return `dans ${Math.floor(minutes / 60)} h`;
  if (days === 1) return "demain";
  return `dans ${days} jours`;
}
