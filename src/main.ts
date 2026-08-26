import './ui/styles/theme.css';
import './ui/styles/layout.css';
import './ui/styles/lobby.css';

import { GameState, PlayerSeat } from './core/types';
import { socketClient } from './net/socketClient';
import { store } from './store/store';
import { InputHandler } from './services/InputHandler';
import { TurnManager } from './services/TurnManager';
import { BaseDeckUI } from './ui/components/BaseDeckUI';
import { BoardUI } from './ui/components/BoardUI';
import { CapturesUI } from './ui/components/CapturesUI';
import { ControlsUI } from './ui/components/ControlsUI';
import { TrenchCardsUI } from './ui/components/TrenchCardsUI';
import { LobbyUI } from './ui/components/LobbyUI';
import { LogUI } from './ui/components/LogUI';
import { MobileMenuUI } from './ui/components/MobileMenuUI';
import { OverlaysUI } from './ui/components/OverlaysUI';
import { PublicCardsUI } from './ui/components/PublicCardsUI';
import { StatusUI } from './ui/components/StatusUI';
import { soundManager } from './ui/utils/sound';

// 1. Initialize UI Overlays & Menu
const lobbyUI = new LobbyUI(document.getElementById('lobby-overlay')!);
const mobileMenuUI = new MobileMenuUI(document.getElementById('mobile-bottom-menu-bar')!);
const overlaysUI = new OverlaysUI(document.getElementById('modal-overlay')!);

// 2. Initialize Coordination Services & Sockets
const turnManager = new TurnManager(store, overlaysUI);
const inputHandler = new InputHandler(store, turnManager);

socketClient.connect();

// 3. Initialize Board & Card Components
const boardUI = new BoardUI(
  document.getElementById('board-container')!,
  (index: number) => inputHandler.handleSquareClick(index),
  (fromIndex: number, toIndex: number) => inputHandler.handlePieceDrop(fromIndex, toIndex)
);

const trenchUI = new TrenchCardsUI(
  {
    north: document.getElementById('trench-north')!,
    east: document.getElementById('trench-east')!,
    south: document.getElementById('trench-south')!,
    west: document.getElementById('trench-west')!
  },
  (seat: PlayerSeat, cardIndex: number) => inputHandler.handleTrenchCardClick(seat, cardIndex)
);

const baseDeckUI = new BaseDeckUI(
  document.getElementById('base-deck-panel')!,
  (index: number) => inputHandler.handleBaseCardClick(index),
  (piece) => inputHandler.handlePromotePawn(piece)
);

const publicCardsUI = new PublicCardsUI(document.getElementById('flop-panel')!);
const statusUI = new StatusUI(document.getElementById('status-panel')!);
const capturesUI = new CapturesUI(document.getElementById('captures-panel')!);

const logUI = new LogUI(document.getElementById('log-panel')!, (historyIndex: number) => {
  store.scrubToHistoryIndex(historyIndex);
});

const controlsUI = new ControlsUI(
  document.getElementById('controls-panel')!,
  () => store.rotateBoard(),
  () => inputHandler.handleResign()
);

// 4. Reactive Store Subscriptions
store.subscribeToTimer((_state: GameState, storeInstance) => {
  statusUI.startTimerCountdown(storeInstance);
  soundManager.handleTimerUpdate(storeInstance);
});

store.subscribe((state: GameState, storeInstance) => {
  lobbyUI.render(storeInstance);
  boardUI.render(state, storeInstance);
  trenchUI.render(state, storeInstance);
  baseDeckUI.render(state, storeInstance);
  publicCardsUI.render(state);
  statusUI.render(state, storeInstance);
  capturesUI.render(state, storeInstance);
  controlsUI.render(state, storeInstance);
  logUI.render(state, storeInstance);
  soundManager.handleStateUpdate(state, storeInstance);
  turnManager.syncTurn(state);
});

// Trigger initial render & turn sync
store.triggerUIUpdate();
turnManager.syncTurn(store.getState());

// 5. Responsive Layout Scaling & Window Resize
function updateBoardScale(): void {
  const container = document.querySelector('.board-layout-container') as HTMLElement;
  const centerArea = document.querySelector('.center-area') as HTMLElement;
  if (!container || !centerArea) return;

  mobileMenuUI.applyTabVisibility();

  if (window.innerWidth > 1150) {
    container.style.transform = '';
    container.style.transformOrigin = '';
    centerArea.style.height = '';
    return;
  }

  const naturalWidth = 532;
  const naturalHeight = 688;
  const availableWidth = Math.max(280, window.innerWidth - 16);
  const scale = Math.min(1, availableWidth / naturalWidth);

  container.style.transform = `scale(${scale}) translateZ(0)`;
  container.style.transformOrigin = 'top center';
  centerArea.style.height = `${Math.round(naturalHeight * scale)}px`;
}

let resizeRafId: number | null = null;
function handleWindowResize(): void {
  if (resizeRafId !== null) return;
  resizeRafId = requestAnimationFrame(() => {
    resizeRafId = null;
    updateBoardScale();
  });
}

window.addEventListener('resize', handleWindowResize);
window.addEventListener('orientationchange', handleWindowResize);
updateBoardScale();

// Global click outside to clear selection
document.addEventListener('click', (e: MouseEvent) => {
  const target = e.target as HTMLElement | null;
  if (!target || target.closest('.sq')) return;
  if (
    target.closest('#modal-overlay') ||
    target.closest('#lobby-overlay') ||
    target.closest('#mobile-bottom-menu-bar') ||
    target.closest('#controls-panel') ||
    target.closest('#trench-north') ||
    target.closest('#trench-east') ||
    target.closest('#trench-south') ||
    target.closest('#trench-west') ||
    target.closest('#base-deck-panel') ||
    target.closest('#captures-panel')
  ) {
    return;
  }

  if (store.isSettingBunker || store.selectedSquare !== null) {
    store.setSettingBunker(false);
    store.selectSquare(null, []);
  }
});
