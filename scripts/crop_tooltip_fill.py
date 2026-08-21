r"""
crop_tooltip_fill.py -- konvertiruet HOMM3-nyy fon dialogovyh okon
(DiBoxBck.bmp) v assets/ui/tooltip_fill.png dlya ispolzovaniya kak odna
rastyagivaemaya fonovaya tekstura tooltipa (_tooltip.scss's `::before`,
`background-size: 100% 100%`).

Ne kusok iz dialog_frame_<цвет>.png (kak bylo ranshe): tot kusok byl vsego
64x64 i pri realnyh razmerah tooltipa (izmereno: dlinnyy tooltip na
defoltnom 758px canvas -- uzhe 318x260px) rastyagivalsya v 4-5 raz, davaya
vidimoe mylo. DiBoxBck.bmp -- 256x256, nastoyashiy fon dialogovyh okon
HOMM3 (ne obrezok ramki), pri tom zhe 318px tooltipe rastyazhenie vsego
~1.2x. Proverena besshovnost tayla 2x2 -- shvov ne vidno (mean/max otklonenie
krayov ~7/~67, u starogo kropa iz ramki bylo ~21/52-101).

Odin fayl na vse 10 tsvetov -- eta tekstura voobshche ne zavisit ot
data-color, v otlichie ot samoy ramki.

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
SRC = r"D:\HOMM3_Extracted\Unpacked_20260802_133005\Data\h3bitmap\DiBoxBck.bmp"
DST = os.path.join(ROOT, "assets", "ui", "tooltip_fill.png")


def main():
    if not os.path.exists(SRC):
        sys.exit("ne nayden istochnik: %s (tolko na mashine avtora assetov)" % SRC)
    im = Image.open(SRC).convert("RGB")
    im.save(DST)
    print("zapisan %s (%dx%d)" % (DST, im.width, im.height))


if __name__ == "__main__":
    main()
