const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

// Store active nicknames
const activeNicknames = new Set();


const server = http.createServer((req, res) => {
  // Serve the index.html file when the root URL is requested
  if (req.url === '/') {
    const filePath = path.join(__dirname, '..', 'frontend', 'index.html'); // Going up one directory to the root
    fs.readFile(filePath, 'utf-8', (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Error');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      }
    });
  }

  // Serve JavaScript files from the frontend/js directory
  else if (req.url.startsWith('/js/') && req.url.endsWith('.js')) {
    const filePath = path.join(__dirname, '..', 'frontend', req.url);  // Going up one directory to the root
    fs.readFile(filePath, 'utf-8', (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('JavaScript File Not Found');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(data);
      }
    });
  }

  // Serve styles.css from the frontend directory
  else if (req.url === '/styles.css') {
    const filePath = path.join(__dirname, '..', 'frontend', 'styles.css');
    fs.readFile(filePath, 'utf-8', (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('CSS File Not Found');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/css' });
        res.end(data);
      }
    });
  }

  // Serve image files from the assets directory
  else if (req.url.startsWith('/assets/') && (req.url.endsWith('.png') || req.url.endsWith('.jpg') || req.url.endsWith('.gif'))) {
    const filePath = path.join(__dirname, '..', 'frontend', req.url);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Image Not Found');
      } else {
        const ext = path.extname(req.url).toLowerCase();
        const contentType = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.gif': 'image/gif'
        }[ext];
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      }
    });
  }

  // Return 404 for any other requests
  else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});


const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files from frontend
//app.use(express.static(path.join(__dirname, '../frontend')));
let playerCount = 0;
const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;
const WAITING_TIME = 20; // 20 seconds
const COUNTDOWN_TIME = 10000; // 10 seconds

let nextColorIndex = 0;

// Game state
let gameState = {
  players: {},
  gameStarted: false,
  waitingTimer: null,
  gameTimer: null,
  waitingTimeCounter: null,
  waitingTime: WAITING_TIME,
  map: [],
  bombs: [],
  powerups: []
};


// Initialize map (15x13 grid)
function initializeMap() {
  const map = [];
  for (let y = 0; y < 13; y++) {
    const row = [];
    for (let x = 0; x < 15; x++) {
      if (x === 0 || y === 0 || x === 14 || y === 12) {
        row.push('wall'); // Border walls
      } else if (x % 2 === 0 && y % 2 === 0) {
        row.push('wall'); // Grid walls
      } else if (isStartingPosition(x, y)) {
        row.push('empty'); // Starting positions
      } else if (Math.random() < 0.6) {
        row.push('block'); // Destructible blocks
      } else {
        row.push('empty');
      }
    }
    map.push(row);
  }
  return map;
}



function isStartingPosition(x, y) {
  const startPositions = [
    [1, 1], [2, 1], [1, 2], // Top-left area
    [13, 1], [12, 1], [13, 2], // Top-right area
    [1, 11], [2, 11], [1, 10], // Bottom-left area
    [13, 11], [12, 11], [13, 10] // Bottom-right area
  ];
  return startPositions.some(([px, py]) => px === x && py === y);
}

function getStartingPosition(playerIndex) {
  const positions = [
    { x: 1, y: 1 }, // Top-left
    { x: 13, y: 1 }, // Top-right
    { x: 1, y: 11 }, // Bottom-left
    { x: 13, y: 11 } // Bottom-right
  ];
  return positions[playerIndex] || positions[0];
}

function startGame() {
  gameState.gameStarted = true;
  gameState.map = initializeMap();

  // Position players
  let playerIndex = 0;
  Object.keys(gameState.players).forEach(id => {
    const pos = getStartingPosition(playerIndex);
    gameState.players[id].x = pos.x;
    gameState.players[id].y = pos.y;
    gameState.players[id].lives = 3;
    gameState.players[id].alive = true; // Reset alive status
    playerIndex++;
  });

  io.emit('gameStart', gameState);
}

function resetGame() {
  gameState = {
    players: {},
    gameStarted: false,
    waitingTimer: null,
    gameTimer: null,
    map: [],
    bombs: [],
    powerups: []
  };
  playerCount = 0;
  nextColorIndex = 0;
  // Clear all active nicknames
  activeNicknames.clear();
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('joinGame', (nickname) => {
    // Prevent joining if game started or during 10s countdown
    if (playerCount >= MAX_PLAYERS) {
      socket.emit('joinError', 'Game is full');
      return;
    }
    // Prevent joining if game started or during 10s countdown
    if (gameState.gameStarted || gameState.gameTimer) {
      socket.emit('joinError', 'Game already started');
      return;
    }
    // Check if nickname is already in use
    if (activeNicknames.has(nickname)) {
      socket.emit('joinError', 'Nickname is already taken');

      return;
    }
    setTimeout(() => {
      socket.emit('clearJoinError');
    }, 3000);

    playerCount++;
    gameState.players[socket.id] = {
      id: socket.id,
      nickname: nickname,
      x: 0,
      y: 0,
      lives: 3,
      bombs: 1,
      flames: 1,
      speed: 1,
      alive: true,
      colorIndex: nextColorIndex
    };

    nextColorIndex = (nextColorIndex + 1) % MAX_PLAYERS;

    // Add nickname to active nicknames set
    activeNicknames.add(nickname);

    socket.emit('joined', { playerId: socket.id, playerCount });
    io.emit('playerJoined', { playerCount, players: gameState.players, waitingTime: gameState.waitingTime });

    // Start waiting time counter if we have min players and it's not already running
    if (playerCount >= MIN_PLAYERS && !gameState.waitingTimeCounter && !gameState.gameStarted && !gameState.gameTimer) {
      gameState.waitingTime = WAITING_TIME; // Reset to initial waiting time
      io.emit('updateWaitingTime', { waitingTime: gameState.waitingTime });

      gameState.waitingTimeCounter = setInterval(() => {
        gameState.waitingTime--;
        io.emit('updateWaitingTime', { waitingTime: gameState.waitingTime });

        // When waiting time ends, start the game countdown
        if (gameState.waitingTime <= 0) {
          clearInterval(gameState.waitingTimeCounter);
          gameState.waitingTimeCounter = null;
          io.emit('countdown', { time: 10 });
          gameState.gameTimer = setTimeout(() => {
            startGame();
            gameState.gameTimer = null;
          }, COUNTDOWN_TIME);
        }
      }, 1000);
    }

    // If 4th player joins during waiting, immediately start 10s countdown
    if (playerCount === MAX_PLAYERS && !gameState.gameStarted) {
      if (gameState.waitingTimeCounter) {
        clearInterval(gameState.waitingTimeCounter);
        gameState.waitingTimeCounter = null;
      }
      io.emit('countdown', { time: 10 });
      gameState.gameTimer = setTimeout(() => {
        startGame();
        gameState.gameTimer = null;
      }, COUNTDOWN_TIME);
    }
  });

  socket.on('playerMove', (data) => {
    if (!gameState.gameStarted || !gameState.players[socket.id]) return;

    const player = gameState.players[socket.id];
    const { direction } = data;
    let { x, y } = player;

    switch (direction) {
      case 'up': y -= 1; break;
      case 'down': y += 1; break;
      case 'left': x -= 1; break;
      case 'right': x += 1; break;
    }

    // Check bounds and collisions
    if (x >= 0 && x < 15 && y >= 0 && y < 13 &&
      (gameState.map[y][x] === 'empty' || gameState.map[y][x] === 'powerup')) {

      // Check powerup pickup
      if (gameState.map[y][x] === 'powerup') {
        const powerup = gameState.powerups.find(p => p.x === x && p.y === y);
        if (powerup) {
          applyPowerup(player, powerup.type);
          gameState.powerups = gameState.powerups.filter(p => !(p.x === x && p.y === y));
          gameState.map[y][x] = 'empty';

          // Emit powerup collected event with updated player stats
          io.emit('powerupCollected', {
            playerId: socket.id,
            powerupType: powerup.type,
            x: x,
            y: y
          });

          // Emit updated player stats
          io.emit('playerStatsUpdate', {
            playerId: socket.id,
            stats: {
              bombs: player.bombs,
              flames: player.flames,
              speed: player.speed,
              lives: player.lives
            }
          });

          // Send updated game state to all players
          io.emit('gameStateUpdate', {
            players: gameState.players,
            powerups: gameState.powerups,
            map: gameState.map
          });
        }
      }

      player.x = x;
      player.y = y;
      io.emit('playerMoved', { playerId: socket.id, x, y });
    }
  });

  socket.on('placeBomb', () => {
    if (!gameState.gameStarted || !gameState.players[socket.id] || !gameState.players[socket.id].alive) return;

    const player = gameState.players[socket.id];
    const existingBomb = gameState.bombs.find(b => b.x === player.x && b.y === player.y);

    if (!existingBomb && player.bombs > 0) {
      const bomb = {
        id: Date.now(),
        x: player.x,
        y: player.y,
        playerId: socket.id,
        timer: 3000 // 3 seconds
      };

      gameState.bombs.push(bomb);
      player.bombs--;

      io.emit('bombPlaced', bomb);

      // Emit updated player stats immediately when bomb is placed
      io.emit('playerStatsUpdate', {
        playerId: socket.id,
        stats: {
          bombs: player.bombs,
          flames: player.flames,
          speed: player.speed,
          lives: player.lives
        }
      });

      setTimeout(() => {
        explodeBomb(bomb);
      }, bomb.timer);
    }
  });

  socket.on('chatMessage', (message) => {
    if (gameState.players[socket.id]) {
      io.emit('chatMessage', {
        nickname: gameState.players[socket.id].nickname,
        message: message,
        timestamp: Date.now()
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (gameState.players[socket.id]) {
      // Remove nickname from active nicknames
      activeNicknames.delete(gameState.players[socket.id].nickname);
      // If game is started, just mark as dead
      if (gameState.gameStarted) {
        gameState.players[socket.id].alive = false;
        broadcastPlayersUpdate();
      } else {
        // Only remove from players if game hasn't started
        delete gameState.players[socket.id];
        playerCount--;
      }

      // Win condition check (unchanged)
      if (gameState.gameStarted) {
        const alivePlayers = Object.values(gameState.players).filter(p => p.alive);
        if (alivePlayers.length === 1) {
          io.emit('gameOver', { winner: alivePlayers[0] });
          setTimeout(resetGame, 5000);
          return;
        }
        if (alivePlayers.length === 0) {
          io.emit('gameOver', { winner: null });
          setTimeout(resetGame, 5000);
          return;
        }
      }

      // Waiting logic (unchanged)
      if (!gameState.gameStarted) {
        // Clear waiting time counter if less than 2 players
        playerCount = Object.values(gameState.players).length;
        if (playerCount < MIN_PLAYERS && gameState.waitingTimeCounter) {
          clearInterval(gameState.waitingTimeCounter);
          gameState.waitingTimeCounter = null;
          gameState.waitingTime = WAITING_TIME;
          io.emit('updateWaitingTime', { waitingTime: gameState.waitingTime });
        }
        if (playerCount === 0) {
          resetGame();
        } else {
          io.emit('playerLeft', {
            playerCount,
            players: gameState.players,
            waitingTime: gameState.waitingTime
          });
        }
      }
    }
  });
});


function broadcastPlayersUpdate() {
  io.emit('playersUpdate', { players: gameState.players });
}


function applyPowerup(player, type) {
  switch (type) {
    case 'bombs':
      player.bombs++;
      break;
    case 'flames':
      player.flames++;
      break;
    case 'speed':
      player.speed = Math.min(player.speed + 0.5, 3);
      break;
  }
}

function explodeBomb(bomb) {
  gameState.bombs = gameState.bombs.filter(b => b.id !== bomb.id);

  const player = gameState.players[bomb.playerId];
  if (player) {
    player.bombs++; // Return bomb to player

    // Emit updated player stats when bomb explodes
    io.emit('playerStatsUpdate', {
      playerId: bomb.playerId,
      stats: {
        bombs: player.bombs,
        flames: player.flames,
        speed: player.speed,
        lives: player.lives
      }
    });
  }

  const explosions = [];
  const directions = [
    [0, 0], // Center
    [0, -1], [0, 1], // Up, Down
    [-1, 0], [1, 0]  // Left, Right
  ];

  directions.forEach(([dx, dy]) => {
    for (let i = 0; i <= (player ? player.flames : 1); i++) {
      const x = bomb.x + dx * i;
      const y = bomb.y + dy * i;

      if (x < 0 || x >= 15 || y < 0 || y >= 13) break;
      if (gameState.map[y][x] === 'wall') break;

      explosions.push({ x, y });

      // Destroy blocks and maybe spawn powerup
      if (gameState.map[y][x] === 'block') {
        console.log('Block destroyed at:', x, y);

        gameState.map[y][x] = 'empty';
        if (Math.random() < 0.3) {
          const powerupTypes = ['bombs', 'flames', 'speed'];
          const powerup = {
            x, y,
            type: powerupTypes[Math.floor(Math.random() * powerupTypes.length)]
          };
          gameState.powerups.push(powerup);
          gameState.map[y][x] = 'powerup';
        }
        break;
      }
    }
  });

  // Check player damage
  const damagedPlayers = [];
  Object.keys(gameState.players).forEach(playerId => {
    const p = gameState.players[playerId];
    if (p.alive && explosions.some(exp => exp.x === p.x && exp.y === p.y)) {
      p.lives--;
      damagedPlayers.push({
        playerId,
        lives: p.lives,
        alive: p.lives > 0
      });

      if (p.lives <= 0) {
        p.alive = false;
        io.emit('playerDied', { playerId });
        broadcastPlayersUpdate();
      }

      // Emit real-time life update immediately
      io.emit('playerStatsUpdate', {
        playerId,
        stats: {
          bombs: p.bombs,
          flames: p.flames,
          speed: p.speed,
          lives: p.lives
        }
      });
    }
  });

  io.emit('bombExploded', {
    bombId: bomb.id,
    explosions,
    damagedPlayers
  });

  io.emit('mapUpdate', { map: gameState.map });

  // Send updated game state to ensure powerups are synced
  io.emit('gameStateUpdate', {
    players: gameState.players,
    powerups: gameState.powerups,
    map: gameState.map
  });

  // Check win condition
  const alivePlayers = Object.values(gameState.players).filter(p => p.alive);
  if (alivePlayers.length <= 1) {
    io.emit('gameOver', { winner: alivePlayers[0] || null });
    setTimeout(resetGame, 5000);
  }
}

const PORT = 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});