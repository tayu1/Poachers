import { getTeamCapturedPieces, getValidPromotionOptions } from '../../core/engine';
import { GameState, PieceType, Team, getPieceType } from '../../core/types';
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

function getPieceSVG(piece: PieceType | number, team?: Team): string {
  const pType = getPieceType(piece);
  if (pType === 0) return '';
  let isTeamA = true;
  if (typeof piece === 'number') {
    if (piece >= 8) {
      isTeamA = false;
    } else if (team !== undefined) {
      isTeamA = team === 'A';
    } else {
      isTeamA = (piece & 8) === 0;
    }
  } else if (team !== undefined) {
    isTeamA = team === 'A';
  }
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
  imgSize: number | string = 'var(--Deadpool_piece_size, 22px)',
  onClickPiece?: (piece: PieceType | number) => void,
  highlightedPiece?: PieceType | number | null,
  highlightColor?: string,
  canPromoteSet?: Set<number>,
  team?: Team
): HTMLElement {
  const sizeCss = typeof imgSize === 'number' ? `${imgSize}px` : imgSize;
  const imgSizeCss = typeof imgSize === 'number' ? `${imgSize - 2}px` : `calc(${imgSize} - 2px)`;

  const row = document.createElement('div');
  row.className = 'deadpool-piece-row';
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.flexWrap = 'wrap';
  row.style.minHeight = sizeCss;
  row.style.rowGap = '2px';

  const sorted = sortDeadPool(pieces);
  const highlightedType = getPieceType(highlightedPiece);

  sorted.forEach((piece, idx) => {
    const pType = getPieceType(piece);
    const prevPiece = idx > 0 ? sorted[idx - 1] : null;
    const sameType = prevPiece ? getPieceType(prevPiece) === pType : false;

    const wrapper = document.createElement('div');
    wrapper.className = 'deadpool-piece-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.justifyContent = 'center';
    wrapper.style.width = sizeCss;
    wrapper.style.height = sizeCss;
    wrapper.style.flexShrink = '0';
    wrapper.style.borderRadius = '3px';
    wrapper.style.boxSizing = 'border-box';
    wrapper.style.zIndex = String(idx);

    if (idx > 0) {
      if (sameType) {
        if (pType === 1) {
          wrapper.style.marginLeft = 'var(--Deadpool_gap_pawns, -14px)';
        } else {
          wrapper.style.marginLeft = 'var(--Deadpool_gap_similar_piece, -11px)';
        }
      } else {
        wrapper.style.marginLeft = 'var(--Deadpool_gap_pieces, 0px)';
      }
    }

    const isHighlighted = highlightedType !== 0 && pType === highlightedType;
    const canPromo = canPromoteSet ? canPromoteSet.has(pType) : false;

    if (isHighlighted && highlightColor) {
      wrapper.style.outline = `2px solid ${highlightColor}`;
      wrapper.style.background = highlightColor.startsWith('#')
        ? `${highlightColor}33`
        : 'rgba(255, 255, 255, 0.2)';
    } else if (canPromo) {
      wrapper.style.outline = '1.5px solid #22c55e';
      wrapper.style.background = 'rgba(34,197,94,0.12)';
    }

    if (onClickPiece && pType !== 1) {
      wrapper.style.cursor = 'pointer';
      wrapper.onclick = () => onClickPiece(piece);
    }

    const img = document.createElement('img');
    img.className = 'deadpool-piece-img';
    img.src = getPieceSVG(piece, team);
    img.alt = String(piece);
    img.style.width = imgSizeCss;
    img.style.height = imgSizeCss;
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
    this.panel.className = 'panel';
    this.panel.style.display = 'flex';
    this.panel.style.flexDirection = 'column';
    this.panel.style.gap = '10px';

    const header = document.createElement('div');
    header.className = 'captures-header';
    header.style.fontSize = '13px';
    header.style.fontWeight = 'bold';
    header.style.color = 'var(--Color_Beige, #f7fba9)';
    header.style.letterSpacing = '0.5px';
    header.innerText = 'CAPTURED PIECES';
    this.panel.appendChild(header);

    this.groupDivA = document.createElement('div');
    this.groupDivA.className = 'captures-bar captures-bar-a';
    this.groupDivA.style.minHeight = '30px';
    this.groupDivA.style.boxSizing = 'border-box';
    this.groupDivA.style.display = 'flex';
    this.groupDivA.style.flexDirection = 'column';
    this.groupDivA.style.justifyContent = 'center';
    this.groupDivA.style.padding = '3px 6px';
    this.groupDivA.style.borderRadius = '6px';
    this.groupDivA.style.border = '1px solid var(--Team_A_color)';
    this.groupDivA.style.background = 'var(--Deadpool_box_bg, rgba(255, 255, 255, 0.03))';
    this.groupDivA.style.boxShadow = 'none';
    this.groupDivA.style.transition = 'all 0.25s ease';

    this.groupDivB = document.createElement('div');
    this.groupDivB.className = 'captures-bar captures-bar-b';
    this.groupDivB.style.minHeight = '30px';
    this.groupDivB.style.boxSizing = 'border-box';
    this.groupDivB.style.display = 'flex';
    this.groupDivB.style.flexDirection = 'column';
    this.groupDivB.style.justifyContent = 'center';
    this.groupDivB.style.padding = '3px 6px';
    this.groupDivB.style.borderRadius = '6px';
    this.groupDivB.style.border = '1px solid var(--Team_B_color)';
    this.groupDivB.style.background = 'var(--Deadpool_box_bg, rgba(255, 255, 255, 0.03))';
    this.groupDivB.style.boxShadow = 'none';
    this.groupDivB.style.transition = 'all 0.25s ease';

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
      { team: 'A', label: 'Team A (North & South)', color: 'var(--Team_A_color)', groupDiv: this.groupDivA! },
      { team: 'B', label: 'Team B (East & West)', color: 'var(--Team_B_color)', groupDiv: this.groupDivB! }
    ];

    teams.forEach(({ team, color, groupDiv }) => {
      const isCurrentActiveTeam = team === activeTeam;
      const teamPieces = getTeamCapturedPieces(state, team);

      groupDiv.innerHTML = '';
      groupDiv.style.border = `1px solid ${color}`;
      groupDiv.style.background = 'var(--Deadpool_box_bg, rgba(255, 255, 255, 0.03))';
      groupDiv.style.boxShadow = 'none';
      groupDiv.style.minHeight = '30px';
      groupDiv.style.boxSizing = 'border-box';
      groupDiv.style.display = 'flex';
      groupDiv.style.flexDirection = 'column';
      groupDiv.style.justifyContent = 'center';
      groupDiv.style.padding = '3px 6px';

      const promoOptions = isCurrentActiveTeam ? getValidPromotionOptions(state, activeSeat) : [];
      const canPromoteSet = new Set(promoOptions.map(o => getPieceType(o.promotedPiece)).filter(t => t !== 0));

      if (isCurrentActiveTeam && promoOptions.length > 0) {
        const promoNotice = document.createElement('div');
        promoNotice.style.fontSize = '10px';
        promoNotice.style.fontWeight = 'bold';
        promoNotice.style.color = '#22c55e';
        promoNotice.style.marginBottom = '2px';
        promoNotice.innerText = 'Click to Promote';
        groupDiv.appendChild(promoNotice);
      }

      const pieceImgSize = 'var(--Deadpool_piece_size, 22px)';

      if (teamPieces.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'deadpool-empty-notice';
        empty.style.display = 'flex';
        empty.style.alignItems = 'center';
        empty.style.minHeight = pieceImgSize;
        empty.style.fontSize = '11px';
        empty.style.color = '#64748b';
        empty.style.fontStyle = 'italic';
        empty.style.lineHeight = '1';
        empty.innerText = 'No lost pieces yet';
        groupDiv.appendChild(empty);
      } else {
        const iconsRow = buildPieceRow(
          teamPieces,
          pieceImgSize,
          isCurrentActiveTeam ? (piece) => this.onSelectCapturedPiece(piece) : undefined,
          isCurrentActiveTeam ? storeInstance.selectedPromotionPiece : null,
          color,
          isCurrentActiveTeam ? canPromoteSet : undefined,
          team
        );
        groupDiv.appendChild(iconsRow);
      }
    });
  }

  private onSelectCapturedPiece(piece: PieceType | number): void {
    if (getPieceType(piece) === 1) return;
    if (store.selectedPromotionPiece === piece) {
      store.selectedPromotionPiece = null;
    } else {
      store.selectedPromotionPiece = piece as PieceType;
    }
    store.triggerUIUpdate();
  }
}
