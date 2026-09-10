export type MobileMenuTab = 'board' | 'status' | 'controls' | 'log' | 'captures' | 'all';

export class MobileMenuUI {
  private container: HTMLElement;
  private activeTab: MobileMenuTab = 'all';

  private centerArea: HTMLElement | null = null;
  private statusPanel: HTMLElement | null = null;
  private controlsPanel: HTMLElement | null = null;
  private logPanel: HTMLElement | null = null;
  private capturesPanel: HTMLElement | null = null;
  private leftUnifiedPanel: HTMLElement | null = null;
  private rightUnifiedPanel: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.centerArea = document.querySelector('.center-area');
    this.statusPanel = document.getElementById('status-panel');
    this.controlsPanel = document.getElementById('controls-panel');
    this.logPanel = document.getElementById('log-panel');
    this.capturesPanel = document.getElementById('captures-panel');
    this.leftUnifiedPanel = document.getElementById('unified-left-panel');
    this.rightUnifiedPanel = document.getElementById('unified-right-panel');
    this.render();
  }

  public setTab(tab: MobileMenuTab): void {
    this.activeTab = tab;
    this.render();
    this.applyTabVisibility();
    this.scrollToTab(tab);
  }

  public applyTabVisibility(): void {
    if (window.innerWidth > 900) {
      if (this.statusPanel) this.statusPanel.style.display = '';
      if (this.controlsPanel) this.controlsPanel.style.display = '';
      if (this.logPanel) this.logPanel.style.display = '';
      if (this.capturesPanel) this.capturesPanel.style.display = '';
      if (this.leftUnifiedPanel) this.leftUnifiedPanel.style.display = '';
      if (this.rightUnifiedPanel) this.rightUnifiedPanel.style.display = '';
      const dividers = document.querySelectorAll('.panel-section-divider');
      dividers.forEach(d => (d as HTMLElement).style.display = '');
      return;
    }

    const showAll = this.activeTab === 'all' || this.activeTab === 'board';
    const showStatus = showAll || this.activeTab === 'status';
    const showCaptures = showAll || this.activeTab === 'captures';
    const showControls = showAll || this.activeTab === 'controls';
    const showLog = showAll || this.activeTab === 'log';

    if (this.statusPanel) {
      this.statusPanel.style.display = showStatus ? 'flex' : 'none';
    }
    if (this.capturesPanel) {
      this.capturesPanel.style.display = showCaptures ? 'flex' : 'none';
    }
    if (this.controlsPanel) {
      this.controlsPanel.style.display = showControls ? 'flex' : 'none';
    }
    if (this.logPanel) {
      this.logPanel.style.display = showLog ? 'flex' : 'none';
    }

    if (this.leftUnifiedPanel) {
      this.leftUnifiedPanel.style.display = (showControls || showLog) ? 'flex' : 'none';
    }
    if (this.rightUnifiedPanel) {
      this.rightUnifiedPanel.style.display = (showStatus || showCaptures) ? 'flex' : 'none';
    }

    const leftDivider = this.leftUnifiedPanel?.querySelector(':scope > .panel-section-divider') as HTMLElement | null;
    if (leftDivider) {
      leftDivider.style.display = (showControls && showLog) ? '' : 'none';
    }

    const rightDivider = this.rightUnifiedPanel?.querySelector(':scope > .panel-section-divider') as HTMLElement | null;
    if (rightDivider) {
      rightDivider.style.display = (showStatus && showCaptures) ? '' : 'none';
    }
  }

  private scrollToTab(tab: MobileMenuTab): void {
    if (window.innerWidth > 900) return;

    setTimeout(() => {
      if (tab === 'board' && this.centerArea) {
        this.centerArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (tab === 'status' && this.statusPanel) {
        this.statusPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (tab === 'controls' && this.controlsPanel) {
        this.controlsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (tab === 'log' && this.logPanel) {
        this.logPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (tab === 'captures' && this.capturesPanel) {
        this.capturesPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (tab === 'all' && this.centerArea) {
        this.centerArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 20);
  }

  public render(): void {
    this.container.innerHTML = '';

    const tabs: { id: MobileMenuTab; label: string; icon: string }[] = [
      { id: 'board', label: 'Board', icon: '🎮' },
      { id: 'status', label: 'Status', icon: '📊' },
      { id: 'controls', label: 'Controls', icon: '⚙️' },
      { id: 'log', label: 'Log', icon: '📜' },
      { id: 'captures', label: 'Captures', icon: '♟️' },
      { id: 'all', label: 'All', icon: '📋' }
    ];

    tabs.forEach(tab => {
      const btn = document.createElement('button');
      btn.className = `mobile-menu-btn ${this.activeTab === tab.id ? 'active' : ''}`;
      btn.innerHTML = `<span class="menu-icon">${tab.icon}</span><span>${tab.label}</span>`;
      btn.addEventListener('click', () => this.setTab(tab.id));
      this.container.appendChild(btn);
    });
  }
}
