// Game logic and state management
import { useState } from './mini-framework/state.js';

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
  waitingTime: 0,
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
  
  socket.on('playerJoined', (data) => {
    const state = getGameState();
    setGameState({
      ...state,
      playerCount: data.playerCount,
      players: data.players,
      waitingTime: data.waitingTime
    });
    updateUI();
  });

  socket.on('updateWaitingTime', (data) => {
    const state = getGameState();
    setGameState({
      ...state,
      waitingTime: data.waitingTime
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
  
  let pendingMoves = new Map();
  let moveUpdateScheduled = false;
  
  socket.on('playerMoved', (data) => {
    pendingMoves.set(data.playerId, data);
    
    if (!moveUpdateScheduled) {
      moveUpdateScheduled = true;
      requestAnimationFrame(() => {
        moveUpdateScheduled = false;
        const state = getGameState();
        let updated = false;
        
        pendingMoves.forEach((moveData, playerId) => {
          if (state.players[playerId]) {
            state.players[playerId].x = moveData.x;
            state.players[playerId].y = moveData.y;
            updated = true;
          }
        });
        
        pendingMoves.clear();
        if (updated) {
          setGameState(state);
          updateUI();
        }
      });
    }
  });
  
  socket.on('bombPlaced', (bomb) => {
    const state = getGameState();
    state.bombs.push(bomb);
    setGameState(state);
    updateUI();
  });
  
  socket.on('mapUpdate', (data) => {
    const state = getGameState();
    setGameState({
      ...state,
      map: data.map
    });
    updateUI();
  });

  // Handle real-time player stats updates
  socket.on('playerStatsUpdate', (data) => {
    const state = getGameState();
    if (state.players[data.playerId]) {
      // Update specific player stats
      state.players[data.playerId].bombs = data.stats.bombs;
      state.players[data.playerId].flames = data.stats.flames;
      state.players[data.playerId].speed = data.stats.speed;
      state.players[data.playerId].lives = data.stats.lives;
      
      setGameState(state);
      updateUI();
    }
  });

  // Handle powerup collection with immediate UI feedback
  socket.on('powerupCollected', (data) => {
    const state = getGameState();
    // Remove the powerup from local state immediately
    state.powerups = state.powerups.filter(p => !(p.x === data.x && p.y === data.y));
    
    setGameState(state);
    updateUI();
  });

  // Handle complete game state updates (for powerups sync)
  socket.on('gameStateUpdate', (data) => {
    const state = getGameState();
    setGameState({
      ...state,
      players: data.players,
      powerups: data.powerups,
      map: data.map
    });
    updateUI();
  });

  socket.on('bombExploded', (data) => {
    const state = getGameState();
    state.bombs = state.bombs.filter(b => b.id !== data.bombId);
    
    // Handle damaged players with real-time life updates
    if (data.damagedPlayers) {
      data.damagedPlayers.forEach(damaged => {
        if (state.players[damaged.playerId]) {
          state.players[damaged.playerId].lives = damaged.lives;
          state.players[damaged.playerId].alive = damaged.alive;
        }
      });
    }
    
    // Show explosions briefly
    state.explosions = data.explosions;
    setGameState({ ...state }); // Create new object to trigger update
    updateUI();
    
    setTimeout(() => {
      const currentState = getGameState();
      setGameState({
        ...currentState,
        explosions: []
      });
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

let lastUpdateTime = 0;
const UI_UPDATE_THROTTLE = 16;

function updateUI() {
  if (!gameUpdateCallback) return;
  
  const currentTime = performance.now();
  if (currentTime - lastUpdateTime >= UI_UPDATE_THROTTLE) {
    gameUpdateCallback();
    lastUpdateTime = currentTime;
  }
}

let keys = {};

let lastMoveTime = 0;
const MOVE_THROTTLE = 50;

export function handleKeyDown(e) {
  if (!e || !e.key) return;
  
  const key = e.key.toLowerCase();
  if (keys[key]) return; // Already pressed
  
  keys[key] = true;
  
  const state = getGameState();
  if (state.screen !== 'game' || !state.gameStarted) return;
  
  const currentTime = performance.now();
  
  switch (key) {
    case 'arrowup':
    case 'arrowdown':
    case 'arrowleft':
    case 'arrowright':
      e.preventDefault();
      if (currentTime - lastMoveTime >= MOVE_THROTTLE) {
        movePlayer(key.replace('arrow', '').toLowerCase());
        lastMoveTime = currentTime;
      }
      break;
    case ' ':
      e.preventDefault();
      placeBomb();
      break;
  }
}

export function handleKeyUp(e) {
  if (!e || !e.key) return;
  
  keys[e.key.toLowerCase()] = false;
}

export function isKeyPressed(key) {
  return keys[key.toLowerCase()] || false;
}

export function initInput() {
  // Input is now handled through the framework
  console.log('Input system ready - using framework event handlers');
}