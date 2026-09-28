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
      return slotIndex === weaponTypeSlot(item.system.weaponType);
    case 'spellbook':
      return slotIndex === 10;
    case 'artifact': {
      // The artifact's own marks decide, weapon or not. An enchanted weapon
      // with no marks at all falls back to its weapon type's slot.
      const marks = item.system.targetSlots ?? [];
      if (item.system.artifactType === 'enchantedWeapon' && marks.length === 0) {
        return slotIndex === weaponTypeSlot(item.system.weaponType);
      }
      return marks.includes(slotIndex);
    }
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
 * The slot a weapon's type gives it: стрелковое — дальний бой (16), any
 * other — правая рука (1).
 * @param {string} weaponType
 * @returns {number}
 */
export function weaponTypeSlot(weaponType) {
  return weaponType === 'ranged' ? 16 : 1;
}

/**
 * Artifact sheet's mini-paperdoll: slots an artifact can't be given. Only
 * the book's (10): an artifact lying there would take away the one way a
 * hero without a book opens race-granted spells (the empty slot 10).
 */
export const ARTIFACT_LOCKED_SLOTS = Object.freeze([10]);

/**
 * New `targetSlots` after clicking `slot` on the artifact sheet's
 * mini-paperdoll: that one slot goes on or off. Locked slots change
 * nothing. Sorted, no repeats.
 * @param {number[]} targetSlots
 * @param {number} slot
 * @returns {number[]}
 */
export function toggleArtifactSlot(targetSlots, slot) {
  const current = new Set(targetSlots);
  if (!ARTIFACT_LOCKED_SLOTS.includes(slot)) {
    if (current.has(slot)) current.delete(slot);
    else current.add(slot);
  }
  return [...current].sort((a, b) => a - b);
}

/**
 * An enchanted weapon's marks after its weapon type changes: left alone if
 * someone marked them by hand, moved along if they are just the old type's
 * own slot (so a bow re-typed as a sword moves from 16 to 1).
 * @param {number[]} targetSlots
 * @param {string} oldType
 * @param {string} newType
 * @returns {number[]}
 */
export function followWeaponTypeSlots(targetSlots, oldType, newType) {
  const untouched = targetSlots.length === 0
    || (targetSlots.length === 1 && targetSlots[0] === weaponTypeSlot(oldType));
  return untouched ? [weaponTypeSlot(newType)] : [...targetSlots];
}
