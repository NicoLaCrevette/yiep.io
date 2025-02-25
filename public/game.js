const socket = io("https://yiep-server.up.railway.app"); 

let players = {}; 
let player;
let cursors;
let score = 10; 
let scoreText;
let pseudo = localStorage.getItem("pseudo") || "Joueur";
let skin = localStorage.getItem("skin") || "skin1";
let pseudoText;
let coins = [];
let isDashing = false;
let dashCooldown = false;
let leaderboardText;

const MAP_WIDTH = 20000;  
const MAP_HEIGHT = 20000; 
const COIN_COUNT = 50;    

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
    player = this.physics.add.image(MAP_WIDTH / 2, MAP_HEIGHT / 2, "player")
        .setScale(0.3) 
        .setSize(150, 150) 
        .setCollideWorldBounds(true);

    // ✅ Ajout du pseudo au-dessus du joueur
    player.pseudoText = this.add.text(player.x, player.y - 50, pseudo, {
        fontSize: "16px",
        fill: "#fff",
        align: "center"
    }).setOrigin(0.5).setDepth(200);

    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.physics.world.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.cameras.main.startFollow(player, true, 0.1, 0.1);

    cursors = this.input.keyboard.createCursorKeys();
    this.input.keyboard.on("keydown-E", dash);

    scoreText = this.add.text(10, 10, "Score: " + score, { fontSize: "20px", fill: "#fff" }).setScrollFactor(0);

    // ✅ Classement affiché à droite
    leaderboardText = this.add.text(600, 10, "🏆 Classement 🏆", {
        fontSize: "18px",
        fill: "#ffcc00"
    }).setScrollFactor(0);

    console.log(`🚀 Joueur généré à : (${player.x}, ${player.y})`);

    for (let i = 0; i < COIN_COUNT; i++) {
        let x = randomPosition(MAP_WIDTH / 2) + MAP_WIDTH / 4;
        let y = randomPosition(MAP_HEIGHT / 2) + MAP_HEIGHT / 4;

        let coin = this.physics.add.image(x, y, "coin")
            .setScale(0.07)  
            .setSize(10, 10) 
            .setDepth(100)
            .setTint(0xffff00);
        coins.push(coin);
        this.physics.add.overlap(player, coin, collectCoin, null, this);
    }

    socket.on("updatePlayers", (data) => {
        players = data;
    });

    socket.on("updateLeaderboard", (leaderboard) => {
        let text = "🏆 Classement 🏆\n";
        leaderboard.forEach((p, index) => {
            text += `${index + 1}. ${p.pseudo} - ${p.score} pts\n`;
        });
        leaderboardText.setText(text);
    });

    socket.on("playerHit", (attackerId) => {
        if (socket.id === attackerId) {
            score += 3;
            scoreText.setText("Score: " + score);
        } else {
            score = Math.max(0, score - 3);
            scoreText.setText("Score: " + score);
            if (score === 0) {
                eliminatePlayer();
            }
        }
    });

    socket.on("eliminated", () => {
        eliminatePlayer();
    });

    socket.emit("setPseudo", pseudo);
}

function update() {
    let speed = isDashing ? 15 : 7;

    if (cursors.left.isDown) player.x -= speed;
    if (cursors.right.isDown) player.x += speed;
    if (cursors.up.isDown) player.y -= speed;
    if (cursors.down.isDown) player.y += speed;

    // ✅ Mettre à jour la position du pseudo au-dessus du joueur
    player.pseudoText.setPosition(player.x, player.y - 50);

    // ✅ Envoyer les coordonnées du joueur au serveur
    socket.emit("move", { x: player.x, y: player.y });
}

// 🎯 Fonction pour faire un dash
function dash() {
    if (dashCooldown) return;

    isDashing = true;
    dashCooldown = true;
    setTimeout(() => {
        isDashing = false;
    }, 500);

    setTimeout(() => {
        dashCooldown = false;
    }, 2000);
}

// 🎯 Fonction pour récupérer une pièce
function collectCoin(player, coin) {
    score += 1;
    scoreText.setText("Score: " + score);
    coin.setPosition(randomPosition(MAP_WIDTH / 2) + MAP_WIDTH / 4, randomPosition(MAP_HEIGHT / 2) + MAP_HEIGHT / 4);
}

// 🎯 Fonction pour gérer l'élimination et réinitialisation du joueur
function eliminatePlayer() {
    alert("💀 Tu as perdu toutes tes pièces ! Recommence !");
    score = 10; 
    scoreText.setText("Score: " + score);
    player.setPosition(MAP_WIDTH / 2, MAP_HEIGHT / 2);
}

// 🎯 Fonction pour générer une position aléatoire
function randomPosition(max) {
    return Math.floor(Math.random() * max);
}
