/**
 * Drop-down list for item sheets in the hero's style — templates/item/
 * parts/hg-select.hbs. The list itself is the hero sheet pickers' own
 * markup (`.hg-tooltip` frame + `.hg-option-list`, current value in gold),
 * opened under its trigger in a layer on document.body so the sheet's
 * window never clips it.
 *
 * The value lives in the partial's hidden native <select>: picking sets it
 * and fires `change`, so the sheet saves exactly as with a plain select.
 * A read-only sheet disables the trigger (core's `_toggleDisabled` covers
 * every button in the form), so the list never opens there.
 *
 * Keyboard: Enter/Space/↓/↑ on the trigger open the list; ↑/↓/Home/End
 * move between options, Enter/Space pick, Escape closes, Tab closes.
 */

/** @type {{layer: HTMLElement, trigger: HTMLElement, onPointerDown: Function}|null} */
let openList = null;

/**
 * Close whatever list is open (safe to call when none is).
 * @param {object} [options]
 * @param {boolean} [options.refocus]   Return focus to the trigger.
 */
export function closeHgSelect({ refocus = false } = {}) {
  if (!openList) return;
  const { layer, trigger, onPointerDown } = openList;
  openList = null;
  document.removeEventListener('pointerdown', onPointerDown, true);
  layer.remove();
  trigger.setAttribute('aria-expanded', 'false');
  if (refocus && trigger.isConnected) trigger.focus();
}

/**
 * Wire every `.hg-select` inside `root`.
 * @param {HTMLElement} root
 * @param {object} options
 * @param {string} options.color        Frame color (`data-color`), as the sheet's own.
 * @param {HTMLElement} options.scaleEl  Element carrying `--hg-pixel-scale`.
 */
export function activateHgSelects(root, { color, scaleEl }) {
  for (const wrap of root.querySelectorAll('.hg-select')) {
    const select = wrap.querySelector('select');
    const trigger = wrap.querySelector('.hg-select__trigger');
    const open = () => openHgSelect({ select, trigger, color, scaleEl });
    trigger.addEventListener('click', () => {
      if (openList?.trigger === trigger) closeHgSelect({ refocus: true });
      else open();
    });
    trigger.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      open();
    });
  }
}

/**
 * @param {object} params
 * @param {HTMLSelectElement} params.select
 * @param {HTMLButtonElement} params.trigger
 * @param {string} params.color
 * @param {HTMLElement} params.scaleEl
 */
function openHgSelect({ select, trigger, color, scaleEl }) {
  closeHgSelect();
  if (trigger.disabled || select.disabled) return;

  const layer = document.createElement('div');
  layer.className = 'heroes-glory hg-select-layer';
  const popup = document.createElement('div');
  popup.className = 'hg-tooltip hg-select-popup';
  popup.dataset.color = color;
  const list = document.createElement('div');
  list.className = 'hg-option-list';
  list.setAttribute('role', 'listbox');
  for (const option of select.options) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'hg-option-list__item';
    item.setAttribute('role', 'option');
    item.dataset.value = option.value;
    item.textContent = option.textContent;
    const current = option.value === select.value;
    item.setAttribute('aria-selected', String(current));
    if (current) item.dataset.current = 'true';
    item.addEventListener('click', () => pick(select, trigger, option.value));
    list.append(item);
  }
  list.addEventListener('keydown', (event) => onListKeydown(event, list));
  popup.append(list);
  layer.append(popup);

  // Same scale as the sheet; above the sheet's own window.
  const scale = parseFloat(getComputedStyle(scaleEl).getPropertyValue('--hg-pixel-scale')) || 1;
  popup.style.setProperty('--hg-pixel-scale', String(scale));
  const app = trigger.closest('.application');
  layer.style.zIndex = String((parseInt(getComputedStyle(app ?? document.body).zIndex, 10) || 100) + 1);
  document.body.append(layer);

  // Under the trigger, or above it when there's no room below; kept on screen.
  const anchor = trigger.getBoundingClientRect();
  const size = popup.getBoundingClientRect();
  const top = anchor.bottom + size.height <= window.innerHeight ? anchor.bottom : Math.max(0, anchor.top - size.height);
  const left = Math.max(0, Math.min(anchor.left, window.innerWidth - size.width));
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;

  const onPointerDown = (event) => {
    if (!popup.contains(event.target) && !trigger.contains(event.target)) closeHgSelect();
  };
  document.addEventListener('pointerdown', onPointerDown, true);
  openList = { layer, trigger, onPointerDown };
  trigger.setAttribute('aria-expanded', 'true');
  (list.querySelector('[data-current]') ?? list.firstElementChild)?.focus();
}

/**
 * @param {HTMLSelectElement} select
 * @param {HTMLButtonElement} trigger
 * @param {string} value
 */
function pick(select, trigger, value) {
  closeHgSelect({ refocus: true });
  if (select.value === value) return;
  select.value = value;
  const label = trigger.querySelector('.hg-select__value');
  if (label) label.textContent = select.selectedOptions[0]?.textContent ?? '';
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * @param {KeyboardEvent} event
 * @param {HTMLElement} list
 */
function onListKeydown(event, list) {
  const items = [...list.children];
  const index = items.indexOf(document.activeElement);
  const focus = (i) => items[(i + items.length) % items.length]?.focus();
  switch (event.key) {
    case 'ArrowDown': focus(index + 1); break;
    case 'ArrowUp': focus(index - 1); break;
    case 'Home': focus(0); break;
    case 'End': focus(items.length - 1); break;
    case 'Escape': closeHgSelect({ refocus: true }); break;
    case 'Tab': closeHgSelect({ refocus: true }); break;
    default: return;
  }
  event.preventDefault();
}
