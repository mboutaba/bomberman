// Game logic and state management
import { useState } from './state.js';

let socket = null;
let gameUpdateCallback = null;

// Game state
const [getGameState, setGameState] = useState('gameState', {
  screen: 'nickname', // nickname, waiting, game, gameover
  players: {},
  myPlayerId: null,
  playerCount: 0,
  map: [],
  bombs: [],
  powerups: [],
  explosions: [],
  gameStarted: false,
  countdown: 0,
  chatMessages: [],
  winner: null
});

export function initGame() {
  socket = io();
  
  socket.on('joined', (data) => {
    const state = getGameState();
    setGameState({
      ...state,
      screen: 'waiting',
      myPlayerId: data.playerId,
      playerCount: data.playerCount
    });
    updateUI();
  });
  
  socket.on('joinError', (message) => {
    alert(message);
  });
  
  socket.on('playerJoined', (data) => {
    const state = getGameState();
    setGameState({
      ...state,
      playerCount: data.playerCount,
      players: data.players
    });
    updateUI();
  });
  
  socket.on('playerLeft', (data) => {
    const state = getGameState();
    setGameState({
      ...state,
      playerCount: data.playerCount,
      players: data.players
    });
    updateUI();
  });
  
  socket.on('countdown', (data) => {
    const state = getGameState();
    setGameState({
      ...state,
      countdown: data.time
    });
    updateUI();
    
    let timeLeft = data.time;
    const countdownTimer = setInterval(() => {
      timeLeft--;
      const currentState = getGameState();
      setGameState({
        ...currentState,
        countdown: timeLeft
      });
      updateUI();
      
      if (timeLeft <= 0) {
        clearInterval(countdownTimer);
      }
    }, 1000);
  });
  
  socket.on('gameStart', (gameData) => {
    const state = getGameState();
    setGameState({
      ...state,
      screen: 'game',
      gameStarted: true,
      players: gameData.players,
      map: gameData.map,
      bombs: gameData.bombs || [],
      powerups: gameData.powerups || [],
      countdown: 0
    });
    updateUI();
  });
  
  socket.on('playerMoved', (data) => {
    const state = getGameState();
    if (state.players[data.playerId]) {
      state.players[data.playerId].x = data.x;
      state.players[data.playerId].y = data.y;
      setGameState(state);
      updateUI();
    }
  });
  
  socket.on('bombPlaced', (bomb) => {
    const state = getGameState();
    state.bombs.push(bomb);
    setGameState(state);
    updateUI();
  });
  
  
  socket.on('bombExploded', (data) => {
    const state = getGameState();
    state.bombs = state.bombs.filter(b => b.id !== data.bombId);
    
    // Show explosions briefly
    state.explosions = data.explosions;
    setGameState(state);
    updateUI();
    
    setTimeout(() => {
      const currentState = getGameState();
      currentState.explosions = [];
      setGameState(currentState);
      updateUI();
    }, 300);
  });
  
  socket.on('playerDied', (data) => {
    const state = getGameState();
    if (state.players[data.playerId]) {
      state.players[data.playerId].alive = false;
      setGameState(state);
      updateUI();
    }
  });
  
  socket.on('gameOver', (data) => {
    const state = getGameState();
    setGameState({
      ...state,
      screen: 'gameover',
      winner: data.winner
    });
    updateUI();
  });
  
  socket.on('chatMessage', (data) => {
    const state = getGameState();
    state.chatMessages.push(data);
    if (state.chatMessages.length > 50) {
      state.chatMessages = state.chatMessages.slice(-50);
    }
    setGameState(state);
    updateUI();
  });
}

export function joinGame(nickname) {
  socket.emit('joinGame', nickname);
}

export function movePlayer(direction) {
  socket.emit('playerMove', { direction });
}

export function placeBomb() {
  socket.emit('placeBomb');
}

export function sendChatMessage(message) {
  socket.emit('chatMessage', message);
}

export function getState() {
  return getGameState();
}

export function onGameUpdate(callback) {
  gameUpdateCallback = callback;
}

function updateUI() {
  if (gameUpdateCallback) {
    gameUpdateCallback();
  }
}

// Input handling through framework
let keys = {};

export function handleKeyDown(e) {
  keys[e.key.toLowerCase()] = true;
  
  const state = getGameState();
  if (state.screen !== 'game' || !state.gameStarted) return;
  
  switch (e.key.toLowerCase()) {
    case 'arrowup':
    case 'w':
      e.preventDefault();
      movePlayer('up');
      break;
    case 'arrowdown':
    case 's':
      e.preventDefault();
      movePlayer('down');
      break;
    case 'arrowleft':
    case 'a':
      e.preventDefault();
      movePlayer('left');
      break;
    case 'arrowright':
    case 'd':
      e.preventDefault();
      movePlayer('right');
      break;
    case ' ':
    case 'enter':
      e.preventDefault();
      placeBomb();
      break;
  }
}

export function handleKeyUp(e) {
  keys[e.key.toLowerCase()] = false;
}

export function isKeyPressed(key) {
  return keys[key.toLowerCase()] || false;
}

export function initInput() {
  // Input is now handled through the framework
  console.log('Input system ready - using framework event handlers');
}