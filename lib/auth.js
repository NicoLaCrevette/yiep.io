/**
 * Authentification de l'admin : un seul mot de passe (ADMIN_PASSWORD) et une
 * session portée par un cookie signé (HttpOnly, SameSite=Strict).
 *
 * La clé de signature combine un secret aléatoire stocké dans le dossier de
 * données et le mot de passe : changer le mot de passe déconnecte toutes les
 * sessions, et un cookie volé ne permet pas de retrouver le mot de passe.
 */
import crypto from "node:crypto";

export const COOKIE_NAME = "yiep_admin";
const SESSION_DAYS = 30;
const MAX_FAILURES = 10;
const LOCK_MS = 15 * 60 * 1000;

const sha256 = value => crypto.createHash("sha256").update(String(value)).digest();
const sign = (key, payload) => crypto.createHmac("sha256", key).update(payload).digest("base64url");

function parseCookies(header = "") {
  const cookies = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    try {
      cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      // cookie mal encodé : ignoré
    }
  }
  return cookies;
}

export function createAuth({ password, secret }) {
  const enabled = typeof password === "string" && password.length > 0;
  const key = enabled ? crypto.createHash("sha256").update(`${secret}\0${password}`).digest() : null;
  const failures = new Map(); // ip -> { count, first }

  function isLocked(ip) {
    const entry = failures.get(ip);
    if (!entry) return false;
    if (Date.now() - entry.first > LOCK_MS) {
      failures.delete(ip);
      return false;
    }
    return entry.count >= MAX_FAILURES;
  }

  function recordFailure(ip) {
    const now = Date.now();
    // Ménage pour que la table ne grossisse pas indéfiniment.
    if (failures.size > 5000) {
      for (const [k, v] of failures) if (now - v.first > LOCK_MS) failures.delete(k);
    }
    const entry = failures.get(ip);
    if (!entry || now - entry.first > LOCK_MS) failures.set(ip, { count: 1, first: now });
    else entry.count++;
  }

  function issueToken() {
    const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_DAYS * 86_400_000 })).toString("base64url");
    return `${payload}.${sign(key, payload)}`;
  }

  function isValidToken(token) {
    if (!enabled || typeof token !== "string") return false;
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return false;
    const expected = Buffer.from(sign(key, payload));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return false;
    try {
      return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now();
    } catch {
      return false;
    }
  }

  const isAuthenticated = req => isValidToken(parseCookies(req.headers.cookie)[COOKIE_NAME]);

  function cookieOptions(req, maxAgeSeconds) {
    return [
      `Path=/`,
      `HttpOnly`,
      `SameSite=Strict`,
      `Max-Age=${maxAgeSeconds}`,
      req.secure ? "Secure" : ""
    ].filter(Boolean).join("; ");
  }

  return {
    enabled,
    isAuthenticated,

    /** Middleware : bloque toute requête sans session valide. */
    require(req, res, next) {
      if (!enabled) return res.status(503).json({ error: "Admin désactivée : ADMIN_PASSWORD n'est pas défini sur le serveur." });
      if (!isAuthenticated(req)) return res.status(401).json({ error: "Session expirée, reconnecte-toi." });
      next();
    },

    login(req, res) {
      if (!enabled) return res.status(503).json({ error: "Admin désactivée : ADMIN_PASSWORD n'est pas défini sur le serveur." });
      if (isLocked(req.ip)) return res.status(429).json({ error: "Trop de tentatives. Réessaie dans 15 minutes." });

      const candidate = typeof req.body?.password === "string" ? req.body.password : "";
      if (!crypto.timingSafeEqual(sha256(candidate), sha256(password))) {
        recordFailure(req.ip);
        return res.status(401).json({ error: "Mot de passe incorrect." });
      }

      failures.delete(req.ip);
      res.setHeader("Set-Cookie", `${COOKIE_NAME}=${issueToken()}; ${cookieOptions(req, SESSION_DAYS * 86_400)}`);
      res.status(204).end();
    },

    logout(req, res) {
      res.setHeader("Set-Cookie", `${COOKIE_NAME}=; ${cookieOptions(req, 0)}`);
      res.status(204).end();
    }
  };
}
