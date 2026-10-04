import { describe, it, expect, beforeEach } from 'vitest';
import { toggleRulesModal, showRulesModal, openImageLightbox, parseRulesMarkdown } from './RulesModal';

class MockElement {
  public tagName: string;
  private _id: string = '';
  public get id(): string {
    return this._id;
  }
  public set id(val: string) {
    this._id = val;
    if (val && (globalThis as any).__registerElementById) {
      (globalThis as any).__registerElementById(val, this);
    }
  }

  public children: MockElement[] = [];
  public childNodes: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public style: Record<string, string> = {};
  public src: string = '';
  public alt: string = '';
  public offsetWidth: number = 300;
  public offsetHeight: number = 400;
  public clientWidth: number = 400;
  public clientHeight: number = 600;

  private _classes = new Set<string>();

  public get className(): string {
    return Array.from(this._classes).join(' ');
  }

  public set className(val: string) {
    this._classes = new Set(val.split(/\s+/).filter(Boolean));
  }

  public classList = {
    add: (...tokens: string[]) => {
      tokens.forEach(t => this._classes.add(t));
    },
    remove: (...tokens: string[]) => {
      tokens.forEach(t => this._classes.delete(t));
    },
    contains: (token: string) => this._classes.has(token),
    toggle: (token: string) => {
      if (this._classes.has(token)) {
        this._classes.delete(token);
        return false;
      } else {
        this._classes.add(token);
        return true;
      }
    }
  };

  private _innerHTML: string = '';
  public get innerHTML(): string {
    return this._innerHTML;
  }
  public set innerHTML(val: string) {
    this._innerHTML = val;
    this.children = [];
    this.childNodes = [];
    if (val.includes('rules-modal')) {
      const closeBtn = new MockElement('button');
      closeBtn.id = 'btn-close-rules';
      closeBtn.className = 'rules-close-btn';
      this.appendChild(closeBtn);

      const content = new MockElement('div');
      content.className = 'rules-content';

      const imgContainer = new MockElement('div');
      imgContainer.className = 'rules-image-container';

      const img = new MockElement('img');
      img.className = 'rules-pic';
      img.src = '/assets/rules_pic.webp';
      img.alt = 'Poachers Rules Overview';
      imgContainer.appendChild(img);

      content.appendChild(imgContainer);
      this.appendChild(content);
    } else if (val.includes('rules-lightbox-backdrop')) {
      const backdrop = new MockElement('div');
      backdrop.className = 'rules-lightbox-backdrop';
      this.appendChild(backdrop);

      const controls = new MockElement('div');
      controls.className = 'rules-lightbox-controls';

      const closeBtn = new MockElement('button');
      closeBtn.id = 'btn-close-rules-lightbox';
      closeBtn.className = 'rules-lightbox-close';
      controls.appendChild(closeBtn);
      this.appendChild(controls);

      const viewport = new MockElement('div');
      viewport.className = 'rules-lightbox-viewport';

      const img = new MockElement('img');
      img.className = 'rules-lightbox-img';
      viewport.appendChild(img);
      this.appendChild(viewport);
    }
  }
  private listeners: Record<string, ((e?: any) => void)[]> = {};

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  public appendChild(child: MockElement): MockElement {
    this.children.push(child);
    this.childNodes.push(child);
    child.parentElement = this;
    if (child.id && (globalThis as any).__registerElementById) {
      (globalThis as any).__registerElementById(child.id, child);
    }
    return child;
  }

  public addEventListener(event: string, cb: (e?: any) => void): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  public dispatchEvent(event: string, data?: any): void {
    if (this.listeners[event]) {
      const eventData = {
        target: this,
        stopPropagation: () => {},
        preventDefault: () => {},
        cancelable: true,
        ...data
      };
      this.listeners[event].forEach(cb => cb(eventData));
    }
  }

  public click(): void {
    this.dispatchEvent('click');
  }

  public querySelector(selector: string): MockElement | null {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      return this.findChild(c => c.id === id);
    }
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      return this.findChild(c => c.classList.contains(cls));
    }
    return null;
  }

  public querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      this.findAllChildren(c => c.classList.contains(cls), results);
    }
    return results;
  }

  private findChild(predicate: (el: MockElement) => boolean): MockElement | null {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const found = child.findChild(predicate);
      if (found) return found;
    }
    return null;
  }

  private findAllChildren(predicate: (el: MockElement) => boolean, results: MockElement[]): void {
    for (const child of this.children) {
      if (predicate(child)) results.push(child);
      child.findAllChildren(predicate, results);
    }
  }
}

describe('RulesModal & Lightbox Pinch Zoom', () => {
  let elementsById: Record<string, MockElement>;
  let docListeners: Record<string, ((e?: any) => void)[]>;

  beforeEach(() => {
    elementsById = {};
    docListeners = {};

    (globalThis as any).__registerElementById = (id: string, el: MockElement) => {
      elementsById[id] = el;
    };

    (globalThis as any).document = {
      getElementById: (id: string) => elementsById[id] || null,
      createElement: (tag: string) => {
        const el = new MockElement(tag);
        return el;
      },
      body: {
        appendChild: (el: MockElement) => {
          if (el.id) elementsById[el.id] = el;
          return el;
        }
      },
      addEventListener: (event: string, cb: (e?: any) => void) => {
        if (!docListeners[event]) docListeners[event] = [];
        docListeners[event].push(cb);
      }
    };

    (globalThis as any).window = {
      innerWidth: 400,
      innerHeight: 600,
      addEventListener: () => {},
      removeEventListener: () => {}
    };
  });

  it('toggles rules modal visibility and contains NO zoom badge', () => {
    toggleRulesModal();
    const modal = elementsById['rules-overlay'];
    expect(modal).toBeDefined();
    expect(modal.classList.contains('hidden')).toBe(false);

    // Verify "Tap pic to zoom" or badge is not in innerHTML
    expect(modal.innerHTML).not.toContain('Tap image to zoom');
    expect(modal.innerHTML).not.toContain('rules-zoom-badge');

    // Call toggle again to hide
    toggleRulesModal();
    expect(modal.classList.contains('hidden')).toBe(true);

    // Call showRulesModal to show
    showRulesModal();
    expect(modal.classList.contains('hidden')).toBe(false);
  });

  it('closes modal when close button is clicked', () => {
    toggleRulesModal();
    const modal = elementsById['rules-overlay'];
    const closeBtn = modal.querySelector('#btn-close-rules');
    expect(closeBtn).toBeDefined();

    closeBtn!.click();
    expect(modal.classList.contains('hidden')).toBe(true);
  });

  it('opens image zoom lightbox immediately with scale = 1', () => {
    toggleRulesModal();
    const modal = elementsById['rules-overlay'];
    const imgContainer = modal.querySelector('.rules-image-container');
    expect(imgContainer).toBeDefined();

    imgContainer!.click();

    const lightbox = elementsById['rules-image-lightbox'] as any;
    expect(lightbox).toBeDefined();
    expect(lightbox.classList.contains('hidden')).toBe(false);

    const lightboxImg = lightbox.querySelector('.rules-lightbox-img');
    expect(lightboxImg).toBeDefined();
    expect(lightboxImg!.src).toContain('rules_pic.webp');
    expect(lightbox.__getScale()).toBe(1);
  });

  it('toggles zoom on double click', () => {
    openImageLightbox('/assets/rules_pic.webp', 'Rules');
    const lightbox = elementsById['rules-image-lightbox'] as any;
    const img = lightbox.querySelector('.rules-lightbox-img');
    expect(img).toBeDefined();

    expect(lightbox.__getScale()).toBe(1);
    img!.dispatchEvent('dblclick');
    expect(lightbox.__getScale()).toBe(2.5);
    img!.dispatchEvent('dblclick');
    expect(lightbox.__getScale()).toBe(1);
  });

  it('supports 2-finger touch pinch-to-zoom', () => {
    openImageLightbox('/assets/rules_pic.webp', 'Rules');
    const lightbox = elementsById['rules-image-lightbox'] as any;
    const viewport = lightbox.querySelector('.rules-lightbox-viewport');
    expect(viewport).toBeDefined();

    // Start 2-finger touch with 100px separation
    viewport!.dispatchEvent('touchstart', {
      touches: [
        { clientX: 100, clientY: 200 },
        { clientX: 200, clientY: 200 }
      ]
    });

    // Move to 200px separation (2x pinch zoom)
    viewport!.dispatchEvent('touchmove', {
      touches: [
        { clientX: 50, clientY: 200 },
        { clientX: 250, clientY: 200 }
      ]
    });

    expect(lightbox.__getScale()).toBe(2);

    // End touch
    viewport!.dispatchEvent('touchend', { touches: [] });
    expect(lightbox.__getScale()).toBe(2);
  });

  it('closes lightbox when close button is clicked', () => {
    openImageLightbox('/assets/rules_pic.webp', 'Rules');
    const lightbox = elementsById['rules-image-lightbox'];
    expect(lightbox.classList.contains('hidden')).toBe(false);

    const closeBtn = lightbox.querySelector('#btn-close-rules-lightbox');
    closeBtn!.click();
    expect(lightbox.classList.contains('hidden')).toBe(true);
  });

  it('closes modal on Escape key press', () => {
    toggleRulesModal();
    const modal = elementsById['rules-overlay'];
    expect(modal.classList.contains('hidden')).toBe(false);

    if (docListeners['keydown']) {
      docListeners['keydown'].forEach(cb => cb({ key: 'Escape' }));
    }
    expect(modal.classList.contains('hidden')).toBe(true);
  });

  it('correctly parses headings and boldings in markdown', () => {
    const md = [
      '# Main Heading',
      '## Sub Heading',
      '### Minor Heading',
      '**Bold Title:** This is normal text with **bold keyword** and *italic keyword*.',
      '* *Spaced Bold* * text here.'
    ].join('\n');

    const html = parseRulesMarkdown(md);
    expect(html).toContain('<h1>Main Heading</h1>');
    expect(html).toContain('<h2>Sub Heading</h2>');
    expect(html).toContain('<h3>Minor Heading</h3>');
    expect(html).toContain('<strong>Bold Title:</strong>');
    expect(html).toContain('<strong>bold keyword</strong>');
    expect(html).toContain('<strong>Spaced Bold</strong>');
    expect(html).toContain('<em>italic keyword</em>');
    expect(html).toContain('<p><strong>Bold Title:</strong> This is normal text with <strong>bold keyword</strong> and <em>italic keyword</em>.</p>');
  });
});
