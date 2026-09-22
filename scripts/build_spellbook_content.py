r"""
build_spellbook_content.py -- stroit odin bezcvetnyi fon knigi magii
(assets/ui/spellbook_content.png) vzamen desyati spelback_<cvet>.png.

Kontekst: obshchaya ramka okna (window_frame_<cvet>.png, sm. frame_build.py)
teper' risuetsya otdel'nym sloem poverh holsta. Sobstvennaya ramka knigi
(krasno-zolotoy bort + uglovoy ornament v spelback_*.png) bol'she ne nuzhna --
ona libo prosvechivala by iz-pod novoy ramki (u kotoroy drugoy risunok), libo
dublirovala by eyo. Vnutri knigi cveta net (proverено diffom mezhdu
variantami: 12 cvetnykh pikseley iz 11145 vne uglov -- shum), tak chto odin
variant (spelback_red.png) bezopasno vzyat kak istochnik dlya vsekh.

Geometriya (izmerena i zadana zadachey, NE peresch'ityvaetsya):
  window_frame_<cvet>.png: 600x473, kayma 9px so vsekh storon,
  vnutrennee okno (9,9)-(590,463) = 582x455 px.

Podhod -- BEZ resamplinga (tol'ko crop + paste, ni odnogo Image.resize()):
  1. Vyrezaetsya centrirovannyi 582x455 kusok iz spelback_red.png (610x481):
     offset (14, 13) = ((610-582)//2, (481-455)//2). Proverено vizual'no
     (sm. zadachu/otchyot) -- etogo otstupa uzhe dostatochno, chtoby ubrat'
     i pryamoy bort (8-9px), i uglovoy ornament (dostigal ~30x20px ot samogo
     vneshnego ugla) -- vo vsekh chetyryokh uglakh vyreza chisto, dopolnitel'nyi
     "clone stamp" ne potrebovalsya.
  2. Etot kusok vstavlyaetsya v prozrachnyi 600x473 RGBA holst na tochno tu zhe
     poziciyu, chto i vnutrennee okno ramki -- offset (9,9). Vneshnyaya kayma
     (9px so vsekh storon) ostayotsya polnost'yu prozrachnoy: eyo vsyo ravno
     zakroet neprozrachnyi bort ramki, risovat' tam nechego.

Rezul'tat: odin fayl, na tom zhe 600x473 holste, chto i sama ramka -- oba
sloya (soderzhimoe i ramka) rastyagivayutsya CSS'om (background-size: 100%
100%) odnim i tem zhe koefficientom pri lyuboy shirine okna, poetomu mezhdu
nimi net i ne budet rassoglasovaniya (v otlichie ot starogo spelback_*.png
na 610x481, kotoryi byl blizok k proporcii holsta, no ne tochno raven ei).

Zavisimosti: Pillow.
"""

import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow ne ustanovlen. Vypolni: pip install pillow")

SRC = os.path.join("assets", "ui", "spelback_red.png")
DST = os.path.join("assets", "ui", "spellbook_content.png")

CANVAS_W, CANVAS_H = 600, 473
INNER_X0, INNER_Y0 = 9, 9
INNER_W, INNER_H = 582, 455

SRC_W, SRC_H = 610, 481
CROP_OFFSET_X = (SRC_W - INNER_W) // 2  # 14
CROP_OFFSET_Y = (SRC_H - INNER_H) // 2  # 13


def main():
    if not os.path.exists(SRC):
        sys.exit(f"net iskhodnika: {SRC}")
    src = Image.open(SRC).convert("RGBA")
    if src.size != (SRC_W, SRC_H):
        sys.exit(f"!! neozhidannyi razmer {SRC}: {src.size}, ozhidalos "
                  f"{(SRC_W, SRC_H)} -- pereschitay CROP_OFFSET_* vruchnuyu")

    crop_box = (CROP_OFFSET_X, CROP_OFFSET_Y,
                CROP_OFFSET_X + INNER_W, CROP_OFFSET_Y + INNER_H)
    content = src.crop(crop_box)  # chistyi crop, bez resemplinga
    assert content.size == (INNER_W, INNER_H)

    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    canvas.paste(content, (INNER_X0, INNER_Y0))
    canvas.save(DST)
    print(f"{SRC} {src.size}  ->  crop {crop_box} ({content.size})  ->  "
          f"{DST} {canvas.size} (holst {CANVAS_W}x{CANVAS_H}, "
          f"kontent na ({INNER_X0},{INNER_Y0}))")


if __name__ == "__main__":
    main()
