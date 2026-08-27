import { GameState } from '../../core/types';
import { GameStore, LogEntry } from '../../store/store';

export class LogUI {
  private container: HTMLElement;
  private onScrubClick: (historyIndex: number) => void;
  private lastWheelTime: number = 0;
  private prevHistoryIndex: number | null = null;
  private prevLogCount: number = 0;

  constructor(container: HTMLElement, onScrubClick: (historyIndex: number) => void) {
    this.container = container;
    this.onScrubClick = onScrubClick;
  }

  public render(_state: GameState, store: GameStore): void {
    const existingLogList = this.container.querySelector('#log-entries') as HTMLElement | null;
    const savedScrollTop = existingLogList ? existingLogList.scrollTop : null;

    const historyIndexChanged = this.prevHistoryIndex !== store.historyIndex;
    const logCountChanged = this.prevLogCount !== store.logs.length;

    this.prevHistoryIndex = store.historyIndex;
    this.prevLogCount = store.logs.length;

    this.container.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.height = '240px';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';

    panel.addEventListener('wheel', (e: WheelEvent) => {
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

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.gap = '6px';
    header.style.marginBottom = '8px';

    const currentLogIdx = store.activeLogIndex;
    const canPrev = currentLogIdx > 0;
    const canNext = currentLogIdx >= 0 && currentLogIdx < store.logs.length - 1;
    const canLive = store.isReplaying;

    const createBtn = (label: string, titleText: string, disabled: boolean, onClick: () => void) => {
      const btn = document.createElement('button');
      btn.innerText = label;
      btn.title = titleText;
      btn.disabled = disabled;
      btn.style.padding = '3px 10px';
      btn.style.fontSize = '12px';
      btn.style.fontWeight = 'bold';
      btn.style.fontFamily = 'monospace';
      btn.style.background = disabled ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.08)';
      btn.style.color = disabled ? 'rgba(255, 255, 255, 0.25)' : 'var(--accent-gold)';
      btn.style.border = '1px solid ' + (disabled ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.15)');
      btn.style.borderRadius = '4px';
      btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
      btn.style.transition = 'all 0.15s ease';

      if (!disabled) {
        btn.addEventListener('mouseenter', () => {
          btn.style.background = 'rgba(245, 158, 11, 0.2)';
          btn.style.borderColor = 'var(--accent-gold)';
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.background = 'rgba(255, 255, 255, 0.08)';
          btn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        });
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        });
      }

      return btn;
    };

    header.appendChild(createBtn('<', 'Back', !canPrev, () => store.stepReplay('prev')));
    header.appendChild(createBtn('>', 'Forward', !canNext, () => store.stepReplay('next')));
    header.appendChild(createBtn('>>', 'Last / Resume Live', !canLive, () => store.stepReplay('live')));

    panel.appendChild(header);

    const logList = document.createElement('div');
    logList.id = 'log-entries';
    logList.className = 'log-entries';
    logList.style.flex = '1';
    logList.style.overflowY = 'auto';
    logList.style.position = 'relative';
    logList.style.fontSize = '12px';
    logList.style.fontFamily = 'monospace';
    logList.style.display = 'flex';
    logList.style.flexDirection = 'column';
    logList.style.gap = '4px';
    logList.style.paddingRight = '4px';

    let selectedElement: HTMLElement | null = null;

    store.logs.forEach((entry: LogEntry, idx: number) => {
      const entryContainer = document.createElement('div');
      entryContainer.style.padding = '4px 6px';
      entryContainer.style.borderRadius = '4px';
      entryContainer.style.cursor = 'pointer';
      entryContainer.style.borderLeft = '3px solid transparent';
      entryContainer.style.background = 'rgba(255, 255, 255, 0.02)';
      entryContainer.style.transition = 'all 0.15s ease';

      const isSelected = currentLogIdx === idx;
      if (isSelected) {
        entryContainer.style.background = 'rgba(6, 182, 212, 0.15)';
        entryContainer.style.borderLeft = '3px solid var(--accent-cyan)';
        selectedElement = entryContainer;
      }

      entryContainer.addEventListener('mouseenter', () => {
        if (!isSelected) {
          entryContainer.style.background = 'rgba(255, 255, 255, 0.08)';
        }
      });
      entryContainer.addEventListener('mouseleave', () => {
        if (!isSelected) {
          entryContainer.style.background = 'rgba(255, 255, 255, 0.02)';
        }
      });

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
          line1.innerText = '---card swap';
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
        store.scrubToHistoryIndex(idx);
      });

      logList.appendChild(entryContainer);
    });

    panel.appendChild(logList);
    this.container.appendChild(panel);

    if (selectedElement && (historyIndexChanged || logCountChanged || savedScrollTop === null)) {
      if (store.isReplaying) {
        const elementTop = (selectedElement as HTMLElement).offsetTop;
        const elementHeight = (selectedElement as HTMLElement).offsetHeight || (selectedElement as HTMLElement).clientHeight || 0;
        const containerHeight = logList.offsetHeight || logList.clientHeight || 0;
        if (containerHeight > 0) {
          logList.scrollTop = Math.max(0, elementTop - (containerHeight / 2) + (elementHeight / 2));
        } else {
          logList.scrollTop = elementTop;
        }
      } else {
        logList.scrollTop = logList.scrollHeight;
      }
    } else if (savedScrollTop !== null && !historyIndexChanged && !logCountChanged) {
      logList.scrollTop = savedScrollTop;
    } else if (!store.isReplaying) {
      logList.scrollTop = logList.scrollHeight;
    }
  }
}
