import { GameState } from '../../core/types';
import { socketClient } from '../../net/socketClient';
import { GameStore } from '../../store/store';

export class ControlsUI {
  private container: HTMLElement;
  private onRotate: () => void;
  private onResign: () => void;
  private onBackToLobby?: () => void;

  constructor(
    container: HTMLElement,
    onRotate: () => void,
    onResign: () => void,
    onBackToLobby?: () => void
  ) {
    this.container = container;
    this.onRotate = onRotate;
    this.onResign = onResign;
    this.onBackToLobby = onBackToLobby;
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
    header.style.color = 'var(--accent-gold)';
    header.innerText = 'POACHERS BATTLEFIELD';
    panel.appendChild(header);

    // Scoreboard
    const scoreboard = document.createElement('div');
    scoreboard.style.textAlign = 'center';
    scoreboard.style.padding = '6px';
    scoreboard.style.background = '#1e293b';
    scoreboard.style.borderRadius = '4px';
    scoreboard.style.fontWeight = 'bold';
    scoreboard.innerHTML = `Team A <span style="color:var(--accent-gold)">${state.score.teamA}</span> : <span style="color:var(--accent-cyan)">${state.score.teamB}</span> Team B`;
    panel.appendChild(scoreboard);

    if (store.isReplaying) {
      const reviewBadge = document.createElement('div');
      reviewBadge.style.textAlign = 'center';
      reviewBadge.style.padding = '4px 8px';
      reviewBadge.style.background = '#0d9488';
      reviewBadge.style.color = '#fff';
      reviewBadge.style.borderRadius = '4px';
      reviewBadge.style.fontSize = '12px';
      reviewBadge.style.fontWeight = '600';
      reviewBadge.innerText = '🔍 REVIEW / REPLAY MODE';
      panel.appendChild(reviewBadge);

      const lobbyBtn = document.createElement('button');
      lobbyBtn.style.width = '100%';
      lobbyBtn.style.padding = '8px 12px';
      lobbyBtn.style.background = '#334155';
      lobbyBtn.style.color = '#f8fafc';
      lobbyBtn.style.border = '1px solid #475569';
      lobbyBtn.style.borderRadius = '4px';
      lobbyBtn.style.cursor = 'pointer';
      lobbyBtn.style.fontWeight = '700';
      lobbyBtn.style.fontSize = '13px';
      lobbyBtn.style.transition = 'all 0.2s ease';
      lobbyBtn.innerText = 'Back to Lobby';
      lobbyBtn.addEventListener('click', () => {
        if (this.onBackToLobby) {
          this.onBackToLobby();
        }
      });
      panel.appendChild(lobbyBtn);
    }

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

    const resignBtn = document.createElement('button');
    resignBtn.style.flex = '1';
    resignBtn.style.padding = '8px';
    resignBtn.style.background = '#ef4444';
    resignBtn.style.color = '#fff';
    resignBtn.style.border = 'none';
    resignBtn.style.borderRadius = '4px';
    resignBtn.style.cursor = 'pointer';
    resignBtn.style.fontWeight = 'bold';
    resignBtn.innerText = 'Resign';
    if (state.isGameOver) {
      resignBtn.disabled = true;
      resignBtn.style.opacity = '0.5';
      resignBtn.style.cursor = 'not-allowed';
    }
    resignBtn.addEventListener('click', this.onResign);

    btnRow.appendChild(rotateBtn);
    btnRow.appendChild(resignBtn);
    panel.appendChild(btnRow);

    // Auto Card Pick Toggle
    const autoPickRow = document.createElement('div');
    autoPickRow.style.marginTop = '2px';

    const autoPickBtn = document.createElement('button');
    autoPickBtn.style.width = '100%';
    autoPickBtn.style.padding = '6px';
    autoPickBtn.style.fontSize = '12px';
    autoPickBtn.style.fontWeight = 'bold';
    autoPickBtn.style.border = 'none';
    autoPickBtn.style.borderRadius = '4px';
    autoPickBtn.style.cursor = 'pointer';
    autoPickBtn.style.background = store.autoCardPick ? '#f59e0b' : '#334155';
    autoPickBtn.style.color = store.autoCardPick ? '#000' : '#fff';
    autoPickBtn.innerText = `Auto Card Pick: ${store.autoCardPick ? 'ON' : 'OFF'}`;
    autoPickBtn.addEventListener('click', () => {
      store.toggleAutoCardPick();
      if (store.isMultiplayer) {
        socketClient.toggleAutoCardPick();
      }
    });

    autoPickRow.appendChild(autoPickBtn);
    panel.appendChild(autoPickRow);

    this.container.appendChild(panel);
  }
}
