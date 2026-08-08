const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static("public"));

// Site vitrine (Twitch + réseaux sociaux) -> http://localhost:3000/links
app.use("/links", express.static("site"));

/* ============================================================================
   API PLANNING — utilisée par la page admin (/links/admin.html)
   ----------------------------------------------------------------------------
   Le mot de passe se définit par variable d'environnement :
       ADMIN_PASSWORD="ton-mot-de-passe" npm run dev
   Sans cette variable, l'écriture est refusée (le planning reste modifiable
   à la main dans site/schedule.json).
   ============================================================================ */
const SCHEDULE_FILE = path.join(__dirname, "site", "schedule.json");
const MAX_SLOTS = 60;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const sha256 = value => crypto.createHash("sha256").update(String(value)).digest();

// Anti-force brute : 10 échecs par IP, réinitialisés au bout de 15 minutes.
const failures = new Map();
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

function throttled(ip) {
    const entry = failures.get(ip);
    if (!entry) return false;
    if (Date.now() - entry.first > LOCK_MS) {
        failures.delete(ip);
        return false;
    }
    return entry.count >= MAX_FAILURES;
}

function recordFailure(ip) {
    const entry = failures.get(ip);
    if (!entry || Date.now() - entry.first > LOCK_MS) {
        failures.set(ip, { count: 1, first: Date.now() });
    } else {
        entry.count++;
    }
}

// 503 = pas de mot de passe configuré, 429 = trop d'échecs, 401 = mauvais mot de passe
function authorize(req, res) {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) {
        res.status(503).json({ error: "ADMIN_PASSWORD n'est pas défini côté serveur." });
        return false;
    }
    if (throttled(req.ip)) {
        res.status(429).json({ error: "Trop de tentatives. Réessaie dans quelques minutes." });
        return false;
    }
    const provided = req.get("x-admin-password") || "";
    if (!crypto.timingSafeEqual(sha256(provided), sha256(expected))) {
        recordFailure(req.ip);
        res.status(401).json({ error: "Mot de passe incorrect." });
        return false;
    }
    failures.delete(req.ip);
    return true;
}

// Renvoie un message d'erreur, ou null si tout est valide.
function validateSlots(slots) {
    if (!Array.isArray(slots)) return "Format invalide : « slots » doit être une liste.";
    if (slots.length > MAX_SLOTS) return `Trop de créneaux (maximum ${MAX_SLOTS}).`;

    for (const slot of slots) {
        if (!slot || typeof slot !== "object") return "Créneau invalide.";
        if (!Number.isInteger(slot.day) || slot.day < 0 || slot.day > 6) {
            return "Jour invalide (attendu : entier de 0 à 6).";
        }
        if (!TIME_RE.test(slot.start) || !TIME_RE.test(slot.end)) {
            return "Horaire invalide (format attendu : HH:MM).";
        }
        if (slot.start === slot.end) {
            return `Début et fin identiques (${slot.start}).`;
        }
        if (slot.game != null && (typeof slot.game !== "string" || slot.game.length > 60)) {
            return "Le champ « jeu » doit faire 60 caractères maximum.";
        }
        if (slot.id != null && (typeof slot.id !== "string" || slot.id.length > 32)) {
            return "Identifiant de créneau invalide.";
        }
    }
    return null;
}

// Vérification du mot de passe depuis l'écran de connexion.
app.post("/api/schedule/check", (req, res) => {
    if (!authorize(req, res)) return;
    res.json({ ok: true });
});

app.put("/api/schedule", express.json({ limit: "32kb" }), (req, res) => {
    if (!authorize(req, res)) return;

    const slots = req.body && req.body.slots;
    const error = validateSlots(slots);
    if (error) return res.status(400).json({ error });

    // On ne garde que les champs attendus : rien d'autre n'atteint le disque.
    const clean = slots.map((slot, index) => ({
        id: typeof slot.id === "string" && slot.id ? slot.id : `s${index + 1}`,
        day: slot.day,
        start: slot.start,
        end: slot.end,
        game: typeof slot.game === "string" ? slot.game.trim() : ""
    }));

    // Écriture atomique : fichier temporaire puis renommage.
    const tmp = `${SCHEDULE_FILE}.${process.pid}.tmp`;
    try {
        fs.writeFileSync(tmp, JSON.stringify({ slots: clean }, null, 2) + "\n");
        fs.renameSync(tmp, SCHEDULE_FILE);
    } catch (err) {
        fs.rmSync(tmp, { force: true });
        console.error("Écriture du planning impossible :", err);
        return res.status(500).json({ error: "Impossible d'écrire schedule.json sur le serveur." });
    }

    console.log(`Planning mis à jour (${clean.length} créneaux).`);
    res.json({ ok: true, count: clean.length });
});

let players = {}; // Liste des joueurs connectés

io.on("connection", (socket) => {
    console.log(`Un joueur s'est connecté : ${socket.id}`);

    // Ajouter le joueur avec une position aléatoire
    players[socket.id] = {
        x: Math.random() * 8000,
        y: Math.random() * 6000
    };

    console.log("Liste actuelle des joueurs :", players);

    // ✅ Envoyer la liste complète des joueurs AU NOUVEAU JOUEUR
    socket.emit("currentPlayers", players);

    // ✅ Informer TOUS les autres joueurs qu’un NOUVEAU joueur est arrivé
    socket.broadcast.emit("newPlayer", { id: socket.id, x: players[socket.id].x, y: players[socket.id].y });

    // ✅ Mise à jour des positions des joueurs
    socket.on("playerMovement", (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            io.emit("playerMoved", { id: socket.id, x: movementData.x, y: movementData.y });
        }
    });

    // ✅ Déconnexion du joueur
    socket.on("disconnect", () => {
        console.log(`Un joueur s'est déconnecté : ${socket.id}`);
        delete players[socket.id];
        io.emit("playerDisconnected", socket.id);
    });
});

server.listen(3000, () => {
    console.log("Serveur démarré sur http://localhost:3000");
});
