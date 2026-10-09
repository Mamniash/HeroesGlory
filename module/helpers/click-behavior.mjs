/**
 * What the left and right buttons do on a sheet element (docs/rules.md,
 * «Клики и подсказки»). An element with its own sheet: the right button
 * opens the sheet, the left does the element's action — or, with none,
 * opens the sheet too; the GM in edit mode opens it with the left button
 * as well, unless the element has an edit-mode action of its own. No
 * tooltip then. Книга Магии is the exception: both buttons open the
 * spread, its item sheet isn't shown. An element without a sheet keeps
 * its left action, and our tooltip on the right button only if it
 * explains something beyond the name. Pure — no Foundry globals.
 */

/**
 * @param {object} element
 * @param {boolean} [element.hasSheet]        has its own sheet (an item, a compendium entry)
 * @param {boolean} [element.hasAction]       has a left-click action outside edit mode (attack, choose…)
 * @param {boolean} [element.hasEditAction]   has a left-click action of its own in the GM's edit mode
 * @param {boolean} [element.isSpellbook]     Книга Магии
 * @param {boolean} [element.hasExplanation]  the tooltip says more than the name
 * @param {object} viewer
 * @param {boolean} [viewer.editMode]   the sheet's edit mode (GM only)
 * @param {boolean} [viewer.isGM]
 * @returns {{left: 'action'|'sheet'|'spellbook'|'none', right: 'sheet'|'spellbook'|'tooltip'|'none', readOnly: boolean}}
 */
export function elementClicks(
  { hasSheet = false, hasAction = false, hasEditAction = false, isSpellbook = false, hasExplanation = false } = {},
  { editMode = false, isGM = false } = {},
) {
  const readOnly = !isGM;
  if (isSpellbook) return { left: 'spellbook', right: 'spellbook', readOnly };
  if (hasSheet) {
    const editing = editMode && isGM;
    const left = editing ? (hasEditAction ? 'action' : 'sheet') : (hasAction ? 'action' : 'sheet');
    return { left, right: 'sheet', readOnly };
  }
  return { left: hasAction ? 'action' : 'none', right: hasExplanation ? 'tooltip' : 'none', readOnly };
}
