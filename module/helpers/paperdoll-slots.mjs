/**
 * Whether `item` may be placed in paperdoll slot `slotIndex` (rules.md
 * §8.1/§8.2). Weapon and spellbook slots are fixed by rule (melee weapon
 * -> slot 1, ranged weapon -> slot 16, spellbook -> slot 10); artifacts
 * are hand-curated per item via `system.targetSlots` (see
 * module/data/item-artifact.mjs's own comment for why `artifactType`
 * isn't used for this instead).
 * @param {{type: string, system: object}} item
 * @param {number} slotIndex
 * @returns {boolean}
 */
export function paperdollSlotAccepts(item, slotIndex) {
  switch (item.type) {
    case 'weapon':
      return slotIndex === (item.system.weaponType === 'ranged' ? 16 : 1);
    case 'spellbook':
      return slotIndex === 10;
    case 'artifact':
      return (item.system.targetSlots ?? []).includes(slotIndex);
    default:
      return false;
  }
}

/**
 * All paperdoll slot indices (1-19) `item` may be dropped on — drives the
 * hero sheet's drag-start highlight.
 * @param {{type: string, system: object}} item
 * @returns {number[]}
 */
export function paperdollValidSlots(item) {
  const slots = [];
  for (let slot = 1; slot <= 19; slot++) {
    if (paperdollSlotAccepts(item, slot)) slots.push(slot);
  }
  return slots;
}
