import { legacySpecializationPlan, specializationFromKey } from './specializations.mjs';
import { specializationItemData, specializationView } from '../apps/specialization-window.mjs';

/**
 * World migrations, run once by the active GM on `ready`. The world setting
 * `migrationVersion` keeps the last one that finished, so none runs twice;
 * a migration that couldn't finish leaves it, and the next start retries
 * what is left.
 */

const SYSTEM_ID = 'heroes-glory';
const VERSION_SETTING = 'migrationVersion';

/** §4.3: the specialization became an item. */
const SPECIALIZATION_ITEMS = 1;

/** The flag on a hero the specialization migration has handled. */
const MIGRATED_FLAG = 'specializationMigrated';

/** The flag of the old stored «+50 Маны» effect (before the item). */
const OLD_EFFECT_FLAG = 'specializationModifiers';

/** Registers the version setting (init). */
export function registerMigrationSetting() {
  game.settings.register(SYSTEM_ID, VERSION_SETTING, {
    scope: 'world',
    config: false,
    type: Number,
    default: 0,
  });
}

/**
 * Runs what this world hasn't run yet (ready, the active GM only).
 * @returns {Promise<void>}
 */
export async function runMigrations() {
  if (!game.user.isActiveGM) return;
  const done = game.settings.get(SYSTEM_ID, VERSION_SETTING) ?? 0;
  if (done < SPECIALIZATION_ITEMS) {
    const finished = await migrateSpecializationItems();
    if (finished) await game.settings.set(SYSTEM_ID, VERSION_SETTING, SPECIALIZATION_ITEMS);
  }
}

/**
 * §4.3: the hero's stored `system.specialization` ({type, key}) → an item of
 * type `specialization` (rules.md §4.3). For each hero, in this order: create
 * the item from the compendium; check it is there; only then delete the old
 * stored «+50 Маны» effect and the old field, and set the flag. A hero whose
 * item couldn't be created keeps the old field and no flag — the next start
 * retries it. The old effect is removed from every world actor that has it,
 * a hero without an old specialization too. Unlinked hero tokens are not
 * touched — only listed. The GM gets a whisper with what was done.
 * @returns {Promise<boolean>}   true — everything done
 */
async function migrateSpecializationItems() {
  const i18n = game.i18n;
  const report = { created: [], failed: [], effects: [], unlinked: [] };

  for (const actor of game.actors) {
    if (actor.type === 'hero') {
      const ok = await migrateHero(actor, report);
      if (!ok) continue;
    }
    await removeOldEffects(actor, report);
  }

  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink || token.actor?.type !== 'hero') continue;
      report.unlinked.push(`${scene.name}: ${token.name}`);
    }
  }

  const lines = [
    ...report.created.map((r) => i18n.format('HEROES_GLORY.SpecializationUi.Migration.Created', r)),
    ...report.failed.map((r) => i18n.format('HEROES_GLORY.SpecializationUi.Migration.CreateFailed', r)),
  ];
  if (report.effects.length) {
    lines.push(i18n.format('HEROES_GLORY.SpecializationUi.Migration.EffectsRemoved', { actors: report.effects.join(', ') }));
  }
  if (report.unlinked.length) {
    lines.push(i18n.format('HEROES_GLORY.SpecializationUi.Migration.UnlinkedTokens', { tokens: report.unlinked.join(', ') }));
  }
  if (lines.length) {
    const esc = foundry.utils.escapeHTML;
    await ChatMessage.create({
      content: `<p><strong>${esc(i18n.localize('HEROES_GLORY.SpecializationUi.Migration.Title'))}</strong></p>`
        + lines.map((line) => `<p>${esc(line)}</p>`).join(''),
      whisper: game.users.filter((u) => u.isGM).map((u) => u.id),
    });
  }
  console.log(`heroes-glory | specialization migration: ${report.created.length} created, ${report.failed.length} failed, `
    + `${report.effects.length} old effects removed, ${report.unlinked.length} unlinked hero tokens listed`);
  return report.failed.length === 0;
}

/**
 * One hero: create the item, check it, then clear the old field and flag it.
 * @param {Actor} actor
 * @param {object} report
 * @returns {Promise<boolean>}   false — the item couldn't be created
 */
async function migrateHero(actor, report) {
  // The stored value — `system.specialization` itself is the derived one.
  const legacy = actor._source.system.specialization ?? null;
  const items = () => actor.items.filter((i) => i.type === 'specialization');
  const plan = legacySpecializationPlan({
    legacy, migrated: !!actor.getFlag(SYSTEM_ID, MIGRATED_FLAG), itemCount: items().length,
  });

  if (plan.create) {
    const spec = specializationFromKey(plan.create);
    const entry = { actor: actor.name, name: specializationView(spec).label };
    try {
      await actor.createEmbeddedDocuments('Item', [await specializationItemData(plan.create)]);
    } catch (err) {
      console.error(err);
    }
    if (!items().some((i) => i.system.key === plan.create)) {
      report.failed.push(entry);
      return false;
    }
    report.created.push(entry);
  }

  await removeOldEffects(actor, report);
  // The old field goes from the database — that key alone; nothing else of
  // `system` is written.
  await actor.update({
    'system.specialization': new foundry.data.operators.ForcedDeletion(),
    [`flags.${SYSTEM_ID}.${MIGRATED_FLAG}`]: true,
  });
  return true;
}

/**
 * Deletes the old stored «+50 Маны» effect (flag `specializationModifiers`)
 * from one actor, if it has one.
 * @param {Actor} actor
 * @param {object} report
 * @returns {Promise<void>}
 */
async function removeOldEffects(actor, report) {
  const ids = actor.effects.filter((e) => e.getFlag(SYSTEM_ID, OLD_EFFECT_FLAG)).map((e) => e.id);
  if (!ids.length) return;
  await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
  if (!report.effects.includes(actor.name)) report.effects.push(actor.name);
}
