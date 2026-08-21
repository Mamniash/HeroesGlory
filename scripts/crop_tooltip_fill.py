r"""
crop_tooltip_fill.py -- vyrezaet sredniy 64x64 kusok iz dialog_frame_<цвет>.png
dlya ispolzovaniya kak odna rastyagivaemaya fonovaya tekstura tooltipa
(_tooltip.scss's `::before`, `background-size: 100% 100%`), vmesto togo
chtoby tayl'nut etot zhe kusok cherez border-image-slice's `fill` (daet
vidimye styki -- kusok ne besshovnyy, sm. plan).

Fon odinakov vo vseh 10 tsvetovyh variantah (recolor() v make_border.py
trogaet tolko "player blue" pikseli ramki, ne korichnevuyu seredinu) --
proverneo poбайтово (mean/max diff = 0 mezhdu white/black/red), poetomu
dostatochno odnogo faila na vse tsveta.

Primer:
    python scripts/crop_tooltip_fill.py
"""

import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow ne ustanovlen. Vypolni: pip install pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "ui", "dialog_frame_white.png")
DST = os.path.join(ROOT, "assets", "ui", "tooltip_fill.png")

# Koordinaty sredney 64x64 zony vnutri 192x192 holsta (64px ramka so
# vseh storon, sm. make_border.py / plan).
BOX = (64, 64, 128, 128)


def main():
    im = Image.open(SRC).convert("RGBA")
    if im.size != (192, 192):
        sys.exit("ozhidalsya 192x192 holst, poluchen %r -- proveryay BOX" % (im.size,))
    crop = im.crop(BOX)
    crop.save(DST)
    print("zapisan %s (%dx%d)" % (DST, crop.width, crop.height))


if __name__ == "__main__":
    main()
