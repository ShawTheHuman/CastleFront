import { el } from './dom';

export interface ModalAction {
  label: string;
  kind?: 'primary' | 'danger' | 'plain';
  onClick?: () => void;
  /** Keep the modal open after the click. */
  keepOpen?: boolean;
}

interface Pending {
  key?: string;
  open: () => void;
}

const queue: Pending[] = [];
let current: { key?: string } | null = null;

/**
 * A centred card over a dimmed screen. Only one is shown at a time; later ones wait their turn.
 * A modal with a `key` is dropped if one with the same key is already showing or waiting (so
 * e.g. switching apps twice can't stack two "welcome back" cards).
 */
export function showModal(
  title: string,
  body: (Node | string)[],
  actions: ModalAction[],
  key?: string,
): void {
  if (key && (current?.key === key || queue.some((q) => q.key === key))) return;
  queue.push({ key, open: () => render(title, body, actions) });
  if (!current) next();
}

function next(): void {
  const item = queue.shift();
  current = item ? { key: item.key } : null;
  item?.open();
}

function render(title: string, body: (Node | string)[], actions: ModalAction[]): void {
  const backdrop = el('div', 'modal-backdrop');
  const card = el('div', 'modal');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  const h = el('h2', 'modal-title', title);
  const content = el('div', 'modal-body');
  content.append(...body);
  const row = el('div', 'modal-actions');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    next();
  };
  for (const a of actions) {
    const b = el('button', `btn ${a.kind ?? 'primary'}`, a.label);
    b.addEventListener('click', () => {
      a.onClick?.();
      if (!a.keepOpen) close();
    });
    row.append(b);
  }
  card.append(h, content, row);
  backdrop.append(card);
  document.body.append(backdrop);
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
