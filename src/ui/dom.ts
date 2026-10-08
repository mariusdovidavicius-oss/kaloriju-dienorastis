/** Trumpas elementų paieškos pagalbininkas. Elementas turi egzistuoti. */
export function $<T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error('Nerastas elementas: ' + sel);
  return el;
}
export const inp = (sel: string, root: ParentNode = document) => $<HTMLInputElement>(sel, root);
export const maybe = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);

let toastT: ReturnType<typeof setTimeout> | undefined;
/** Trumpas pranešimas apačioje; su `action` – mygtukas (pvz. „Atšaukti“), rodomas 6 s. */
export function toast(msg: string, action?: { label: string; run: () => void }) {
  const el = $('#toast');
  el.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = msg;
  el.append(span);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = action.label;
    b.onclick = () => { el.hidden = true; action.run(); };
    el.append(b);
  }
  el.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (el.hidden = true), action ? 6000 : 3500);
}

/** Vibracija paspaudus (jei telefonas palaiko). */
export function tick() { try { navigator.vibrate?.(8); } catch { /* nesvarbu */ } }
