const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
});

let players = {};

io.on("connection", (socket) => {
    console.log("Nouvelle connexion :", socket.id);
    players[socket.id] = { x: Math.random() * 500, y: Math.random() * 500 };
    io.emit("updatePlayers", players);

    socket.on("move", (data) => {
        if (players[socket.id]) {
            players[socket.id] = data;
            io.emit("updatePlayers", players);
        }
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
        io.emit("updatePlayers", players);
        console.log("Déconnexion :", socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serveur en ligne sur le port ${PORT}`));
