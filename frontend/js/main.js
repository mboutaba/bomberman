// Main application entry point
import { renderApp } from './render.js';
import { initRouter, useRoute } from './router.js';
import { initGame, joinGame, getState, onGameUpdate, initInput, sendChatMessage } from './game.js';

let animationId;
let lastFrameTime = 0;
const TARGET_FPS = 60;
const FRAME_TIME = 1000 / TARGET_FPS;

function h(type, props = {}, ...children) {
  return {
    type,
    props,
    children: children.flat()
  };
}

function NicknameScreen() {
  const state = getState();
  
  function handleSubmit(e) {
    e.preventDefault();
    const nickname = e.target.nickname.value.trim();
    if (nickname.length > 0 && nickname.length <= 20) {
      joinGame(nickname);
    }
  }
  
  return h('div', { class: 'screen' },
    h('h1', {}, 'Bomberman DOM'),
    h('p', {}, 'Enter your nickname to join the battle!'),
    h('form', { onsubmit: handleSubmit },
      h('input', {
        type: 'text',
        name: 'nickname',
        placeholder: 'Enter nickname...',
        maxlength: '20',
        required: true
      }),
      h('br'),
      h('button', { type: 'submit', class: 'btn' }, 'Join Game')
    )
  );
}

function WaitingScreen() {
  const state = getState();
  
  return h('div', { class: 'screen' },
    h('h1', {}, 'Waiting for Players'),
    h('p', {}, `Players: ${state.playerCount}/4`),
    state.countdown > 0 ? 
      h('div', { class: 'countdown' }, state.countdown) :
      h('p', {}, 'Waiting for more players...'),
    h('div', { class: 'player-list' },
      Object.values(state.players).map((player, index) =>
        h('div', { key: player.id, class: 'player-info' },
          h('span', { class: `player-${index}` }, '●'), ' ', player.nickname
        )
      )
    )
  );
}

function GameScreen() {
  const state = getState();
  
  function handleChatSubmit(e) {
    e.preventDefault();
    const message = e.target.message.value.trim();
    if (message) {
      sendChatMessage(message);
      e.target.message.value = '';
    }
  }
  
  const playerArray = Object.values(state.players);
  
  return h('div', { class: 'game-container' },
    // Game Board
    h('div', { class: 'game-board', style: 'width: 480px; height: 416px;' },
      // Map cells
      ...state.map.flatMap((row, y) =>
        row.map((cell, x) =>
          h('div', {
            key: `cell-${x}-${y}`,
            class: `game-cell ${cell}`,
            style: `left: ${x * 32}px; top: ${y * 32}px;`
          })
        )
      ),
      
      // Players
      ...playerArray
        .filter(player => player.alive)
        .map((player, index) =>
          h('div', {
            key: `player-${player.id}`,
            class: `player player-${index}`,
            style: `left: ${player.x * 32}px; top: ${player.y * 32}px;`
          })
        ),
      
      // Bombs
      ...state.bombs.map(bomb =>
        h('div', {
          key: `bomb-${bomb.id}`,
          class: 'bomb',
          style: `left: ${bomb.x * 32}px; top: ${bomb.y * 32}px;`
        })
      ),
      
      // Explosions
      ...state.explosions.map((explosion, index) =>
        h('div', {
          key: `explosion-${index}`,
          class: 'explosion',
          style: `left: ${explosion.x * 32}px; top: ${explosion.y * 32}px;`
        })
      )
    ),
    
    // Sidebar
    h('div', { class: 'sidebar' },
      h('h3', {}, 'Players'),
      h('div', { class: 'player-list' },
        ...playerArray.map((player, index) => {
          const isMe = player.id === state.myPlayerId;
          return h('div', {
            key: player.id,
            class: 'player-info',
            style: isMe ? 'border: 2px solid #007bff;' : ''
          },
            h('span', { class: `player-${index}` }, '●'),
            ' ',
            player.nickname,
            isMe ? ' (You)' : '',
            h('br'),
            `Lives: ${player.lives} | Bombs: ${player.bombs} | Flames: ${player.flames}`,
            !player.alive ? ' [DEAD]' : ''
          );
        })
      ),
      
      h('div', { class: 'chat' },
        h('h4', {}, 'Chat'),
        h('div', { class: 'chat-messages' },
          ...state.chatMessages.slice(-20).map((msg, index) =>
            h('div', { key: index, class: 'message' },
              h('strong', {}, msg.nickname + ': '),
              msg.message
            )
          )
        ),
        h('form', { class: 'chat-input', onsubmit: handleChatSubmit },
          h('input', {
            type: 'text',
            name: 'message',
            placeholder: 'Type message...',
            maxlength: '100'
          }),
          h('button', { type: 'submit', class: 'btn' }, 'Send')
        )
      ),
      
      h('div', { class: 'controls' },
        h('h4', {}, 'Controls'),
        h('p', {}, 'WASD or Arrow Keys: Move'),
        h('p', {}, 'Space or Enter: Place Bomb')
      )
    )
  );
}

function GameOverScreen() {
  const state = getState();
  
  return h('div', { class: 'screen' },
    h('h1', {}, 'Game Over!'),
    state.winner ? 
      h('h2', {}, `🎉 ${state.winner.nickname} Wins! 🎉`) :
      h('h2', {}, 'Draw!'),
    h('p', {}, 'Returning to lobby in 5 seconds...'),
    h('button', { 
      class: 'btn',
      onclick: () => window.location.reload()
    }, 'Play Again')
  );
}

function App() {
  const state = getState();
  
  switch (state.screen) {
    case 'nickname':
      return NicknameScreen();
    case 'waiting':
      return WaitingScreen();
    case 'game':
      return GameScreen();
    case 'gameover':
      return GameOverScreen();
    default:
      return h('div', {}, 'Loading...');
  }
}

function gameLoop(currentTime) {
  if (currentTime - lastFrameTime >= FRAME_TIME) {
    renderApp(App, document.getElementById('app'));
    lastFrameTime = currentTime;
  }
  
  animationId = requestAnimationFrame(gameLoop);
}

function init() {
  initRouter();
  initGame();
  initInput();
  
  onGameUpdate(() => {
    renderApp(App, document.getElementById('app'));
  });
  
  // Start game loop
  animationId = requestAnimationFrame(gameLoop);
}

// Start the application
init();