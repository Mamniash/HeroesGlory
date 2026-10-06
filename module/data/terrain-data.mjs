/**
 * §6.4, group Г: the terrain of a token's movement, so that a Силовое Поле
 * can be impassable. Core's TerrainData already reads a `null` difficulty as
 * infinite (`_initialize`: `difficulty ??= Infinity`), and an infinite cost
 * constrains any movement, but its `resolveTerrainEffects` multiplies the
 * difficulties, turning a `null` into 0 — free movement. Here an effect with
 * `difficulty: null` makes the terrain impassable; everything else is core's.
 */
export default class HeroesGloryTerrainData extends foundry.data.TerrainData {

  /** @override */
  static resolveTerrainEffects(effects, options) {
    if (effects.some((effect) => (effect.name === "difficulty") && (effect.difficulty === null))) {
      return new this({ difficulty: null });
    }
    return super.resolveTerrainEffects(effects, options);
  }
}
