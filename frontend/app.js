import FacileJS from './framework/index.js';
import { createRouter } from './framework/router.js';

// --- WebSocket Connection ---
const ws = new WebSocket('ws://localhost:8080');
ws.onopen = () => console.log('Connected to the server');
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  store.dispatch({ type: message.type, payload: message.payload });

  // Navigate based on server messages
  if (message.type === 'UPDATE_LOBBY_STATE') {
    router.navigate('#/lobby');
  } else if (message.type === 'START_GAME') {
    router.navigate('#/game');
  } else if (message.type === 'GAME_OVER') {
    router.navigate('#/gameover');
  }
};
ws.onclose = () => console.log('Disconnected from the server');
ws.onerror = (error) => console.error('WebSocket Error:', error);

// --- Game Constants ---
const TILE = { EMPTY: 0, BLOCK: 1, WALL: 2 };

// --- State Management ---
const initialState = {
  screen: 'nickname',
  nickname: '',
  lobby: { players: [], countdown: null, status: 'waiting' },
  chatMessages: [],
  gameState: { map: [], players: [], bombs: [], explosions: [], powerUps: [] },
  winner: null,
};
