#!/usr/bin/env python3
"""
build_luck_negative.py — кадры отрицательной Удачи (−1, −2, −3) из кадров +1, +2, +3.

В HOMM3 у ILCK42/ILCK82 кадры −3…0 одинаковые (череп, подкова, слиток), поэтому −1/−2/−3
собираются из положительных: подковы переворачиваются по вертикали («Перевёрнутые», способ
У-а), фон и рамка кадра остаются на месте. Кадры 0 и +1…+3 не трогаются.

Как: кадр раскладывается на слои по маске —
  металл (золото: светлее кожи и тёплое; мелкие светлые пятна кожи отброшены),
  блики (светлые серые лучи рядом с металлом),
  тень (темнее кожи рядом с металлом).
Металл с бликами переворачивается относительно середины подков; тень строится заново с тем же
смещением и глубиной, что в оригинале; освободившееся место закрывается кожей из зеркального
места кадра. 82×93 (--clean, по умолчанию для ilck82) дополнительно: оставшиеся серые обрывки
лучей (заметно ниже насыщенность, чем у кожи) убираются, а всё, где нужна кожа, заполняется
копией настоящей кожи из чистого участка того же кадра, а не усреднением соседей (без мыла).

Нужно: Python 3.9+, Pillow, numpy (обычный Python, без venv).

Пересобрать (из корня репозитория; assets/ilck42 и assets/ilck82 только читаются):
    python scripts/build_luck_negative.py
Пишет assets/ilck42-neg/ и assets/ilck82-neg/: ilckNN_g00_f000.png (−3), f001 (−2), f002 (−1).
"""
import argparse
import os

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))


# ------------------------------------------------------------------ helpers
def load(set_name, frame):
    path = os.path.join(ROOT, 'assets', set_name, f'{set_name}_g00_f{frame:03d}.png')
    return np.asarray(Image.open(path).convert('RGB')).astype(np.float64)


def lum(a):
    return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]


def saturation(a):
    mx, mn = a.max(-1), a.min(-1)
    return np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-9), 0)


def shift(mask, dy, dx):
    out = np.zeros_like(mask)
    h, w = mask.shape
    ys, yd = (slice(0, h - dy), slice(dy, h)) if dy >= 0 else (slice(-dy, h), slice(0, h + dy))
    xs, xd = (slice(0, w - dx), slice(dx, w)) if dx >= 0 else (slice(-dx, w), slice(0, w + dx))
    out[yd, xd] = mask[ys, xs]
    return out


def dilate(m, r=1):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out |= shift(m, dy, dx)
    return out


def erode(m, r=1):
    return ~dilate(~m, r)


def components(m):
    """4-connected components (plain BFS — the frames are tiny)."""
    seen = np.zeros_like(m)
    out = []
    h, w = m.shape
    for sy, sx in zip(*np.where(m)):
        if seen[sy, sx]:
            continue
        comp = np.zeros_like(m)
        stack = [(sy, sx)]
        seen[sy, sx] = True
        while stack:
            y, x = stack.pop()
            comp[y, x] = True
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        out.append(comp)
    return out


def interior(shape, border):
    m = np.zeros(shape, bool)
    m[border:shape[0] - border, border:shape[1] - border] = True
    return m


def flip_rows(m, y0, y1):
    out = m.copy() if m.ndim == 3 else np.zeros_like(m)
    out[y0:y1 + 1] = m[y0:y1 + 1][::-1]
    return out


def bbox(m):
    ys, xs = np.where(m)
    return ys.min(), ys.max(), xs.min(), xs.max()


# ------------------------------------------------------------------ layers
def metal_mask(a, inner):
    y = lum(a)
    bg = float(np.median(y[inner]))
    m0 = (y > max(80, bg + 35)) & (a[..., 0] - a[..., 2] > 40) & inner
    m = dilate(erode(dilate(m0, 1), 1), 1) & inner
    comps = components(m)
    if not comps:
        return m
    big = max(c.sum() for c in comps)
    keep = np.zeros_like(m)
    for c in comps:
        if c.sum() >= 0.1 * big:
            keep |= c
    return keep


def layers(a, large):
    inner = interior(a.shape[:2], 3 if large else 1)
    y = lum(a)
    M = metal_mask(a, inner)
    bg_lum = float(np.median(y[inner & ~dilate(M, 2)]))
    G = (y > bg_lum + 40) & ~M & dilate(M, 20 if large else 12) & inner
    S = (y < bg_lum * 0.75) & dilate(M, 8 if large else 4) & ~M & ~G & inner
    return M, G, S, bg_lum, inner


def shadow_offset(M, S, r):
    best, score = (0, 0), -1
    for dy in range(0, r + 1):
        for dx in range(0, r + 1):
            sm = shift(M, dy, dx) & ~M
            sc = (sm & S).sum() / max(sm.sum(), 1)
            if sc > score:
                best, score = (dy, dx), sc
    return best


# ------------------------------------------------------------------ fills
def inpaint_average(a, known):
    """Neighbour averaging (the 42×38 frames — as chosen; tiny holes, no texture to keep)."""
    a = a.copy()
    known = known.copy()
    for _ in range(200):
        if known.all():
            break
        acc = np.zeros_like(a)
        cnt = np.zeros(known.shape)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            k = shift(known, dy, dx)
            acc += np.where(k[..., None], np.roll(np.roll(a, dy, 0), dx, 1), 0)
            cnt += k
        fill = ~known & (cnt > 0)
        a[fill] = acc[fill] / cnt[fill][:, None]
        known |= fill
    return a


def tiles(holes, size):
    """Hole components cut into size×size pieces, so each piece can find clean leather nearby."""
    out = []
    h, w = holes.shape
    for comp in components(holes):
        for ty in range(0, h, size):
            for tx in range(0, w, size):
                part = np.zeros_like(comp)
                part[ty:ty + size, tx:tx + size] = comp[ty:ty + size, tx:tx + size]
                if part.any():
                    out.append(part)
    return out


def fill_with_leather(a, holes, clean, max_r=30, size=6):
    """Each hole piece is filled with a copy of real leather from the same frame: the nearest
    offset at which the whole piece lands on clean leather. Falls back to averaging if none."""
    a = a.copy()
    offsets = sorted(((dy, dx) for dy in range(-max_r, max_r + 1) for dx in range(-max_r, max_r + 1)
                      if (dy, dx) != (0, 0)), key=lambda v: v[0] ** 2 + v[1] ** 2)
    left = np.zeros_like(holes)
    for comp in tiles(holes, size):
        for dy, dx in offsets:
            src = shift(comp, dy, dx)              # where the component would read from: p + (dy, dx)
            if src.sum() == comp.sum() and (src & ~clean).sum() == 0:
                ys, xs = np.where(comp)
                a[ys, xs] = a[ys + dy, xs + dx]
                break
        else:
            left |= comp
    if left.any():
        a = inpaint_average(a, ~left)
    return a, int(left.sum())


# ------------------------------------------------------------------ flip
def flip_horseshoes(a, large, clean):
    M, G, S, bg_lum, inner = layers(a, large)
    y0, y1, _, _ = bbox(M)
    F = M | G
    obj = F | S
    Ff = flip_rows(F, y0, y1)
    Mf = flip_rows(M, y0, y1)
    flipped = flip_rows(a, y0, y1)
    dy, dx = shadow_offset(M, S, 6 if large else 3)
    Sf = shift(Mf, dy, dx) & ~Ff & inner
    k_shadow = float(np.median(lum(a)[S]) / bg_lum) if S.any() else 1.0

    bg = a.copy()
    use_mirror = obj & ~flip_rows(obj, y0, y1)
    use_mirror[:y0] = False
    use_mirror[y1 + 1:] = False
    bg[use_mirror] = flipped[use_mirror]
    known = ~obj | use_mirror
    report = {}
    if clean:
        # grey ray remnants: clearly less saturated than the leather around them
        leather_s = float(np.median(saturation(a)[inner & ~dilate(obj, 2)]))
        rays = (saturation(bg) < 0.6 * leather_s) & inner & ~Ff & ~Sf
        rays = dilate(rays, 1) & inner & ~Ff
        # old shadow that the flipped shadow does not cover: darker leftovers next to it
        old_shadow = dilate(S, 1) & ~Sf & ~Ff & (lum(bg) < bg_lum * 0.85) & inner
        rays |= old_shadow
        holes = (~known | rays) & inner & ~Ff
        clean_leather = known & ~rays & inner & ~dilate(obj | Ff | Sf, 1)
        bg, left = fill_with_leather(bg, holes & ~Sf, clean_leather)
        bg = inpaint_average(bg, ~(holes & Sf)) if (holes & Sf).any() else bg
        report = {'rays_and_old_shadow_px': int(rays.sum()), 'holes_px': int(holes.sum()), 'averaged_px': left}
    else:
        bg = inpaint_average(bg, known)
    out = bg.copy()
    out[Sf] = bg[Sf] * k_shadow
    out[Ff] = flipped[Ff]
    return out, report


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--sets', nargs='+', default=['ilck42', 'ilck82'])
    a = p.parse_args()
    for set_name in a.sets:
        large = set_name == 'ilck82'
        out_dir = os.path.join(ROOT, 'assets', f'{set_name}-neg')
        os.makedirs(out_dir, exist_ok=True)
        for n in (1, 2, 3):
            img, rep = flip_horseshoes(load(set_name, 3 + n), large, clean=large)
            path = os.path.join(out_dir, f'{set_name}_g00_f{3 - n:03d}.png')
            Image.fromarray(np.clip(np.round(img), 0, 255).astype(np.uint8), 'RGB').save(path, optimize=True)
            print(f'{set_name} −{n} → {os.path.relpath(path, ROOT)}', rep or '')


if __name__ == '__main__':
    main()
