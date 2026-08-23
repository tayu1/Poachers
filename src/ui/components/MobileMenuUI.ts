export type MobileMenuTab = 'board' | 'status' | 'controls' | 'log' | 'captures' | 'all';

export class MobileMenuUI {
  private container: HTMLElement;
  private activeTab: MobileMenuTab = 'all';

  private centerArea: HTMLElement | null = null;
  private statusPanel: HTMLElement | null = null;
  private controlsPanel: HTMLElement | null = null;
  private logPanel: HTMLElement | null = null;
  private capturesPanel: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.centerArea = document.querySelector('.center-area');
    this.statusPanel = document.getElementById('status-panel');
    this.controlsPanel = document.getElementById('controls-panel');
    this.logPanel = document.getElementById('log-panel');
    this.capturesPanel = document.getElementById('captures-panel');
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
      return;
    }

    const showAll = this.activeTab === 'all' || this.activeTab === 'board';
    if (this.statusPanel) {
      this.statusPanel.style.display = showAll || this.activeTab === 'status' ? 'flex' : 'none';
    }
    if (this.controlsPanel) {
      this.controlsPanel.style.display = showAll || this.activeTab === 'controls' ? 'flex' : 'none';
    }
    if (this.logPanel) {
      this.logPanel.style.display = showAll || this.activeTab === 'log' ? 'flex' : 'none';
    }
    if (this.capturesPanel) {
      this.capturesPanel.style.display = showAll || this.activeTab === 'captures' ? 'flex' : 'none';
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
