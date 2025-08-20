const WebSocket = require('ws');
const { createInitialGameState, handlePlayerMove, handlePlaceBomb, handleExplosions } = require('./game.js');

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
 // start game!
 function startGame() {
  console.log('Game starting!');
  lobbyState.status = 'inprogress';
  mainGameState = createInitialGameState(lobbyState.players);
  gameLoopInterval = setInterval(gameTick, GAME_TICK_RATE);
  broadcast({ type: 'START_GAME', payload: mainGameState });
}


// bomb timing!
function gameTick() {
    if (!mainGameState) return;

    // 1. Decrement bomb timers
    mainGameState.bombs.forEach(bomb => bomb.timer -= GAME_TICK_RATE / 1000);

    // 2. Handle explosions
    handleExplosions(mainGameState);

    // 3. Decrement explosion effect timers
    mainGameState.explosions.forEach(exp => exp.timer -= GAME_TICK_RATE / 1000);
    mainGameState.explosions = mainGameState.explosions.filter(exp => exp.timer > 0);

    // 4. Broadcast the new state
    broadcast({ type: 'GAME_STATE_UPDATE', payload: mainGameState });

    // 5. Check for win condition
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
    }
}