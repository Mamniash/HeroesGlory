/**
 * One-off world migration: backfill `system.targetSlots` on already-owned
 * "Зачарованные доспехи"/"Зачарованные щиты" artifact items that predate
 * this fix (scripts/data/artifact-compendium-data.mjs — targetSlots was
 * empty for all 21 of these entries before now, so any copy a hero
 * already owns from before the fix is still empty and can't be placed on
 * the paperdoll).
 *
 * Rebuilding the compendium (`npm run build:packs`) only fixes the
 * COMPENDIUM's own entries going forward — it does not reach back into
 * copies already embedded on actors in a running world. This script
 * reaches those.
 *
 * Idempotent: only touches an item whose `targetSlots` is CURRENTLY EMPTY
 * and whose name matches a known entry below. Running it twice (or on a
 * world that never needed it) changes nothing the second time. Never
 * touches `level`, `bonus`, `modifiers`, or anything a GM might already
 * have customized by hand — a non-empty targetSlots is left exactly as
 * it is, even if it doesn't match the table below.
 *
 * How to run (GM only):
 *   Foundry sidebar -> Macros -> Create Macro -> Type: Script -> paste
 *   this whole file's contents -> Execute. Prints a summary to the
 *   console and whispers it to you in chat; does nothing on its own
 *   until you run it.
 */
(async () => {
  const TARGET_SLOTS_BY_NAME = {
    // Зачарованные доспехи, стр. 47 — голова=3, торс=5, ноги=9
    // (docs/rules.md §11: допущение, не книжный факт — см. artifact-compendium-data.mjs)
    'Нагрудник из окаменелого дерева': [5],
    'Шлем белого единорога': [3],
    'Шлем-череп': [3],
    'Шлем Хаоса': [3],
    'Поножи из кости дракона': [9],
    'Шлем адской ярости': [3],
    'Кольчуга великого василиска': [5],
    'Туника короля циклопов': [5],
    'Шлем небесного грома': [3],
    'Доспех из чешуи дракона': [5],
    // Зачарованные щиты, стр. 48 — все в слот щита (slot_6)
    'Щит стражника королевы': [6],
    'Щит полурослика': [6],
    'Щит короля гномов': [6],
    'Щит короля гноллов': [6],
    'Щит яростного огра': [6],
    'Щит проклятых': [6],
    'Щит короля минотавров': [6],
    'Щит морской славы': [6],
    'Щит из чешуи дракона': [6],
    'Щит часового': [6],
  };

  let updated = 0;
  const touched = [];

  for (const actor of game.actors) {
    for (const item of actor.items) {
      if (item.type !== 'artifact') continue;
      if (!['enchantedArmor', 'enchantedShield'].includes(item.system.artifactType)) continue;
      const slots = TARGET_SLOTS_BY_NAME[item.name];
      if (!slots) continue;
      if ((item.system.targetSlots ?? []).length > 0) continue; // already set — never override a GM customization
      await item.update({ 'system.targetSlots': slots });
      updated += 1;
      touched.push(`${actor.name} — ${item.name} -> slot ${slots.join(',')}`);
    }
  }

  const summary = updated === 0
    ? 'Миграция targetSlots: обновлять нечего (0 предметов подошло под условия).'
    : `Миграция targetSlots: обновлено ${updated} предмет(ов):\n${touched.join('\n')}`;
  console.log(summary);
  await ChatMessage.create({ content: `<pre>${summary}</pre>`, whisper: [game.user.id] });
})();
