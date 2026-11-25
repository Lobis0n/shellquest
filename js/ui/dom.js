/**
 * Utilidades mínimas de DOM.
 * @module ui/dom
 */

/** Crea un elemento con clases y atributos. */
export function el(tag, className = '', attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  return node;
}

export const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const FG = {
  30: 'black', 31: 'red', 32: 'green', 33: 'yellow', 34: 'blue', 35: 'magenta', 36: 'cyan', 37: 'white',
  90: 'gray', 91: 'red', 92: 'green', 93: 'yellow', 94: 'blue', 95: 'magenta', 96: 'cyan', 97: 'white',
};

/**
 * Convierte texto con secuencias ANSI en un DocumentFragment de <span>.
 * @param {string} text
 * @param {string} [baseClass]
 */
export function ansiToFragment(text, baseClass = '') {
  const frag = document.createDocumentFragment();
  const parts = String(text).split(/\x1b\[([0-9;]*)m/);
  let fg = null;
  let bold = false;
  let dim = false;
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      for (const code of (part || '0').split(';').map(Number)) {
        if (code === 0) { fg = null; bold = false; dim = false; }
        else if (code === 1) bold = true;
        else if (code === 2) dim = true;
        else if (FG[code]) fg = FG[code];
      }
      return;
    }
    if (!part) return;
    const span = document.createElement('span');
    const classes = [baseClass, fg && `ansi-${fg}`, bold && 'ansi-bold', dim && 'ansi-dim'].filter(Boolean);
    if (classes.length) span.className = classes.join(' ');
    span.textContent = part;
    frag.appendChild(span);
  });
  return frag;
}
