/**
 * HOMM3 artifact art (Artifact.def frames in assets/artifact/; frame N is
 * HOMM3 artifact N of ARTRAITS.TXT). Shared by the artifact compendium
 * data and the spellbook's default image, so the path lives in one place.
 */

/**
 * @param {number} frame   Artifact.def frame (= HOMM3 artifact number).
 * @returns {string}
 */
export function artifactFramePath(frame) {
  return `systems/heroes-glory/assets/artifact/artifact_g00_f${String(frame).padStart(3, '0')}.png`;
}

/** Книга Магии — HOMM3 «Книга заклинаний», artifact 0. */
export const SPELLBOOK_IMG = artifactFramePath(0);
