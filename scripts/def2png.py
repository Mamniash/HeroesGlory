#!/usr/bin/env python3
r"""
def2png.py -- raskladyvaet HOMM3 .def na otdelnye PNG s prozrachnostyu.

Trebuetsya tolko Pillow:  pip install pillow

Primery:
    python def2png.py SECSK82.DEF --list
    python def2png.py SECSK82.DEF -o out\secsk82
    python def2png.py SECSK82.DEF -o out\secsk82 --scale 2 --no-shadow
    python def2png.py D:\...\h3sprite\*.def -o out
"""

import argparse
import csv
import glob
import os
import struct
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow ne ustanovlen. Vypolni: pip install pillow")

HEADER = struct.Struct("<IIII")
BLOCK = struct.Struct("<IIII")
FRAME = struct.Struct("<IIIIIIii")

# Sluzhebnye indeksy palitry v DEF.
# 0 - polnaya prozrachnost
# 1 - kray teni      (alpha 0x40)
# 4 - telo teni      (alpha 0x80)
# 5 - podsvetka vydeleniya -> prozrachnost
# 6 - telo teni pod podsvetkoy
# 7 - kray teni pod podsvetkoy
SPECIAL = {0: 0, 1: 0x40, 4: 0x80, 5: 0, 6: 0x80, 7: 0x40}


def read_def(path):
    """Chitaet .def i vozvrashchaet (palette, frames).

    frames -- spisok slovarey s klyuchami:
        group, index, offset, fmt, canvas (w,h), size (w,h), margin (l,t), pixels
    pixels -- bytes dlinoy size_w*size_h (indeksy palitry) ili None.
    """
    with open(path, "rb") as fh:
        data = fh.read()

    if len(data) < 16 + 768:
        raise ValueError("fayl slishkom malenkiy, eto ne .def")

    _def_type, _w, _h, n_blocks = HEADER.unpack_from(data, 0)
    palette = data[16:16 + 768]
    if n_blocks == 0 or n_blocks > 10000:
        raise ValueError("nepravdopodobnoe chislo blokov: %d" % n_blocks)

    pos = 16 + 768
    entries = []  # (group_id, [offsets])
    for _ in range(n_blocks):
        group_id, n_frames, _u1, _u2 = BLOCK.unpack_from(data, pos)
        pos += BLOCK.size
        pos += 13 * n_frames  # imena kadrov, 13 bayt kazhdoe
        offs = struct.unpack_from("<%dI" % n_frames, data, pos)
        pos += 4 * n_frames
        entries.append((group_id, list(offs)))

    frames = []
    for group_id, offs in entries:
        for idx, off in enumerate(offs):
            frames.append(_read_frame(data, off, group_id, idx))
    return palette, frames


def _read_frame(data, off, group_id, idx):
    _size, fmt, fw, fh, w, h, lm, tm = FRAME.unpack_from(data, off)
    base = off + FRAME.size  # smeshcheniya vnutri kadra otschityvayutsya otsyuda

    info = {
        "group": group_id,
        "index": idx,
        "offset": off,
        "fmt": fmt,
        "canvas": (fw, fh),
        "size": (w, h),
        "margin": (lm, tm),
        "pixels": None,
    }

    if w == 0 or h == 0:
        return info

    out = bytearray()

    if fmt == 0:
        out += data[base:base + w * h]

    elif fmt == 1:
        line_offs = struct.unpack_from("<%dI" % h, data, base)
        for lo in line_offs:
            p = base + lo
            got = 0
            while got < w:
                code = data[p]
                length = data[p + 1] + 1
                p += 2
                if code == 0xFF:
                    out += data[p:p + length]
                    p += length
                else:
                    out += bytes([code]) * length
                got += length

    elif fmt == 2:
        line_offs = struct.unpack_from("<%dH" % h, data, base)
        for lo in line_offs:
            p = base + lo
            got = 0
            while got < w:
                seg = data[p]
                p += 1
                code = seg >> 5
                length = (seg & 0x1F) + 1
                if code == 7:
                    out += data[p:p + length]
                    p += length
                else:
                    out += bytes([code]) * length
                got += length

    elif fmt == 3:
        # kazhdaya stroka razbita na bloki po 32 pikselya, u kazhdogo svoyo smeshchenie
        per_line = w // 32
        for row in range(h):
            blk_offs = struct.unpack_from(
                "<%dH" % per_line, data, base + row * 2 * per_line
            )
            for bo in blk_offs:
                p = base + bo
                got = 0
                while got < 32:
                    seg = data[p]
                    p += 1
                    code = seg >> 5
                    length = (seg & 0x1F) + 1
                    if code == 7:
                        out += data[p:p + length]
                        p += length
                    else:
                        out += bytes([code]) * length
                    got += length

    else:
        raise ValueError("neizvestnyy format kadra: %d" % fmt)

    # nekotorye kadry perepolnyayut poslednyuyu stroku na neskolko pikseley
    if len(out) > w * h:
        del out[w * h:]
    if len(out) < w * h:
        out += bytes(w * h - len(out))

    info["pixels"] = bytes(out)
    return info


def frame_to_image(info, palette, keep_shadow=True):
    fw, fh = info["canvas"]
    w, h = info["size"]
    lm, tm = info["margin"]

    canvas = Image.new("RGBA", (max(fw, 1), max(fh, 1)), (0, 0, 0, 0))
    if info["pixels"] is None:
        return canvas

    table = []
    for i in range(256):
        if i in SPECIAL:
            alpha = SPECIAL[i] if keep_shadow else 0
            table.append(bytes((0, 0, 0, alpha)))
        else:
            table.append(bytes(palette[i * 3:i * 3 + 3]) + b"\xff")

    raw = b"".join(table[p] for p in info["pixels"])
    sprite = Image.frombytes("RGBA", (w, h), raw)

    # polya inogda vrut (izvestnaya problema sgtwmta.def / sgtwmtb.def)
    if lm < 0 or tm < 0 or lm + w > fw or tm + h > fh:
        return sprite
    canvas.paste(sprite, (lm, tm))
    return canvas


def process(path, outdir, scale=1, keep_shadow=True, list_only=False,
            group_dirs=False, writer=None):
    name = os.path.splitext(os.path.basename(path))[0].lower()
    try:
        palette, frames = read_def(path)
    except Exception as exc:
        print("  [ERROR] %s: %s" % (os.path.basename(path), exc))
        return 0

    groups = sorted({f["group"] for f in frames})
    fmts = sorted({f["fmt"] for f in frames})
    print("%-18s kadrov: %-5d grupp: %-3d format: %s  razmer holsta: %dx%d"
          % (os.path.basename(path), len(frames), len(groups),
             ",".join(str(x) for x in fmts),
             frames[0]["canvas"][0], frames[0]["canvas"][1]))

    if list_only:
        for g in groups:
            in_g = [f for f in frames if f["group"] == g]
            print("    gruppa %-3d -> %d kadrov" % (g, len(in_g)))
        return len(frames)

    target = os.path.join(outdir, name)
    os.makedirs(target, exist_ok=True)

    written = 0
    for f in frames:
        img = frame_to_image(f, palette, keep_shadow=keep_shadow)
        if scale != 1:
            img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)

        if group_dirs:
            sub = os.path.join(target, "g%02d" % f["group"])
            os.makedirs(sub, exist_ok=True)
            fname = os.path.join(sub, "%03d.png" % f["index"])
        else:
            fname = os.path.join(target, "%s_g%02d_f%03d.png"
                                 % (name, f["group"], f["index"]))
        img.save(fname)
        written += 1

        if writer:
            writer.writerow([
                os.path.basename(path), f["group"], f["index"], f["fmt"],
                f["canvas"][0], f["canvas"][1],
                f["size"][0], f["size"][1],
                os.path.relpath(fname, outdir),
            ])

    print("    -> %d PNG v %s" % (written, target))
    return written


def main():
    ap = argparse.ArgumentParser(
        description="Raskladyvaet HOMM3 .def na PNG s prozrachnostyu.")
    ap.add_argument("inputs", nargs="+",
                    help="puti k .def (mozhno maski, naprimer *.def)")
    ap.add_argument("-o", "--outdir", default="def_png",
                    help="kuda skladyvat (po umolchaniyu ./def_png)")
    ap.add_argument("--scale", type=int, default=1,
                    help="uvelichit metodom nearest neighbor, naprimer 2")
    ap.add_argument("--no-shadow", action="store_true",
                    help="ubrat poluprozrachnuyu ten, ostavit tolko sprite")
    ap.add_argument("--list", action="store_true",
                    help="tolko pokazat chislo kadrov, nichego ne pisat")
    ap.add_argument("--group-dirs", action="store_true",
                    help="raskladyvat kadry po papkam grupp")
    args = ap.parse_args()

    paths = []
    for pattern in args.inputs:
        hits = glob.glob(pattern)
        if hits:
            paths.extend(sorted(hits))
        elif os.path.exists(pattern):
            paths.append(pattern)
        else:
            print("ne nayden: %s" % pattern)
    if not paths:
        sys.exit("nechego obrabatyvat")

    if args.list:
        for p in paths:
            process(p, args.outdir, list_only=True)
        return

    os.makedirs(args.outdir, exist_ok=True)
    index_path = os.path.join(args.outdir, "_index.csv")
    total = 0
    with open(index_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh, delimiter=";")
        writer.writerow(["def", "group", "frame", "fmt",
                         "canvas_w", "canvas_h", "sprite_w", "sprite_h", "png"])
        for p in paths:
            total += process(p, args.outdir,
                             scale=args.scale,
                             keep_shadow=not args.no_shadow,
                             group_dirs=args.group_dirs,
                             writer=writer)
    print("\nGotovo. Vsego kadrov: %d. Indeks: %s" % (total, index_path))


if __name__ == "__main__":
    main()
