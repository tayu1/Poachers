import { GameState } from '../../core/types';
import { GameStore, LogEntry } from '../../store/store';

export class LogUI {
  private container: HTMLElement;
  private onScrubClick: (historyIndex: number) => void;
  private lastWheelTime: number = 0;
  private prevHistoryIndex: number | null = null;
  private prevLogCount: number = 0;
  private firstLogRef: LogEntry | null = null;
  private initialized: boolean = false;

  private panel!: HTMLElement;
  private header!: HTMLElement;
  private logList!: HTMLElement;
  private btnPrev!: HTMLButtonElement;
  private btnNext!: HTMLButtonElement;
  private btnLive!: HTMLButtonElement;
  private entryElements: HTMLElement[] = [];

  constructor(container: HTMLElement, onScrubClick: (historyIndex: number) => void) {
    this.container = container;
    this.onScrubClick = onScrubClick;
    this.injectStyles();
  }

  private injectStyles() {
    if (!document.getElementById('log-ui-styles')) {
      const style = document.createElement('style');
      style.id = 'log-ui-styles';
      style.textContent = `
        .log-ui-btn { padding: 3px 10px; font-size: 12px; font-weight: bold; font-family: monospace; border-radius: 4px; transition: all 0.15s ease; background: rgba(255, 255, 255, 0.08); color: var(--accent-gold); border: 1px solid rgba(255, 255, 255, 0.15); cursor: pointer; }
        .log-ui-btn:hover:not(:disabled) { background: rgba(245, 158, 11, 0.2); border-color: var(--accent-gold); }
        .log-ui-btn:disabled { background: rgba(255, 255, 255, 0.03); color: rgba(255, 255, 255, 0.25); border-color: rgba(255, 255, 255, 0.05); cursor: not-allowed; }
        .log-ui-entry { padding: 4px 6px; border-radius: 4px; cursor: pointer; border-left: 3px solid transparent; background: rgba(255, 255, 255, 0.02); transition: all 0.15s ease; }
        .log-ui-entry:hover:not(.log-ui-entry-selected) { background: rgba(255, 255, 255, 0.08); }
        .log-ui-entry-selected { background: rgba(6, 182, 212, 0.15) !important; border-left: 3px solid var(--accent-cyan) !important; }
      `;
      document.head.appendChild(style);
    }
  }

  private initElements(store: GameStore) {
    this.container.innerHTML = '';

    this.panel = document.createElement('div');
    this.panel.className = 'panel';
    this.panel.style.height = '240px';
    this.panel.style.display = 'flex';
    this.panel.style.flexDirection = 'column';

    this.header = document.createElement('div');
    this.header.style.display = 'flex';
    this.header.style.alignItems = 'center';
    this.header.style.gap = '6px';
    this.header.style.marginBottom = '8px';

    // Scrubbing via wheel on header
    this.header.addEventListener('wheel', (e: WheelEvent) => {
      if (store.logs.length <= 1) return;
      e.preventDefault();
      const now = Date.now();
      if (now - this.lastWheelTime < 80) return;
      this.lastWheelTime = now;

      if (e.deltaY < 0) {
        store.stepReplay('prev');
      } else if (e.deltaY > 0) {
        store.stepReplay('next');
      }
    }, { passive: false });

    const createBtn = (label: string, titleText: string, onClick: () => void) => {
      const btn = document.createElement('button');
      btn.className = 'log-ui-btn';
      btn.innerText = label;
      btn.title = titleText;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!btn.disabled) onClick();
      });
      return btn;
    };

    this.btnPrev = createBtn('<', 'Back', () => store.stepReplay('prev'));
    this.btnNext = createBtn('>', 'Forward', () => store.stepReplay('next'));
    this.btnLive = createBtn('>>', 'Last / Resume Live', () => store.stepReplay('live'));

    this.header.appendChild(this.btnPrev);
    this.header.appendChild(this.btnNext);
    this.header.appendChild(this.btnLive);

    this.panel.appendChild(this.header);

    this.logList = document.createElement('div');
    this.logList.id = 'log-entries';
    this.logList.className = 'log-entries';
    this.logList.style.flex = '1';
    this.logList.style.overflowY = 'auto';
    this.logList.style.position = 'relative';
    this.logList.style.fontSize = '12px';
    this.logList.style.fontFamily = 'monospace';
    this.logList.style.display = 'flex';
    this.logList.style.flexDirection = 'column';
    this.logList.style.gap = '4px';
    this.logList.style.paddingRight = '4px';

    this.panel.appendChild(this.logList);
    this.container.appendChild(this.panel);

    this.initialized = true;
  }

  public render(_state: GameState, store: GameStore): void {
    if (!this.initialized) {
      this.initElements(store);
    }

    const currentLogIdx = store.activeLogIndex;
    const canPrev = currentLogIdx > 0;
    const canNext = currentLogIdx >= 0 && currentLogIdx < store.logs.length - 1;
    const canLive = store.isReplaying;

    this.btnPrev.disabled = !canPrev;
    this.btnNext.disabled = !canNext;
    this.btnLive.disabled = !canLive;

    const historyIndexChanged = this.prevHistoryIndex !== store.historyIndex;
    const logCountChanged = this.prevLogCount !== store.logs.length;
    const isNewLogSequence = store.logs.length > 0 && store.logs[0] !== this.firstLogRef;

    // Fast path: just update styles if only history index changed
    if (!logCountChanged && !isNewLogSequence && historyIndexChanged && this.entryElements.length === store.logs.length) {
      this.updateSelection(currentLogIdx, store.isReplaying);
      this.prevHistoryIndex = store.historyIndex;
      return;
    }

    // Capture whether user is currently at the bottom (sticky scroll) before adding nodes
    const wasAtBottom = this.logList.scrollHeight - this.logList.scrollTop - this.logList.clientHeight < 10;

    // If log count shrank or logs were entirely replaced, clear everything
    if (store.logs.length < this.prevLogCount || isNewLogSequence) {
      this.logList.innerHTML = '';
      this.entryElements = [];
      this.firstLogRef = store.logs.length > 0 ? store.logs[0] : null;
      this.prevHistoryIndex = null;
    } else if (store.logs.length > 0 && !this.firstLogRef) {
      this.firstLogRef = store.logs[0];
    } else if (store.logs.length === 0) {
      this.firstLogRef = null;
    }

    // Append new logs
    for (let idx = this.entryElements.length; idx < store.logs.length; idx++) {
      const entry = store.logs[idx];
      const entryContainer = document.createElement('div');
      entryContainer.className = 'log-ui-entry';

      const line1 = document.createElement('div');
      line1.style.fontWeight = '600';
      line1.style.color = '#e2e8f0';

      const isUnnumbered = entry.text === 'card swap' ||
        entry.text === '---card swap' ||
        entry.text === 'card refill' ||
        entry.text === '---card refill' ||
        entry.text.startsWith('---');

      if (isUnnumbered) {
        line1.style.color = '#888888';
        if (entry.text === 'card swap' || entry.text === '---card swap') {
          line1.innerText = '---card change';
        } else if (entry.text === 'card refill' || entry.text === '---card refill') {
          line1.innerText = '---card refill';
        } else {
          line1.innerText = entry.text;
        }
      } else {
        line1.innerText = `${entry.turnNumber}. ${entry.seat}] ${entry.text}`;
      }
      entryContainer.appendChild(line1);

      if (entry.pokerText) {
        const line2 = document.createElement('div');
        line2.style.fontSize = '11px';
        line2.style.color = 'var(--accent-gold)';
        line2.style.marginTop = '2px';
        line2.style.paddingLeft = '12px';
        line2.innerText = entry.pokerText;
        entryContainer.appendChild(line2);
      }

      entryContainer.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.prevHistoryIndex = null;
        store.scrubToHistoryIndex(entry.historyIndex);
      });

      this.logList.appendChild(entryContainer);
      this.entryElements.push(entryContainer);
    }

    this.updateSelection(currentLogIdx, store.isReplaying, wasAtBottom, logCountChanged);

    this.prevHistoryIndex = store.historyIndex;
    this.prevLogCount = store.logs.length;
  }

  private updateSelection(currentLogIdx: number, isReplaying: boolean, wasAtBottom: boolean = false, logsAdded: boolean = false) {
    let selectedElement: HTMLElement | null = null;

    for (let i = 0; i < this.entryElements.length; i++) {
      const el = this.entryElements[i];
      if (i === currentLogIdx) {
        el.classList.add('log-ui-entry-selected');
        selectedElement = el;
      } else {
        el.classList.remove('log-ui-entry-selected');
      }
    }

    if (selectedElement) {
      if (isReplaying) {
        const elementTop = selectedElement.offsetTop;
        const elementHeight = selectedElement.offsetHeight || selectedElement.clientHeight || 0;
        const containerHeight = this.logList.offsetHeight || this.logList.clientHeight || 0;
        if (containerHeight > 0) {
          this.logList.scrollTop = Math.max(0, elementTop - (containerHeight / 2) + (elementHeight / 2));
        } else {
          this.logList.scrollTop = elementTop;
        }
      } else if (logsAdded && wasAtBottom) {
        // Sticky scroll: Only force scroll to bottom if new logs were added, we aren't replaying, and they were already at the bottom
        this.logList.scrollTop = this.logList.scrollHeight;
      }
    }
  }
}
