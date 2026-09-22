r"""
recolor_panel.py -- obrezaet panel geroya i menyaet tsvet igroka cherez palitru.

V interfeysnyh bitmapah HOMM3 indeksy palitry 224-255 zarezervirovany pod tsvet
igroka. Menyaem tolko ih -- piksely ostayutsya netronutymi.

Trebuetsya Pillow:  pip install pillow

Primery:
    python recolor_panel.py HeroScr4.bmp --list
    python recolor_panel.py HeroScr4.bmp -o out --crop 0,0,606,478
    python recolor_panel.py HeroScr4.bmp -o out --crop 0,0,606,478 --color red
    python recolor_panel.py HeroScr4.bmp -o out --crop 0,0,606,478 --all
    python recolor_panel.py HeroScr4.bmp -o out --hue 265 --sat 1.1
"""

import argparse
import colorsys
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow ne ustanovlen. Vypolni: pip install pillow")

PLAYER_LO, PLAYER_HI = 224, 255  # blok tsveta igroka

# hue -- ottenok v gradusah, sat -- mnozhitel nasyshchennosti,
# range -- kuda perelozhit yarkost (None = ostavit kak est).
COLORS = {
    "blue":   {"hue": 222, "sat": 1.00},  # ishodnyy
    "red":    {"hue": 358, "sat": 1.05},
    "tan":    {"hue":  32, "sat": 0.55},
    "green":  {"hue": 112, "sat": 0.95},
    "orange": {"hue":  26, "sat": 1.05},
    "purple": {"hue": 278, "sat": 0.95},
    "teal":   {"hue": 182, "sat": 0.95},
    "pink":   {"hue": 325, "sat": 0.80},
    # monohromnye: nasyshchennost v nol, yarkost perekladyvaetsya v novyy diapazon
    "black":  {"hue": 0, "sat": 0.0, "range": (0.04, 0.30)},
    "white":  {"hue": 0, "sat": 0.0, "range": (0.72, 0.99)},
    "steel":  {"hue": 205, "sat": 0.22, "range": (0.34, 0.68)},
}


def shift_palette(pal, hue_deg, sat_mul=1.0, val_mul=1.0, val_range=None):
    """Vozvrashchaet novuyu palitru s peretsvechennym blokom 224-255.

    val_range -- para (lo, hi): ishodnyy razbros yarkosti linevno
    perekladyvaetsya v etot diapazon, stupeni rampy sohranyayutsya.
    """
    pal = list(pal)
    idxs = range(PLAYER_LO, PLAYER_HI + 1)

    vals = {}
    for i in idxs:
        r, g, b = [c / 255.0 for c in pal[i * 3:i * 3 + 3]]
        vals[i] = colorsys.rgb_to_hsv(r, g, b)

    if val_range:
        lo, hi = val_range
        vmin = min(v for _h, _s, v in vals.values())
        vmax = max(v for _h, _s, v in vals.values())
        span = (vmax - vmin) or 1.0

    for i in idxs:
        _h, s, v = vals[i]
        s = max(0.0, min(1.0, s * sat_mul))
        if val_range:
            v = lo + (v - vmin) / span * (hi - lo)
        v = max(0.0, min(1.0, v * val_mul))
        nr, ng, nb = colorsys.hsv_to_rgb((hue_deg % 360) / 360.0, s, v)
        pal[i * 3:i * 3 + 3] = [int(round(nr * 255)),
                                int(round(ng * 255)),
                                int(round(nb * 255))]
    return pal


def _lum(rgb):
    r, g, b = rgb
    return 0.299 * r + 0.587 * g + 0.114 * b


def fill_enclosed_dark(im, level=40, neutral=18, need=4):
    """Zameshchaet piksely, ne vhodyashchie v blok igroka, no okruzhennye im.

    Lovit dve kategorii:
      * pochti chernye  -- vse kanaly nizhe level;
      * neytralno serye -- raznitsa mezhdu kanalami ne bolshe neutral.
    Derevo pod eti pravila ne popadaet: ono zametno krasnoe.

    Kazhdyy takoy piksel zamenyaetsya na blizhayshiy po yarkosti indeks
    bloka igroka, poetomu bliki ostayutsya blikami, a teni tenyami.
    Kontur ne stradaet: u nego sosedey iz bloka menshe, chem need.
    """
    pal = im.getpalette()

    def rgb(i):
        return pal[i * 3:i * 3 + 3]

    block = list(range(PLAYER_LO, PLAYER_HI + 1))
    block_lum = [(i, _lum(rgb(i))) for i in block]

    cand = {}
    for i in range(256):
        if PLAYER_LO <= i <= PLAYER_HI:
            continue
        c = rgb(i)
        is_dark = max(c) <= level
        is_neutral = (max(c) - min(c)) <= neutral
        if is_dark or is_neutral:
            target = min(block_lum, key=lambda t: abs(t[1] - _lum(c)))[0]
            cand[i] = target

    w, h = im.size
    px = im.load()
    targets = [(x, y) for y in range(h) for x in range(w) if px[x, y] in cand]
    changed = 0
    for x, y in targets:
        cnt = 0
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and PLAYER_LO <= px[nx, ny] <= PLAYER_HI:
                    cnt += 1
        if cnt >= need:
            px[x, y] = cand[px[x, y]]
            changed += 1
    return changed


def load_paletted(path):
    im = Image.open(path)
    if im.mode != "P":
        raise ValueError("izobrazhenie ne paletirovannoe (mode=%s), "
                         "peretsvetka cherez palitru ne rabotaet" % im.mode)
    return im.copy()


def main():
    ap = argparse.ArgumentParser(
        description="Obrezka i peretsvetka interfeysnyh bitmapov HOMM3.")
    ap.add_argument("input", help="put k .bmp")
    ap.add_argument("-o", "--outdir", default="panel_out")
    ap.add_argument("--crop", help="left,top,right,bottom (naprimer 0,0,606,478)")
    ap.add_argument("--color", choices=sorted(COLORS),
                    help="gotovyy tsvet igroka")
    ap.add_argument("--sweep", action="store_true",
                    help="sgenerirovat mnogo variantov po krugu ottenkov")
    ap.add_argument("--sweep-step", type=int, default=15,
                    help="shag ottenka v gradusah dlya --sweep (po umolchaniyu 15)")
    ap.add_argument("--all", action="store_true",
                    help="sdelat vse varianty srazu")
    ap.add_argument("--hue", type=float, help="proizvolnyy ottenok, 0-360")
    ap.add_argument("--sat", type=float, default=1.0, help="mnozhitel nasyshchennosti")
    ap.add_argument("--val", type=float, default=1.0, help="mnozhitel yarkosti")
    ap.add_argument("--scale", type=int, default=1,
                    help="uvelichit nearest neighbor, naprimer 2")
    ap.add_argument("--dark-level", type=int, default=40,
                    help="porog 'pochti chernogo' dlya --fill-dark (0-255)")
    ap.add_argument("--fill-dark", action="store_true",
                    help="ubrat pochti-chernye krapiny vnutri tsvetnyh zon "
                         "(rekomenduetsya dlya white i black)")
    ap.add_argument("--list", action="store_true",
                    help="pokazat razmer i blok tsveta igroka, nichego ne pisat")
    args = ap.parse_args()

    im = load_paletted(args.input)
    if args.fill_dark:
        n = fill_enclosed_dark(im, level=args.dark_level)
        print("ubrano krapin: %d" % n)
    base = os.path.splitext(os.path.basename(args.input))[0].lower()

    if args.list:
        pal = im.getpalette()
        print("razmer: %dx%d" % im.size)
        print("blok tsveta igroka (indeksy %d-%d):" % (PLAYER_LO, PLAYER_HI))
        for i in range(PLAYER_LO, PLAYER_HI + 1):
            r, g, b = pal[i * 3:i * 3 + 3]
            print("  %3d  rgb(%3d,%3d,%3d)" % (i, r, g, b))
        return

    box = None
    if args.crop:
        try:
            box = tuple(int(v) for v in args.crop.split(","))
            assert len(box) == 4
        except Exception:
            sys.exit("--crop zhdet chetyre chisla: left,top,right,bottom")

    jobs = []
    if args.sweep:
        # yarkost ne trogaem voobshche -- kontrast s chernym konturom
        # ostayotsya takim zhe, kak v ishodnom sinem
        profiles = [("v", 1.00), ("m", 0.55)]
        for hue in range(0, 360, max(1, args.sweep_step)):
            for tag, sat in profiles:
                jobs.append(("h%03d%s" % (hue, tag),
                             {"hue": hue, "sat": sat}))
    elif args.all:
        jobs = [(n, c) for n, c in sorted(COLORS.items())]
    elif args.hue is not None:
        jobs = [("hue%03d" % int(args.hue),
                 {"hue": args.hue, "sat": args.sat})]
    elif args.color:
        c = dict(COLORS[args.color])
        c["sat"] = c["sat"] * args.sat
        jobs = [(args.color, c)]
    else:
        jobs = [(None, None)]  # bez peretsvetki

    os.makedirs(args.outdir, exist_ok=True)
    for name, conf in jobs:
        work = im.copy()
        if conf is not None:
            work.putpalette(shift_palette(im.getpalette(),
                                          conf["hue"], conf["sat"],
                                          args.val, conf.get("range")))
        out = work.convert("RGBA")
        if box:
            out = out.crop(box)
        if args.scale != 1:
            out = out.resize((out.width * args.scale, out.height * args.scale),
                             Image.NEAREST)
        suffix = "_%s" % name if name else ""
        path = os.path.join(args.outdir, "%s%s.png" % (base, suffix))
        out.save(path)
        print("zapisan %s  (%dx%d)" % (path, out.width, out.height))


if __name__ == "__main__":
    main()
