/**
 * §6.4, group Г: the region behavior of a Силовое Поле (p. 54): «Они
 * становятся непроходимыми даже для летающих существ». Core v14 makes a cell
 * impassable through its terrain — an infinite movement cost stops any
 * movement into or out of it, walking and flying alike; a `null` difficulty is
 * that infinity (HeroesGloryTerrainData). A region's own `restriction` is not
 * that: it only clips the region's shape by walls. Core's `displace`
 * (Телепорт, a GM's drop) isn't a step and passes.
 */
export default class HeroesGloryForceFieldBehavior extends foundry.data.regionBehaviors.RegionBehaviorType {

  /** @override */
  static defineSchema() {
    return {};
  }

  /** @override */
  _getTerrainEffects(token, segment) {
    if (segment.action === "displace") return [];
    return [{ name: "difficulty", difficulty: null }];
  }
}
