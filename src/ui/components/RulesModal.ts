import rulesText from '../../../rules_explained.md?raw';

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
