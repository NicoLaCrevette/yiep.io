const socket = io("https://yiep-server.up.railway.app");

let players = {};

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    scene: { preload, create, update }
};

const game = new Phaser.Game(config);
let player;

function preload() {
    this.load.image("player", "assets/player.png");
}

function create() {
    player = this.add.image(400, 300, "player");

    socket.on("updatePlayers", (data) => {
        players = data;
    });

    this.input.keyboard.on("keydown", (event) => {
        let speed = 5;
        if (event.key === "ArrowUp") player.y -= speed;
        if (event.key === "ArrowDown") player.y += speed;
        if (event.key === "ArrowLeft") player.x -= speed;
        if (event.key === "ArrowRight") player.x += speed;

        socket.emit("move", { x: player.x, y: player.y });
    });
}

function update() {
    for (let id in players) {
        if (id !== socket.id) {
            // Afficher les autres joueurs
        }
    }
}
