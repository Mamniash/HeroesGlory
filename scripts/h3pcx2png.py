r"""
h3pcx2png.py -- opoznaet i konvertiruet "PCX" iz HOMM3 / HotA.

Eto ne nastoyashchiy PCX. U HOMM3 zagolovok iz treh uint32:
    size, width, height
dalshe libo 8-bitnye indeksy + palitra 768 bayt, libo 24-bitnyy BGR.
HotA dobavlyaet 32-bitnye varianty (BGRA).

Primery:
    python h3pcx2png.py fayl.pcx --probe
    python h3pcx2png.py fayl.pcx -o out
    python h3pcx2png.py "papka\*.pcx" -o out
"""

import argparse
import glob
import os
import struct
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow ne ustanovlen. Vypolni: pip install pillow")


def probe(path):
    with open(path, "rb") as fh:
        data = fh.read()
    n = len(data)
    print("%s  (%d bayt)" % (os.path.basename(path), n))
    print("  pervye 16 bayt: %s" % " ".join("%02X" % b for b in data[:16]))

    if n < 12:
        print("  slishkom malenkiy")
        return None

    size, w, h = struct.unpack_from("<III", data, 0)
    print("  zagolovok: size=%d width=%d height=%d" % (size, w, h))

    if w == 0 or h == 0 or w > 4096 or h > 4096:
        print("  zagolovok nepravdopodobnyy -- format drugoy")
        return None

    for bpp, need in ((8, 12 + w * h + 768), (24, 12 + w * h * 3),
                      (32, 12 + w * h * 4)):
        mark = "  <== podhodit" if need == n else ""
        print("    %2d bit -> ozhidaemyy razmer %d%s" % (bpp, need, mark))
        if need == n:
            return (bpp, w, h, data)

    # inogda est vyravnivanie ili lishniy hvost
    for bpp, need in ((8, 12 + w * h + 768), (24, 12 + w * h * 3),
                      (32, 12 + w * h * 4)):
        if n >= need:
            print("    %d bit podhodit s hvostom %d bayt" % (bpp, n - need))
            return (bpp, w, h, data)
    return None


def convert(path, outdir):
    got = probe(path)
    if not got:
        print("  ne raspoznan, propuskayu\n")
        return False
    bpp, w, h, data = got

    if bpp == 8:
        pixels = data[12:12 + w * h]
        pal = data[12 + w * h:12 + w * h + 768]
        im = Image.frombytes("P", (w, h), pixels)
        im.putpalette(list(pal))
        im = im.convert("RGBA")
    elif bpp == 24:
        raw = data[12:12 + w * h * 3]
        im = Image.frombytes("RGB", (w, h), raw)
        b, g, r = im.split()
        im = Image.merge("RGB", (r, g, b)).convert("RGBA")
    else:
        raw = data[12:12 + w * h * 4]
        im = Image.frombytes("RGBA", (w, h), raw)
        b, g, r, a = im.split()
        im = Image.merge("RGBA", (r, g, b, a))

    os.makedirs(outdir, exist_ok=True)
    name = os.path.splitext(os.path.basename(path))[0] + ".png"
    out = os.path.join(outdir, name)
    im.save(out)
    print("  -> %s (%dx%d, %d bit)\n" % (out, w, h, bpp))
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inputs", nargs="+")
    ap.add_argument("-o", "--outdir", default="pcx_png")
    ap.add_argument("--probe", action="store_true",
                    help="tolko opoznat format, nichego ne pisat")
    args = ap.parse_args()

    paths = []
    for pat in args.inputs:
        hits = glob.glob(pat)
        paths.extend(sorted(hits) if hits else
                     ([pat] if os.path.exists(pat) else []))
    if not paths:
        sys.exit("nechego obrabatyvat")

    for p in paths:
        if args.probe:
            probe(p)
            print()
        else:
            convert(p, args.outdir)


if __name__ == "__main__":
    main()
