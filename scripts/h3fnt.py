"""
Parser for Heroes of Might and Magic 3's .FNT bitmap font format.

Format confirmed by direct binary analysis of this project's own assets/fonts/
files, cross-checked against the open-source `fntgen.py` (might-and-magic/
fnt-generator on GitHub — the same struct layout, confirmed byte-for-byte), and
sanity-checked three independent ways: every glyph's offset-table delta equals
width * height, a decoded 'A'/'O' render as recognizable letterforms, and
decoding CP1251 code points 0xC1/0xC4/0xC6/0xDB produces unmistakable Cyrillic
Б/Д/Ж/Ы. See the project's own plan doc for the full writeup.

    Header (32 bytes):
        int32   magic          (0x0008ff1e, constant across every file seen)
        uint32  height_packed  (fontHeight << 8)
        24 bytes zero padding

    Per-character metrics -- 256 x 3 x int32 (768 ints, 3072 bytes), one
    triplet per character code 0..255, in this order:
        int32 left_offset   (may be negative -- kerning/overhang)
        int32 width         (glyph bitmap width in px)
        int32 right_offset

    A character is genuinely undefined only when ALL THREE of the above are
    zero -- not `width == 0` alone, which would wrongly treat a bitmap-less
    but still-advancing character (blank glyph, real spacing) as undefined.

    Glyph offset table -- 256 x uint32 (1024 bytes): byte offset into the
    glyph-data section (relative to that section's own start), one per
    character; meaningless for undefined characters.

    Glyph pixel data -- the rest of the file, 1 byte per pixel, row-major,
    width * height bytes per glyph. No vertical/baseline field anywhere in
    the format -- every glyph is simply top-anchored in its own
    `width x height` box; the font's own height (from the header) doubles as
    both the glyph box height and the line height.

    Pixel values are a baked-in fill + outline, not anti-aliasing: 255 is the
    glyph's actual ink, 0 is transparent, and where present, 1 is a baked-in
    1px black outline already surrounding the 255 fill (confirmed by
    rendering BIGFONT's 'A'/'O' with 1 and 255 as different colors -- 1 forms
    a clean ring around 255 on every edge). Some fonts (smalfont, TINY,
    TIMES08R, CALLI10R) never had an outline baked in and only ever use
    {0, 255}.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass

# Two distinct values observed across this project's own assets/fonts/*.FNT
# (0x0008ff1e: CREDITS/HISCORE/TIMES08R/VERD10B/smalfont, 0x0008ff1f: BIGFONT/
# CALLI10R/MEDFONT/TINY) -- doesn't correlate with any other structural
# difference noticed (baked-outline presence, height, ...), so most likely a
# version/variant tag that doesn't affect how the rest of the file is laid
# out. Both accepted; anything else is a genuine "this isn't the format we
# think it is" signal worth stopping on.
KNOWN_MAGICS = {0x0008FF1E, 0x0008FF1F}
HEADER_SIZE = 32
NUM_CHARS = 256
METRICS_SIZE = NUM_CHARS * 3 * 4
OFFSET_TABLE_SIZE = NUM_CHARS * 4


@dataclass
class Glyph:
    code: int
    left_offset: int
    width: int
    right_offset: int
    # Row-major, 1 byte per pixel, `width * height` bytes. Empty for
    # width == 0 (e.g. an undefined-shape-but-advancing character).
    pixels: bytes

    @property
    def advance(self) -> int:
        return self.left_offset + self.width + self.right_offset

    @property
    def is_defined(self) -> bool:
        return bool(self.left_offset or self.width or self.right_offset)

    def pixel(self, x: int, y: int, height: int) -> int:
        return self.pixels[y * self.width + x]


@dataclass
class H3Font:
    height: int
    glyphs: list[Glyph]  # always exactly 256 entries, index == char code

    def defined_glyphs(self):
        return (g for g in self.glyphs if g.is_defined)

    def has_baked_outline(self) -> bool:
        """
        Whether this font's glyph pixel data ever uses value 1 (a baked-in
        outline pixel, distinct from 255's fill -- see this module's own
        docstring) anywhere. False for a font that only ever used {0, 255}.
        """
        return any(1 in g.pixels for g in self.defined_glyphs())


def parse(path: str) -> H3Font:
    with open(path, "rb") as f:
        data = f.read()

    magic, height_packed = struct.unpack_from("<iI", data, 0)
    if (magic & 0xFFFFFFFF) not in KNOWN_MAGICS:
        raise ValueError(f"{path}: unexpected magic 0x{magic & 0xFFFFFFFF:08x} -- not a recognized .FNT variant")
    height = height_packed >> 8

    metrics = struct.unpack_from(f"<{NUM_CHARS * 3}i", data, HEADER_SIZE)
    triplets = [metrics[i:i + 3] for i in range(0, NUM_CHARS * 3, 3)]

    offsets_start = HEADER_SIZE + METRICS_SIZE
    offsets = struct.unpack_from(f"<{NUM_CHARS}I", data, offsets_start)

    glyph_data_start = offsets_start + OFFSET_TABLE_SIZE
    glyph_data = data[glyph_data_start:]

    glyphs = []
    for code in range(NUM_CHARS):
        left, width, right = triplets[code]
        if left == 0 and width == 0 and right == 0:
            glyphs.append(Glyph(code, 0, 0, 0, b""))
            continue
        start = offsets[code]
        n = width * height
        glyphs.append(Glyph(code, left, width, right, glyph_data[start:start + n]))

    return H3Font(height=height, glyphs=glyphs)


def codepoint_for(code: int) -> int | None:
    """
    Map an H3 .FNT character code to its Unicode codepoint, or None if it
    isn't a real character -- either the two mystery low codes (30/31) some
    fonts define despite being outside the normal printable range, or
    Windows-1251's own single genuinely undefined byte (0x98: confirmed by
    rendering it directly -- a plain hollow-box glyph in every font checked,
    not a real Cyrillic letter or punctuation mark). Caller's job to decide
    what, if anything, to do with those (this project maps them into the
    Private Use Area rather than guessing at a "real" meaning).
    """
    if 32 <= code <= 126:
        return code
    if 128 <= code <= 255:
        try:
            return ord(bytes([code]).decode("cp1251"))
        except UnicodeDecodeError:
            return None
    return None
