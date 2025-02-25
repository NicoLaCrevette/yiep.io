const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// ✅ Activer CORS pour autoriser les connexions depuis Vercel
app.use(cors({
    origin: "https://yiep-io.vercel.app", // Remplace par ton URL Vercel
    methods: ["GET", "POST"]
}));

const io = new Server(server, {
    cors: {
        origin: "https://yiep-io.vercel.app", // Remplace ici aussi par ton URL Vercel
        methods: ["GET", "POST"]
    }
});

let players = {}; // Stockage des joueurs connectés

// 🎮 Gestion des connexions des joueurs
io.on("connection", (socket) => {
    console.log(`✅ Nouvelle connexion : ${socket.id}`);

    players[socket.id] = { x: Math.random() * 800, y: Math.random() * 600 };
    io.emit("updatePlayers", players);

    // 🎮 Mise à jour des positions des joueurs
    socket.on("move", (data) => {
        if (players[socket.id]) {
            players[socket.id] = data;
            io.emit("updatePlayers", players);
        }
    });

    // 🔴 Déconnexion d'un joueur
    socket.on("disconnect", () => {
        delete players[socket.id];
        io.emit("updatePlayers", players);
        console.log(`❌ Déconnexion : ${socket.id}`);
    });
});

// 🚀 Démarrer le serveur
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎉 Serveur en ligne sur le port ${PORT}`);
});
