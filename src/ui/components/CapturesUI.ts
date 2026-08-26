import { getTeamCapturedPieces, getValidPromotionOptions } from '../../core/engine';
import { GameState, PieceType, getPieceType } from '../../core/types';
import { GameStore, store } from '../../store/store';

// Sort order: King(5) → Rook(4) → Bishop(3) → Knight(2) → Pawn(1)
const PIECE_ORDER: Record<number, number> = { 5: 0, 4: 1, 3: 2, 2: 3, 1: 4 };
const SVG_NAMES = ['', 'p', 'n', 'b', 'r', 'k'];

function sortDeadPool(pieces: (PieceType | number)[]): (PieceType | number)[] {
  return [...pieces].sort((a, b) => {
    const orderA = PIECE_ORDER[getPieceType(a)] ?? 99;
    const orderB = PIECE_ORDER[getPieceType(b)] ?? 99;
    return orderA - orderB;
  });
}

function getPieceSVG(piece: PieceType | number): string {
  const pType = getPieceType(piece);
  if (pType === 0) return '';
  const isTeamA = typeof piece === 'number' ? (piece & 8) === 0 : true;
  const prefix = isTeamA ? 'w_' : 'b_';
  const name = SVG_NAMES[pType] || 'p';
  return `/assets/${prefix}${name}.svg`;
}

/**
 * Build a flex row of piece images with the sardine/grouping layout.
 * Spacing controlled by CSS variables: --gap-pieces, --gap-similar-piece, --gap-pawns in theme.css
 */
export function buildPieceRow(
  pieces: (PieceType | number)[],
  imgSize: number,
  onClickPiece?: (piece: PieceType | number) => void,
  highlightedPiece?: PieceType | number | null,
  highlightColor?: string,
  canPromoteSet?: Set<number>
): HTMLElement {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.flexWrap = 'wrap';
  row.style.minHeight = `${imgSize + 4}px`;
  row.style.rowGap = '4px';

  const sorted = sortDeadPool(pieces);
  const highlightedType = getPieceType(highlightedPiece);

  sorted.forEach((piece, idx) => {
    const pType = getPieceType(piece);
    const prevPiece = idx > 0 ? sorted[idx - 1] : null;
    const sameType = prevPiece ? getPieceType(prevPiece) === pType : false;

    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.justifyContent = 'center';
    wrapper.style.width = `${imgSize}px`;
    wrapper.style.height = `${imgSize}px`;
    wrapper.style.flexShrink = '0';
    wrapper.style.borderRadius = '3px';
    wrapper.style.boxSizing = 'border-box';
    wrapper.style.zIndex = String(idx);

    if (idx > 0) {
      if (sameType) {
        if (pType === 1) {
          wrapper.style.marginLeft = 'var(--gap-pawns, -18px)';
        } else {
          wrapper.style.marginLeft = 'var(--gap-similar-piece, -14px)';
        }
      } else {
        wrapper.style.marginLeft = 'var(--gap-pieces, 0px)';
      }
    }

    const isHighlighted = highlightedType !== 0 && pType === highlightedType;
    const canPromo = canPromoteSet ? canPromoteSet.has(pType) : false;

    if (isHighlighted && highlightColor) {
      wrapper.style.outline = `2px solid ${highlightColor}`;
      wrapper.style.background = `${highlightColor}33`;
    } else if (canPromo) {
      wrapper.style.outline = '1.5px solid #22c55e';
      wrapper.style.background = 'rgba(34,197,94,0.12)';
    }

    if (onClickPiece) {
      wrapper.style.cursor = 'pointer';
      wrapper.onclick = () => onClickPiece(piece);
    }

    const img = document.createElement('img');
    img.src = getPieceSVG(piece);
    img.alt = String(piece);
    img.style.width = `${imgSize - 2}px`;
    img.style.height = `${imgSize - 2}px`;
    img.style.objectFit = 'contain';
    img.style.pointerEvents = 'none';

    wrapper.appendChild(img);
    row.appendChild(wrapper);
  });

  return row;
}

export class CapturesUI {
  private container: HTMLElement;
  private panel: HTMLElement | null = null;
  private groupDivA: HTMLElement | null = null;
  private groupDivB: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  private initDOMStructure(): void {
    this.container.innerHTML = '';

    this.panel = document.createElement('div');
    this.panel.style.display = 'flex';
    this.panel.style.flexDirection = 'column';
    this.panel.style.gap = '10px';

    const header = document.createElement('div');
    header.style.fontSize = '13px';
    header.style.fontWeight = 'bold';
    header.style.color = '#e2e8f0';
    header.style.letterSpacing = '0.5px';
    header.innerText = 'CAPTURED PIECES';
    this.panel.appendChild(header);

    this.groupDivA = document.createElement('div');
    this.groupDivA.style.padding = '8px 10px';
    this.groupDivA.style.borderRadius = '6px';

    this.groupDivB = document.createElement('div');
    this.groupDivB.style.padding = '8px 10px';
    this.groupDivB.style.borderRadius = '6px';

    this.panel.appendChild(this.groupDivA);
    this.panel.appendChild(this.groupDivB);
    this.container.appendChild(this.panel);
  }

  public render(state: GameState, storeInstance: GameStore): void {
    if (!this.panel || !this.container.contains(this.panel)) {
      this.initDOMStructure();
    }

    const activeSeat = state.activePlayer;
    const activePlayerState = state.players[activeSeat];
    const activeTeam = activePlayerState.team;

    const teams: { team: 'A' | 'B'; label: string; color: string; groupDiv: HTMLElement }[] = [
      { team: 'A', label: 'Team A (North & South)', color: '#3b82f6', groupDiv: this.groupDivA! },
      { team: 'B', label: 'Team B (East & West)', color: '#ef4444', groupDiv: this.groupDivB! }
    ];

    teams.forEach(({ team, color, groupDiv }) => {
      const isCurrentActiveTeam = team === activeTeam;
      const teamPieces = getTeamCapturedPieces(state, team);

      groupDiv.innerHTML = '';
      groupDiv.style.background = isCurrentActiveTeam ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255, 255, 255, 0.03)';
      groupDiv.style.border = isCurrentActiveTeam ? `1px solid ${color}` : '1px solid transparent';

      const promoOptions = isCurrentActiveTeam ? getValidPromotionOptions(state, activeSeat) : [];
      const canPromoteSet = new Set(promoOptions.map(o => getPieceType(o.promotedPiece)).filter(t => t !== 0));

      if (isCurrentActiveTeam && promoOptions.length > 0) {
        const promoNotice = document.createElement('div');
        promoNotice.style.fontSize = '11px';
        promoNotice.style.fontWeight = 'bold';
        promoNotice.style.color = '#22c55e';
        promoNotice.style.marginBottom = '6px';
        promoNotice.innerText = '⚡ Promotion available! Select a piece below to promote on Hill.';
        groupDiv.appendChild(promoNotice);
      }

      if (teamPieces.length === 0) {
        const empty = document.createElement('span');
        empty.style.display = 'block';
        empty.style.fontSize = '11px';
        empty.style.color = '#64748b';
        empty.style.fontStyle = 'italic';
        empty.innerText = 'No lost pieces yet';
        groupDiv.appendChild(empty);
      } else {
        const iconsRow = buildPieceRow(
          teamPieces,
          28,
          isCurrentActiveTeam ? (piece) => this.onSelectCapturedPiece(piece) : undefined,
          isCurrentActiveTeam ? storeInstance.selectedPromotionPiece : null,
          color,
          isCurrentActiveTeam ? canPromoteSet : undefined
        );
        groupDiv.appendChild(iconsRow);
      }
    });
  }

  private onSelectCapturedPiece(piece: PieceType | number): void {
    if (store.selectedPromotionPiece === piece) {
      store.selectedPromotionPiece = null;
    } else {
      store.selectedPromotionPiece = piece as PieceType;
    }
    store.triggerUIUpdate();
  }
}
