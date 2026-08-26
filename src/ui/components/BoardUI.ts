import { HILL_SQUARE_INDICES, PLAYER_TEAMS, getCol, getRow } from '../../core/constants';
import { getValidPromotionOptions } from '../../core/engine';
import { isPieceControllable } from '../../core/moves';
import { GameState, LastMove, Move, PieceType, PlayerSeat, getPieceType, pieceToChar, Pc, decEnd, ActionInt } from '../../core/types';
import { GameStore } from '../../store/store';

export class BoardUI {
  private container: HTMLElement;
  private onSquareClick: (index: number) => void;
  private onPieceDrop: (fromIndex: number, toIndex: number) => void;
  private lastAnimatedMoveKey: string | null = null;
  private displayedArrowMove: LastMove | null = null;
  private arrowTimer: any = null;

  // Cached state references for active drag resolution
  private latestState: GameState | null = null;
  private latestStore: GameStore | null = null;

  // Drag and Drop pointer state
  private activeDrag: {
    pointerId: number;
    fromIndex: number;
    startX: number;
    startY: number;
    isDragging: boolean;
    piece: number;
    pieceSrc: string;
  } | null = null;
  private dragAvatar: HTMLImageElement | null = null;
  private currentHoverIndex: number | null = null;
  private suppressNextClick: boolean = false;

  // Cached DOM elements for zero-recreation rendering
  private boardFrame: HTMLElement | null = null;
  private boardGrid: HTMLElement | null = null;
  private squareElements: HTMLElement[] = [];
  private pieceImgElements: HTMLImageElement[] = [];
  private edgeGlowElement: HTMLElement | null = null;
  private midHorizontalElement: HTMLElement | null = null;
  private midVerticalElement: HTMLElement | null = null;

  constructor(
    container: HTMLElement,
    onSquareClick: (index: number) => void,
    onPieceDrop?: (fromIndex: number, toIndex: number) => void
  ) {
    this.container = container;
    this.onSquareClick = onSquareClick;
    this.onPieceDrop = onPieceDrop || (() => {});
  }

  private getPieceSVGFilename(piece: PieceType | number): string {
    const pType = getPieceType(piece);
    if (pType === 0) return '';
    const isTeamA = typeof piece === 'number' ? (piece & 8) === 0 : true;
    const prefix = isTeamA ? 'w_' : 'b_';
    const SVG_NAMES = ['', 'p', 'n', 'b', 'r', 'k'];
    return `/assets/${prefix}${SVG_NAMES[pType]}.svg`;
  }

  private handlePointerDown(e: PointerEvent, index: number): void {
    if (!e.isPrimary || e.button !== 0) return;
    if (!this.latestState || !this.latestStore) return;

    const state = this.latestState;
    const store = this.latestStore;

    // Check if board interactions are currently active
    if (
      state.isGameOver ||
      store.isReplaying ||
      store.isCombatDelaying ||
      state.setupState?.inSetup ||
      state.pendingRefills.length > 0
    ) {
      return;
    }

    // Bunker setup and promotion piecing rely on direct tap/click
    if (store.isSettingBunker || store.selectedPromotionPiece !== null) {
      return;
    }

    const piece = state.board[index];
    const isControllable = piece !== 0 && isPieceControllable(piece, state.activePlayer, index);

    if (isControllable) {
      this.activeDrag = {
        pointerId: e.pointerId,
        fromIndex: index,
        startX: e.clientX,
        startY: e.clientY,
        isDragging: false,
        piece,
        pieceSrc: this.getPieceSVGFilename(piece)
      };

      window.addEventListener('pointermove', this.onWindowPointerMove, { passive: false });
      window.addEventListener('pointerup', this.onWindowPointerUp);
      window.addEventListener('pointercancel', this.onWindowPointerCancel);
    }
  }

  private onWindowPointerMove = (e: PointerEvent): void => {
    if (!this.activeDrag || e.pointerId !== this.activeDrag.pointerId) return;

    const dx = e.clientX - this.activeDrag.startX;
    const dy = e.clientY - this.activeDrag.startY;
    const dist = Math.hypot(dx, dy);

    if (!this.activeDrag.isDragging && dist >= 5) {
      this.activeDrag.isDragging = true;
      this.suppressNextClick = true;

      // Select piece square if not already selected to immediately reveal move markers
      if (this.latestStore && this.latestStore.selectedSquare !== this.activeDrag.fromIndex) {
        this.onSquareClick(this.activeDrag.fromIndex);
      }

      // Mark source square as dragging
      const srcSq = this.squareElements[this.activeDrag.fromIndex];
      if (srcSq) {
        srcSq.classList.add('drag-source');
      }

      // Create or configure floating drag avatar
      if (!this.dragAvatar) {
        this.dragAvatar = document.createElement('img');
        this.dragAvatar.className = 'dragged-piece-avatar';
        document.body.appendChild(this.dragAvatar);
      }
      this.dragAvatar.src = this.activeDrag.pieceSrc;
      this.dragAvatar.style.display = 'block';

      const rotationAngle = this.latestStore ? this.latestStore.boardRotationAngle : 0;
      this.dragAvatar.style.transform = `translate(-50%, -50%) rotate(-${rotationAngle}deg)`;
    }

    if (this.activeDrag.isDragging) {
      e.preventDefault();
      if (this.dragAvatar) {
        this.dragAvatar.style.left = `${e.clientX}px`;
        this.dragAvatar.style.top = `${e.clientY}px`;
      }

      // Detect target square under pointer (handles CSS scaling and rotations)
      const elem = document.elementFromPoint(e.clientX, e.clientY);
      const sqElem = elem ? (elem.closest('.sq') as HTMLElement | null) : null;
      let targetIndex: number | null = null;
      if (sqElem && sqElem.dataset.index !== undefined) {
        targetIndex = parseInt(sqElem.dataset.index, 10);
      }

      if (this.currentHoverIndex !== targetIndex) {
        if (this.currentHoverIndex !== null && this.squareElements[this.currentHoverIndex]) {
          this.squareElements[this.currentHoverIndex].classList.remove('drop-target-hover');
        }

        if (targetIndex !== null && this.latestStore) {
          const isLegal = this.latestStore.legalMoves.some((m: any) =>
            typeof m === 'number' ? ((m >>> 8) & 0x3F) === targetIndex : m.toIndex === targetIndex
          );
          if (isLegal && this.squareElements[targetIndex]) {
            this.squareElements[targetIndex].classList.add('drop-target-hover');
            this.currentHoverIndex = targetIndex;
          } else {
            this.currentHoverIndex = null;
          }
        } else {
          this.currentHoverIndex = null;
        }
      }
    }
  };

  private onWindowPointerUp = (e: PointerEvent): void => {
    if (!this.activeDrag || e.pointerId !== this.activeDrag.pointerId) return;

    window.removeEventListener('pointermove', this.onWindowPointerMove);
    window.removeEventListener('pointerup', this.onWindowPointerUp);
    window.removeEventListener('pointercancel', this.onWindowPointerCancel);

    const fromIndex = this.activeDrag.fromIndex;
    const wasDragging = this.activeDrag.isDragging;
    this.activeDrag = null;

    if (wasDragging) {
      const elem = document.elementFromPoint(e.clientX, e.clientY);
      const sqElem = elem ? (elem.closest('.sq') as HTMLElement | null) : null;
      let toIndex: number | null = null;
      if (sqElem && sqElem.dataset.index !== undefined) {
        toIndex = parseInt(sqElem.dataset.index, 10);
      }

      this.cleanupDragVisuals(fromIndex);

      if (toIndex !== null && toIndex !== fromIndex) {
        this.onPieceDrop(fromIndex, toIndex);
      }

      setTimeout(() => {
        this.suppressNextClick = false;
      }, 60);
    } else {
      this.suppressNextClick = false;
    }
  };

  private onWindowPointerCancel = (e: PointerEvent): void => {
    if (!this.activeDrag || e.pointerId !== this.activeDrag.pointerId) return;

    window.removeEventListener('pointermove', this.onWindowPointerMove);
    window.removeEventListener('pointerup', this.onWindowPointerUp);
    window.removeEventListener('pointercancel', this.onWindowPointerCancel);

    const fromIndex = this.activeDrag.fromIndex;
    this.activeDrag = null;
    this.cleanupDragVisuals(fromIndex);
    this.suppressNextClick = false;
  };

  private cleanupDragVisuals(fromIndex: number): void {
    if (this.dragAvatar) {
      this.dragAvatar.style.display = 'none';
    }
    if (this.squareElements[fromIndex]) {
      this.squareElements[fromIndex].classList.remove('drag-source');
    }
    if (this.currentHoverIndex !== null && this.squareElements[this.currentHoverIndex]) {
      this.squareElements[this.currentHoverIndex].classList.remove('drop-target-hover');
      this.currentHoverIndex = null;
    }
  }

  private handleClick(index: number): void {
    if (this.suppressNextClick) {
      return;
    }
    this.onSquareClick(index);
  }

  private initDOMStructure(): void {
    this.container.innerHTML = '';
    this.squareElements = [];
    this.pieceImgElements = [];

    this.boardFrame = document.createElement('div');
    this.boardFrame.className = 'board-frame';

    // Outer Region Divider Lines
    [
      'outer-line-north-1', 'outer-line-north-2',
      'outer-line-south-1', 'outer-line-south-2',
      'outer-line-west-1',  'outer-line-west-2',
      'outer-line-east-1',  'outer-line-east-2'
    ].forEach(cls => {
      const line = document.createElement('div');
      line.className = `outer-region-line ${cls}`;
      this.boardFrame!.appendChild(line);
    });

    this.boardGrid = document.createElement('div');
    this.boardGrid.className = 'board-grid';

    for (let index = 0; index < 64; index++) {
      const row = getRow(index);
      const col = getCol(index);
      const isLight = (row + col) % 2 === 0;
      const isHill = HILL_SQUARE_INDICES.includes(index);

      const sq = document.createElement('div');
      sq.className = `sq ${isLight ? 'light-sq' : 'dark-sq'} ${isHill ? 'hill-sq' : ''}`;
      sq.dataset.index = index.toString();
      sq.style.cursor = 'pointer';
      sq.style.touchAction = 'none';

      sq.addEventListener('pointerdown', (e) => this.handlePointerDown(e, index));
      sq.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleClick(index);
      });

      const img = document.createElement('img');
      img.style.display = 'none';
      img.draggable = false;
      sq.appendChild(img);

      this.squareElements.push(sq);
      this.pieceImgElements.push(img);
      this.boardGrid.appendChild(sq);
    }

    // 2x2 Hill Box Overlay
    const hillMark = document.createElement('div');
    hillMark.className = 'hill-mark-2x2';
    this.boardGrid.appendChild(hillMark);

    // Mid Horizontal Center Line (Team A color)
    this.midHorizontalElement = document.createElement('div');
    this.midHorizontalElement.className = 'board-mid-line-horizontal';
    this.boardGrid.appendChild(this.midHorizontalElement);

    // Mid Vertical Center Line (Team B color)
    this.midVerticalElement = document.createElement('div');
    this.midVerticalElement.className = 'board-mid-line-vertical';
    this.boardGrid.appendChild(this.midVerticalElement);

    // Edge glow line
    this.edgeGlowElement = document.createElement('div');
    this.boardGrid.appendChild(this.edgeGlowElement);

    this.boardFrame.appendChild(this.boardGrid);
    this.container.appendChild(this.boardFrame);
  }

  private renderArrow(boardFrame: HTMLElement, _boardGrid: HTMLElement, move: LastMove): void {
    const oldOverlay = boardFrame.querySelector('.last-move-arrow');
    if (oldOverlay) oldOverlay.remove();

    const moveType = move.type || 'move';
    const markerId = `arrowhead-${moveType}`;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'last-move-arrow');
    svg.setAttribute('viewBox', '0 0 432 432');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '5';

    let lineClass = 'last-move-line';
    let arrowheadClass = 'last-move-arrowhead';

    if (moveType === 'capture') {
      lineClass += ' capture-line';
      arrowheadClass += ' capture-arrowhead';
    } else if (moveType === 'failed_attack') {
      lineClass += ' failed-attack-line';
      arrowheadClass += ' failed-attack-arrowhead';
    }

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', markerId);
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('refX', '5');
    marker.setAttribute('refY', '3');
    marker.setAttribute('orient', 'auto');

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 6 3, 0 6');
    polygon.setAttribute('class', arrowheadClass);
    marker.appendChild(polygon);
    defs.appendChild(marker);
    svg.appendChild(defs);

    const fromRow = getRow(move.fromIndex);
    const fromCol = getCol(move.fromIndex);
    const toRow = getRow(move.toIndex);
    const toCol = getCol(move.toIndex);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', lineClass);
    line.setAttribute('x1', (fromCol * 54 + 27).toString());
    line.setAttribute('y1', (fromRow * 54 + 27).toString());
    line.setAttribute('x2', (toCol * 54 + 27).toString());
    line.setAttribute('y2', (toRow * 54 + 27).toString());
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('marker-end', `url(#${markerId})`);

    svg.appendChild(line);
    boardFrame.appendChild(svg);
  }

  public render(state: GameState, store: GameStore): void {
    this.latestState = state;
    this.latestStore = store;

    if (!this.boardFrame || !this.container.contains(this.boardFrame)) {
      this.initDOMStructure();
    }

    if (!state.lastMove && state.turnCount <= 1 && (!state.setupState || !state.setupState.inSetup)) {
      if (this.arrowTimer) clearTimeout(this.arrowTimer);
      this.lastAnimatedMoveKey = null;
      this.displayedArrowMove = null;
      const oldOverlay = this.boardFrame!.querySelector('.last-move-arrow');
      if (oldOverlay) oldOverlay.remove();
    }

    const isUnresolvedCombat = Boolean(
      state.pendingCombat &&
      (!state.isTurnRiverRevealed || state.pendingCombat.winnerSeat === null || state.pendingCombat.winnerSeat === undefined)
    );

    const currentMoveKey = state.lastMove
      ? `${state.lastMove.fromIndex}->${state.lastMove.toIndex}:${state.lastMove.type || 'move'}@${state.lastMove.moveId || store.historyLength}`
      : null;

    let animatableTargetIndex: number | null = null;
    let animatableFromIndex: number | null = null;
    let capturedPieceSrcForGhost: string | null = null;

    if (state.lastMove && currentMoveKey !== this.lastAnimatedMoveKey) {
      this.lastAnimatedMoveKey = currentMoveKey;

      if (!store.isReplaying && !isUnresolvedCombat) {
        const moveType = state.lastMove.type || 'move';
        const fromIdx = state.lastMove.fromIndex;
        const toIdx = state.lastMove.toIndex;

        if (moveType === 'move') {
          if (fromIdx !== undefined && toIdx !== undefined && fromIdx !== toIdx) {
            animatableTargetIndex = toIdx;
            animatableFromIndex = fromIdx;
          }
        } else if (moveType === 'capture') {
          if (fromIdx !== undefined && toIdx !== undefined && fromIdx !== toIdx && state.board[toIdx] !== 0) {
            animatableTargetIndex = toIdx;
            animatableFromIndex = fromIdx;

            const rawCap = state.pendingCombat?.capturedPiece ?? null;
            if (rawCap) {
              capturedPieceSrcForGhost = this.getPieceSVGFilename(rawCap);
            }
          }
        } else if (moveType === 'failed_attack') {
          const destIdx = state.lastMove.destIndex;
          if (destIdx !== undefined && fromIdx !== undefined && destIdx !== fromIdx && state.board[destIdx] !== 0) {
            animatableTargetIndex = destIdx;
            animatableFromIndex = fromIdx;
          }
        }
      }

      if (animatableTargetIndex === null) {
        if (this.arrowTimer) clearTimeout(this.arrowTimer);
        this.displayedArrowMove = state.lastMove;
      }
    }

    this.boardFrame!.style.transform = `rotate(${store.boardRotationAngle}deg)`;

    const activeTeam = PLAYER_TEAMS[state.activePlayer];
    if (this.midHorizontalElement) {
      this.midHorizontalElement.style.display = activeTeam === 'A' ? 'block' : 'none';
    }
    if (this.midVerticalElement) {
      this.midVerticalElement.style.display = activeTeam === 'B' ? 'block' : 'none';
    }

    const isRefillOrSetupStage = Boolean(state.setupState?.inSetup) || state.pendingRefills.length > 0;
    const promoOptions = !isRefillOrSetupStage ? getValidPromotionOptions(state, state.activePlayer) : [];

    for (let index = 0; index < 64; index++) {
      const row = getRow(index);
      const col = getCol(index);
      const isLight = (row + col) % 2 === 0;
      const isHill = HILL_SQUARE_INDICES.includes(index);
      const sq = this.squareElements[index];
      const img = this.pieceImgElements[index];

      let sqClasses = `sq ${isLight ? 'light-sq' : 'dark-sq'} ${isHill ? 'hill-sq' : ''}`;

      const piece = state.board[index];
      const isCurrentTurnPlayerPiece = !isRefillOrSetupStage && piece !== 0 && isPieceControllable(piece, state.activePlayer, index);

      if (isCurrentTurnPlayerPiece) {
        const pieceTeamClass = (piece & 8) === 0 ? 'active-team-a' : 'active-team-b';
        sqClasses += ` active-piece-sq ${pieceTeamClass}`;
      }

      if (store.selectedSquare === index && !isRefillOrSetupStage) {
        sqClasses += ' selected-sq';
      }


      if (store.selectedPromotionPiece) {
        const selectedType = getPieceType(store.selectedPromotionPiece);
        const isPromoValid = promoOptions.some(o => o.hillIndex === index && getPieceType(o.promotedPiece) === selectedType);
        if (isPromoValid) {
          sqClasses += ' promotion-target';
        }
      } else if (promoOptions.some(o => o.hillIndex === index)) {
        sqClasses += ' promotion-available';
        sq.title = 'Hill pawn can be promoted! Select a lost piece from pool.';
      } else {
        sq.title = '';
      }

      sq.className = sqClasses;

      const pieceChar = pieceToChar(piece);
      if (pieceChar && piece !== 0) {
        const isTeamA = (piece & 8) === 0;
        let classes = `piece-img ${isTeamA ? 'piece-team-a' : 'piece-team-b'}`;

        if (state.threatenedKings?.includes(index) && isCurrentTurnPlayerPiece) {
          classes += ' threatened-king';
        } else if (isCurrentTurnPlayerPiece) {
          classes += ' active-highlight';
        }

        img.className = classes;
        const targetSrc = this.getPieceSVGFilename(piece);
        if (img.dataset.pieceSrc !== targetSrc) {
          img.dataset.pieceSrc = targetSrc;
          img.src = targetSrc;
        }
        img.alt = pieceChar;
        img.style.display = 'block';

        if (animatableTargetIndex !== null && animatableFromIndex !== null && index === animatableTargetIndex) {
          const fromRow = getRow(animatableFromIndex);
          const fromCol = getCol(animatableFromIndex);
          const deltaX = (fromCol - col) * 54;
          const deltaY = (fromRow - row) * 54;

          img.style.transition = 'none';
          img.style.transform = `translate(${deltaX}px, ${deltaY}px) rotate(-${store.boardRotationAngle}deg)`;
          img.style.willChange = 'transform';
          img.style.zIndex = '20';

          void img.offsetWidth;

          const targetAngle = store.boardRotationAngle;
          requestAnimationFrame(() => {
            if (!img.isConnected) return;
            img.style.transition = 'transform 0.28s cubic-bezier(0.25, 0.8, 0.25, 1)';
            img.style.transform = `translate(0px, 0px) rotate(-${targetAngle}deg)`;

            const handleTransitionEnd = () => {
              img.style.transition = 'none';
              img.style.transform = `rotate(-${targetAngle}deg)`;
              img.style.willChange = '';
              img.style.zIndex = '';
              img.removeEventListener('transitionend', handleTransitionEnd);
            };
            img.addEventListener('transitionend', handleTransitionEnd);
          });
        } else {
          img.style.transition = 'none';
          img.style.transform = `rotate(-${store.boardRotationAngle}deg)`;
        }
      } else {
        img.style.display = 'none';
        img.style.transition = 'none';
      }

      // Fast in-place marker removal without querySelectorAll overhead
      while (sq.childNodes.length > 1) {
        sq.removeChild(sq.lastChild!);
      }

      // If this square is the capture destination, display the captured piece ghost that collapses on impact
      if (animatableTargetIndex === index && capturedPieceSrcForGhost) {
        const ghost = document.createElement('img');
        ghost.src = capturedPieceSrcForGhost;
        ghost.className = 'captured-piece-ghost';
        ghost.style.transform = `rotate(-${store.boardRotationAngle}deg)`;
        ghost.style.transition = 'opacity 0.26s ease-out, transform 0.26s ease-out';
        sq.appendChild(ghost);

        const targetAngle = store.boardRotationAngle;
        requestAnimationFrame(() => {
          if (!ghost.isConnected) return;
          ghost.style.opacity = '0';
          ghost.style.transform = `rotate(-${targetAngle}deg) scale(0.5)`;
          setTimeout(() => {
            if (ghost.parentElement) {
              ghost.remove();
            }
          }, 280);
        });
      }

      const isBunkered = (piece & 16) !== 0;
      if (isBunkered && piece !== 0) {
        const isTeamA = (piece & 8) === 0;
        const badge = document.createElement('div');
        badge.className = `bunker-badge ${isTeamA ? 'bunker-badge-a' : 'bunker-badge-b'}`;
        sq.appendChild(badge);
      }

      if (store.isSettingBunker && !isRefillOrSetupStage) {
        const p = state.board[index];
        if (p && isPieceControllable(p, state.activePlayer, index) && !HILL_SQUARE_INDICES.includes(index)) {
          const candidateMarker = document.createElement('div');
          candidateMarker.className = 'bunker-candidate-marker';
          sq.appendChild(candidateMarker);
        }
      }

      const targetMove = !isRefillOrSetupStage
        ? store.legalMoves.find((m: any) => (typeof m === 'number' ? decEnd(m) === index : m.toIndex === index))
        : undefined;

      if (targetMove !== undefined) {
        let isAttack = false;
        let isKingCapture = false;

        if (typeof targetMove === 'number') {
          const targetPiece = state.board[index];
          if (targetPiece !== Pc.EMPTY) {
            isAttack = true;
            if ((targetPiece & 7) === 5) {
              isKingCapture = true;
            }
          }
        } else {
          isAttack = Boolean((targetMove as Move).isAttack);
          isKingCapture = Boolean((targetMove as Move).isKingCapture);
        }

        if (isKingCapture || isAttack) {
          const marker = document.createElement('div');
          marker.className = 'attack-marker';
          sq.appendChild(marker);
        } else {
          const dot = document.createElement('div');
          dot.className = 'move-dot';
          sq.appendChild(dot);
        }
      }
    }

    if (this.boardGrid) {
      this.boardGrid.classList.remove('winning-glow-team-a', 'winning-glow-team-b');
      if (state.isGameOver && state.winnerTeam) {
        if (state.winnerTeam === 'A') {
          this.boardGrid.classList.add('winning-glow-team-a');
        } else if (state.winnerTeam === 'B') {
          this.boardGrid.classList.add('winning-glow-team-b');
        }
      }
    }

    const activeSeat = state.activePlayer;
    const teamClass = activeTeam === 'A' ? 'team-a' : 'team-b';
    const seatEdgeClasses: Record<PlayerSeat, string> = {
      [PlayerSeat.NORTH]: 'edge-north',
      [PlayerSeat.EAST]: 'edge-east',
      [PlayerSeat.SOUTH]: 'edge-south',
      [PlayerSeat.WEST]: 'edge-west'
    };
    if (this.edgeGlowElement) {
      if (state.isGameOver) {
        this.edgeGlowElement.style.display = 'none';
      } else {
        this.edgeGlowElement.style.display = '';
        this.edgeGlowElement.className = `board-edge-glow ${seatEdgeClasses[activeSeat]} ${teamClass}`;
      }
    }

    if (animatableTargetIndex !== null) {
      if (this.arrowTimer) clearTimeout(this.arrowTimer);
      this.displayedArrowMove = null;
      const oldOverlay = this.boardFrame!.querySelector('.last-move-arrow');
      if (oldOverlay) oldOverlay.remove();

      const newMoveForArrow = state.lastMove;
      this.arrowTimer = setTimeout(() => {
        this.displayedArrowMove = newMoveForArrow;
        if (this.boardFrame && this.boardGrid && this.displayedArrowMove === newMoveForArrow) {
          if (newMoveForArrow) {
            this.renderArrow(this.boardFrame, this.boardGrid, newMoveForArrow);
          }
        }
      }, 280);
    }

    if (this.displayedArrowMove) {
      this.renderArrow(this.boardFrame!, this.boardGrid!, this.displayedArrowMove);
    }
  }
}
