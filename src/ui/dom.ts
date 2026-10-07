/** Trumpas elementų paieškos pagalbininkas. Elementas turi egzistuoti index.html. */
export function $<T extends HTMLElement = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error('Nerastas elementas: ' + sel);
  return el;
}

export const inp = (sel: string) => $<HTMLInputElement>(sel);

let toastT: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (el.hidden = true), 3500);
}
