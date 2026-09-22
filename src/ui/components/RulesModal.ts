import rulesText from '../../../rules_explained.md?raw';

export function openImageLightbox(src: string, alt: string): void {
  let lightbox = document.getElementById('rules-image-lightbox');
  if (!lightbox) {
    lightbox = document.createElement('div');
    lightbox.id = 'rules-image-lightbox';
    lightbox.className = 'rules-image-lightbox hidden';
    lightbox.innerHTML = `
      <div class="rules-lightbox-backdrop"></div>
      <div class="rules-lightbox-controls">
        <button id="btn-close-rules-lightbox" class="rules-lightbox-close" aria-label="Close">✕ Close</button>
      </div>
      <div class="rules-lightbox-viewport">
        <img class="rules-lightbox-img" src="" alt="" draggable="false" />
      </div>
    `;
    document.body.appendChild(lightbox);

    const img = lightbox.querySelector('.rules-lightbox-img') as HTMLImageElement | null;
    const viewport = lightbox.querySelector('.rules-lightbox-viewport') as HTMLElement | null;
    const closeBtn = lightbox.querySelector('#btn-close-rules-lightbox');
    const backdrop = lightbox.querySelector('.rules-lightbox-backdrop');

    let scale = 1;
    let translateX = 0;
    let translateY = 0;

    let initialPinchDistance = 0;
    let initialScale = 1;
    let initialTranslateX = 0;
    let initialTranslateY = 0;
    let pinchMidX = 0;
    let pinchMidY = 0;

    let lastPanX = 0;
    let lastPanY = 0;
    let isPanning = false;
    let lastTapTime = 0;

    const clampToBounds = () => {
      if (!img || !viewport) return;
      const baseW = img.offsetWidth || 300;
      const baseH = img.offsetHeight || 300;
      const viewW = viewport.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 400);
      const viewH = viewport.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 600);

      const effectiveW = baseW * scale;
      const effectiveH = baseH * scale;

      if (effectiveW > viewW) {
        const maxX = (effectiveW - viewW) / 2 + 32;
        translateX = Math.max(-maxX, Math.min(maxX, translateX));
      } else {
        translateX = 0;
      }

      if (effectiveH > viewH) {
        const maxY = (effectiveH - viewH) / 2 + 32;
        translateY = Math.max(-maxY, Math.min(maxY, translateY));
      } else {
        translateY = 0;
      }
    };

    const applyTransform = (withTransition = false) => {
      if (!img) return;
      img.style.transition = withTransition ? 'transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)' : 'none';
      img.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`;
    };

    const resetZoom = (withTransition = true) => {
      scale = 1;
      translateX = 0;
      translateY = 0;
      applyTransform(withTransition);
    };

    if (viewport) {
      // Touch Event Handlers for 2-finger pinch and 1-finger pan
      viewport.addEventListener('touchstart', (e: TouchEvent) => {
        if (e.touches.length === 2) {
          isPanning = false;
          initialPinchDistance = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          initialScale = scale;
          initialTranslateX = translateX;
          initialTranslateY = translateY;
          pinchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          pinchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        } else if (e.touches.length === 1) {
          const touch = e.touches[0];
          lastPanX = touch.clientX;
          lastPanY = touch.clientY;
          isPanning = scale > 1;

          const now = Date.now();
          if (now - lastTapTime < 300) {
            lastTapTime = 0;
            if (scale > 1.2) {
              resetZoom(true);
            } else {
              scale = 2.5;
              const viewW = viewport.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 400);
              const viewH = viewport.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 600);
              translateX = (viewW / 2 - touch.clientX) * 1.5;
              translateY = (viewH / 2 - touch.clientY) * 1.5;
              clampToBounds();
              applyTransform(true);
            }
          } else {
            lastTapTime = now;
          }
        }
      }, { passive: false });

      viewport.addEventListener('touchmove', (e: TouchEvent) => {
        if (e.touches.length === 2 && initialPinchDistance > 0) {
          if (e.cancelable) e.preventDefault();
          const currentDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          scale = Math.min(Math.max(1, (currentDist / initialPinchDistance) * initialScale), 5);

          const curMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const curMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          translateX = initialTranslateX + (curMidX - pinchMidX);
          translateY = initialTranslateY + (curMidY - pinchMidY);

          clampToBounds();
          applyTransform(false);
        } else if (e.touches.length === 1 && isPanning) {
          if (e.cancelable) e.preventDefault();
          const touch = e.touches[0];
          const dx = touch.clientX - lastPanX;
          const dy = touch.clientY - lastPanY;
          lastPanX = touch.clientX;
          lastPanY = touch.clientY;

          translateX += dx;
          translateY += dy;
          clampToBounds();
          applyTransform(false);
        }
      }, { passive: false });

      viewport.addEventListener('touchend', (e: TouchEvent) => {
        if (e.touches.length === 1) {
          lastPanX = e.touches[0].clientX;
          lastPanY = e.touches[0].clientY;
          isPanning = scale > 1;
        } else if (e.touches.length === 0) {
          isPanning = false;
          initialPinchDistance = 0;
          if (scale < 1.05) {
            resetZoom(true);
          } else {
            clampToBounds();
            applyTransform(true);
          }
        }
      });

      // Mouse Wheel Zoom for Desktop
      viewport.addEventListener('wheel', (e: WheelEvent) => {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.18 : 0.85;
        scale = Math.min(Math.max(1, scale * zoomFactor), 5);
        clampToBounds();
        applyTransform(true);
      }, { passive: false });

      // Mouse Drag for Desktop
      let isMouseDown = false;
      let mouseStartX = 0;
      let mouseStartY = 0;

      viewport.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button !== 0) return;
        if (scale > 1) {
          isMouseDown = true;
          mouseStartX = e.clientX;
          mouseStartY = e.clientY;
        }
      });

      if (typeof window !== 'undefined') {
        window.addEventListener('mousemove', (e: MouseEvent) => {
          if (!isMouseDown || scale <= 1) return;
          const dx = e.clientX - mouseStartX;
          const dy = e.clientY - mouseStartY;
          mouseStartX = e.clientX;
          mouseStartY = e.clientY;
          translateX += dx;
          translateY += dy;
          clampToBounds();
          applyTransform(false);
        });

        window.addEventListener('mouseup', () => {
          if (isMouseDown) {
            isMouseDown = false;
            clampToBounds();
            applyTransform(true);
          }
        });
      }
    }

    // Double-click toggle for Desktop
    if (img) {
      img.addEventListener('dblclick', (e: MouseEvent) => {
        e.stopPropagation();
        if (scale > 1.2) {
          resetZoom(true);
        } else {
          scale = 2.5;
          clampToBounds();
          applyTransform(true);
        }
      });
    }

    const closeLightbox = () => {
      if (lightbox) lightbox.classList.add('hidden');
      resetZoom(false);
    };

    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
    if (backdrop) backdrop.addEventListener('click', closeLightbox);
    if (viewport) {
      viewport.addEventListener('click', (e: MouseEvent) => {
        if (e.target === viewport && scale <= 1.05) {
          closeLightbox();
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && lightbox && !lightbox.classList.contains('hidden')) {
        closeLightbox();
      }
    });

    // Expose helpers on lightbox element for testing / verification
    (lightbox as any).__getScale = () => scale;
    (lightbox as any).__setScale = (s: number) => {
      scale = s;
      clampToBounds();
      applyTransform(false);
    };
    (lightbox as any).__getTranslate = () => ({ x: translateX, y: translateY });
    (lightbox as any).__resetZoom = resetZoom;
  }

  const img = lightbox.querySelector('.rules-lightbox-img') as HTMLImageElement | null;
  if (img) {
    img.src = src;
    img.alt = alt;
  }
  if ((lightbox as any).__resetZoom) {
    (lightbox as any).__resetZoom(false);
  }
  lightbox.classList.remove('hidden');
}

export function toggleRulesModal(): void {
  let modal = document.getElementById('rules-overlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'rules-overlay';
    modal.className = 'rules-backdrop hidden';

    const parseMarkdown = (md: string) => {
      return md
        .replace(/^\s*!\[(.*?)\]\((.*?)\)/gim, '<div class="rules-image-container"><img src="$2" alt="$1" class="rules-pic" /></div>')
        .replace(/^\s*### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^\s*## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^\s*# (.*$)/gim, '<h1>$1</h1>')
        .replace(/^(?!<h|<!|<div)(?!$)(.*)$/gim, '<p>$1</p>')
        .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/gim, '<em>$1</em>')
        .replace(/\n/g, '');
    };

    const htmlContent = parseMarkdown(rulesText);

    modal.innerHTML = `
      <div class="rules-modal">
        <button id="btn-close-rules" class="rules-close-btn">X Close</button>
        <div class="rules-content">${htmlContent}</div>
      </div>
    `;
    document.body.appendChild(modal);

    const btnClose = modal.querySelector('#btn-close-rules');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        modal!.classList.add('hidden');
      });
    }

    modal.querySelectorAll('.rules-image-container').forEach((container) => {
      const el = container as HTMLElement;
      const openViewer = () => {
        const img = el.querySelector('.rules-pic') as HTMLImageElement | null;
        if (img) {
          openImageLightbox(img.src, img.alt);
        }
      };

      el.addEventListener('click', openViewer);

      // Also allow 2-finger touch on the image in the rules page to immediately open zoom viewer
      el.addEventListener('touchstart', (e: Event) => {
        const te = e as TouchEvent;
        if (te.touches && te.touches.length === 2) {
          if (te.cancelable) te.preventDefault();
          openViewer();
        }
      }, { passive: false });
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal!.classList.add('hidden');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
        modal.classList.add('hidden');
      }
    });
  }

  if (modal.classList.contains('hidden')) {
    modal.classList.remove('hidden');
  } else {
    modal.classList.add('hidden');
  }
}

export function showRulesModal(): void {
  const modal = document.getElementById('rules-overlay');
  if (!modal || modal.classList.contains('hidden')) {
    toggleRulesModal();
  }
}
