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
    const borderColor = isTeamA ? 'var(--Team_A_color)' : (isTeamB ? 'var(--Team_B_color)' : 'var(--Color_Beige)');
    const shadowColor = isTeamA ? 'rgba(245, 158, 11, 0.4)' : (isTeamB ? 'rgba(6, 182, 212, 0.4)' : 'rgba(247, 251, 169, 0.25)');

    card.style.border = `1.5px solid ${borderColor}`;
    card.style.boxShadow = `0 25px 60px rgba(0, 0, 0, 0.75), 0 0 30px ${shadowColor}`;

    const title = document.createElement('h1');
    title.style.color = borderColor;
    title.style.margin = '0 0 10px 0';
    title.style.fontFamily = 'var(--Font_classic)';
    title.style.fontSize = '26px';
    title.style.fontWeight = '700';
    title.innerText = isTeamA ? 'Team Gold (A) Won!' : (isTeamB ? 'Team Cyan (B) Won!' : 'Game Over - Draw!');
    card.appendChild(title);

    const desc = document.createElement('p');
    desc.style.color = 'var(--Color_Beige)';
    desc.style.opacity = '0.9';
    desc.style.fontFamily = 'var(--Font_classic)';
    desc.style.fontSize = '14px';
    desc.style.margin = '0 0 18px 0';
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
      banner.style.borderRadius = '8px';
      banner.style.fontSize = '13px';
      banner.style.fontWeight = '700';
      banner.style.textAlign = 'center';
      banner.style.fontFamily = 'var(--Font_classic)';

      if (isMyRequest) {
        banner.style.background = 'rgba(245, 158, 11, 0.15)';
        banner.style.border = '1.5px solid #f59e0b';
        banner.style.color = '#f59e0b';
        banner.innerText = '⏳ Rematch Requested... Waiting for opponent to accept';
      } else if (isAcceptedByMe) {
        banner.style.background = 'rgba(34, 197, 94, 0.15)';
        banner.style.border = '1.5px solid #22c55e';
        banner.style.color = '#4ade80';
        banner.innerText = '✓ Rematch Accepted! Starting match...';
      } else {
        banner.style.background = 'rgba(34, 197, 94, 0.2)';
        banner.style.border = '1.5px solid #22c55e';
        banner.style.color = '#4ade80';
        banner.innerText = `⚡ ${rematchOffer.requestedByName || 'Opponent'} requested a Rematch!`;
      }
      card.appendChild(banner);
    }

    const btnGroup = document.createElement('div');
    btnGroup.className = 'overlay-btn-group';

    const rematchBtn = document.createElement('button');
    rematchBtn.className = 'btn-overlay btn-primary btn-rematch';

    if (rematchMode === 'disabled') {
      rematchBtn.innerText = '🚫 Rematch (Unavailable)';
      rematchBtn.disabled = true;
      rematchBtn.title = 'Cannot rematch: Opponent left the match';
    } else if (rematchMode === 'return_to_lobby') {
      rematchBtn.innerText = '🔄 Rematch (Seat Setup)';
      rematchBtn.title = 'A player left. Click to return to seat setting room.';
      rematchBtn.addEventListener('click', () => {
        options.onRematch();
      });
    } else if (rematchOffer) {
      if (isMyRequest) {
        rematchBtn.innerText = '⏳ Waiting for Opponent...';
        rematchBtn.disabled = true;
      } else if (isAcceptedByMe) {
        rematchBtn.innerText = '✓ Rematch Accepted';
        rematchBtn.classList.add('btn-ready-active');
        rematchBtn.disabled = true;
      } else {
        rematchBtn.innerText = '✓ Accept Rematch';
        rematchBtn.classList.add('btn-ready-active');
        rematchBtn.addEventListener('click', () => {
          if (options.onAcceptRematch) {
            options.onAcceptRematch();
          } else {
            options.onRematch();
          }
        });
      }
    } else {
      rematchBtn.innerText = '🔄 Rematch';
      rematchBtn.addEventListener('click', () => {
        options.onRematch();
      });
    }
    btnGroup.appendChild(rematchBtn);

    const lobbyBtn = document.createElement('button');
    lobbyBtn.className = 'btn-overlay btn-secondary btn-back-lobby';
    lobbyBtn.innerText = '🏠 Back to Lobby';
    lobbyBtn.addEventListener('click', () => {
      this.hideAll();
      options.onBackToLobby();
    });
    btnGroup.appendChild(lobbyBtn);

    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'btn-overlay btn-secondary btn-review-game';
    reviewBtn.innerText = '🔍 Review Game';
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
