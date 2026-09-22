#!/usr/bin/env python3
"""
key_bg.py — убирает плоский фон из извлечённых спрайтов HOMM3.

У части извлечённых картинок фон остался залитым служебным цветом
(обычно бирюзовым). Скрипт делает этот цвет прозрачным.

Что делает помимо самой замены:

  - определяет цвет фона сам, по рамке изображения, и показывает его;
  - ищет ГАЛО — пиксели, близкие к фону, но не равные ему. Это следы
    сглаживания по краю рисунка. Если их вырезать грубым допуском,
    у иконки отъедается контур; если оставить — по краю остаётся
    бирюзовая кайма. Скрипт сообщает, сколько их и какие;
  - защищает от вырезания пикселей фонового цвета ВНУТРИ рисунка:
    прозрачным становится только то, что связано с краем картинки.

Зависимости: Pillow.

Примеры:
    python scripts\\key_bg.py assets\\ui\\speltrnl.png --probe
    python scripts\\key_bg.py assets\\ui\\speltrnl.png assets\\ui\\speltrnr.png
    python scripts\\key_bg.py assets\\ui\\speltrnl.png --tolerance 12 --suffix ""
"""

import argparse
import os
import sys
from collections import Counter

from PIL import Image, ImageDraw


def border_colors(img):
    """Счётчик цветов по периметру — фон почти всегда доминирует там."""
    w, h = img.size
    px = img.convert("RGB").load()
    c = Counter()
    for x in range(w):
        c[px[x, 0]] += 1
        c[px[x, h - 1]] += 1
    for y in range(h):
        c[px[0, y]] += 1
        c[px[w - 1, y]] += 1
    return c


def corner_colors(img):
    """Цвета в четырёх углах картинки."""
    w, h = img.size
    px = img.convert("RGB").load()
    return [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]


def guess_key(img):
    """
    Определяет цвет фона.

    Сначала по углам изображения: у спрайта вроде загнутого уголка страницы
    рисунок прижат к одному углу, а остальные три — чистый фон. Периметр для
    этого не годится: рисунок может занимать вдоль края больше пикселей,
    чем фон, и большинство окажется за рисунком.

    Если по углам большинства нет, откатываемся на большинство по периметру.
    """
    corners = Counter(corner_colors(img))
    top_corner, n = corners.most_common(1)[0]
    if n >= 3:
        return top_corner, f"3+ из 4 углов картинки"
    border = border_colors(img)
    if n == 2:
        # два угла против двух — берём тот, что чаще встречается на периметре
        cands = [c for c, k in corners.items() if k == 2]
        best = max(cands, key=lambda c: border[c])
        return best, "2 из 4 углов, выбран по периметру"
    return border.most_common(1)[0][0], "большинство по периметру"


def find_halo(img, key, tolerance):
    """Цвета, близкие к ключевому, но не равные ему — следы сглаживания."""
    px = img.convert("RGB").load()
    w, h = img.size
    kr, kg, kb = key
    halo = Counter()
    for y in range(h):
        for x in range(w):
            v = px[x, y]
            if v == key:
                continue
            d = max(abs(v[0] - kr), abs(v[1] - kg), abs(v[2] - kb))
            if d <= tolerance:
                halo[v] += 1
    return halo


def key_out(img, key, tolerance, edge_only):
    """
    Строит альфу. Возвращает (rgba, keyed, protected).

    protected — пиксели фонового цвета, не связанные с краем картинки:
    они остаются непрозрачными, потому что это часть рисунка.
    """
    w, h = img.size
    rgb = img.convert("RGB")
    px = rgb.load()
    kr, kg, kb = key

    matched = Image.new("L", (w, h), 0)
    mp = matched.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if (abs(r - kr) <= tolerance and abs(g - kg) <= tolerance
                    and abs(b - kb) <= tolerance):
                mp[x, y] = 255

    if edge_only:
        # заливка от каждой точки рамки, попавшей в ключ
        region = matched.copy()
        seeds = []
        for x in range(w):
            for y in (0, h - 1):
                if region.load()[x, y] == 255:
                    seeds.append((x, y))
        for y in range(h):
            for x in (0, w - 1):
                if region.load()[x, y] == 255:
                    seeds.append((x, y))
        for s in seeds:
            if region.load()[s[0], s[1]] == 255:
                ImageDraw.floodfill(region, s, 128, thresh=0)
        rp = region.load()
    else:
        rp = None

    out = img.convert("RGBA").copy()
    alpha = Image.new("L", (w, h), 255)
    ap = alpha.load()
    keyed = protected = 0
    for y in range(h):
        for x in range(w):
            if mp[x, y] != 255:
                continue
            if rp is not None and rp[x, y] != 128:
                protected += 1
                continue
            ap[x, y] = 0
            keyed += 1
    out.putalpha(alpha)
    return out, keyed, protected


def process(path, args):
    if not os.path.exists(path):
        print(f"нет файла: {path}")
        return
    img = Image.open(path)
    print(f"\n--- {path}  {img.size}  режим {img.mode} ---")

    counts = border_colors(img)
    print("  цвета по периметру: " +
          ", ".join(f"{c} x{n}" for c, n in counts.most_common(3)))
    print(f"  углы картинки: {corner_colors(img)}")

    if args.key_color:
        key = tuple(int(v) for v in args.key_color.split(","))
        how = "задан вручную"
    else:
        key, how = guess_key(img)
    print(f"  ключевой цвет: {key}  ({how})")

    share = 100.0 * counts[key] / max(1, sum(counts.values()))
    print(f"  его доля на периметре: {share:.0f}%")
    if share < 50:
        print("  ! доля низкая — если это не фон, задай --key-color вручную")

    halo = find_halo(img, key, max(args.tolerance, args.halo_probe))
    if halo:
        print(f"  гало (близкие к фону цвета): {sum(halo.values())} пикселей")
        for c, n in halo.most_common(4):
            print(f"      {c} x{n}")
        print("    Если после вырезания по краю осталась цветная кайма — "
              "поднимай --tolerance по одному шагу.")
    else:
        print("  гало нет: фон плоский, край чистый")

    if args.probe:
        print("  --probe: файл не записан")
        return

    out, keyed, protected = key_out(img, key, args.tolerance, not args.anywhere)
    print(f"  вырезано пикселей: {keyed}")
    if protected:
        print(f"  ! пикселей фонового цвета внутри рисунка: {protected} — "
              f"оставлены непрозрачными")
        print("    (если это тоже фон, запусти с --anywhere)")

    if keyed == 0:
        print("  !! ничего не вырезано — проверь --key-color и --tolerance")
        return

    root, ext = os.path.splitext(path)
    dst = args.output or f"{root}{args.suffix}{ext}"
    if os.path.abspath(dst) == os.path.abspath(path) and not args.force:
        print(f"  !! перезапись исходника {dst} — добавь --force, "
              f"если так и задумано")
        return
    out.save(dst)
    print(f"  записано: {dst}")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="+", help="PNG для обработки")
    ap.add_argument("--key-color", default=None,
                    help="цвет фона R,G,B; по умолчанию определяется сам")
    ap.add_argument("--tolerance", type=int, default=0,
                    help="допуск на канал (по умолчанию 0 — точное совпадение)")
    ap.add_argument("--halo-probe", type=int, default=40,
                    help="в каком радиусе искать гало для отчёта")
    ap.add_argument("--anywhere", action="store_true",
                    help="вырезать фоновый цвет и внутри рисунка тоже")
    ap.add_argument("--suffix", default="_rgba",
                    help="суффикс выходного файла; пустой = поверх исходника")
    ap.add_argument("--output", default=None, help="явный путь выхода")
    ap.add_argument("--force", action="store_true",
                    help="разрешить перезапись исходника")
    ap.add_argument("--probe", action="store_true",
                    help="только анализ, без записи")
    args = ap.parse_args()

    for p in args.paths:
        process(p, args)


if __name__ == "__main__":
    main()
