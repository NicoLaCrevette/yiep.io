/**
 * Application Express : page publique, admin, API du planning et jeu.
 * Séparée de server.js pour pouvoir être testée sans ouvrir de port fixe.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";

import { Store } from "./lib/store.js";
import { createAuth } from "./lib/auth.js";
import { addDays, isValidDate, daysBetween, mondayOf, zonedNow } from "./public/js/lib/dates.js";
import { ownerTwitch, validateEvent, validateSettings } from "./public/js/lib/model.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAX_RANGE_DAYS = 62;

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

/** Remplace les {{CLÉS}} d'un gabarit HTML (sans interpréter les « $ » du contenu). */
const fill = (template, values) => template.replace(/\{\{(\w+)\}\}/g, (match, key) => values[key] ?? match);

function contentSecurityPolicy(nonce) {
  return [
    "default-src 'self'",
    "script-src 'self'",
    `style-src 'self'${nonce ? ` 'nonce-${nonce}'` : ""}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join("; ");
}

export function createApp({ dataDir, adminPassword, siteUrl = "", trustProxy } = {}) {
  const store = new Store(dataDir ?? path.join(ROOT, "data"));
  const auth = createAuth({ password: adminPassword, secret: store.secret });
  const views = path.join(ROOT, "views");

  const app = express();
  app.disable("x-powered-by");
  if (trustProxy !== undefined) app.set("trust proxy", trustProxy);

  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
    });
    next();
  });

  /* ====================================================================
     Pages
     ==================================================================== */

  const publicSettings = () => {
    const { avatar, ...settings } = store.settings;
    return { ...settings, avatarUrl: avatar ? `/avatar?v=${avatar.version}` : null };
  };

  app.get("/", (req, res) => {
    const settings = store.settings;
    const nonce = crypto.randomBytes(16).toString("base64");
    const origin = siteUrl || `${req.protocol}://${req.get("host")}`;
    const description = settings.bio || `Planning des lives et réseaux de ${settings.displayName}.`;
    const today = zonedNow().date;
    const monday = mondayOf(today);

    const head = [
      `<title>${escapeHtml(settings.displayName)} — Twitch, planning & réseaux</title>`,
      `<meta name="description" content="${escapeHtml(description)}">`,
      `<link rel="canonical" href="${escapeHtml(`${origin}/`)}">`,
      `<meta property="og:type" content="profile">`,
      `<meta property="og:site_name" content="${escapeHtml(settings.displayName)}">`,
      `<meta property="og:title" content="${escapeHtml(settings.displayName)}">`,
      `<meta property="og:description" content="${escapeHtml(description)}">`,
      `<meta property="og:url" content="${escapeHtml(`${origin}/`)}">`,
      settings.avatar ? `<meta property="og:image" content="${escapeHtml(`${origin}/avatar?v=${settings.avatar.version}`)}">` : "",
      `<meta name="twitter:card" content="summary">`
    ].filter(Boolean).join("\n");

    // Données initiales injectées dans la page : affichage immédiat, sans requête supplémentaire.
    const data = JSON.stringify({
      settings: publicSettings(),
      today,
      // La veille du lundi est incluse : un live du dimanche soir peut déborder après minuit.
      events: store.listEvents(addDays(monday, -1), addDays(monday, 13)),
      loaded: { from: monday, to: addDays(monday, 13) }
    }).replace(/</g, "\\u003c");

    const html = fill(fs.readFileSync(path.join(views, "index.html"), "utf8"), {
      HEAD: head,
      NONCE: nonce,
      ACCENT: settings.accent,
      DATA: data
    });

    res.set({ "Content-Security-Policy": contentSecurityPolicy(nonce), "Cache-Control": "no-cache" });
    res.type("html").send(html);
  });

  app.get("/admin", (req, res) => {
    res.set({
      "Content-Security-Policy": contentSecurityPolicy(),
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow"
    });
    res.sendFile(path.join(views, "admin.html"));
  });

  // Anciennes adresses du site, pour ne casser aucun lien déjà partagé.
  app.get(["/links", "/links/", "/links/index.html"], (req, res) => res.redirect(301, "/"));
  app.get("/links/admin.html", (req, res) => res.redirect(301, "/admin"));

  app.get("/avatar", (req, res) => {
    const avatar = store.settings.avatar;
    if (!avatar) return res.status(404).end();
    const immutable = req.query.v === String(avatar.version);
    res.set({
      "Content-Type": avatar.type,
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache"
    });
    res.sendFile(store.files.avatar);
  });

  app.use(express.static(path.join(ROOT, "public"), { index: false }));

  // Le jeu multijoueur (Phaser + Socket.IO) d'origine.
  app.use("/jeu", express.static(path.join(ROOT, "game")));

  /* ====================================================================
     API
     ==================================================================== */

  const api = express.Router();
  api.use((req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" });
    next();
  });

  // Protection CSRF : en plus du cookie SameSite=Strict, toute écriture doit venir du site lui-même.
  api.use((req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD") return next();
    const origin = req.get("origin");
    if (origin) {
      let host;
      try { host = new URL(origin).host; } catch { host = null; }
      if (host !== req.get("host")) return res.status(403).json({ error: "Origine refusée." });
    }
    next();
  });

  const json = express.json({ limit: "32kb" });

  /* ---------- session ---------- */

  api.get("/session", (req, res) => {
    res.json({ enabled: auth.enabled, authenticated: auth.isAuthenticated(req) });
  });
  api.post("/login", json, auth.login);
  api.post("/logout", auth.logout);

  /* ---------- planning (lecture publique) ---------- */

  api.get("/events", (req, res) => {
    const { from, to } = req.query;
    if (!isValidDate(from) || !isValidDate(to)) return res.status(400).json({ error: "Paramètres from et to attendus (YYYY-MM-DD)." });
    const span = daysBetween(from, to);
    if (span < 0 || span > MAX_RANGE_DAYS) return res.status(400).json({ error: `Période invalide (${MAX_RANGE_DAYS} jours maximum).` });
    res.json({ events: store.listEvents(from, to) });
  });

  /* ---------- planning (écriture admin) ---------- */

  api.post("/events", auth.require, json, (req, res) => {
    const { value, error } = validateEvent(req.body);
    if (error) return res.status(400).json({ error });
    res.status(201).json({ event: store.createEvent(value) });
  });

  api.put("/events/:id", auth.require, json, (req, res) => {
    const { value, error } = validateEvent(req.body);
    if (error) return res.status(400).json({ error });
    const event = store.updateEvent(req.params.id, value);
    if (!event) return res.status(404).json({ error: "Ce live n'existe plus." });
    res.json({ event });
  });

  api.delete("/events/:id", auth.require, (req, res) => {
    if (!store.deleteEvent(req.params.id)) return res.status(404).json({ error: "Ce live n'existe plus." });
    res.status(204).end();
  });

  api.post("/events/copy-week", auth.require, json, (req, res) => {
    if (!isValidDate(req.body?.week)) return res.status(400).json({ error: "Semaine invalide." });
    res.json(store.copyWeek(req.body.week));
  });

  /* ---------- profil ---------- */

  api.get("/settings", (req, res) => res.json({ settings: publicSettings() }));

  api.put("/settings", auth.require, json, (req, res) => {
    const { value, error } = validateSettings(req.body);
    if (error) return res.status(400).json({ error });
    store.updateSettings(value);
    res.json({ settings: publicSettings() });
  });

  api.put(
    "/avatar",
    auth.require,
    express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "2mb" }),
    (req, res) => {
      if (!Buffer.isBuffer(req.body) || !store.setAvatar(req.body)) {
        return res.status(400).json({ error: "Image invalide (PNG, JPEG ou WebP, 2 Mo max)." });
      }
      res.json({ settings: publicSettings() });
    }
  );

  api.delete("/avatar", auth.require, (req, res) => {
    store.removeAvatar();
    res.json({ settings: publicSettings() });
  });

  api.use((req, res) => res.status(404).json({ error: "Route inconnue." }));

  // Erreurs de parsing (JSON mal formé, corps trop gros…) renvoyées proprement.
  api.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status ?? err.statusCode ?? 500;
    if (status >= 500) console.error(err);
    const message = status === 413 ? "Fichier ou requête trop volumineux."
      : status === 400 ? "Requête invalide."
      : status < 500 ? err.message
      : "Erreur interne du serveur.";
    res.status(status).json({ error: message });
  });

  app.use("/api", api);

  return { app, store, auth };
}
