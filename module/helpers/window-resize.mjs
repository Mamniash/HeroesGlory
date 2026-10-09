/**
 * Our dialogs and the picker size themselves to their content (`width:
 * 'auto'`, the frame's own max-width wraps the text); once the user drags
 * the resize handle, the window keeps the size they chose (core turns
 * `auto` into a number then) and the frame fills it — this class switches
 * the CSS over (_dialog.scss, «hg-resized»): no max-width, the body scrolls
 * inside the frame, nothing sticks out of it.
 */

/** Set on the application element once the user has resized it. */
export const RESIZED_CLASS = 'hg-resized';

/**
 * Marks the window as user-sized on the first press of its resize handle.
 * Call from `_onFirstRender` (the frame and its handle exist by then).
 * @param {foundry.applications.api.ApplicationV2} app
 */
export function trackUserResize(app) {
  const handle = app.element?.querySelector('.window-resize-handle');
  handle?.addEventListener('pointerdown', () => app.element.classList.add(RESIZED_CLASS), { once: true });
}
