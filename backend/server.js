const WebSocket = require('ws');
const { createInitialGameState, handlePlayerStartMoving, handlePlayerStopMoving, updatePlayerPosition, handlePlaceBomb, handleExplosions } = require('./game.js');

const wss = new WebSocket.Server({ port: 8080 });
console.log('Server started on port 8080');

// --- State ---
let lobbyState = {
  status: 'waiting',
  players: [],
  lobbyTimer: null,
  countdownTimer: null,
};
let mainGameState = null;
let gameLoopInterval = null;
let nextPlayerId = 1;

const LOBBY_WAIT_TIME = 20000;
const COUNTDOWN_TIME = 10;
const GAME_TICK_RATE = 1000 / 60;

// --- Helper Functions ---
function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  });
}

function resetLobby() {
    console.log('Resetting lobby.');
    lobbyState = {
        status: 'waiting',
        players: [],
        lobbyTimer: null,
        countdownTimer: null,
    };
    nextPlayerId = 1;
    // Optional: Inform clients that the lobby has reset
    // broadcast({ type: 'LOBBY_RESET' });
}

function broadcastLobbyState() {
  broadcast({
    type: 'UPDATE_LOBBY_STATE',
    payload: {
      status: lobbyState.status,
      players: lobbyState.players.map(p => ({ id: p.id, nickname: p.nickname })),
      countdown: lobbyState.countdownTimer ? lobbyState.countdownTimer.remaining : null,
    }
  });
}

function startGame() {
  console.log('Game starting!');
  lobbyState.status = 'inprogress';
  mainGameState = createInitialGameState(lobbyState.players);
  gameLoopInterval = setInterval(gameTick, GAME_TICK_RATE);
  broadcast({ type: 'START_GAME', payload: mainGameState });
}

function gameTick() {
    if (!mainGameState) return;

    // 1. Update all player positions based on their current movement state
    mainGameState.players.forEach(player => {
        updatePlayerPosition(player, mainGameState);
    });

    // 2. Decrement bomb timers
    mainGameState.bombs.forEach(bomb => bomb.timer -= GAME_TICK_RATE / 1000);

    // 3. Handle explosions
    handleExplosions(mainGameState);

    // 4. Decrement explosion effect timers and filter them out
    const initialExplosionCount = mainGameState.explosions.length;
    mainGameState.explosions.forEach(exp => exp.timer -= GAME_TICK_RATE / 1000);
    mainGameState.explosions = mainGameState.explosions.filter(exp => exp.timer > 0);
    if (mainGameState.explosions.length < initialExplosionCount) {
        mainGameState.changes.push({ type: 'EXPLOSIONS_CLEARED', payload: { explosions: mainGameState.explosions } });
    }

    // 5. Broadcast the diff if there are any changes
    if (mainGameState.changes.length > 0) {
        broadcast({ type: 'GAME_STATE_DIFF', payload: mainGameState.changes });
        mainGameState.changes = []; // Clear changes after broadcasting
    }

    // 6. Check for win condition
    const alivePlayers = mainGameState.players.filter(p => p.isAlive);
    if (alivePlayers.length <= 1) {
        clearInterval(gameLoopInterval);
        const winner = alivePlayers.length === 1 ? alivePlayers[0] : null;
        console.log('Game Over! Winner:', winner ? winner.nickname : 'Draw');
        broadcast({
            type: 'GAME_OVER',
            payload: {
                winner: winner ? { id: winner.id, nickname: winner.nickname } : null
            }
        });
        mainGameState = null;
        resetLobby();
    }
}

function startGameCountdown() {
  if (lobbyState.status === 'countdown') return;
  clearTimeout(lobbyState.lobbyTimer);
  lobbyState.lobbyTimer = null;
  lobbyState.status = 'countdown';
  let remaining = COUNTDOWN_TIME;
  lobbyState.countdownTimer = {
    interval: setInterval(() => {
      remaining--;
      broadcast({ type: 'UPDATE_COUNTDOWN', payload: remaining });
      if (remaining <= 0) {
        clearInterval(lobbyState.countdownTimer.interval);
        startGame();
      }
    }, 1000),
    remaining: remaining
  };
  broadcastLobbyState();
  console.log('Starting 10-second countdown...');
}

// --- WebSocket Server Logic ---
wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (rawMessage) => {
    const data = JSON.parse(rawMessage);

    // Handle JOIN_GAME message separately, as it's the entry point for a player.
    if (data.type === 'JOIN_GAME') {
      const existingPlayer = lobbyState.players.find(p => p.ws === ws);
      if (!existingPlayer && lobbyState.players.length < 4 && lobbyState.status !== 'inprogress') {
        const newPlayer = {
          id: nextPlayerId++,
          ws: ws,
          nickname: data.payload.nickname,
          isAlive: true,
        };
        lobbyState.players.push(newPlayer);
        ws.playerId = newPlayer.id; // Associate ws connection with a player ID
        broadcastLobbyState();

        if (lobbyState.players.length >= 2 && lobbyState.status === 'waiting' && !lobbyState.lobbyTimer) {
            console.log('Setting 20-second lobby timer...');
            lobbyState.lobbyTimer = setTimeout(startGameCountdown, LOBBY_WAIT_TIME);
        }
        if (lobbyState.players.length === 4 && lobbyState.status === 'waiting') {
            console.log('Four players have joined. Starting countdown immediately.');
            startGameCountdown();
        }
      }
      return; // Stop processing further for this message
    }

    // For all other messages, a player must exist.
    const player = lobbyState.players.find(p => p.ws === ws);
    if (!player) {
        console.log('Message from unknown player ignored');
        return;
    }

    switch (data.type) {
      case 'SEND_CHAT_MESSAGE':
        broadcast({ type: 'NEW_CHAT_MESSAGE', payload: { nickname: player.nickname, message: data.payload.message } });
        break;
      case 'START_MOVING':
        if (mainGameState) {
            const gamePlayer = mainGameState.players.find(p => p.id === player.id);
            if (gamePlayer) handlePlayerStartMoving(gamePlayer, data.payload);
        }
        break;
      case 'STOP_MOVING':
        if (mainGameState) {
            const gamePlayer = mainGameState.players.find(p => p.id === player.id);
            if (gamePlayer) handlePlayerStopMoving(gamePlayer, data.payload);
        }
        break;
      case 'PLACE_BOMB':
        if (mainGameState) {
            const gamePlayer = mainGameState.players.find(p => p.id === player.id);
            if (gamePlayer) handlePlaceBomb(gamePlayer, mainGameState);
        }
        break;
    }
  });

  ws.on('close', () => {
    const player = lobbyState.players.find(p => p.ws === ws);
    if (player) {
        console.log(`Player ${player.nickname} disconnected`);
        lobbyState.players = lobbyState.players.filter(p => p.id !== player.id);
        if (lobbyState.status !== 'inprogress') {
            if (lobbyState.players.length < 2) {
                clearTimeout(lobbyState.lobbyTimer);
                lobbyState.lobbyTimer = null;
            }
            if (lobbyState.status === 'countdown') {
                clearInterval(lobbyState.countdownTimer.interval);
                lobbyState.status = 'waiting';
            }
            broadcastLobbyState();
        } else {
            mainGameState.players = mainGameState.players.filter(p => p.id !== player.id);
        }
    }
  });

  ws.on('error', (error) => console.error('WebSocket error:', error));
});