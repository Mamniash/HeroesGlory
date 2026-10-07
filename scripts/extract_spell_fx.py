#!/usr/bin/env python3
"""
extract_spell_fx.py -- the HOMM3 combat-spell animations the system plays
(module/helpers/spell-fx.mjs), from the game's h3sprite.lod unpacked to DEF
files, to assets/spell-fx/<key>/NNN.png.

    python scripts/extract_spell_fx.py [path to the unpacked h3sprite folder]

One DEF a key; frames keep the DEF's canvas, so they line up. Rerun gives
the same files. Needs Pillow (as def2png.py).
"""

import os
import shutil
import subprocess
import sys
import tempfile

DEFAULT_SPRITES = r"D:\HOMM3_Extracted\Unpacked_20260802_133005\Data\h3sprite"
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "spell-fx")

# key -> DEF. Keep in step with SPELL_FX in module/helpers/spell-fx.mjs.
SPELL_FX = {
    "magic-arrow": "C20SPX0.def",      # Волшебная Стрела, in flight (points right)
    "magic-arrow-hit": "C20SPX.DEF",   # Волшебная Стрела, the burst on the target
    "lightning": "C03SPA0.def",        # Молния, one bolt (vertical)
    "lightning-alt": "C11SPA0.def",    # the second bolt drawing, for the flicker
    "fireball": "C13SPF0.def",         # Огненный Шар, the explosion
}


def main():
    sprites = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SPRITES
    def2png = os.path.join(os.path.dirname(__file__), "def2png.py")
    with tempfile.TemporaryDirectory() as tmp:
        for key, name in SPELL_FX.items():
            src = os.path.join(sprites, name)
            work = os.path.join(tmp, key)
            subprocess.run([sys.executable, def2png, src, "-o", work, "--group-dirs"], check=True,
                           stdout=subprocess.DEVNULL)
            frames_dir = next(os.path.join(root, d) for root, dirs, _ in os.walk(work) for d in dirs if d == "g00")
            dest = os.path.join(OUT, key)
            shutil.rmtree(dest, ignore_errors=True)
            os.makedirs(dest)
            frames = sorted(f for f in os.listdir(frames_dir) if f.endswith(".png"))
            for index, frame in enumerate(frames):
                shutil.copyfile(os.path.join(frames_dir, frame), os.path.join(dest, f"{index:03d}.png"))
            print(f"{key}: {len(frames)} frames <- {name}")


if __name__ == "__main__":
    main()
