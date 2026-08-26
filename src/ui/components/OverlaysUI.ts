import { Team } from '../../core/types';
import { RematchOfferState } from '../../net/events';

export interface GameOverOptions {
  onRematch: () => void;
  onAcceptRematch?: () => void;
  onReviewGame: () => void;
  onBackToLobby: () => void;
}

export class OverlaysUI {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public showGameOver(
    winnerTeam: Team | null,
    options: GameOverOptions,
    message?: string,
    rematchOffer?: RematchOfferState | null,
    myPlayerId?: string | null,
    rematchMode: 'available' | 'disabled' | 'return_to_lobby' = 'available'
  ): void {
    this.container.innerHTML = '';
    this.container.className = 'overlay';

    const card = document.createElement('div');
    card.className = 'overlay-card';

    const isTeamA = winnerTeam === 'A';
    const isTeamB = winnerTeam === 'B';
    const borderColor = isTeamA ? 'var(--team-a-color)' : (isTeamB ? 'var(--team-b-color)' : '#94a3b8');
    const shadowColor = isTeamA ? 'rgba(245, 158, 11, 0.4)' : (isTeamB ? 'rgba(6, 182, 212, 0.4)' : 'rgba(148, 163, 184, 0.4)');

    card.style.border = `2px solid ${borderColor}`;
    card.style.boxShadow = `0 0 30px ${shadowColor}`;

    const title = document.createElement('h1');
    title.style.color = borderColor;
    title.style.margin = '0 0 10px 0';
    title.style.fontFamily = 'var(--font-heading)';
    title.style.fontSize = '28px';
    title.innerText = isTeamA ? 'Team Gold (A) Won!' : (isTeamB ? 'Team Cyan (B) Won!' : 'Game Over - Draw!');
    card.appendChild(title);

    const desc = document.createElement('p');
    desc.style.color = '#94a3b8';
    desc.style.fontSize = '14px';
    desc.style.margin = '0 0 16px 0';
    desc.innerText = message || (winnerTeam ? `Team ${winnerTeam === 'A' ? 'Gold (A)' : 'Cyan (B)'} achieved victory!` : 'The match ended in a draw.');
    card.appendChild(desc);

    let isMyRequest = false;
    let isAcceptedByMe = false;
    if (rematchOffer && myPlayerId) {
      isMyRequest = rematchOffer.requestedByPlayerId === myPlayerId;
      isAcceptedByMe = rematchOffer.acceptedPlayerIds.includes(myPlayerId);
    }

    if (rematchOffer && rematchMode === 'available') {
      const banner = document.createElement('div');
      banner.style.padding = '8px 12px';
      banner.style.marginBottom = '16px';
      banner.style.borderRadius = '6px';
      banner.style.fontSize = '13px';
      banner.style.fontWeight = 'bold';
      banner.style.textAlign = 'center';

      if (isMyRequest) {
        banner.style.background = 'rgba(245, 158, 11, 0.2)';
        banner.style.border = '1px solid #f59e0b';
        banner.style.color = '#f59e0b';
        banner.innerText = '⏳ Rematch Requested... Waiting for opponent to accept';
      } else if (isAcceptedByMe) {
        banner.style.background = 'rgba(34, 197, 94, 0.2)';
        banner.style.border = '1px solid #22c55e';
        banner.style.color = '#4ade80';
        banner.innerText = '✓ Rematch Accepted! Starting match...';
      } else {
        banner.style.background = 'rgba(34, 197, 94, 0.25)';
        banner.style.border = '1px solid #22c55e';
        banner.style.color = '#4ade80';
        banner.innerText = `⚡ ${rematchOffer.requestedByName || 'Opponent'} requested a Rematch!`;
      }
      card.appendChild(banner);
    }

    const btnGroup = document.createElement('div');
    btnGroup.className = 'overlay-btn-group';
    btnGroup.style.display = 'flex';
    btnGroup.style.flexDirection = 'column';
    btnGroup.style.gap = '10px';

    const rematchBtn = document.createElement('button');
    rematchBtn.className = 'btn-overlay btn-rematch';
    rematchBtn.style.padding = '12px 20px';
    rematchBtn.style.borderRadius = '6px';
    rematchBtn.style.fontWeight = '700';
    rematchBtn.style.fontSize = '15px';
    rematchBtn.style.border = 'none';

    if (rematchMode === 'disabled') {
      rematchBtn.innerText = 'Rematch (Unavailable)';
      rematchBtn.style.background = '#334155';
      rematchBtn.style.color = '#64748b';
      rematchBtn.style.cursor = 'not-allowed';
      rematchBtn.style.opacity = '0.6';
      rematchBtn.disabled = true;
      rematchBtn.title = 'Cannot rematch: Opponent left the match';
    } else if (rematchMode === 'return_to_lobby') {
      rematchBtn.innerText = 'Rematch (Seat Setup)';
      rematchBtn.style.background = '#2563eb';
      rematchBtn.style.color = '#fff';
      rematchBtn.style.cursor = 'pointer';
      rematchBtn.title = 'A player left. Click to return to seat setting room.';
      rematchBtn.addEventListener('click', () => {
        options.onRematch();
      });
    } else if (rematchOffer) {
      if (isMyRequest) {
        rematchBtn.innerText = '⏳ Waiting for Opponent...';
        rematchBtn.style.background = '#334155';
        rematchBtn.style.color = '#94a3b8';
        rematchBtn.style.cursor = 'not-allowed';
        rematchBtn.disabled = true;
      } else if (isAcceptedByMe) {
        rematchBtn.innerText = '✓ Rematch Accepted';
        rematchBtn.style.background = '#166534';
        rematchBtn.style.color = '#4ade80';
        rematchBtn.style.cursor = 'not-allowed';
        rematchBtn.disabled = true;
      } else {
        rematchBtn.innerText = '✓ Accept Rematch';
        rematchBtn.style.background = '#22c55e';
        rematchBtn.style.color = '#000';
        rematchBtn.style.cursor = 'pointer';
        rematchBtn.addEventListener('click', () => {
          if (options.onAcceptRematch) {
            options.onAcceptRematch();
          } else {
            options.onRematch();
          }
        });
      }
    } else {
      rematchBtn.innerText = 'Rematch';
      rematchBtn.style.background = '#2563eb';
      rematchBtn.style.color = '#fff';
      rematchBtn.style.cursor = 'pointer';
      rematchBtn.addEventListener('click', () => {
        options.onRematch();
      });
    }
    btnGroup.appendChild(rematchBtn);

    const lobbyBtn = document.createElement('button');
    lobbyBtn.className = 'btn-overlay btn-back-lobby';
    lobbyBtn.style.padding = '12px 20px';
    lobbyBtn.style.background = '#334155';
    lobbyBtn.style.color = '#f8fafc';
    lobbyBtn.style.border = '1px solid #475569';
    lobbyBtn.style.borderRadius = '6px';
    lobbyBtn.style.cursor = 'pointer';
    lobbyBtn.style.fontWeight = '700';
    lobbyBtn.style.fontSize = '15px';
    lobbyBtn.innerText = 'Back to Lobby';
    lobbyBtn.addEventListener('click', () => {
      this.hideAll();
      options.onBackToLobby();
    });
    btnGroup.appendChild(lobbyBtn);

    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'btn-overlay btn-review-game';
    reviewBtn.style.padding = '12px 20px';
    reviewBtn.style.background = '#0d9488';
    reviewBtn.style.color = '#fff';
    reviewBtn.style.border = 'none';
    reviewBtn.style.borderRadius = '6px';
    reviewBtn.style.cursor = 'pointer';
    reviewBtn.style.fontWeight = '700';
    reviewBtn.style.fontSize = '15px';
    reviewBtn.innerText = 'Review Game';
    reviewBtn.addEventListener('click', () => {
      this.hideAll();
      options.onReviewGame();
    });
    btnGroup.appendChild(reviewBtn);

    card.appendChild(btnGroup);
    this.container.appendChild(card);
  }

  public hideAll(): void {
    this.container.className = 'overlay hidden';
  }
}
