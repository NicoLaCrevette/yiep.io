const socket = io("https://yiep-server.up.railway.app"); // Vérifie que c'est la bonne URL

let players = {}; // Stocke tous les joueurs connectés
let player;
let cursors;
let score = 0;
let scoreText;
let coin;

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    physics: {
        default: "arcade"
    },
    scene: { preload, create, update }
};

const game = new Phaser.Game(config);

function preload() {
    this.load.image("player", "assets/player.png"); 
    this.load.image("coin", "assets/coin.png"); 
}

function create() {
    player = this.physics.add.image(400, 300, "player").setScale(0.3);
    coin = this.physics.add.image(randomPosition(800), randomPosition(600), "coin").setScale(0.5);

    cursors = this.input.keyboard.createCursorKeys();

    // Ajouter le score
    scoreText = this.add.text(10, 10, "Score: 0", { fontSize: "20px", fill: "#fff" });

    // Vérifier si le joueur touche la pièce
    this.physics.add.overlap(player, coin, collectCoin, null, this);

    // Écouter les mises à jour des joueurs
    socket.on("updatePlayers", (data) => {
        players = data;
    });
}

function update() {
    let speed = 5;

    if (cursors.left.isDown) player.x -= speed;
    if (cursors.right.isDown) player.x += speed;
    if (cursors.up.isDown) player.y -= speed;
    if (cursors.down.isDown) player.y += speed;

    // Envoyer la position du joueur au serveur
    socket.emit("move", { x: player.x, y: player.y });
}

// Fonction pour récupérer une pièce
function collectCoin() {
    score += 1;
    scoreText.setText("Score: " + score);
    coin.setPosition(randomPosition(800), randomPosition(600)); // Nouvelle position
}

// Fonction pour générer une position aléatoire
function randomPosition(max) {
    return Math.floor(Math.random() * max);
}
