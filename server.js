const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static("public"));

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
