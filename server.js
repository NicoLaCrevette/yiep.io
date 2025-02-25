const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// ✅ Activer CORS pour autoriser les connexions depuis Vercel
app.use(cors({
    origin: "https://yiep-io.vercel.app", 
    methods: ["GET", "POST"]
}));

const io = new Server(server, {
    cors: {
        origin: "https://yiep-io.vercel.app",
        methods: ["GET", "POST"]
    }
});

let players = {}; 

io.on("connection", (socket) => {
    console.log(`✅ Nouvelle connexion : ${socket.id}`);

    // Initialisation du joueur avec 10 pièces et un pseudo par défaut
    players[socket.id] = { 
        x: Math.random() * 800, 
        y: Math.random() * 600,
        score: 10,
        pseudo: "Joueur" 
    };
    io.emit("updatePlayers", players);
    updateLeaderboard();

    // Mise à jour de la position du joueur
    socket.on("move", (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            io.emit("updatePlayers", players);
        }
    });

    // Mise à jour du pseudo
    socket.on("setPseudo", (pseudo) => {
        if (players[socket.id]) {
            players[socket.id].pseudo = pseudo;
            io.emit("updatePlayers", players);
            updateLeaderboard();
        }
    });

    // Gestion des attaques avec le dash
    socket.on("dashHit", (targetId) => {
        if (players[targetId] && players[socket.id]) {
            let attacker = players[socket.id];
            let target = players[targetId];

            if (target.score > 0) {
                target.score = Math.max(0, target.score - 3);
                attacker.score += 3;

                io.to(targetId).emit("playerHit", socket.id);
                io.to(socket.id).emit("playerHit", socket.id);

                console.log(`⚔️ ${socket.id} a volé 3 pièces à ${targetId}`);

                if (target.score === 0) {
                    io.to(targetId).emit("eliminated");
                    console.log(`💀 ${targetId} est éliminé et recommence.`);
                    target.score = 10;
                }

                updateLeaderboard();
            }
        }
    });

    // Déconnexion d'un joueur
    socket.on("disconnect", () => {
        delete players[socket.id];
        io.emit("updatePlayers", players);
        updateLeaderboard();
        console.log(`❌ Déconnexion : ${socket.id}`);
    });
});

// 🎯 Fonction pour mettre à jour le classement
function updateLeaderboard() {
    let leaderboard = Object.values(players)
        .sort((a, b) => b.score - a.score) 
        .slice(0, 5); // Top 5 joueurs

    io.emit("updateLeaderboard", leaderboard);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎉 Serveur en ligne sur le port ${PORT}`);
});
