import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArtifactDocuments } from '../scripts/data/artifact-compendium-data.mjs';
import { SPELLBOOK_IMG } from '../module/helpers/item-images.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const onDisk = (img) => fs.existsSync(path.join(ROOT, img.replace(/^systems\/heroes-glory\//, '')));

describe('artifact images — HOMM3 Artifact.def frames', () => {
  const docs = buildArtifactDocuments();

  test('all 71 artifacts have an HOMM3 frame that exists', () => {
    assert.equal(docs.length, 71);
    for (const d of docs) {
      assert.match(d.img, /^systems\/heroes-glory\/assets\/artifact\/artifact_g00_f\d{3}\.png$/, d.name);
      assert.ok(onDisk(d.img), `${d.name}: ${d.img}`);
    }
  });

  test('frames repeat only among shields', () => {
    const byImg = new Map();
    for (const d of docs) byImg.set(d.img, [...(byImg.get(d.img) ?? []), d]);
    for (const [img, users] of byImg) {
      if (users.length > 1) for (const d of users) assert.equal(d.system.artifactType, 'enchantedShield', `${img}: ${d.name}`);
    }
  });

  test('Книга Магии: HOMM3 «Книга заклинаний» (frame 0), on disk', () => {
    assert.equal(SPELLBOOK_IMG, 'systems/heroes-glory/assets/artifact/artifact_g00_f000.png');
    assert.ok(onDisk(SPELLBOOK_IMG));
  });
});
