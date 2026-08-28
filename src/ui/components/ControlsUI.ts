import { GameState } from '../../core/types';
import { socketClient } from '../../net/socketClient';
import { GameStore } from '../../store/store';

export class ControlsUI {
  private container: HTMLElement;
  private onRotate: () => void;
  private onResign: () => void;

  constructor(
    container: HTMLElement,
    onRotate: () => void,
    onResign: () => void
  ) {
    this.container = container;
    this.onRotate = onRotate;
    this.onResign = onResign;
  }

  public render(state: GameState, store: GameStore): void {
    this.container.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.gap = '10px';

    const header = document.createElement('div');
    header.style.fontSize = '20px';
    header.style.fontFamily = 'var(--font-heading)';
    header.style.fontWeight = 'bold';
    header.style.background = 'linear-gradient(135deg, #f59e0b 0%, #06b6d4 100%)';
    header.style.webkitBackgroundClip = 'text';
    header.style.webkitTextFillColor = 'transparent';
    header.innerText = 'POACHERS';
    panel.appendChild(header);

    // Scoreboard
    const scoreboard = document.createElement('div');
    scoreboard.style.textAlign = 'center';
    scoreboard.style.padding = '6px';
    scoreboard.style.background = '#1e293b';
    scoreboard.style.borderRadius = '4px';
    scoreboard.style.fontWeight = 'bold';
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

    const actionBtn = document.createElement('button');
    actionBtn.style.flex = '1';
    actionBtn.style.padding = '8px';
    actionBtn.style.background = isFinished ? '#2563eb' : '#ef4444';
    actionBtn.style.color = '#fff';
    actionBtn.style.border = 'none';
    actionBtn.style.borderRadius = '4px';
    actionBtn.style.cursor = 'pointer';
    actionBtn.style.fontWeight = 'bold';
    actionBtn.innerText = isFinished ? 'Menu' : 'Resign';
    actionBtn.addEventListener('click', this.onResign);

    btnRow.appendChild(rotateBtn);
    btnRow.appendChild(actionBtn);
    panel.appendChild(btnRow);

    this.container.appendChild(panel);
  }
}
