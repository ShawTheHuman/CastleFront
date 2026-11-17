import { el } from './dom';

export interface ModalAction {
  label: string;
  kind?: 'primary' | 'danger' | 'plain';
  onClick?: () => void;
  /** Keep the modal open after the click. */
  keepOpen?: boolean;
}

/** A centred card over a dimmed screen. Returns a function that closes it. */
export function showModal(
  title: string,
  body: (Node | string)[],
  actions: ModalAction[],
): () => void {
  const backdrop = el('div', 'modal-backdrop');
  const card = el('div', 'modal');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  const h = el('h2', 'modal-title', title);
  const content = el('div', 'modal-body');
  content.append(...body);
  const row = el('div', 'modal-actions');
  const close = () => backdrop.remove();
  for (const a of actions) {
    const b = el('button', `btn ${a.kind ?? 'primary'}`, a.label);
    b.onclick = () => {
      a.onClick?.();
      if (!a.keepOpen) close();
    };
    row.append(b);
  }
  card.append(h, content, row);
  backdrop.append(card);
  document.body.append(backdrop);
  (row.querySelector('button') as HTMLButtonElement | null)?.focus();
  return close;
}

let toastHost: HTMLElement | null = null;

export function toast(text: string, kind: 'info' | 'win' | 'unlock' = 'info', ms = 2200): void {
  if (!toastHost) {
    toastHost = el('div', 'toasts');
    document.body.append(toastHost);
  }
  const t = el('div', `toast ${kind}`, text);
  toastHost.append(t);
  while (toastHost.children.length > 3) toastHost.firstElementChild?.remove();
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}
