/**
 * Persistance des données dans des fichiers JSON (pas de base de données à
 * installer). Chaque écriture passe par un fichier temporaire puis un
 * renommage : un crash en pleine écriture ne corrompt jamais les données.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { addDays, mondayOf } from "../public/js/lib/dates.js";
import { DEFAULT_ACCENT, compareEvents, validateEvent } from "../public/js/lib/model.js";

export const DEFAULT_SETTINGS = {
  displayName: "Nicooow",
  bio: "Streameur sur Twitch — gaming, chill et bonne humeur.",
  accent: DEFAULT_ACCENT,
  links: {
    twitch: "https://www.twitch.tv/nicooow__",
    discord: "https://discord.gg/JdzyXEKbt2",
    x: "https://x.com/_Nicooow_",
    instagram: "https://www.instagram.com/nicoow01/",
    youtube: "",
    tiktok: "",
    kick: ""
  },
  avatar: null // { type: "image/webp", version: 1700000000000 }
};

const AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Reconnaît le format d'une image à ses premiers octets, sans faire confiance à l'en-tête HTTP. */
export function sniffImageType(buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer.toString("ascii", 1, 4) === "PNG") return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });

    this.files = {
      events: path.join(dir, "events.json"),
      settings: path.join(dir, "settings.json"),
      avatar: path.join(dir, "avatar.img"),
      secret: path.join(dir, "secret.key")
    };

    this.events = this.#loadEvents();
    const saved = this.#read(this.files.settings, {});
    this.settings = { ...DEFAULT_SETTINGS, ...saved, links: { ...DEFAULT_SETTINGS.links, ...saved.links } };
    this.secret = this.#loadSecret();
  }

  /* ---------- lecture / écriture bas niveau ---------- */

  #read(file, fallback) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (err) {
      if (err.code === "ENOENT") return fallback;
      // On refuse de démarrer plutôt que d'écraser des données qu'on n'arrive pas à lire.
      throw new Error(`Fichier de données illisible : ${file} (${err.message})`);
    }
  }

  #write(file, data) {
    const tmp = `${file}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(tmp, typeof data === "string" || Buffer.isBuffer(data) ? data : `${JSON.stringify(data, null, 2)}\n`);
      fs.renameSync(tmp, file);
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      throw err;
    }
  }

  #loadEvents() {
    const raw = this.#read(this.files.events, { events: [] }).events ?? [];
    const events = [];
    for (const item of raw) {
      const { value } = validateEvent(item);
      if (value && typeof item.id === "string") events.push({ id: item.id, ...value });
      else console.warn(`Live ignoré (données invalides) dans ${this.files.events} :`, item);
    }
    return events.sort(compareEvents);
  }

  #loadSecret() {
    try {
      return fs.readFileSync(this.files.secret, "utf8").trim();
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      const secret = crypto.randomBytes(32).toString("hex");
      fs.writeFileSync(this.files.secret, secret, { mode: 0o600 });
      return secret;
    }
  }

  #saveEvents() {
    this.events.sort(compareEvents);
    this.#write(this.files.events, { events: this.events });
  }

  /* ---------- planning ---------- */

  listEvents(from, to) {
    return this.events.filter(e => e.date >= from && e.date <= to);
  }

  createEvent(value) {
    const event = { id: crypto.randomBytes(8).toString("base64url"), ...value };
    this.events.push(event);
    this.#saveEvents();
    return event;
  }

  updateEvent(id, value) {
    const index = this.events.findIndex(e => e.id === id);
    if (index === -1) return null;
    this.events[index] = { id, ...value };
    this.#saveEvents();
    return this.events[index];
  }

  deleteEvent(id) {
    const before = this.events.length;
    this.events = this.events.filter(e => e.id !== id);
    if (this.events.length === before) return false;
    this.#saveEvents();
    return true;
  }

  /**
   * Recopie tous les lives d'une semaine sur la semaine suivante.
   * Un live identique (même jour, même heure, même titre) n'est pas dupliqué.
   */
  copyWeek(anyDayOfWeek) {
    const monday = mondayOf(anyDayOfWeek);
    const source = this.listEvents(monday, addDays(monday, 6));
    const key = e => `${e.date}|${e.start}|${e.title.toLowerCase()}`;
    const existing = new Set(this.events.map(key));

    const created = [];
    for (const { id, ...event } of source) {
      const copy = { ...event, date: addDays(event.date, 7), guests: event.guests.map(g => ({ ...g })) };
      if (existing.has(key(copy))) continue;
      created.push({ id: crypto.randomBytes(8).toString("base64url"), ...copy });
    }

    if (created.length) {
      this.events.push(...created);
      this.#saveEvents();
    }
    return { created: created.length, skipped: source.length - created.length };
  }

  /* ---------- profil ---------- */

  updateSettings(value) {
    this.settings = { ...this.settings, ...value };
    this.#write(this.files.settings, this.settings);
    return this.settings;
  }

  setAvatar(buffer) {
    const type = sniffImageType(buffer);
    if (!type || !AVATAR_TYPES.has(type)) return null;
    this.#write(this.files.avatar, buffer);
    return this.updateSettings({ avatar: { type, version: Date.now() } });
  }

  removeAvatar() {
    fs.rmSync(this.files.avatar, { force: true });
    return this.updateSettings({ avatar: null });
  }
}
