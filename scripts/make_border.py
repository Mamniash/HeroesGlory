r"""
make_border.py -- sobiraet 9-chastnyy fayl dlya CSS border-image
iz kadrov dialgbox.def i tayl-tekstury fona.

Ozhidaemyy poryadok kadrov (kak v dialgbox.def):
    f000 levyy verhniy ugol      f004 levaya granica
    f001 pravyy verhniy ugol     f005 pravaya granica
    f002 levyy nizhniy ugol      f006 verhnyaya granica
    f003 pravyy nizhniy ugol     f007 nizhnyaya granica

Primer:
    python make_border.py D:\HG_Sheet_Assets\ui\dialgbox ^
        --bg D:\HG_Sheet_Assets\ui\dibox128.png ^
        -o D:\HG_Sheet_Assets\ui\frames
"""

import argparse
import colorsys
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow ne ustanovlen. Vypolni: pip install pillow")

ORDER = ["tl", "tr", "bl", "br", "left", "right", "top", "bottom"]

# Te zhe ottenki, chto v recolor_panel.py, chtoby ramka sovpadala
# s vybrannym tsvetom paneli geroya.
COLORS = {
    "blue":   {"hue": 222, "sat": 1.00},  # ishodnyy
    "red":    {"hue": 358, "sat": 1.05},
    "tan":    {"hue":  32, "sat": 0.55},
    "green":  {"hue": 112, "sat": 0.95},
    "orange": {"hue":  26, "sat": 1.05},
    "purple": {"hue": 278, "sat": 0.95},
    "teal":   {"hue": 182, "sat": 0.95},
    "pink":   {"hue": 325, "sat": 0.80},
    "black":  {"hue": 0, "sat": 0.0, "range": (0.04, 0.30)},
    # Ne belyy: eto variant h195m iz massovoy generacii (ottenok 195,
    # priglushennaya nasyshchennost). Imya "white" ostavleno, chtoby ne
    # menyat klyuchi v config.mjs i CSS.
    "white":  {"hue": 195, "sat": 0.55},
}


def is_player_blue(r, g, b):
    """Otlichaet siniy tsvet igroka ot korichnevogo dereva i zolota."""
    return b > r + 20 and b > g + 12


def recolor(im, hue_deg, sat_mul=1.0, val_range=None):
    """Peretsvechivaet tolko sinie piksely, derevo i zoloto ne trogaet."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size

    vals = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and is_player_blue(r, g, b):
                vals.append(colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)[2])
    if not vals:
        return im
    vmin, vmax = min(vals), max(vals)
    span = (vmax - vmin) or 1.0

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if not a or not is_player_blue(r, g, b):
                continue
            _hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            ss = max(0.0, min(1.0, ss * sat_mul))
            if val_range:
                lo, hi = val_range
                vv = lo + (vv - vmin) / span * (hi - lo)
            nr, ng, nb = colorsys.hsv_to_rgb((hue_deg % 360) / 360, ss, vv)
            px[x, y] = (int(nr * 255), int(ng * 255), int(nb * 255), a)
    return im


def load_trimmed(path):
    """Otkryvaet PNG i obrezaet prozrachnye polya po bbox."""
    im = Image.open(path).convert("RGBA")
    box = im.getbbox()
    if box is None:
        raise ValueError("kadr pustoy: %s" % path)
    return im.crop(box)


def main():
    ap = argparse.ArgumentParser(
        description="Sborka 9-chastnoy ramki dlya CSS border-image.")
    ap.add_argument("indir", help="papka s dialgbox_g00_fNNN.png")
    ap.add_argument("-o", "--outdir", default="frames")
    ap.add_argument("--prefix", default="dialgbox_g00_f",
                    help="prefiks imen kadrov")
    ap.add_argument("--bg", help="tayl fona (naprimer dibox128.png)")
    ap.add_argument("--name", default="dialog_frame",
                    help="imya vyhodnogo fayla bez rasshireniya")
    ap.add_argument("--scale", type=int, default=1,
                    help="uvelichit nearest neighbor")
    ap.add_argument("--color", choices=sorted(COLORS),
                    help="peretsvetit ramku v odin iz tsvetov")
    ap.add_argument("--all-colors", action="store_true",
                    help="sobrat srazu vse 10 tsvetov")
    args = ap.parse_args()

    parts = {}
    for i, key in enumerate(ORDER):
        path = os.path.join(args.indir, "%s%03d.png" % (args.prefix, i))
        if not os.path.exists(path):
            sys.exit("ne nayden kadr: %s" % path)
        parts[key] = load_trimmed(path)
        print("%-7s %-28s %dx%d" % (key, os.path.basename(path),
                                    parts[key].width, parts[key].height))

    # tolshchina ramki beryotsya iz uglov
    left = max(parts["tl"].width, parts["bl"].width)
    right = max(parts["tr"].width, parts["br"].width)
    top = max(parts["tl"].height, parts["tr"].height)
    bottom = max(parts["bl"].height, parts["br"].height)

    # sredniy uchastok -- odna edinica povtora kazhdoy storony
    mid_w = max(parts["top"].width, parts["bottom"].width)
    mid_h = max(parts["left"].height, parts["right"].height)

    W = left + mid_w + right
    H = top + mid_h + bottom
    print("\ntolshchina ramki: verh %d, pravo %d, niz %d, levo %d"
          % (top, right, bottom, left))
    print("razmer sborki: %dx%d" % (W, H))

    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    # zapolnenie serediny tayl-tekstoroy
    if args.bg:
        bg = Image.open(args.bg).convert("RGBA")
        for y in range(0, H, bg.height):
            for x in range(0, W, bg.width):
                out.paste(bg, (x, y))
        print("fon: %s (%dx%d), zalozhen taylom" % (
            os.path.basename(args.bg), bg.width, bg.height))

    # Storony kladutsya NATIVNOY tolshchinoy vplotnuyu k krayu i
    # povtoryayutsya vdol svoey osi. Rastyagivat ih poperyok nelzya:
    # zolotaya liniya prevratitsya v shirokuyu polosu. Ostatok zony
    # mezhdu liniey i vnutrenney oblastyu zapolnyaet fonovaya tekstura.
    def tile_v(part, x, y0, y1):
        y = y0
        while y < y1:
            h = min(part.height, y1 - y)
            piece = part.crop((0, 0, part.width, h))
            out.paste(piece, (x, y), piece)
            y += h

    def tile_h(part, y, x0, x1):
        x = x0
        while x < x1:
            w = min(part.width, x1 - x)
            piece = part.crop((0, 0, w, part.height))
            out.paste(piece, (x, y), piece)
            x += w

    tile_h(parts["top"], 0, left, W - right)
    tile_h(parts["bottom"], H - parts["bottom"].height, left, W - right)
    tile_v(parts["left"], 0, top, H - bottom)
    tile_v(parts["right"], W - parts["right"].width, top, H - bottom)

    # ugly poverh storon
    out.paste(parts["tl"], (0, 0), parts["tl"])
    out.paste(parts["tr"], (W - parts["tr"].width, 0), parts["tr"])
    out.paste(parts["bl"], (0, H - parts["bl"].height), parts["bl"])
    out.paste(parts["br"], (W - parts["br"].width, H - parts["br"].height),
              parts["br"])

    if args.scale != 1:
        s = args.scale
        out = out.resize((W * s, H * s), Image.NEAREST)
        top, right, bottom, left = top * s, right * s, bottom * s, left * s

    os.makedirs(args.outdir, exist_ok=True)

    jobs = []
    if args.all_colors:
        jobs = sorted(COLORS.items())
    elif args.color:
        jobs = [(args.color, COLORS[args.color])]
    else:
        jobs = [(None, None)]

    png = None
    for cname, conf in jobs:
        img = out if conf is None else recolor(
            out.copy(), conf["hue"], conf["sat"], conf.get("range"))
        fname = args.name + ("_%s" % cname if cname else "") + ".png"
        path = os.path.join(args.outdir, fname)
        img.save(path)
        if png is None:
            png = path
        print("zapisan %s" % path)

    css = os.path.join(args.outdir, args.name + ".css")
    with open(css, "w", encoding="utf-8") as fh:
        fh.write(""".hg-frame {
  border-style: solid;
  border-color: transparent;
  border-width: %dpx %dpx %dpx %dpx;
  border-image-source: url("%s.png");
  border-image-slice: %d %d %d %d fill;
  border-image-repeat: repeat;
  image-rendering: pixelated;
  padding: 8px 14px;
}
""" % (top, right, bottom, left, args.name,
       top, right, bottom, left))
    print("zapisan %s" % css)
    print("\nborder-image-slice: %d %d %d %d fill" % (top, right, bottom, left))


if __name__ == "__main__":
    main()
