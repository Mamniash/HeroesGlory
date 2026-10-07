#!/usr/bin/env python3
"""
extract_spell_fx.py -- the HOMM3 combat-spell animations the system plays
(module/helpers/spell-fx.mjs), from the game's h3sprite.lod unpacked to DEF
files, to assets/spell-fx/<key>/NNN.png, and their frame counts and sizes to
assets/spell-fx/manifest.json.

    python scripts/extract_spell_fx.py [path to the unpacked h3sprite folder]

One DEF a key; frames keep the DEF's canvas, so they line up. Rerun gives
the same files. Needs Pillow (as def2png.py).
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

DEFAULT_SPRITES = r"D:\HOMM3_Extracted\Unpacked_20260802_133005\Data\h3sprite"
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "spell-fx")

# key -> DEF; the spell each one is for — as HOMM3 draws it (VCMI's
# config/spells/*.json «animation» blocks). Keep in step with FX_BY_SPELL
# in module/helpers/spell-fx.mjs.
SPELL_FX = {
    "magic-arrow": "C20SPX0.def",        # Волшебная Стрела, in flight (points right)
    "magic-arrow-hit": "C20SPX.DEF",     # its burst on the target
    "ice-bolt": "C08SPW0.def",           # Ледяная Молния, in flight
    "ice-bolt-hit": "C08SPW5.def",       # its burst
    "disrupting-ray": "C07SPA0.def",     # Разрушительный Луч, in flight
    "disrupting-ray-hit": "C07SPA1.def", # its mark on the target
    "lightning": "C03SPA0.def",          # Молния
    "lightning-alt": "C03SPA1.def",
    "chain-lightning": "C11SPA0.def",    # Цепная Молния
    "chain-lightning-alt": "C11SPA1.def",
    "fireball": "C13SPF.DEF",            # Огненный Шар
    "inferno": "C04SPF0.def",            # Инферно
    "meteor-shower": "C08SPE0.def",      # Метеоритный Дождь
    "frost-ring": "C07SPW.DEF",          # Кольцо Холода
    "implosion": "C05SPE0.def",          # Взрыв
    "death-ripple": "C04SPE0.def",       # Волна Смерти
    "destroy-undead": "C14SPA0.def",     # Уничтожить Нежить
    "armageddon": "C06SPF0.def",         # Армагеддон
    "shield": "C13SPE0.def",             # Щит
    "air-shield": "C01SPA0.def",         # Воздушный Щит
    "fire-shield": "C05SPF0.def",        # Огненный Щит
    "anti-magic": "C02SPE0.def",         # Антимагия
    "bless": "C01SPW.DEF",               # Благословение
    "curse": "C04SPW.DEF",               # Проклятие
    "precision": "C12SPA0.def",          # Точность
    "weakness": "C17SPW0.def",           # Слабость
    "stone-skin": "C16SPE.DEF",          # Каменная Кожа
    "prayer": "C10SPW.def",              # Молитва
    "fortune": "C09SPA0.def",            # Удача
    "misfortune": "C10SPF0.def",         # Неудача
    "haste": "C15SPA0.def",              # Ускорение
    "slow": "C09SPE0.def",               # Замедление
    "counterstrike": "C04SPA0.def",      # Ответный Удар
    "forgetfulness": "C06SPW.DEF",       # Забывчивость
    "blind": "C02SPF0.def",              # Слепота
    "dispel": "C05SPW.DEF",              # Развеивание Магии
    "cure": "C03SPW.DEF",                # Лечение
    "resurrection": "C01SPE0.def",       # Воскрешение
}


def main():
    sprites = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SPRITES
    def2png = os.path.join(os.path.dirname(__file__), "def2png.py")
    manifest = {}
    shutil.rmtree(OUT, ignore_errors=True)
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
            width, height = Image.open(os.path.join(dest, "000.png")).size
            manifest[key] = {"frames": len(frames), "width": width, "height": height}
            print(f"{key}: {len(frames)} frames {width}x{height} <- {name}")
    # The player reads frame counts and sizes from here (spell-fx.mjs).
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)
        f.write("\n")


if __name__ == "__main__":
    main()
