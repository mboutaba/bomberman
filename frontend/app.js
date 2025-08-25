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
function reducer(state = initialState, action) {
  if (!action || !action.type) return state;
  switch (action.type) {
    case 'SET_SCREEN':
      return { ...state, screen: action.payload };
    case 'SET_NICKNAME':
      return { ...state, nickname: action.payload };
    case 'UPDATE_LOBBY_STATE':
      return { ...state, lobby: action.payload };
    case 'UPDATE_COUNTDOWN':
      return { ...state, lobby: { ...state.lobby, countdown: action.payload } };
    case 'START_GAME':
      return { ...state, gameState: action.payload, winner: null };
    case 'NEW_CHAT_MESSAGE':
      return { ...state, chatMessages: [...state.chatMessages, action.payload] };
    case 'GAME_STATE_DIFF':
      // logic for updating gameState based on diff
      const newGameState = JSON.parse(JSON.stringify(state.gameState));
      for (const change of action.payload) {
        switch (change.type) {
          case 'PLAYER_MOVED': {
            const player = newGameState.players.find(p => p.id === change.payload.id);
            if (player) {
              player.x = change.payload.x;
              player.y = change.payload.y;
            }
            break;
          }
          case 'BOMB_PLACED': newGameState.bombs.push(change.payload); break;
          case 'BOMB_EXPLODED': {
            const { x, y } = change.payload;
            newGameState.bombs = newGameState.bombs.filter(b => b.x !== x || b.y !== y);
            break;
          }
          case 'EXPLOSION_STARTED': newGameState.explosions.push(change.payload); break;
          case 'EXPLOSIONS_CLEARED': newGameState.explosions = change.payload.explosions; break;
          case 'PLAYER_DAMAGED': {
            const player = newGameState.players.find(p => p.id === change.payload.id);
            if (player) player.lives = change.payload.lives;
            break;
          }
          case 'PLAYER_DIED': {
            const player = newGameState.players.find(p => p.id === change.payload.id);
            if (player) player.isAlive = false;
            break;
          }
          case 'BLOCK_DESTROYED': {
            const { x, y } = change.payload;
            if (newGameState.map[y] && newGameState.map[y][x] !== undefined) newGameState.map[y][x] = 0;
            break;
          }
          case 'POWERUP_SPAWNED': newGameState.powerUps.push(change.payload); break;
          case 'POWERUP_COLLECTED': newGameState.powerUps = newGameState.powerUps.filter(p => !(p.x === change.payload.x && p.y === change.payload.y)); break;
          case 'PLAYER_STATS_CHANGED': {
            const player = newGameState.players.find(p => p.id === change.payload.id);
            if (player) {
              player.bombs = change.payload.bombs;
              player.flame = change.payload.flame;
              player.speed = change.payload.speed;
            }
            break;
          }
        }
      }
      return { ...state, gameState: newGameState };
    case 'GAME_OVER':
      return { ...state, winner: action.payload.winner };
    default:
      return state;
  }
}

const store = FacileJS.createStore(reducer);
const router = createRouter(store);
