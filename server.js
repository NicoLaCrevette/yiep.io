import http from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app.js";

// Charge le fichier .env s'il existe (Node ≥ 20.12). Sinon, les variables
// d'environnement classiques suffisent.
try {
  process.loadEnvFile();
} catch {
  // pas de .env : rien à faire
}

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

// Derrière un hébergeur (Render, Railway, Nginx…), TRUST_PROXY=1 permet de
// connaître la vraie IP des visiteurs et de détecter le HTTPS.
const trustProxy = process.env.TRUST_PROXY
  ? (/^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY)
  : undefined;

const { app } = createApp({
  dataDir: process.env.DATA_DIR || undefined,
  adminPassword: ADMIN_PASSWORD,
  siteUrl: (process.env.SITE_URL || "").replace(/\/+$/, ""),
  trustProxy
});

const server = http.createServer(app);

/* ============================================================================
   Jeu multijoueur (/jeu) — synchronisation des joueurs via Socket.IO
   ============================================================================ */
const io = new Server(server);
const players = {};

io.on("connection", socket => {
  players[socket.id] = { x: Math.random() * 8000, y: Math.random() * 6000 };

  socket.emit("currentPlayers", players);
  socket.broadcast.emit("newPlayer", { id: socket.id, ...players[socket.id] });

  socket.on("playerMovement", movement => {
    const player = players[socket.id];
    if (!player || !Number.isFinite(movement?.x) || !Number.isFinite(movement?.y)) return;
    player.x = movement.x;
    player.y = movement.y;
    io.emit("playerMoved", { id: socket.id, x: player.x, y: player.y });
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("playerDisconnected", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Site    → http://localhost:${PORT}`);
  console.log(`Admin   → http://localhost:${PORT}/admin`);
  console.log(`Jeu     → http://localhost:${PORT}/jeu`);

  if (!ADMIN_PASSWORD) {
    console.warn("⚠  ADMIN_PASSWORD n'est pas défini : l'admin est désactivée. Voir README.md.");
  } else if (ADMIN_PASSWORD.length < 10) {
    console.warn("⚠  ADMIN_PASSWORD est court : utilise au moins 10 caractères.");
  }
});
