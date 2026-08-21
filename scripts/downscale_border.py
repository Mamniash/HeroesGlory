r"""
downscale_border.py -- umenshaet uzhe sobrannye dialog_frame_<цвет>.png
(192x192, ugly/trim 64px) do 96x96 (ugly/trim 32px) kachestvennym
resemplingom (LANCZOS), pishet OTDELNYE fayly dialog_frame_32_<цвет>.png --
originaly NE trogaet (te zhe dialog_frame_<цвет>.png ispolzuet ne tolko
tooltip, no i race/faction/class/panel-color pikery cherez tot zhe sloy
.hg-tooltip -- porcha na meste uehala by srazu vezde).

Pochemu ne peresobrat cherez make_border.py s nulya: syrye kadry
(D:\HG_Sheet_Assets\ui\dialgbox\*.png, dibox128.png -- ne v repozitorii)
narisovany HOMM3 tolko v 64px, bolshe nikakogo razreshenija u nih net --
lyuboe umenshenie vsyo ravno trebuet resemplinga, tak chto proshche
(i vosproizvodimee, bez zavisimosti ot vneshnih failov) sdelat eto na uzhe
gotovom 192x192 kompozite.

Proverено (sm. plan/scratch-eksperiment): LANCZOS na 64->32 uglu ostavlyaet
scrollwork chitaemym, zametno luchshe nyneshnego runtime-szhatiya do ~20-24px.

Primer:
    python scripts/downscale_border.py
"""

import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow ne ustanovlen. Vypolni: pip install pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UI_DIR = os.path.join(ROOT, "assets", "ui")

COLORS = [
    "red", "blue", "tan", "green", "orange",
    "purple", "teal", "pink", "black", "white",
]

SRC_SIZE = 192
DST_SIZE = 96  # 32 (ugol) + 32 (seredina) + 32 (ugol)


def main():
    for color in COLORS:
        src_path = os.path.join(UI_DIR, "dialog_frame_%s.png" % color)
        dst_path = os.path.join(UI_DIR, "dialog_frame_32_%s.png" % color)
        im = Image.open(src_path).convert("RGBA")
        if im.size != (SRC_SIZE, SRC_SIZE):
            sys.exit("%s: ozhidalsya %dx%d, poluchen %r" % (src_path, SRC_SIZE, SRC_SIZE, im.size))
        small = im.resize((DST_SIZE, DST_SIZE), Image.LANCZOS)
        small.save(dst_path)
        print("zapisan %s (%dx%d)" % (dst_path, small.width, small.height))


if __name__ == "__main__":
    main()
