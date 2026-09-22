r"""
crop_book.py -- ukorachivaet fon knigi zaklinaniy po vysote,
vyrezaya SEREDINU i sohranyaya nizhnyuyu ramku s uglami.

Prostaya obrezka snizu srezala by ramku. Poetomu beryotsya verhnyaya
chast do linii reza plyus nizhnyaya polosa zadannoy tolshchiny -- oni
skleivayutsya. Ischezaet tolko pustoy kusok stranicy posredine.

Primery:
    python crop_book.py spelback_red.png --probe
    python crop_book.py spelback_red.png -o out --height 481 --frame 40
    python crop_book.py "papka\spelback_*.png" -o out --height 481 --frame 40
"""

import argparse
import glob
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow ne ustanovlen. Vypolni: pip install pillow")


def probe(path, rows=14):
    """Pokazyvaet, gde po vertikali menyaetsya kartinka -- chtoby vybrat
    tolshchinu nizhney polosy i liniyu reza."""
    im = Image.open(path).convert("RGB")
    W, H = im.size
    px = im.load()
    print("%s  %dx%d" % (os.path.basename(path), W, H))
    print("\nsredniy tsvet strok v nizhney chasti:")
    prev = None
    for y in range(H - 1, max(H - 130, -1), -1):
        s = [0, 0, 0]
        for x in range(0, W, 7):
            c = px[x, y]
            s[0] += c[0]; s[1] += c[1]; s[2] += c[2]
        n = len(range(0, W, 7))
        cur = (s[0]//n, s[1]//n, s[2]//n)
        mark = ""
        if prev and sum(abs(a-b) for a, b in zip(cur, prev)) > 24:
            mark = "  <== rezkaya smena"
        if (H - y) % 5 == 0 or mark:
            print("  y=%3d (snizu %3d)  rgb%s%s" % (y, H-1-y, cur, mark))
        prev = cur


def crop(path, outdir, height, frame, suffix=""):
    im = Image.open(path).convert("RGBA")
    W, H = im.size
    if height >= H:
        print("  %s: novaya vysota %d ne menshe ishodnoy %d, propusk"
              % (os.path.basename(path), height, H))
        return None
    if frame >= height:
        print("  %s: polosa ramki %d ne vlezaet v vysotu %d, propusk"
              % (os.path.basename(path), frame, height))
        return None

    top_h = height - frame          # skolko beryom sverhu
    out = Image.new("RGBA", (W, height), (0, 0, 0, 0))
    out.paste(im.crop((0, 0, W, top_h)), (0, 0))          # verh kak est
    out.paste(im.crop((0, H - frame, W, H)), (0, top_h))  # nizhnyaya ramka

    os.makedirs(outdir, exist_ok=True)
    base = os.path.splitext(os.path.basename(path))[0]
    dst = os.path.join(outdir, base + suffix + ".png")
    out.save(dst)
    print("  %s -> %s  (%dx%d, vyrezano %d px iz serediny)"
          % (os.path.basename(path), dst, W, height, H - height))
    return dst


def main():
    ap = argparse.ArgumentParser(
        description="Ukorachivaet fon knigi, sohranyaya nizhnyuyu ramku.")
    ap.add_argument("inputs", nargs="+", help="puti k PNG (mozhno maski)")
    ap.add_argument("-o", "--outdir", default="book_cropped")
    ap.add_argument("--height", type=int,
                    help="itogovaya vysota v px (naprimer 481)")
    ap.add_argument("--frame", type=int, default=40,
                    help="tolshchina nizhney polosy s ramkoy, px")
    ap.add_argument("--suffix", default="",
                    help="dobavit k imeni fayla, naprimer _short")
    ap.add_argument("--probe", action="store_true",
                    help="tolko pokazat, gde menyaetsya kartinka po vertikali")
    args = ap.parse_args()

    paths = []
    for pat in args.inputs:
        hits = glob.glob(pat)
        paths.extend(sorted(hits) if hits else
                     ([pat] if os.path.exists(pat) else []))
    if not paths:
        sys.exit("nechego obrabatyvat")

    if args.probe:
        for p in paths:
            probe(p)
        return

    if not args.height:
        sys.exit("ukazhi --height (naprimer 481)")

    print("liniya reza: %d px sverhu, zatem nizhnyaya polosa %d px"
          % (args.height - args.frame, args.frame))
    for p in paths:
        crop(p, args.outdir, args.height, args.frame, args.suffix)


if __name__ == "__main__":
    main()
