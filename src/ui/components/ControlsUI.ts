import { GameState } from '../../core/types';
import { socketClient } from '../../net/socketClient';
import { GameStore } from '../../store/store';
import { toggleRulesModal } from './RulesModal';

export class ControlsUI {
  private container: HTMLElement;
  private onRotate: () => void;
  private onResign: () => void;
  private isConfirmingResign: boolean = false;
  private actionBtn: HTMLButtonElement | null = null;

  constructor(
    container: HTMLElement,
    onRotate: () => void,
    onResign: () => void
  ) {
    this.container = container;
    this.onRotate = onRotate;
    this.onResign = onResign;
  }

  private handleOutsideClick = (e: Event): void => {
    if (this.actionBtn && (e.target === this.actionBtn || (this.actionBtn.contains && this.actionBtn.contains(e.target as Node)))) {
      return;
    }
    this.resetResignConfirmation();
  };

  private attachOutsideClickListener(): void {
    this.detachOutsideClickListener();
    if (typeof document !== 'undefined') {
      document.addEventListener?.('pointerdown', this.handleOutsideClick, true);
      document.addEventListener?.('click', this.handleOutsideClick, true);
    }
  }

  private detachOutsideClickListener(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener?.('pointerdown', this.handleOutsideClick, true);
      document.removeEventListener?.('click', this.handleOutsideClick, true);
    }
  }

  public resetResignConfirmation(): void {
    this.isConfirmingResign = false;
    if (this.actionBtn && !this.actionBtn.innerText.includes('Menu')) {
      this.actionBtn.innerText = '🏳️ Resign';
    }
    this.detachOutsideClickListener();
  }

  public render(state: GameState, store: GameStore): void {
    this.container.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.gap = '10px';

    // Header row: POACHERS logo with Rules button on the same line
    const headerRow = document.createElement('div');
    headerRow.className = 'controls-header-row';
    headerRow.style.display = 'flex';
    headerRow.style.justifyContent = 'space-between';
    headerRow.style.alignItems = 'center';
    headerRow.style.gap = '8px';

    const logoImg = document.createElement('img');
    logoImg.src = '/assets/poachers_logo.svg';
    logoImg.alt = 'POACHERS';
    logoImg.className = 'controls-header-logo';
    (logoImg as any).draggable = false;
    headerRow.appendChild(logoImg);

    const rulesBtn = document.createElement('button');
    rulesBtn.id = 'btn-rules-controls';
    rulesBtn.className = 'btn-show-rules';
    rulesBtn.style.padding = '4px 10px';
    rulesBtn.style.fontSize = '12px';
    rulesBtn.style.fontWeight = 'bold';
    rulesBtn.style.borderRadius = '4px';
    rulesBtn.style.cursor = 'pointer';
    rulesBtn.style.display = 'inline-flex';
    rulesBtn.style.alignItems = 'center';
    rulesBtn.style.gap = '4px';
    rulesBtn.innerText = '📜 RULES';
    rulesBtn.title = 'View Game Rules';
    rulesBtn.addEventListener('click', () => {
      toggleRulesModal();
    });
    headerRow.appendChild(rulesBtn);

    panel.appendChild(headerRow);

    // Scoreboard
    const scoreboard = document.createElement('div');
    scoreboard.className = 'controls-scoreboard';
    scoreboard.innerHTML = `<span class="scoreboard-team scoreboard-team-a" style="color:var(--Team_A_color)"><span class="scoreboard-team-name">Team A</span> <span class="scoreboard-score">${state.score.teamA}</span></span> <span class="scoreboard-divider" style="color:var(--Color_Beige)">:</span> <span class="scoreboard-team scoreboard-team-b" style="color:var(--Team_B_color)"><span class="scoreboard-score">${state.score.teamB}</span> <span class="scoreboard-team-name">Team B</span></span>`;
    panel.appendChild(scoreboard);


    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';

    const rotateBtn = document.createElement('button');
    rotateBtn.id = 'btn-rotate-controls';
    rotateBtn.style.flex = '1';
    rotateBtn.style.padding = '8px';
    rotateBtn.style.borderRadius = '4px';
    rotateBtn.style.cursor = 'pointer';
    rotateBtn.innerText = `🔄 Rotate 90°`;
    rotateBtn.addEventListener('click', this.onRotate);

    const isFinished = state.isGameOver || store.isReplaying;

    if (isFinished) {
      this.resetResignConfirmation();
    }

    const actionBtn = document.createElement('button');
    actionBtn.id = 'btn-action-controls';
    actionBtn.style.flex = '1';
    actionBtn.style.padding = '8px';
    actionBtn.style.borderRadius = '4px';
    actionBtn.style.cursor = 'pointer';
    actionBtn.style.fontWeight = 'bold';
    actionBtn.innerText = isFinished ? '🏠 Menu' : (this.isConfirmingResign ? '⚠️ Resign?!' : '🏳️ Resign');
    this.actionBtn = actionBtn;

    actionBtn.addEventListener('click', () => {
      if (isFinished) {
        this.onResign();
        return;
      }

      if (this.isConfirmingResign) {
        this.resetResignConfirmation();
        this.onResign();
      } else {
        this.isConfirmingResign = true;
        actionBtn.innerText = '⚠️ Resign?!';
        this.attachOutsideClickListener();
      }
    });

    btnRow.appendChild(rotateBtn);
    btnRow.appendChild(actionBtn);
    panel.appendChild(btnRow);

    this.container.appendChild(panel);
  }
}
