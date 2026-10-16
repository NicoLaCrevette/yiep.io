const socket = io();

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: "#87CEEB",
    physics: {
        default: "arcade",
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

let cursors, keys;
let otherPlayers = {}; // Stocke les autres joueurs

function preload() {
    this.load.image("player", "assets/sprite.png");
    this.load.image("background", "assets/background.png");
}

function create() {
    this.physics.world.setBounds(0, 0, 8000, 6000);
    this.background = this.add.tileSprite(0, 0, 8000, 6000, "background").setOrigin(0, 0);

    this.playersGroup = this.add.group();

    // ✅ Ajouter le joueur principal
    this.player = this.physics.add.sprite(4000, 3000, "player").setScale(0.2);
    this.player.setCollideWorldBounds(true);
    this.cameras.main.setBounds(0, 0, 8000, 6000);
    this.cameras.main.startFollow(this.player);

    // ✅ Activer les touches
    cursors = this.input.keyboard.createCursorKeys();
    keys = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.Z,
        left: Phaser.Input.Keyboard.KeyCodes.Q,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        right: Phaser.Input.Keyboard.KeyCodes.D
    });

    // ✅ RECEVOIR LA LISTE DES JOUEURS PRÉSENTS
    socket.on("currentPlayers", (players) => {
        console.log("🔹 Joueurs reçus du serveur :", players);
        Object.keys(players).forEach((id) => {
            if (id !== socket.id && !otherPlayers[id]) {
                addOtherPlayer(this, id, players[id]);
            }
        });
    });

    // ✅ QUAND UN NOUVEAU JOUEUR SE CONNECTE
    socket.on("newPlayer", (playerInfo) => {
        console.log("🟢 Nouveau joueur reçu :", playerInfo);
        if (!otherPlayers[playerInfo.id]) {
            addOtherPlayer(this, playerInfo.id, playerInfo);
        }
    });

    // ✅ QUAND UN JOUEUR SE DÉPLACE
    socket.on("playerMoved", (playerInfo) => {
        if (otherPlayers[playerInfo.id]) {
            otherPlayers[playerInfo.id].setPosition(playerInfo.x, playerInfo.y);
        }
    });

    // ✅ QUAND UN JOUEUR QUITTE
    socket.on("playerDisconnected", (id) => {
        console.log("🔴 Joueur déconnecté :", id);
        if (otherPlayers[id]) {
            otherPlayers[id].destroy();
            delete otherPlayers[id];
        }
    });
}

// ✅ Fonction pour ajouter un autre joueur à l’écran
function addOtherPlayer(scene, id, playerInfo) {
    console.log("👤 Ajout du joueur à l'écran :", id, playerInfo);
    const otherPlayer = scene.physics.add.sprite(playerInfo.x, playerInfo.y, "player").setScale(0.2);
    otherPlayers[id] = otherPlayer;
    scene.playersGroup.add(otherPlayer);
}

// ✅ MISE À JOUR DES DÉPLACEMENTS
function update() {
    this.player.setVelocity(0);

    let speed = 300;

    if (cursors.left.isDown || keys.left.isDown) {
        this.player.setVelocityX(-speed);
    } else if (cursors.right.isDown || keys.right.isDown) {
        this.player.setVelocityX(speed);
    }

    if (cursors.up.isDown || keys.up.isDown) {
        this.player.setVelocityY(-speed);
    } else if (cursors.down.isDown || keys.down.isDown) {
        this.player.setVelocityY(speed);
    }

    socket.emit("playerMovement", { x: this.player.x, y: this.player.y });
}
