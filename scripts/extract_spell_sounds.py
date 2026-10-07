#!/usr/bin/env python3
"""
extract_spell_sounds.py -- the HOMM3 spell sounds the system plays
(module/helpers/spell-fx.mjs, SFX_BY_SPELL), from the game's Heroes3.snd to
assets/spell-sfx/<NAME>.ogg.

    python scripts/extract_spell_sounds.py [path to Heroes3.snd] [path to ffmpeg]

Heroes3.snd: a count, then 48-byte entries — a 40-byte name ("NAME\\0wav\\0…"),
the offset and size of a WAV. The WAVs are converted to Ogg Vorbis with
ffmpeg (a tenth of the size). Rerun gives the same files.
"""

import os
import shutil
import struct
import subprocess
import sys
import tempfile

DEFAULT_SND = r"D:\Games\Heroes of Might and Magic III Complete\Data\Heroes3.snd"
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "spell-sfx")

# The sounds of our spells, as VCMI's config/spells/*.json «sounds» blocks
# name them (an obstacle spell — its «appearSound»; Телепорт — out and in).
# Keep in step with SFX_BY_SPELL in module/helpers/spell-fx.mjs.
SOUNDS = [
    "MAGICBLT", "ICERAY", "LIGHTBLT", "DECAY", "CHAINLTE", "FROSTING", "SPONTCOMB", "FIREBLST", "METEOR",
    "DEATHRIP", "SACBRETH", "ARMGEDN", "SHIELD", "AIRSHELD", "FIRESHLD", "ANTIMAGK", "BLESS", "CURSE",
    "BLOODLUS", "PRECISON", "WEAKNESS", "TUFFSKIN", "DISRUPTR", "PRAYER", "FORTUNE", "MISFORT", "TAILWIND",
    "MUCKMIRE", "CNTRSTRK", "FORGET", "BLIND", "FLYSPELL", "QUIKSAND", "FORCEFLD", "FIREWALL", "TELPTOUT",
    "TELPTIN", "CLONE", "SUMNELM", "DISPELL", "CURE", "RESURECT",
]


def read_entries(path):
    with open(path, "rb") as f:
        count = struct.unpack("<I", f.read(4))[0]
        entries = {}
        for _ in range(count):
            raw = f.read(48)
            name = raw[:40].split(b"\0")[0].decode("latin1").upper()
            offset, size = struct.unpack("<II", raw[40:48])
            entries[name] = (offset, size)
    return entries


def main():
    snd = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SND
    ffmpeg = sys.argv[2] if len(sys.argv) > 2 else (shutil.which("ffmpeg") or "ffmpeg")
    entries = read_entries(snd)
    missing = [name for name in SOUNDS if name not in entries]
    if missing:
        sys.exit(f"not in {snd}: {', '.join(missing)}")
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT)
    with open(snd, "rb") as f, tempfile.TemporaryDirectory() as tmp:
        for name in SOUNDS:
            offset, size = entries[name]
            f.seek(offset)
            wav = os.path.join(tmp, f"{name}.wav")
            with open(wav, "wb") as out:
                out.write(f.read(size))
            dest = os.path.join(OUT, f"{name}.ogg")
            subprocess.run([ffmpeg, "-loglevel", "error", "-y", "-i", wav, "-c:a", "libvorbis", "-q:a", "4",
                            "-map_metadata", "-1", "-fflags", "+bitexact", dest], check=True)
            print(f"{name}: {size} bytes wav -> {os.path.getsize(dest)} bytes ogg")


if __name__ == "__main__":
    main()
