r"""
downscale_border.py -- umenshaet assets/ui/dialog_frame_<цвет>.png
(192x192, ugol/trim 64px) do 96x96 (ugol/trim 32px) kachestvennym
resemplingom (LANCZOS), pishet OTDELNYE fayly dialog_frame_32_<цвет>.png --
originaly NE trogaet (oni ostayutsya obshchim istochnikom dlya etogo
skripta i dlya crop_tooltip_fill.py, derzhat ih otdelno ot proizvodnyh
32px failov -- prosto gigiena, ne trebovanie CSS: border-image-source v
_tooltip.scss teper ssylaetsya tolko na _32-varianty).

Proverено (sm. plan/scratch-eksperiment): LANCZOS na 64->32 uglu ostavlyaet
scrollwork chitaemym, zametno luchshe nyneshnego runtime-szhatiya do ~20-24px.

VAZhNO pro sami originaly: assets/ui/dialog_frame_<цвет>.png sobrany
(scripts/make_border.py) BEZ --bg. S --bg middle byl by zapolnen tem zhe
netayl'nym kropom vneshney tekstury, chto dal vidimye styki v bolshom
"fill" kvadrate (sm. _tooltip.scss) -- i ottuda zhe tekli styki tonkoy
polosoy vdol lyubogo kraya, potomu chto sprity "top"/"bottom"/"left"/
"right" iz dialgbox.def pokryvayut tolko samu zolotuyu liniyu, koroche
svoey zonoy, i ostal'noe zapolnyal tot zhe tayl fona. Bez --bg krome
liniy/uglov ostaetsya prozrachnost' -- edinstvennyy fon teper risuet
`::before` v _tooltip.scss, poetomu povtora (i shva) net nigde.

Peresobrat originaly (nuzhny vneshnie fayly, ne v repozitorii -- tolko na
mashine avtora assetov):
    python scripts/make_border.py D:\HG_Sheet_Assets\ui\dialgbox ^
        -o assets/ui --name dialog_frame --all-colors
(BEZ --bg -- imenno eto i ubiraet shov; s --bg poluchitsya staraya, shovnaya
versiya). Zatem etot skript peresobiraet 32px variant iz obnovlennyh
originalov.

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
