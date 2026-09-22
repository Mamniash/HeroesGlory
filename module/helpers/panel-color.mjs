/**
 * "auto" resolves through the hero's faction; any other value is already a
 * concrete CONFIG.HEROES_GLORY.panelColors key and is returned as-is.
 * Single source of truth for this — used by hero-sheet.mjs's
 * _prepareContext and its option-picker color, so the two can't drift.
 * @param {{panelColor: string, faction: string}} system
 * @returns {string}
 */
export function resolveEffectivePanelColor(system) {
  if (system.panelColor !== 'auto') return system.panelColor;
  return CONFIG.HEROES_GLORY.panelColorByFaction[system.faction] ?? 'red';
}
