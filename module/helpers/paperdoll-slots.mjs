/**
 * Whether `item` may be placed in paperdoll slot `slotIndex` (rules.md
 * §8.1/§8.2). Weapon and spellbook slots are fixed by rule (melee weapon
 * -> slot 1, ranged weapon -> slot 16, spellbook -> slot 10); the other 5
 * artifact types are hand-curated per item via `system.targetSlots` (see
 * module/data/item-artifact.mjs's own comment for why `artifactType`
 * isn't used for those instead).
 *
 * An artifact whose `artifactType` is "enchantedWeapon" is the one
 * exception: it's made to behave exactly like a real weapon once
 * equipped (item-artifact.mjs carries the same `weaponType`/`damage`/
 * `twoHanded`/`epicTable` fields item-weapon.mjs does), so its slot is
 * derived from `weaponType` the same deterministic way a real weapon's
 * is — not from `targetSlots`, which would otherwise need curating by
 * hand for every hand-authored enchanted weapon even though the answer
 * is never actually ambiguous.
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
      if (item.system.artifactType === 'enchantedWeapon') {
        return slotIndex === (item.system.weaponType === 'ranged' ? 16 : 1);
      }
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
