r"""
crop_creature_stat_icons.py -- vyrezaet ikonki harakteristik iz okna
informatsii o sushchestve HOMM3 (CrStkPu.bmp, 298x311) v assets/crstkpu/
dlya lista sushchestva (templates/actor/actor-creature-sheet.hbs).

V CrStkPu ikonki narisovany pryamo v fone okna, stolbtsom sprava ot
portreta: yacheyki 21x18 s shagom 19 px po vertikali, levyy kray x=128,
verhniy y=47 (ramka yacheyki -- v x=127 i y=46, ne vyrezaetsya). Poryadok
v okne: Ataka, Zashchita, Vystrely, Uron, Zdorove, Ostalos zdorovya,
Skorost. Beryom shest: «Ostalos zdorovya» listu ne nuzhno (Zdorove odno
pole), «Vystrely» stoit u «Kol-va atak» -- svoey ikonki u nego v HOMM3 net.

Primer:
    python scripts/crop_creature_stat_icons.py
"""

import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow ne ustanovlen. Vypolni: pip install pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = r"D:\HOMM3_Extracted\Unpacked_20260802_133005\Data\h3bitmap\CrStkPu.bmp"
DST = os.path.join(ROOT, "assets", "crstkpu")

LEFT, TOP, WIDTH, HEIGHT, STEP = 128, 47, 21, 18, 19
# Row in the window -> file name.
ICONS = {0: "attack", 1: "defense", 2: "shots", 3: "damage", 4: "health", 6: "speed"}


def main():
    if not os.path.exists(SRC):
        sys.exit("ne nayden istochnik: %s (tolko na mashine avtora assetov)" % SRC)
    im = Image.open(SRC).convert("RGB")
    os.makedirs(DST, exist_ok=True)
    for row, name in ICONS.items():
        top = TOP + STEP * row
        path = os.path.join(DST, "crstkpu_%s.png" % name)
        im.crop((LEFT, top, LEFT + WIDTH, top + HEIGHT)).save(path)
        print("zapisan %s" % path)


if __name__ == "__main__":
    main()
