import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createApp } from "../app.js";
import { Store } from "../lib/store.js";

const PASSWORD = "mot-de-passe-de-test";
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "yiep-test-"));

let server;
let base;
let cookie = "";

const EVENT = {
  date: "2026-10-20",
  start: "21:00",
  end: "00:00",
  title: "Soirée Valorant",
  game: "Valorant",
  guests: [{ name: "Gotaga", twitch: "gotaga" }]
};

function request(method, url, { body, headers = {}, auth = true, raw } = {}) {
  const init = { method, headers: { ...headers }, redirect: "manual" };
  if (auth && cookie) init.headers.cookie = cookie;
  if (raw) {
    init.body = raw.body;
    init.headers["content-type"] = raw.type;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers["content-type"] = "application/json";
  }
  return fetch(base + url, init);
}

before(async () => {
  const { app } = createApp({ dataDir, adminPassword: PASSWORD });
  await new Promise(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("la page d'accueil est servie avec ses données et une CSP stricte", async () => {
  const res = await request("GET", "/", { auth: false });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<title>Nicooow — /);
  assert.match(res.headers.get("content-security-policy"), /script-src 'self'; style-src 'self' 'nonce-/);

  const data = JSON.parse(html.match(/<script type="application\/json" id="initial-data">(.*?)<\/script>/s)[1]);
  assert.equal(data.settings.links.twitch, "https://www.twitch.tv/nicooow__");
  assert.ok(Array.isArray(data.events));
});

test("les anciennes adresses redirigent", async () => {
  assert.equal((await request("GET", "/links/", { auth: false })).headers.get("location"), "/");
  assert.equal((await request("GET", "/links/admin.html", { auth: false })).headers.get("location"), "/admin");
});

test("l'admin et le jeu sont servis", async () => {
  const admin = await request("GET", "/admin", { auth: false });
  assert.equal(admin.status, 200);
  assert.equal(admin.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal((await request("GET", "/jeu/", { auth: false })).status, 200);
});

test("connexion : mauvais puis bon mot de passe", async () => {
  let res = await request("POST", "/api/login", { body: { password: "faux" }, auth: false });
  assert.equal(res.status, 401);

  res = await request("POST", "/api/login", { body: { password: PASSWORD }, auth: false });
  assert.equal(res.status, 204);
  const setCookie = res.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  cookie = setCookie.split(";")[0];

  const session = await (await request("GET", "/api/session")).json();
  assert.deepEqual(session, { enabled: true, authenticated: true });
});

test("un cookie falsifié est refusé", async () => {
  const forged = `${cookie.split(".")[0]}.signature-bidon`;
  const res = await fetch(`${base}/api/events`, {
    method: "POST",
    headers: { cookie: forged, "content-type": "application/json" },
    body: JSON.stringify(EVENT)
  });
  assert.equal(res.status, 401);
});

test("écrire sans être connecté est refusé", async () => {
  const res = await request("POST", "/api/events", { body: EVENT, auth: false });
  assert.equal(res.status, 401);
});

test("une requête venant d'un autre site est refusée (CSRF)", async () => {
  const res = await request("POST", "/api/events", { body: EVENT, headers: { origin: "https://evil.example" } });
  assert.equal(res.status, 403);
});

test("cycle complet d'un live : création, lecture, modification, suppression", async () => {
  let res = await request("POST", "/api/events", { body: EVENT });
  assert.equal(res.status, 201);
  const { event } = await res.json();
  assert.ok(event.id);
  assert.deepEqual(event.guests, [{ name: "Gotaga", twitch: "gotaga" }]);

  res = await request("GET", "/api/events?from=2026-10-19&to=2026-10-25", { auth: false });
  assert.deepEqual((await res.json()).events.map(e => e.id), [event.id]);

  res = await request("PUT", `/api/events/${event.id}`, { body: { ...EVENT, title: "Nouveau titre" } });
  assert.equal((await res.json()).event.title, "Nouveau titre");

  res = await request("PUT", `/api/events/${event.id}`, { body: { ...EVENT, start: "99:00" } });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Horaire/);

  assert.equal((await request("DELETE", `/api/events/${event.id}`)).status, 204);
  assert.equal((await request("DELETE", `/api/events/${event.id}`)).status, 404);
});

test("la lecture du planning valide la période demandée", async () => {
  assert.equal((await request("GET", "/api/events?from=2026-10-01&to=2027-10-01", { auth: false })).status, 400);
  assert.equal((await request("GET", "/api/events?from=n'importe&to=quoi", { auth: false })).status, 400);
});

test("copier une semaine ne crée pas de doublons", async () => {
  await request("POST", "/api/events", { body: { ...EVENT, date: "2026-11-02", title: "Lundi" } });
  await request("POST", "/api/events", { body: { ...EVENT, date: "2026-11-06", title: "Vendredi" } });

  let res = await request("POST", "/api/events/copy-week", { body: { week: "2026-11-04" } });
  assert.deepEqual(await res.json(), { created: 2, skipped: 0 });

  res = await request("POST", "/api/events/copy-week", { body: { week: "2026-11-02" } });
  assert.deepEqual(await res.json(), { created: 0, skipped: 2 });

  const { events } = await (await request("GET", "/api/events?from=2026-11-09&to=2026-11-15")).json();
  assert.deepEqual(events.map(e => [e.date, e.title]), [["2026-11-09", "Lundi"], ["2026-11-13", "Vendredi"]]);
});

test("JSON mal formé : erreur 400 propre", async () => {
  const res = await fetch(`${base}/api/events`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: "{pas du json"
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "Requête invalide.");
});

test("profil : mise à jour, liens dangereux refusés, échappement HTML", async () => {
  let res = await request("PUT", "/api/settings", {
    body: { displayName: "Nico</script><b>", bio: "Bio", accent: "#ff4757", links: { twitch: "twitch.tv/nicooow__" } }
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).settings.links.discord, "");

  res = await request("PUT", "/api/settings", { body: { displayName: "Nico", links: { x: "javascript:alert(1)" } } });
  assert.equal(res.status, 400);

  const html = await (await request("GET", "/", { auth: false })).text();
  assert.ok(!html.includes("</script><b>"), "le nom ne doit jamais sortir brut dans la page");
  assert.match(html, /<title>Nico&lt;\/script&gt;&lt;b&gt; —/);
  assert.match(html, /:root\{--accent:#ff4757\}/);
});

test("avatar : seules de vraies images sont acceptées", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );
  let res = await request("PUT", "/api/avatar", { raw: { body: png, type: "image/png" } });
  assert.equal(res.status, 200);
  const { settings } = await res.json();
  assert.match(settings.avatarUrl, /^\/avatar\?v=\d+$/);

  res = await request("GET", settings.avatarUrl, { auth: false });
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.match(res.headers.get("cache-control"), /immutable/);

  res = await request("PUT", "/api/avatar", { raw: { body: Buffer.from("<svg onload=alert(1)>"), type: "image/png" } });
  assert.equal(res.status, 400);

  res = await request("DELETE", "/api/avatar");
  assert.equal((await res.json()).settings.avatarUrl, null);
  assert.equal((await request("GET", "/avatar", { auth: false })).status, 404);
});

test("les données survivent à un redémarrage", () => {
  const reloaded = new Store(dataDir);
  assert.ok(reloaded.events.some(e => e.title === "Vendredi"));
  assert.equal(reloaded.settings.accent, "#ff4757");
});

test("déconnexion puis blocage après 10 essais ratés", async () => {
  assert.equal((await request("POST", "/api/logout")).status, 204);

  for (let i = 0; i < 10; i++) {
    assert.equal((await request("POST", "/api/login", { body: { password: "x" }, auth: false })).status, 401);
  }
  const res = await request("POST", "/api/login", { body: { password: PASSWORD }, auth: false });
  assert.equal(res.status, 429);
});

test("sans ADMIN_PASSWORD, l'admin est désactivée", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yiep-test-"));
  const { app } = createApp({ dataDir: dir, adminPassword: "" });
  const srv = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  const url = `http://127.0.0.1:${srv.address().port}`;
  try {
    const session = await (await fetch(`${url}/api/session`)).json();
    assert.equal(session.enabled, false);
    const res = await fetch(`${url}/api/login`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "" })
    });
    assert.equal(res.status, 503);
  } finally {
    srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
