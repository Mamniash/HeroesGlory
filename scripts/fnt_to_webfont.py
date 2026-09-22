"""
Convert one .FNT bitmap font into a WOFF2 + TTF webfont, each pixel becoming
a unit square in the glyph outline (no interpolation) -- see h3fnt.py's own
docstring for the parsed format and the project's plan doc for the full
design writeup (baseline placement, ink rule, gasp table, etc).

Two output modes:

  --mode mono (default): monochrome glyph, ink = (pixel == 255) only. The
    baked-in outline byte (pixel == 1, where a font has one) is discarded;
    the visible outline is meant to be reproduced by the caller via CSS
    text-shadow. This is "variant A".

    Advance width is tightened per glyph by however much outline margin that
    particular glyph actually had (measured directly -- the gap between the
    outline-or-ink extent and the 255-only extent on each side -- never a
    flat guess or a check on the font's own name). A font whose baked
    outline reserved real horizontal margin (e.g. BIGFONT: exactly 1px on
    both sides, on every single glyph) gets that margin clawed back so
    letters don't end up sitting artificially far apart once the ring that
    used to fill it is gone. A font whose outline never occupied side margin
    in the first place (MEDFONT: measured at 0px both sides, every glyph --
    its baked outline is vertical-only) or that never had one at all
    (SMALLFONT) measures 0 and is untouched, automatically, glyph by glyph.

  --mode colr: two-layer COLRv0/CPAL glyph -- a bottom black layer covering
    every ink-or-outline pixel (pixel != 0) and a top layer, in whatever
    CSS `color` is set (CPAL's reserved 0xFFFF "use foreground color" index),
    covering just the fill (pixel == 255). Requires the source font to
    actually have baked-outline pixels (h3fnt.H3Font.has_baked_outline);
    raises otherwise. No CSS text-shadow needed on top of this -- the
    outline is already part of the glyph. This is "variant B".

Usage (matches the fonts actually committed to assets/fonts/ -- smalfont has
no baked outline, so it stays mono; medfont/bigfont do, and variant B (colr)
was the one picked after a side-by-side comparison, so those two are built in
--mode colr under their plain names, not mono):
    python scripts/fnt_to_webfont.py assets/fonts/smalfont.fnt smalfont-h3 \
        --family "H3 SmallFont" --out-dir assets/fonts
    python scripts/fnt_to_webfont.py assets/fonts/MEDFONT.FNT medfont-h3 \
        --family "H3 MedFont" --out-dir assets/fonts --mode colr
    python scripts/fnt_to_webfont.py assets/fonts/BIGFONT.FNT bigfont-h3 \
        --family "H3 BigFont" --out-dir assets/fonts --mode colr
"""

from __future__ import annotations

import argparse
import pathlib

from fontTools.colorLib.builder import buildCOLR, buildCPAL
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import newTable

import h3fnt

UNITS_PER_PIXEL = 64  # square pixels: same grid step on both axes

PUA_START = 0xE000  # first assignment: h3fnt.codepoint_for() returning None for a
# *defined* glyph is always one of: the two mystery low codes every font
# defines (30/31, confirmed via the Step 0 glyph tables to be real,
# deliberate ornamental glyphs -- a flourish/cross motif -- not garbage), or
# Windows-1251's one genuinely undefined byte (0x98, confirmed to be a plain
# hollow-box glyph, not a real character). Assigned dynamically in character-
# code order rather than a fixed table, so this doesn't need updating if one
# of the other 6 fonts turns out to have yet another such gap.

# CPAL's reserved palette index meaning "paint this layer in whatever color
# CSS `color` currently is" -- not an index into the palette's own color
# list. Used for the COLR fill layer so the glyph's fill stays recolorable
# (e.g. the gold heading color) while the outline layer stays a fixed color.
CPAL_FOREGROUND_INDEX = 0xFFFF


def glyph_name_for(code: int) -> str:
    return f"g{code:03d}"


def build_outline(glyph: h3fnt.Glyph, height: int, ink_value, units_per_pixel: int = UNITS_PER_PIXEL):
    """
    One rectangle contour per horizontal run of pixels matching `ink_value`
    in each row -- not one contour per pixel. Abutting same-winding
    rectangles render as a single solid blocky shape under TrueType's fill
    rule, so this is purely a contour-count optimization, not a visual
    difference from per-pixel squares.

    `ink_value`: an int (e.g. 255) to match exactly one pixel value, or a
    callable `pixel_value -> bool` to match a set (e.g. "nonzero").

    Baseline sits at the BOTTOM of the glyph's own height-tall box (row
    `height - 1`'s bottom edge lands at y=0); row 0 (the top row of the
    bitmap) has its top edge at y = height * units_per_pixel. Horizontal
    origin is the glyph's own left_offset, in pixel units.
    """
    is_ink = ink_value if callable(ink_value) else (lambda v: v == ink_value)
    pen = TTGlyphPen(None)
    min_x = None
    if glyph.width and glyph.pixels:
        for row in range(height):
            x = 0
            while x < glyph.width:
                if not is_ink(glyph.pixel(x, row, height)):
                    x += 1
                    continue
                run_start = x
                while x < glyph.width and is_ink(glyph.pixel(x, row, height)):
                    x += 1
                run_end = x  # exclusive

                left = (glyph.left_offset + run_start) * units_per_pixel
                right = (glyph.left_offset + run_end) * units_per_pixel
                top = (height - row) * units_per_pixel
                bottom = (height - row - 1) * units_per_pixel
                min_x = left if min_x is None else min(min_x, left)

                pen.moveTo((left, bottom))
                pen.lineTo((left, top))
                pen.lineTo((right, top))
                pen.lineTo((right, bottom))
                pen.closePath()
    # TTGlyphPen's Glyph doesn't populate xMin/xMax until recalcBounds() is
    # run against a full glyf table (for composite-glyph resolution, which
    # doesn't apply here) -- tracked directly instead. No ink at all (a
    # blank-but-advancing glyph, e.g. a would-be zero-width space) falls back
    # to the glyph's own left_offset, matching where its (empty) box starts.
    if min_x is None:
        min_x = glyph.left_offset * units_per_pixel
    return pen.glyph(), min_x


def ink_bounds(glyph: h3fnt.Glyph, height: int, ink_value, units_per_pixel: int = UNITS_PER_PIXEL):
    """
    (min_x, max_x) in font units spanning every pixel matching `ink_value`
    (same matching rules as `build_outline`) across the whole glyph -- the
    left edge of the leftmost matching pixel and the right edge of the
    rightmost one. `None, None` if nothing matches (a blank glyph). Same
    coordinate system `build_outline` uses (`glyph.left_offset` included),
    so a `255`-only call here lands on exactly the same `min_x` that
    function already returns as `lsb` -- this exists to also get the right
    edge, which `build_outline` has no reason to track for itself.
    """
    is_ink = ink_value if callable(ink_value) else (lambda v: v == ink_value)
    min_x = max_x = None
    if glyph.width and glyph.pixels:
        for row in range(height):
            for x in range(glyph.width):
                if not is_ink(glyph.pixel(x, row, height)):
                    continue
                left = (glyph.left_offset + x) * units_per_pixel
                right = left + units_per_pixel
                min_x = left if min_x is None else min(min_x, left)
                max_x = right if max_x is None else max(max_x, right)
    return min_x, max_x


def build_notdef(height: int, units_per_pixel: int = UNITS_PER_PIXEL):
    """
    A deliberate, visible hollow-box placeholder -- not empty, and not left
    to whatever a library default would produce. Should realistically never
    render (everything in cmap falls through to Roboto instead for anything
    undefined), but must be well-formed if something ever does hit it.
    """
    pen = TTGlyphPen(None)
    margin = units_per_pixel
    thickness = units_per_pixel // 2
    w = height * units_per_pixel  # square advance box, matches its own hmtx entry below
    outer = [(margin, margin), (margin, height * units_per_pixel - margin),
             (w - margin, height * units_per_pixel - margin), (w - margin, margin)]
    inner_margin = margin + thickness
    inner = [(inner_margin, inner_margin), (w - inner_margin, inner_margin),
             (w - inner_margin, height * units_per_pixel - inner_margin),
             (inner_margin, height * units_per_pixel - inner_margin)]

    pen.moveTo(outer[0])
    for pt in outer[1:]:
        pen.lineTo(pt)
    pen.closePath()

    pen.moveTo(inner[0])
    for pt in inner[1:]:
        pen.lineTo(pt)
    pen.closePath()

    return pen.glyph()


def _base_font_setup(font: h3fnt.H3Font, family_name: str, glyph_order, glyphs, advances, cmap):
    units_per_em = font.height * UNITS_PER_PIXEL
    fb = FontBuilder(units_per_em, isTTF=True)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(advances)
    fb.setupHorizontalHeader(ascent=units_per_em, descent=0, lineGap=0)
    fb.setupOS2(
        sTypoAscender=units_per_em, sTypoDescender=0, sTypoLineGap=0,
        usWinAscent=units_per_em, usWinDescent=0,
        fsType=0,
    )
    fb.setupNameTable({"familyName": family_name, "styleName": "Regular"})
    fb.setupPost()

    # gasp: a single range across the whole ppem span, "smooth" behavior
    # (grid-fit + gray/AA) -- a soft, lightly-antialiased look is the actual
    # goal here (matching the original game's own rendering), not a crisp/
    # jagged one. In practice modern Chromium's own text rasterizer barely
    # consults gasp at all (it's much more of a legacy-GDI-hinting-era
    # mechanism) -- the CSS side (dropping `-webkit-font-smoothing: none`/
    # `text-rendering: optimizeSpeed`, see utils/_mixins.scss) is what
    # actually controls this in a browser -- but this is still the
    # font-level half of the same intent, kept consistent with it rather
    # than left on the old "disable everything" setting.
    gasp = newTable("gasp")
    gasp.gaspRange = {0xFFFF: 0x0003}  # GASP_GRIDFIT | GASP_DOGRAY
    fb.font["gasp"] = gasp

    return fb, units_per_em


def convert_mono(fnt_path: str, family_name: str, out_dir: pathlib.Path, out_stem: str):
    """
    Variant A: ink = (pixel == 255) only. Outline (if any) discarded -- see
    this function's own advance-tightening step below for why that isn't
    quite the whole story for a font that had one.
    """
    font = h3fnt.parse(fnt_path)

    glyph_order = [".notdef"]
    glyphs = {".notdef": build_notdef(font.height)}
    advances = {".notdef": (font.height * UNITS_PER_PIXEL, UNITS_PER_PIXEL)}
    cmap: dict[int, str] = {}
    next_pua = PUA_START

    for glyph in font.defined_glyphs():
        name = glyph_name_for(glyph.code)
        glyph_order.append(name)
        outline, lsb = build_outline(glyph, font.height, 255)
        glyphs[name] = outline

        # Advance is normally just the raw metric (left_offset + width +
        # right_offset) -- fine for a font that never had a baked outline,
        # since then the 255-only ink already reaches all the way to both
        # edges of that box. For a font that DID have one, that box's edges
        # were sized to fit the outline ring too, and dropping the ring
        # leaves that margin behind as dead space that would otherwise
        # accumulate between every pair of letters. Measured, not assumed,
        # per glyph: compare the 255-only extent against the outline-or-ink
        # extent and claw back exactly the difference on each side. Zero
        # wherever the two extents already coincide (every SMALLFONT glyph;
        # every MEDFONT glyph, whose own baked outline turned out to be
        # vertical-only -- confirmed by this same measurement, not guessed).
        raw_advance = glyph.advance * UNITS_PER_PIXEL
        full_min, full_max = ink_bounds(glyph, font.height, lambda v: v != 0)
        fill_min, fill_max = ink_bounds(glyph, font.height, 255)
        if full_min is not None and fill_min is not None:
            inset_left = fill_min - full_min
            inset_right = full_max - fill_max
        else:
            inset_left = inset_right = 0
        advances[name] = (raw_advance - inset_left - inset_right, lsb)

        codepoint = h3fnt.codepoint_for(glyph.code)
        if codepoint is None:
            codepoint = next_pua
            next_pua += 1
        cmap[codepoint] = name

    fb, units_per_em = _base_font_setup(font, family_name, glyph_order, glyphs, advances, cmap)
    _save(fb, out_dir, out_stem, font, units_per_em, len(glyph_order), len(cmap), fnt_path)


def convert_colr(fnt_path: str, family_name: str, out_dir: pathlib.Path, out_stem: str):
    """
    Variant B: two-layer COLRv0 glyph per character -- a black "everything
    that's ink or baked outline" layer underneath, a foreground-colored
    "just the 255 fill" layer on top. Raises if the source font never had a
    baked outline at all (nothing to build the bottom layer from that would
    differ from the top one).
    """
    font = h3fnt.parse(fnt_path)
    if not font.has_baked_outline():
        raise ValueError(
            f"{fnt_path} has no baked-in outline (only {{0, 255}} pixel values) -- "
            "COLR mode has nothing to build a separate outline layer from. "
            "Use --mode mono for this font."
        )

    glyph_order = [".notdef"]
    glyphs = {".notdef": build_notdef(font.height)}
    advances = {".notdef": (font.height * UNITS_PER_PIXEL, UNITS_PER_PIXEL)}
    cmap: dict[int, str] = {}
    color_glyphs: dict[str, list[tuple[str, int]]] = {}
    next_pua = PUA_START

    for glyph in font.defined_glyphs():
        name = glyph_name_for(glyph.code)
        outline_name = f"{name}.outline"
        fill_name = f"{name}.fill"

        outline_glyph, outline_lsb = build_outline(glyph, font.height, lambda v: v != 0)
        fill_glyph, fill_lsb = build_outline(glyph, font.height, 255)

        glyph_order.extend([name, outline_name, fill_name])
        glyphs[name] = _empty_glyph()  # the base glyph itself paints nothing directly -- COLR points at the two layers below instead
        glyphs[outline_name] = outline_glyph
        glyphs[fill_name] = fill_glyph

        advance = (glyph.advance * UNITS_PER_PIXEL, outline_lsb)
        advances[name] = advance
        advances[outline_name] = advance
        advances[fill_name] = (glyph.advance * UNITS_PER_PIXEL, fill_lsb)

        # Painted bottom-to-top: outline (fixed black, palette index 0) first,
        # then fill (CSS `color`, the reserved "foreground" index) on top.
        color_glyphs[name] = [(outline_name, 0), (fill_name, CPAL_FOREGROUND_INDEX)]

        codepoint = h3fnt.codepoint_for(glyph.code)
        if codepoint is None:
            codepoint = next_pua
            next_pua += 1
        cmap[codepoint] = name

    fb, units_per_em = _base_font_setup(font, family_name, glyph_order, glyphs, advances, cmap)
    fb.font["COLR"] = buildCOLR(color_glyphs)
    fb.font["CPAL"] = buildCPAL([[(0.0, 0.0, 0.0, 1.0)]])  # palette 0, index 0: opaque black
    _save(fb, out_dir, out_stem, font, units_per_em, len(glyph_order), len(cmap), fnt_path)


def _empty_glyph():
    return TTGlyphPen(None).glyph()


def _save(fb, out_dir, out_stem, font, units_per_em, num_glyphs, num_cmap, fnt_path):
    out_dir.mkdir(parents=True, exist_ok=True)
    ttf_path = out_dir / f"{out_stem}.ttf"
    woff2_path = out_dir / f"{out_stem}.woff2"

    fb.font.save(str(ttf_path))
    fb.font.flavor = "woff2"
    fb.font.save(str(woff2_path))

    print(f"{fnt_path}: height={font.height}px unitsPerEm={units_per_em} "
          f"glyphs={num_glyphs} cmap_entries={num_cmap}")
    print(f"  -> {ttf_path}")
    print(f"  -> {woff2_path}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("fnt_path")
    ap.add_argument("out_stem", help="Output filename stem, e.g. 'smalfont-h3' -> smalfont-h3.ttf/.woff2")
    ap.add_argument("--family", required=True, help="Font family name embedded in the font's own name table")
    ap.add_argument("--out-dir", default="assets/fonts")
    ap.add_argument("--mode", choices=["mono", "colr"], default="mono")
    args = ap.parse_args()

    out_dir = pathlib.Path(args.out_dir)
    if args.mode == "mono":
        convert_mono(args.fnt_path, args.family, out_dir, args.out_stem)
    else:
        convert_colr(args.fnt_path, args.family, out_dir, args.out_stem)


if __name__ == "__main__":
    main()
