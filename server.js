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

let players = {}; 

io.on("connection", (socket) => {
    console.log(`✅ Nouvelle connexion : ${socket.id}`);

    // Initialisation du joueur avec 10 pièces
    players[socket.id] = { 
        x: Math.random() * 800, 
        y: Math.random() * 600,
        score: 10 // Départ avec 10 pièces
    };
    io.emit("updatePlayers", players);

    // Mise à jour de la position d'un joueur
    socket.on("move", (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            io.emit("updatePlayers", players);
        }
    });

    // Gestion des attaques avec le dash
    socket.on("dashHit", (targetId) => {
        if (players[targetId] && players[socket.id]) {
            let attacker = players[socket.id];
            let target = players[targetId];

            if (target.score > 0) {
                target.score = Math.max(0, target.score - 3); // Perd 3 pièces
                attacker.score += 3; // Gagne 3 pièces

                io.to(targetId).emit("playerHit", socket.id);
                io.to(socket.id).emit("playerHit", socket.id);

                console.log(`⚔️ ${socket.id} a volé 3 pièces à ${targetId}`);

                // Vérifie si la cible est éliminée
                if (target.score === 0) {
                    io.to(targetId).emit("eliminated");
                    console.log(`💀 ${targetId} est éliminé et recommence.`);
                    target.score = 10; // Réinitialisation
                }
            }
        }
    });

    // Déconnexion d'un joueur
    socket.on("disconnect", () => {
        delete players[socket.id];
        io.emit("updatePlayers", players);
        console.log(`❌ Déconnexion : ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎉 Serveur en ligne sur le port ${PORT}`);
});
