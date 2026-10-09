#!/usr/bin/env python3
r"""
upscale_icons.py — увеличивает маленькие иконки HOMM3 пиксельным масштабированием (xBRZ и др.).

Лист героя показывает иконки первичных навыков, Опыта, Маны, вторичных навыков, Боевого духа и
Удачи увеличенными в 1,26 раза (окно 760 px) — растянутые «по ближайшему пикселю» они рябят.
Поэтому лист берёт версии xBRZ ×4 (с повтором краёв, --pad), а браузер уменьшает их под ячейку
со сглаживанием (image-rendering: auto, src/scss/components/_hd-icons.scss).

Исходники только читаются. Пересобрать все иконки листа (из корня репозитория):

    <python-с-xbrz> scripts/upscale_icons.py --hero-sheet

  пишет assets/pskil42-x4/ (6), assets/secskill-x4/ (кадры из SECONDARY_SKILL_FRAMES и пустой
  кадр — module/helpers/skill-icons.mjs), assets/imrl42-x4/ (7) и assets/ilck42-x4/ (7: −3…−1 из
  assets/ilck42-neg/, их собирает scripts/build_luck_negative.py — его запускать раньше;
  0…+3 из assets/ilck42/) и assets/smalres-x3/ (монеты Золота, кадр 6 SMALRES — ×3, не ×4).
  Имена файлов — как у исходных кадров.

Python и пакеты. xBRZ — пакет «xbrz.py» с PyPI (C++ через ctypes). Готовое колесо под Windows есть
только для CPython 3.9; на более новых пакет собирается из исходников и требует Visual C++. Поэтому —
отдельное окружение на Python 3.9, вне репозитория:

    py -3.9 -m venv %USERPROFILE%\.venvs\xbrz
    %USERPROFILE%\.venvs\xbrz\Scripts\python -m pip install xbrz.py "pillow<11"
    %USERPROFILE%\.venvs\xbrz\Scripts\python scripts/upscale_icons.py --hero-sheet

Произвольные файлы (для сравнений):

    python scripts/upscale_icons.py --method xbrz --scale 2 3 4 --pad --out OUT  assets/pskil42/*.png
      → OUT/<метод>x<N>[-pad]/<папка исходника>/<имя>; с --flat — прямо в OUT/<имя>

Методы:
  xbrz    — пакет xbrz.py (см. выше), RGBA, ×2…×6.
  hqx     — пакет hqx (чистый Python, hq2x/3x/4x); импортирует PIL.PyAccess, которого нет в
            Pillow 11+, — нужен Pillow < 11. Только RGB: альфа, если есть, масштабируется отдельно.
  nearest — только Pillow: каждый пиксель повторяется N×N, ×2…×8.
  scale2x — Pillow + numpy: Scale2x (EPX) для ×2, Scale3x для ×3 (правила AdvMAME).
--pad: края повторяются на 2 px перед масштабированием и обрезаются после — иначе xBRZ скругляет
4 внешних угла непрозрачной картинки до полупрозрачности.

Печатает JSON-строку на каждый записанный файл. Код выхода 1, если какой-то вход не прочитался.
"""
import argparse
import glob
import json
import os
import re
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))


def _xbrz(img, scale):
    import xbrz

    return xbrz.scale_pillow(img.convert('RGBA'), scale)


def _hqx(img, scale):
    import hqx

    rgba = img.convert('RGBA')
    out = hqx.hqx_scale(rgba.convert('RGB'), scale).convert('RGBA')
    alpha = rgba.getchannel('A')
    if alpha.getextrema() != (255, 255):
        out.putalpha(alpha.resize(out.size, Image.NEAREST))
    return out


def _nearest(img, scale):
    rgba = img.convert('RGBA')
    return rgba.resize((rgba.width * scale, rgba.height * scale), Image.NEAREST)


def _scale2x(img, scale):
    """Scale2x / Scale3x (AdvMAME, a.k.a. EPX for ×2): numpy, exact-colour rules.

    Edges repeat the border pixel. A pixel's colour includes alpha.
    """
    import numpy as np

    rgba = np.asarray(img.convert('RGBA'), dtype=np.uint8)
    h, w = rgba.shape[:2]
    packed = rgba.view(np.uint32)[..., 0]
    p = np.pad(packed, 1, mode='edge')
    A, B, C = p[:-2, :-2], p[:-2, 1:-1], p[:-2, 2:]
    D, E, F = p[1:-1, :-2], p[1:-1, 1:-1], p[1:-1, 2:]
    G, H, I = p[2:, :-2], p[2:, 1:-1], p[2:, 2:]
    act = (B != H) & (D != F)

    def pick(cond, a):
        return np.where(act & cond, a, E)

    if scale == 2:
        sub = [[pick(D == B, D), pick(B == F, F)],
               [pick(D == H, D), pick(H == F, F)]]
    else:
        sub = [[pick(D == B, D),
                pick(((D == B) & (E != C)) | ((B == F) & (E != A)), B),
                pick(B == F, F)],
               [pick(((D == B) & (E != G)) | ((D == H) & (E != A)), D),
                E,
                pick(((B == F) & (E != I)) | ((H == F) & (E != C)), F)],
               [pick(D == H, D),
                pick(((D == H) & (E != I)) | ((H == F) & (E != G)), H),
                pick(H == F, F)]]
    out = np.empty((h * scale, w * scale), dtype=np.uint32)
    for dy in range(scale):
        for dx in range(scale):
            out[dy::scale, dx::scale] = sub[dy][dx]
    return Image.fromarray(out.view(np.uint8).reshape(h * scale, w * scale, 4), 'RGBA')


BACKENDS = {'xbrz': (_xbrz, range(2, 7)), 'hqx': (_hqx, (2, 3, 4)), 'nearest': (_nearest, range(2, 9)),
            'scale2x': (_scale2x, (2, 3))}

PAD = 2


def _padded(fn, img, scale):
    """Scale with the edge pixels repeated PAD px outward, then crop back.

    xBRZ treats the outside of the image as a corner to round: without this,
    the 4 outer corners of an opaque icon come out semi-transparent.
    """
    rgba = img.convert('RGBA')
    w, h = rgba.size
    big = Image.new('RGBA', (w + 2 * PAD, h + 2 * PAD))
    big.paste(rgba, (PAD, PAD))
    # Repeat the outer rows, then the outer columns (corners included).
    for i in range(PAD):
        big.paste(rgba.crop((0, 0, w, 1)), (PAD, i))
        big.paste(rgba.crop((0, h - 1, w, h)), (PAD, PAD + h + i))
    for i in range(PAD):
        big.paste(big.crop((PAD, 0, PAD + 1, h + 2 * PAD)), (i, 0))
        big.paste(big.crop((PAD + w - 1, 0, PAD + w, h + 2 * PAD)), (PAD + w + i, 0))
    out = fn(big, scale)
    return out.crop((PAD * scale, PAD * scale, (PAD + w) * scale, (PAD + h) * scale))


# ------------------------------------------------------------------ --hero-sheet
def _frame(set_name, n, folder=None):
    return os.path.join(ROOT, 'assets', folder or set_name, f'{set_name}_g00_f{n:03d}.png')


def hero_sheet_jobs():
    """(output folder, [source files], scale) for every small icon the hero sheet shows. The
    secondary-skill frames are read from skill-icons.mjs (SECONDARY_SKILL_FRAMES +
    SECONDARY_SKILL_EMPTY_FRAME). The gold coins (SMALRES frame 6) are ×3."""
    with open(os.path.join(ROOT, 'module', 'helpers', 'skill-icons.mjs'), encoding='utf-8') as f:
        src = f.read()
    table = src[src.index('const SECONDARY_SKILL_FRAMES'):]
    table = table[:table.index('};')]
    sec = {int(n) for n in re.findall(r'(?:base|advanced|expert): (\d+)', table)}
    empty = int(re.search(r'const SECONDARY_SKILL_EMPTY_FRAME = (\d+);', src).group(1))
    luck = [_frame('ilck42', n, 'ilck42-neg') for n in range(3)] + [_frame('ilck42', n) for n in range(3, 7)]
    return [
        ('pskil42-x4', [_frame('pskil42', n) for n in range(6)], 4),
        ('secskill-x4', [_frame('secskill', n) for n in sorted(sec | {empty})], 4),
        ('imrl42-x4', [_frame('imrl42', n) for n in range(7)], 4),
        ('ilck42-x4', luck, 4),
        ('smalres-x3', [_frame('smalres', 6)], 3),
    ]


def build_hero_sheet():
    fn, _ = BACKENDS['xbrz']
    for folder, files, scale in hero_sheet_jobs():
        out_dir = os.path.join(ROOT, 'assets', folder)
        os.makedirs(out_dir, exist_ok=True)
        total = 0
        for src in files:
            dst = os.path.join(out_dir, os.path.basename(src))
            _padded(fn, Image.open(src), scale).save(dst, optimize=True)
            total += os.path.getsize(dst)
        print(f'assets/{folder}: {len(files)} files, {total} bytes')
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--hero-sheet', action='store_true',
                   help='rebuild every hero-sheet icon set in assets/ (xBRZ ×4, the gold coins ×3; --pad)')
    p.add_argument('--method', choices=BACKENDS)
    p.add_argument('--scale', type=int, nargs='+')
    p.add_argument('--out', help='output root (must not contain the inputs)')
    p.add_argument('--flat', action='store_true', help='write straight into --out, no <method>/<set> folders')
    p.add_argument('--pad', action='store_true',
                   help='repeat edge pixels before scaling and crop after (no rounded/transparent corners); '
                        'output folder gets a "-pad" suffix')
    p.add_argument('inputs', nargs='*', help='PNG files or glob patterns')
    a = p.parse_args(argv)
    if a.hero_sheet:
        return build_hero_sheet()
    if not (a.method and a.scale and a.out and a.inputs):
        p.error('--method, --scale, --out and input files are required (or --hero-sheet)')

    fn, allowed = BACKENDS[a.method]
    bad = [s for s in a.scale if s not in allowed]
    if bad:
        p.error(f'{a.method}: unsupported scale {bad}, allowed {list(allowed)}')

    files = []
    for pat in a.inputs:
        files += sorted(glob.glob(pat)) or [pat]
    out_root = os.path.abspath(a.out)
    failed = 0
    for src in files:
        src_abs = os.path.abspath(src)
        try:
            img = Image.open(src_abs)
            img.load()
        except Exception as e:  # noqa: BLE001 — report and keep going
            print(f'skip {src}: {e}', file=sys.stderr)
            failed += 1
            continue
        set_name = os.path.basename(os.path.dirname(src_abs))
        for s in a.scale:
            sub = f'{a.method}x{s}' + ('-pad' if a.pad else '')
            dst = (os.path.join(out_root, os.path.basename(src_abs)) if a.flat
                   else os.path.join(out_root, sub, set_name, os.path.basename(src_abs)))
            if os.path.abspath(dst) == src_abs:
                p.error(f'refusing to overwrite the input {src}')
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            result = _padded(fn, img, s) if a.pad else fn(img, s)
            result.save(dst, optimize=True)
            print(json.dumps({'src': src, 'out': dst, 'method': a.method, 'scale': s, 'pad': a.pad,
                              'size': [img.width * s, img.height * s], 'bytes': os.path.getsize(dst)}))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
