const socket = io("https://yiep-server.up.railway.app"); // Vérifie que c'est bien ton URL

let players = {}; // Stocke tous les joueurs connectés
let player;
let cursors;
let score = 0;
let scoreText;
let coins = [];

const MAP_WIDTH = 20000;  // Taille de la carte
const MAP_HEIGHT = 20000; 
const COIN_COUNT = 50;    // Nombre de pièces

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
    // Création du joueur au centre de la map
    player = this.physics.add.image(MAP_WIDTH / 2, MAP_HEIGHT / 2, "player").setScale(0.3);
    player.setCollideWorldBounds(true);

    // Définir la caméra qui suit le joueur
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.physics.world.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.cameras.main.startFollow(player, true, 0.1, 0.1);

    cursors = this.input.keyboard.createCursorKeys();

    // Score en haut de l'écran
    scoreText = this.add.text(10, 10, "Score: 0", { fontSize: "20px", fill: "#fff" }).setScrollFactor(0);

    console.log(`🚀 Joueur généré à : (${player.x}, ${player.y})`);

    // Générer plusieurs pièces
    for (let i = 0; i < COIN_COUNT; i++) {
        let x = randomPosition(MAP_WIDTH / 2) + MAP_WIDTH / 4;
        let y = randomPosition(MAP_HEIGHT / 2) + MAP_HEIGHT / 4;
        
        console.log(`💰 Pièce générée à : (${x}, ${y})`);
        
        let coin = this.physics.add.image(x, y, "coin")
            .setScale(2)  // Agrandir pour mieux voir
            .setDepth(100)  // Toujours au-dessus du joueur
            .setTint(0xffff00); // Ajoute une couleur jaune
        coins.push(coin);
        this.physics.add.overlap(player, coin, collectCoin, null, this);
    }

    socket.on("updatePlayers", (data) => {
        players = data;
    });
}

function update() {
    let speed = 7; // Vitesse du joueur

    if (cursors.left.isDown) player.x -= speed;
    if (cursors.right.isDown) player.x += speed;
    if (cursors.up.isDown) player.y -= speed;
    if (cursors.down.isDown) player.y += speed;

    // Envoyer la position du joueur au serveur
    socket.emit("move", { x: player.x, y: player.y });
}

// Fonction pour récupérer une pièce
function collectCoin(player, coin) {
    score += 1;
    scoreText.setText("Score: " + score);
    coin.setPosition(randomPosition(MAP_WIDTH / 2) + MAP_WIDTH / 4, randomPosition(MAP_HEIGHT / 2) + MAP_HEIGHT / 4); // Nouvelle position aléatoire
}

// Fonction pour générer une position aléatoire
function randomPosition(max) {
    return Math.floor(Math.random() * max);
}
