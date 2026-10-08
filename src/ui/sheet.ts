// Iš apačios išslystantis langas (pridėjimas, taisymas). Vienu metu – vienas.
import { t } from '../i18n';
import { esc } from '../lib/format';

let current: { el: HTMLElement; onClose?: () => void; prevFocus: Element | null } | null = null;

export interface Sheet { body: HTMLElement; close: () => void; setTitle: (s: string) => void }

export function openSheet(title: string, opts: { onClose?: () => void; id?: string } = {}): Sheet {
  closeSheet();
  const root = document.createElement('div');
  root.className = 'sheet';
  if (opts.id) root.id = opts.id;
  root.innerHTML = '<div class="sheet-backdrop" data-close></div>'
    + '<div class="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">'
    + '<div class="sheet-head"><h2 id="sheetTitle">' + esc(title) + '</h2><button type="button" class="iconbtn" data-close aria-label="' + esc(t('close')) + '">×</button></div>'
    + '<div class="sheet-body"></div></div>';
  document.body.append(root);
  document.body.classList.add('sheet-open');
  current = { el: root, onClose: opts.onClose, prevFocus: document.activeElement };
  root.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-close]')) closeSheet(); });
  requestAnimationFrame(() => root.classList.add('open'));
  const body = root.querySelector<HTMLElement>('.sheet-body')!;
  return {
    body,
    close: closeSheet,
    setTitle: (s) => { root.querySelector('#sheetTitle')!.textContent = s; },
  };
}

export function closeSheet() {
  if (!current) return;
  const c = current;
  current = null;
  c.el.remove();
  document.body.classList.remove('sheet-open');
  c.onClose?.();
  if (c.prevFocus instanceof HTMLElement) c.prevFocus.focus({ preventScroll: true });
}

export const sheetOpen = () => !!current;

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current) closeSheet(); });
