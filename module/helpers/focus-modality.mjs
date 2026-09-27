/**
 * Keyboard-only focus marker for item sheets in the hero's style.
 *
 * `:focus-visible` is not enough there: Chromium matches it on every text
 * field however it was focused, and on a control core refocuses after the
 * sheet re-renders (submitOnChange) — so a mouse click on «Двуручное» left
 * a focus outline. Instead, the element that receives focus gets
 * `.hg-focus-kb` only when the user's last input was a key press; a mouse
 * or touch press clears that. Styles key off the class (_item-frame.scss).
 */

const FOCUS_CLASS = 'hg-focus-kb';

let lastInputWasKeyboard = false;
let installed = false;

/** Listen for the user's input kind, once per page. */
function install() {
  if (installed) return;
  installed = true;
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    lastInputWasKeyboard = true;
  }, true);
  document.addEventListener('pointerdown', () => {
    lastInputWasKeyboard = false;
  }, true);
}

/**
 * Mark keyboard focus inside `root` (listeners on `root` itself, so they
 * survive the re-render of its content).
 * @param {HTMLElement} root
 */
export function trackKeyboardFocus(root) {
  install();
  root.addEventListener('focusin', (event) => {
    event.target.classList.toggle(FOCUS_CLASS, lastInputWasKeyboard);
  });
  root.addEventListener('focusout', (event) => {
    event.target.classList.remove(FOCUS_CLASS);
  });
}
