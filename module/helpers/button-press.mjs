/**
 * Shared timing for every sprite-swap button's "pressed" frame across the
 * project (tooltip.mjs's pin OK/Yes/No, hero-sheet.mjs's backpack arrows,
 * level-up-app.mjs's confirm checkmark) — how long the pressed frame (f001
 * in every asset set that has one) stays visible after a click before the
 * button's real next state (disabled, closed, re-rendered, ...) takes
 * over. Used to be three independent same-valued constants (150ms each,
 * PIN_OK_PRESS_HOLD_MS/BACKPACK_PRESS_HOLD_MS/CONFIRM_PRESS_HOLD_MS) —
 * consolidated to one so they can't quietly drift apart, and lowered
 * (150 → 100, ~1.5×) per a live-feel pass: long enough to read as a
 * press, short enough not to feel laggy.
 *
 * `:active` is deliberately not used anywhere this applies — every one of
 * these buttons either gets disabled, removed, or has its whole parent
 * re-rendered (Handlebars swaps in a fresh DOM node) as an immediate
 * consequence of the same click, all of which end `:active` before the
 * browser has actually painted it even once. Holding the pressed frame via
 * an explicit class + this timer, added synchronously in the click handler
 * (before anything disabled/async/re-rendered happens), is what makes the
 * frame visible starting at the moment of the click instead of never or
 * "eventually".
 * @type {number}
 */
export const PRESS_HOLD_MS = 100;
