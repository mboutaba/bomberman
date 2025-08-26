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
  screen: 'nickname', // Default screen
  nickname: '',
  lobby: { players: [], countdown: null, status: 'waiting' },
  chatMessages: [],
  gameState: { map: [], players: [], bombs: [], explosions: [], powerUps: [] },
  winner: null,
};

function reducer(state = initialState, action) {
  if (!action || !action.type) {
    return state;
  }
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
    case 'GAME_STATE_DIFF': {
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
          case 'BOMB_PLACED':
            newGameState.bombs.push(change.payload);
            break;
          case 'BOMB_EXPLODED': {
            const { x, y } = change.payload;
            newGameState.bombs = newGameState.bombs.filter(b => b.x !== x || b.y !== y);
            break;
          }
          case 'EXPLOSION_STARTED':
            newGameState.explosions.push(change.payload);
            break;
          case 'EXPLOSIONS_CLEARED':
            newGameState.explosions = change.payload.explosions;
            break;
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
            if (newGameState.map[y] && newGameState.map[y][x] !== undefined) {
              newGameState.map[y][x] = 0; // TILE.EMPTY
            }
            break;
          }
          case 'POWERUP_SPAWNED':
            newGameState.powerUps.push(change.payload);
            break;
          case 'POWERUP_COLLECTED':
            newGameState.powerUps = newGameState.powerUps.filter(p => !(p.x === change.payload.x && p.y === change.payload.y));
            break;
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
    }
    case 'GAME_OVER':
      return { ...state, winner: action.payload.winner };
    default:
      return state;
  }
}

const store = FacileJS.createStore(reducer);
const router = createRouter(store);

// --- High-Performance Board Renderer ---
const boardManager = {
    CELL_SIZE: 50,
    dynamicElementContainer: null,
    playerPool: new Map(),
    bombPool: new Map(),
    explosionPool: new Map(),
    powerUpPool: new Map(),
    activeElements: new Set(),

    createBoard(map) {
        const wallAndBlockCells = [];
        map.forEach((row, y) => {
            row.forEach((tile, x) => {
                if (tile === TILE.WALL || tile === TILE.BLOCK) {
                    const tileClass = tile === TILE.WALL ? 'cell wall' : 'cell block';
                    wallAndBlockCells.push(FacileJS.createElement('div', {
                        class: tileClass,
                        style: `grid-column: ${x + 1}; grid-row: ${y + 1};`
                    }));
                }
            });
        });

        const dynamicContainerVNode = FacileJS.createElement('div', {
            class: 'dynamic-container',
            ref: (el) => { if (el) this.dynamicElementContainer = el; }
        });

        return FacileJS.createElement('div', {
            class: 'board',
            style: `grid-template-columns: repeat(${map[0].length}, ${this.CELL_SIZE}px); grid-template-rows: repeat(${map.length}, ${this.CELL_SIZE}px);`
        }, ...wallAndBlockCells, dynamicContainerVNode);
    },

    updatePool({ pool, items, key, className, updateFunc, tag = 'div' }) {
        if (!this.dynamicElementContainer) return;
        items.forEach(item => {
            const itemKey = key(item);
            const fullKey = `${className}-${itemKey}`;
            this.activeElements.add(fullKey);
            let el = pool.get(itemKey);
            if (!el) {
                el = document.createElement(tag);
                pool.set(itemKey, el);
                this.dynamicElementContainer.appendChild(el);
            }
            updateFunc(el, item);
        });
    },

    update(gameState) {
        if (!this.dynamicElementContainer) return;
        this.activeElements.clear();

        this.updatePool({
            pool: this.playerPool,
            items: gameState.players,
            key: p => p.id,
            className: 'player',
            tag: 'img', // Create an <img> element for players
            updateFunc: (el, p) => {
                el.className = `player player-${p.id} ${p.isAlive ? '' : 'dead'}`;
                el.src = '/assets/ghost.png'; // Use local ghost image
                el.style.transform = `translate(${p.x}px, ${p.y}px)`;
            }
        });

        this.updatePool({
            pool: this.bombPool,
            items: gameState.bombs || [],
            key: b => `${b.x}-${b.y}`,
            className: 'bomb',
            tag: 'img', // Create an <img> element
            updateFunc: (el, b) => {
                el.className = 'bomb';
                el.src = 'https://static.thenounproject.com/png/2881495-200.png'; // Set the image source
                const x = b.x * this.CELL_SIZE;
                const y = b.y * this.CELL_SIZE;
                el.style.transform = `translate(${x}px, ${y}px)`;
            }
        });

        this.updatePool({
            pool: this.powerUpPool, items: gameState.powerUps || [], key: p => `${p.x}-${p.y}`, className: 'power-up',
            updateFunc: (el, p) => {
                el.className = `power-up ${p.type}`;
                const x = p.x * this.CELL_SIZE;
                const y = p.y * this.CELL_SIZE;
                el.style.transform = `translate(${x}px, ${y}px)`;
            }
        });

        const explosionCells = new Map();
        (gameState.explosions || []).forEach(exp => {
            exp.cells.forEach(cell => {
                const key = `${cell.x}-${cell.y}`;
                if (!explosionCells.has(key)) explosionCells.set(key, cell);
            });
        });

        this.updatePool({
            pool: this.explosionPool, items: Array.from(explosionCells.values()), key: cell => `${cell.x}-${cell.y}`, className: 'explosion',
            updateFunc: (el, cell) => {
                el.className = 'explosion';
                const x = cell.x * this.CELL_SIZE;
                const y = cell.y * this.CELL_SIZE;
                el.style.transform = `translate(${x}px, ${y}px)`;
            }
        });

        const cleanup = (pool, prefix) => {
            for (const [key, el] of pool.entries()) {
                if (!this.activeElements.has(`${prefix}-${key}`)) {
                    el.remove();
                    pool.delete(key);
                }
            }
        };

        cleanup(this.playerPool, 'player');
        cleanup(this.bombPool, 'bomb');
        cleanup(this.powerUpPool, 'power-up');
        cleanup(this.explosionPool, 'explosion');
    },

    reset() {
        if (this.dynamicElementContainer) {
            this.dynamicElementContainer.innerHTML = '';
        }
        this.playerPool.clear();
        this.bombPool.clear();
        this.explosionPool.clear();
        this.powerUpPool.clear();
        this.activeElements.clear();
    }
};

// --- Input Handling ---
const keyboardState = {}; // Tracks which keys are currently held down
const keyMap = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
};

const handleKeyDown = (e) => {
    const direction = keyMap[e.code];
    if (direction && !keyboardState[e.code]) {
        keyboardState[e.code] = true;
        ws.send(JSON.stringify({ type: 'START_MOVING', payload: direction }));
    }
};

const handleKeyUp = (e) => {
    const direction = keyMap[e.code];
    if (direction) {
        keyboardState[e.code] = false;
        ws.send(JSON.stringify({ type: 'STOP_MOVING', payload: direction }));
    }
};

const handleKeyPress = (e) => {
    if (e.code === 'Space' && store.getState().screen === 'game') {
        e.preventDefault();
        ws.send(JSON.stringify({ type: 'PLACE_BOMB' }));
    }
};

// --- Components ---

function App() {
    const state = store.getState();
    let screenComponent;

    // Route guard
    if (!state.nickname && state.screen !== 'nickname') {
        router.navigate('#/nickname');
        screenComponent = NicknameScreen(); // Render nickname screen while navigating
    } else {
        switch (state.screen) {
            case 'lobby': screenComponent = LobbyScreen(); break;
            case 'game': screenComponent = GameScreen(); break;
            case 'gameover': screenComponent = GameOverScreen(); break;
            default: screenComponent = NicknameScreen(); break;
        }
    }
    return FacileJS.createElement('div', { class: 'app-container', tabindex: '0', autofocus: true, onkeydown: handleKeyDown, onkeyup: handleKeyUp, onkeypress: handleKeyPress, }, screenComponent);
}

// The game loop is now only for animation, not for sending input.
function gameLoop() {
    requestAnimationFrame(gameLoop);
}

function ChatComponent() {
    const state = store.getState(); let currentMessage = '';
    const handleInput = (e) => { currentMessage = e.target.value; };
    const handleSendMessage = () => { if (currentMessage.trim().length > 0) { ws.send(JSON.stringify({ type: 'SEND_CHAT_MESSAGE', payload: { message: currentMessage } })); } };
    return FacileJS.createElement('div', { class: 'chat-container' },
        FacileJS.createElement('div', { class: 'messages' }, ...state.chatMessages.map(msg => FacileJS.createElement('p', { class: 'message' }, FacileJS.createElement('strong', {}, `${msg.nickname}: `), msg.message))),
        FacileJS.createElement('input', { type: 'text', placeholder: 'Type a message...', oninput: handleInput, onkeyup: (e) => { if (e.keyCode === 13) { handleSendMessage(); e.target.value = ''; } } })
    );
}

function NicknameScreen() {
    let nickname = '';
    const handleInput = (e) => { nickname = e.target.value; };
    const handleJoin = () => {
        if (nickname.trim().length > 0) {
            store.dispatch({ type: 'SET_NICKNAME', payload: nickname });
            ws.send(JSON.stringify({ type: 'JOIN_GAME', payload: { nickname } }));
            router.navigate('#/lobby');
        }
    };
    return FacileJS.createElement('div', { class: 'container nickname-screen' },
        FacileJS.createElement('h1', {}, 'Bomberman-DOM'),
        FacileJS.createElement('input', { type: 'text', placeholder: 'Enter your nickname', oninput: handleInput, onkeyup: (e) => e.keyCode === 13 && handleJoin() }),
        FacileJS.createElement('button', { onclick: handleJoin }, 'Join Game')
    );
}

function LobbyScreen() {
    const { players, countdown, status } = store.getState().lobby;
    const timerText = countdown !== null ? `Game starts in: ${countdown}s` : 'Waiting...';
    return FacileJS.createElement('div', { class: 'container lobby-screen' },
        FacileJS.createElement('h1', {}, 'Lobby'),
        FacileJS.createElement('p', {}, `Players: ${players.length}/4`),
        FacileJS.createElement('ul', {}, ...players.map(p => FacileJS.createElement('li', {}, p.nickname))),
        FacileJS.createElement('p', { class: 'timer' }, status === 'countdown' ? timerText : 'Waiting for more players...'),
        ChatComponent()
    );
}

function BoardRendererComponent({ map }) {
    boardManager.reset();
    return boardManager.createBoard(map);
}

function PlayerStatus({ players }) {
    return FacileJS.createElement('div', { class: 'player-status-container' },
        ...players.map(p => {
            const lifeIcons = Array.from({ length: p.lives }, () =>
                FacileJS.createElement('div', { class: 'life-icon' })
            );

            return FacileJS.createElement('div', { class: `player-status player-${p.id} ${p.isAlive ? '' : 'dead'}` },
                FacileJS.createElement('div', { class: 'player-icon' }),
                FacileJS.createElement('span', { class: 'nickname' }, p.nickname),
                FacileJS.createElement('div', { class: 'lives-container' }, ...lifeIcons)
            );
        })
    );
}

function GameOverScreen() {
    const { winner } = store.getState();
    const handlePlayAgain = () => { window.location.reload(); };
    const message = winner ? `${winner.nickname} Wins!` : "It's a Draw!";
    return FacileJS.createElement('div', { class: 'container game-over-screen' },
        FacileJS.createElement('h1', {}, 'Game Over'),
        FacileJS.createElement('h2', {}, message),
        FacileJS.createElement('button', { onclick: handlePlayAgain }, 'Play Again')
    );
}

function GameScreen() {
    const { map, players } = store.getState().gameState;
    if (!map || map.length === 0) {
        return FacileJS.createElement('div', {}, 'Loading game...');
    }
    return FacileJS.createElement('div', { class: 'game-container' },
        PlayerStatus({ players }),
        BoardRendererComponent({ map }),
        ChatComponent()
    );
}

// --- App Initialization ---
const rootElement = document.getElementById('root');
const update = FacileJS.createApp(App, rootElement);

store.subscribe(() => {
    const state = store.getState();
    update(); // Always run the framework's update for static UI and screen transitions
    if (state.screen === 'game' && state.gameState.map.length > 0) {
        boardManager.update(state.gameState);
    } else {
        boardManager.reset();
    }
});

requestAnimationFrame(gameLoop);
