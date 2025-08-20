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

