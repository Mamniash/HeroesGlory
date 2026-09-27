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

/**
 * Artifact sheet's mini-paperdoll: slots an artifact can never be given —
 * the spellbook's (10) and the three reserve ones (17–19, no meaning yet,
 * rules.md §8.2).
 */
export const ARTIFACT_LOCKED_SLOTS = Object.freeze([10, 17, 18, 19]);

/**
 * Interchangeable slots, picked as one on the artifact sheet: the two ring
 * slots and the five «прочее» slots. Marking a ring for one hand but not
 * the other would mean nothing at the table.
 */
export const PAPERDOLL_SLOT_GROUPS = Object.freeze([
  Object.freeze([2, 7]),
  Object.freeze([11, 12, 13, 14, 15]),
]);

/**
 * The group `slot` belongs to (itself alone if ungrouped).
 * @param {number} slot
 * @returns {number[]}
 */
export function paperdollSlotGroup(slot) {
  return [...(PAPERDOLL_SLOT_GROUPS.find((group) => group.includes(slot)) ?? [slot])];
}

/**
 * New `targetSlots` after clicking `slot` on the artifact sheet's
 * mini-paperdoll: the slot's whole group goes on if any of it is off,
 * off if all of it is on. Locked slots change nothing. Sorted, no repeats.
 * @param {number[]} targetSlots
 * @param {number} slot
 * @returns {number[]}
 */
export function toggleArtifactSlot(targetSlots, slot) {
  const current = new Set(targetSlots);
  if (ARTIFACT_LOCKED_SLOTS.includes(slot)) return [...current].sort((a, b) => a - b);
  const group = paperdollSlotGroup(slot);
  const allOn = group.every((s) => current.has(s));
  for (const s of group) {
    if (allOn) current.delete(s);
    else current.add(s);
  }
  return [...current].sort((a, b) => a - b);
}
