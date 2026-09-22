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
    if (this.actionBtn && this.actionBtn.innerText !== 'Menu') {
      this.actionBtn.innerText = 'Resign';
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

    // Header row: POACHERS title with Rules button on the same line
    const headerRow = document.createElement('div');
    headerRow.style.display = 'flex';
    headerRow.style.justifyContent = 'space-between';
    headerRow.style.alignItems = 'center';

    const header = document.createElement('div');
    header.style.fontSize = '20px';
    header.style.fontFamily = 'var(--font-heading)';
    header.style.fontWeight = 'bold';
    header.style.background = 'linear-gradient(135deg, #f59e0b 0%, #06b6d4 100%)';
    header.style.webkitBackgroundClip = 'text';
    header.style.webkitTextFillColor = 'transparent';
    header.innerText = 'POACHERS';
    headerRow.appendChild(header);

    const rulesBtn = document.createElement('button');
    rulesBtn.id = 'btn-rules-controls';
    rulesBtn.className = 'btn-show-rules';
    rulesBtn.style.background = '#10b981';
    rulesBtn.style.color = '#fff';
    rulesBtn.style.padding = '4px 10px';
    rulesBtn.style.fontSize = '12px';
    rulesBtn.style.fontWeight = 'bold';
    rulesBtn.style.border = 'none';
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
    scoreboard.innerHTML = `<span style="color:var(--accent-gold)">Team A ${state.score.teamA}</span> : <span style="color:var(--accent-cyan)">${state.score.teamB} Team B</span>`;
    panel.appendChild(scoreboard);


    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';

    const rotateBtn = document.createElement('button');
    rotateBtn.style.flex = '1';
    rotateBtn.style.padding = '8px';
    rotateBtn.style.background = '#0d9488';
    rotateBtn.style.color = '#fff';
    rotateBtn.style.border = 'none';
    rotateBtn.style.borderRadius = '4px';
    rotateBtn.style.cursor = 'pointer';
    rotateBtn.innerText = `Rotate 90°`;
    rotateBtn.addEventListener('click', this.onRotate);

    const isFinished = state.isGameOver || store.isReplaying;

    if (isFinished) {
      this.resetResignConfirmation();
    }

    const actionBtn = document.createElement('button');
    actionBtn.id = 'btn-action-controls';
    actionBtn.style.flex = '1';
    actionBtn.style.padding = '8px';
    actionBtn.style.background = isFinished ? '#2563eb' : '#ef4444';
    actionBtn.style.color = '#fff';
    actionBtn.style.border = 'none';
    actionBtn.style.borderRadius = '4px';
    actionBtn.style.cursor = 'pointer';
    actionBtn.style.fontWeight = 'bold';
    actionBtn.innerText = isFinished ? 'Menu' : (this.isConfirmingResign ? 'Resign?!' : 'Resign');
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
        actionBtn.innerText = 'Resign?!';
        this.attachOutsideClickListener();
      }
    });

    btnRow.appendChild(rotateBtn);
    btnRow.appendChild(actionBtn);
    panel.appendChild(btnRow);

    this.container.appendChild(panel);
  }
}
