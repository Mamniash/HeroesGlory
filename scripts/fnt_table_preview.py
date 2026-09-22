"""
Step 0 of the HOMM3-pixel-font task: render every glyph of a .FNT file into
one labeled PNG table, so the font's contents (Cyrillic coverage, quality,
which characters exist) can actually be looked at before any conversion work
touches it.

Value 255 (the glyph's real ink) and value 1 (a baked-in outline some fonts
have -- see h3fnt.py's own docstring) are drawn in different colors so that
distinction is visible in the deliverable itself, not just asserted.

Usage:
    python scripts/fnt_table_preview.py assets/fonts/smalfont.fnt out/smalfont.png
    python scripts/fnt_table_preview.py assets/fonts/*.FNT --out-dir out/
"""

from __future__ import annotations

import argparse
import pathlib

from PIL import Image, ImageDraw, ImageFont

import h3fnt

GRID_COLS = 16
GRID_ROWS = 16
UPSCALE = 5
CELL_PADDING = 4
LABEL_HEIGHT = 14
BG_COLOR = (58, 46, 34)
INK_COLOR = (255, 255, 255)
OUTLINE_COLOR = (220, 40, 40)
LABEL_COLOR = (200, 200, 200)
EMPTY_CELL_COLOR = (30, 24, 18)


def render_table(font: h3fnt.H3Font, title: str) -> Image.Image:
    max_width = max((g.width for g in font.glyphs), default=1) or 1
    cell_w = max_width * UPSCALE + CELL_PADDING * 2
    cell_h = font.height * UPSCALE + CELL_PADDING * 2 + LABEL_HEIGHT

    title_h = 24
    img_w = GRID_COLS * cell_w
    img_h = GRID_ROWS * cell_h + title_h
    img = Image.new("RGB", (img_w, img_h), BG_COLOR)
    draw = ImageDraw.Draw(img)
    label_font = ImageFont.load_default(size=12)
    title_font = ImageFont.load_default(size=16)

    draw.text((4, 4), title, fill=(255, 255, 255), font=title_font)

    for code in range(256):
        glyph = font.glyphs[code]
        col, row = code % GRID_COLS, code // GRID_COLS
        cell_x = col * cell_w
        cell_y = row * cell_h + title_h

        draw.rectangle(
            [cell_x, cell_y, cell_x + cell_w - 1, cell_y + cell_h - 1],
            outline=(70, 60, 50),
        )
        draw.text((cell_x + 2, cell_y + 1), f"{code:02X}", fill=LABEL_COLOR, font=label_font)

        glyph_top = cell_y + LABEL_HEIGHT + CELL_PADDING
        glyph_left = cell_x + CELL_PADDING

        if not glyph.is_defined:
            draw.rectangle(
                [glyph_left, glyph_top, glyph_left + max_width * UPSCALE - 1, glyph_top + font.height * UPSCALE - 1],
                fill=EMPTY_CELL_COLOR,
            )
            continue

        for y in range(font.height):
            for x in range(glyph.width):
                value = glyph.pixel(x, y, font.height)
                if value == 0:
                    continue
                color = INK_COLOR if value == 255 else OUTLINE_COLOR
                px = glyph_left + x * UPSCALE
                py = glyph_top + y * UPSCALE
                draw.rectangle([px, py, px + UPSCALE - 1, py + UPSCALE - 1], fill=color)

    return img


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("fnt_files", nargs="+", help=".FNT file(s) to render")
    ap.add_argument("--out-dir", default=".", help="Directory to write PNGs into")
    args = ap.parse_args()

    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for fnt_path in args.fnt_files:
        p = pathlib.Path(fnt_path)
        font = h3fnt.parse(str(p))
        defined = sum(1 for g in font.defined_glyphs())
        has_outline = any(g.pixel(x, y, font.height) == 1 for g in font.defined_glyphs() for y in range(font.height) for x in range(g.width))
        title = f"{p.name}  height={font.height}px  defined={defined}/256  baked-outline={'yes' if has_outline else 'no'}"
        img = render_table(font, title)
        out_path = out_dir / (p.stem + "_table.png")
        img.save(out_path)
        print(f"{p} -> {out_path}  ({title})")


if __name__ == "__main__":
    main()
