import { test } from "node:test";
import assert from "node:assert/strict";

import {
  addDays, eventSpan, formatDelay, formatWeekRange, isValidDate, mondayOf, wallMinutes, zonedNow
} from "../public/js/lib/dates.js";
import { linkSubtitle, normalizeTwitch, normalizeUrl, validateEvent, validateSettings } from "../public/js/lib/model.js";

test("dates : validation et calculs de semaine", () => {
  assert.equal(isValidDate("2026-02-29"), false);
  assert.equal(isValidDate("2028-02-29"), true);
  assert.equal(isValidDate("2026-13-01"), false);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(mondayOf("2026-10-18"), "2026-10-12"); // dimanche → lundi précédent
  assert.equal(mondayOf("2026-10-12"), "2026-10-12");
});

test("dates : heure de Paris, été comme hiver", () => {
  // 30 juin 2026 à 19:30 UTC = 21:30 à Paris (UTC+2)
  assert.deepEqual(zonedNow(new Date("2026-06-30T19:30:00Z")), { date: "2026-06-30", minutes: 21 * 60 + 30 });
  // 15 janvier 2026 à 23:30 UTC = 00:30 le 16 à Paris (UTC+1)
  assert.deepEqual(zonedNow(new Date("2026-01-15T23:30:00Z")), { date: "2026-01-16", minutes: 30 });
});

test("dates : un live qui passe minuit finit le lendemain", () => {
  const span = eventSpan({ date: "2026-10-16", start: "21:00", end: "00:30" });
  assert.equal(span.end - span.start, 210);
  assert.equal(span.end, wallMinutes("2026-10-17", "00:30"));
});

test("dates : libellés", () => {
  assert.equal(formatWeekRange("2026-10-12"), "12 – 18 octobre");
  assert.equal(formatWeekRange("2026-09-28"), "28 sept. – 4 oct.");
  assert.equal(formatWeekRange("2026-12-28"), "28 déc. 2026 – 3 janv. 2027");
  assert.equal(formatDelay(20, 0), "dans 20 min");
  assert.equal(formatDelay(150, 1), "dans 2 h"); // 23h → 1h30 : pas « demain »
  assert.equal(formatDelay(20 * 60, 1), "demain");
  assert.equal(formatDelay(50 * 60, 3), "dans 3 jours");
});

test("normalizeTwitch accepte pseudo, @pseudo et liens", () => {
  assert.equal(normalizeTwitch("Gotaga"), "gotaga");
  assert.equal(normalizeTwitch("@Gotaga"), "gotaga");
  assert.equal(normalizeTwitch("https://www.twitch.tv/Gotaga?sr=a"), "gotaga");
  assert.equal(normalizeTwitch("twitch.tv/nicooow__/videos"), "nicooow__");
  assert.equal(normalizeTwitch("pas un pseudo"), null);
  assert.equal(normalizeTwitch("https://youtube.com/@x"), null);
});

test("normalizeUrl refuse tout sauf https", () => {
  assert.equal(normalizeUrl("x.com/_Nicooow_"), "https://x.com/_Nicooow_");
  assert.equal(normalizeUrl(""), "");
  assert.equal(normalizeUrl("javascript:alert(1)"), null);
  assert.equal(normalizeUrl("http://x.com/a"), null);
});

test("validateEvent nettoie et contrôle les champs", () => {
  const { value } = validateEvent({
    date: "2026-10-20", start: "21:00", end: "00:00",
    title: "  Soirée   Valorant ", game: "",
    guests: [
      { name: "", twitch: "https://twitch.tv/Gotaga" },
      { name: "Sans twitch", twitch: "" },
      { name: "", twitch: "" }, // ligne vide ignorée
      { name: "Gotaga bis", twitch: "@gotaga" } // doublon ignoré
    ]
  });
  assert.equal(value.title, "Soirée Valorant");
  assert.deepEqual(value.guests, [
    { name: "gotaga", twitch: "gotaga" },
    { name: "Sans twitch", twitch: "" }
  ]);

  assert.match(validateEvent({ date: "2026-10-20", start: "21:00", end: "21:00", title: "x" }).error, /fin/);
  assert.match(validateEvent({ date: "2026-10-20", start: "21:00", end: "23:00", title: " " }).error, /titre/i);
  assert.match(validateEvent({ date: "2026-10-20", start: "25:00", end: "23:00", title: "x" }).error, /Horaire/);
  assert.match(validateEvent({
    date: "2026-10-20", start: "21:00", end: "23:00", title: "x", guests: [{ name: "a", twitch: "pas valide !" }]
  }).error, /Twitch invalide/);
});

test("validateSettings contrôle les liens et la couleur", () => {
  const ok = validateSettings({ displayName: "Nico", bio: "", accent: "#ABCDEF", links: { twitch: "twitch.tv/nicooow__" } });
  assert.equal(ok.value.accent, "#abcdef");
  assert.equal(ok.value.links.twitch, "https://twitch.tv/nicooow__");
  assert.equal(ok.value.links.discord, "");

  assert.match(validateSettings({ displayName: "", links: {} }).error, /nom/i);
  assert.match(validateSettings({ displayName: "a", links: { x: "javascript:alert(1)" } }).error, /X/);
  assert.equal(validateSettings({ displayName: "a", accent: "red", links: {} }).value.accent, "#9146ff");
});

test("linkSubtitle affiche un texte lisible", () => {
  assert.equal(linkSubtitle("twitch", "https://www.twitch.tv/nicooow__"), "twitch.tv/nicooow__");
  assert.equal(linkSubtitle("x", "https://x.com/_Nicooow_"), "@_Nicooow_");
  assert.equal(linkSubtitle("instagram", "https://www.instagram.com/nicoow01/"), "@nicoow01");
  assert.equal(linkSubtitle("discord", "https://discord.gg/abc"), "Rejoins la communauté");
});
