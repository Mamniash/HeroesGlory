#!/usr/bin/env python3
"""
build_secondary_skill_rows.py — собирает 5-рядный фон прокручиваемой сетки
вторичных навыков (.hero-paperdoll__secondary-skills-scroll) из четырёх
РАЗНЫХ строк исходного арта вместо одной повторённой плиткой.

Раньше (secondary_skill_row_tile.png, теперь неактуален) фон был одной
строкой — 4 ряда исходника при вёрстке отличаются рисунком (текстура
дерева/кожи чуть другая в каждом ряду), и плитка из одной и той же строки
пять раз подряд выглядит явно беднее оригинала.

Теперь: строки 1-4 как есть, пятая — копия первой (пятой строки в
оригинальной 4-рядной сетке нет). Склейка вертикальная, впритык, без
смещений — геометрия шва совпадает с геометрией самого исходника для
швов 1|2, 2|3, 3|4 (это просто соседние пиксели той же панели), и только
шов 4|5 — синтетический (первая строка приставлена второй раз), поэтому
именно он проверяется отдельно ниже.

Источник тот же, что и раньше — heroscr4_black.png (граница рядов
проверена как визуально идентичная во всех 10 цветах панели: сама
декоративная кайма ячеек не зависит от data-color, меняется только рамка
окна). Проверяется здесь же, по всем 4 рядам, а не только по первому,
как было в прошлый раз.

Геометрия (native px, canvas 600×473):
  x0 = 13, ширина = 281, шаг ряда = 48, начало сетки y0 = 271
  ряды: 271, 319, 367, 415 (5-й — копия ряда 271)

Примеры:
    python scripts\\build_secondary_skill_rows.py
    python scripts\\build_secondary_skill_rows.py --dry-run
"""

import argparse
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UI_DIR = os.path.join(ROOT, "assets", "ui")

ALL_COLORS = ["black", "blue", "green", "orange", "pink",
              "purple", "red", "tan", "teal", "white"]

ROW_X0 = 13
ROW_W = 281
ROW_H = 48
ROW_Y0 = 271
ROW_COUNT_SRC = 4  # строк в оригинале — пятая всегда копия первой


def row_box(n):
    """Bbox n-го ряда (0-based) в native px исходной панели."""
    y0 = ROW_Y0 + n * ROW_H
    return (ROW_X0, y0, ROW_X0 + ROW_W, y0 + ROW_H)


def pixel_diff(a, b):
    """Максимальное и среднее абсолютное отклонение по каналам RGB."""
    ap, bp = a.load(), b.load()
    w, h = a.size
    max_diff = 0
    total = 0
    n = 0
    for y in range(h):
        for x in range(w):
            ar, ag, ab = ap[x, y][:3]
            br, bg, bb = bp[x, y][:3]
            d = max(abs(ar - br), abs(ag - bg), abs(ab - bb))
            if d > max_diff:
                max_diff = d
            total += d
            n += 1
    return max_diff, total / n


def check_cross_color(source_color, colors):
    """
    Сверяет все 4 ряда с тем же вырезом на остальных цветовых панелях —
    подтверждает, что кайма ячеек не зависит от data-color (как и раньше,
    но теперь по каждому из 4 рядов, не только по первому).
    """
    src_path = os.path.join(UI_DIR, f"heroscr4_{source_color}.png")
    if not os.path.exists(src_path):
        sys.exit(f"нет исходной панели: {src_path}")
    src = Image.open(src_path).convert("RGB")

    print(f"сверка рядов между цветовыми панелями (эталон: {source_color})")
    rows_src = [src.crop(row_box(n)) for n in range(ROW_COUNT_SRC)]

    ok = True
    for color in colors:
        if color == source_color:
            continue
        path = os.path.join(UI_DIR, f"heroscr4_{color}.png")
        if not os.path.exists(path):
            print(f"  ! нет панели {path} — пропускаю")
            continue
        panel = Image.open(path).convert("RGB")
        if panel.size != src.size:
            print(f"  ! {color}: размер {panel.size} не совпадает с {src.size} — пропускаю")
            ok = False
            continue
        diffs = []
        for n in range(ROW_COUNT_SRC):
            crop = panel.crop(row_box(n))
            max_diff, mean_diff = pixel_diff(rows_src[n], crop)
            diffs.append(max_diff)
            if max_diff != 0:
                ok = False
        print(f"  {color}: maxDiff по рядам 1-4 = {diffs}")

    if ok:
        print("  все 4 ряда пиксель-в-пиксель идентичны во всех цветах — ок")
    else:
        print("  !! есть расхождения — кайма НЕ одинакова во всех цветах, "
              "сборка ниже больше не верна для всех панелей разом")
    return ok


def brightness_slice(px, x, y0, y1):
    return [(y, (px[x, y][0] + px[x, y][1] + px[x, y][2]) // 3) for y in range(y0, y1)]


def check_seam(strip, row_h, row_count):
    """
    Проверяет шов между последней НАСТОЯЩЕЙ строкой (ряд 4) и приклеенной
    копией ряда 1 (ряд 5) — единственный синтетический шов в сборке.
    Соседние строки 1|2, 2|3, 3|4 швов не имеют вообще: это соседние
    пиксели одной и той же исходной панели, разрезание их обратно
    склеивает без изменений — но именно поэтому они годятся как эталон
    формы линии каймы, с которым сравнивается синтетический шов 4|5.

    Печатает срез пиксельных яркостей по вертикальной линии на границе
    (и на одном из настоящих швов для сравнения формы), чтобы численно
    убедиться: на шве 4|5 такой же один проваленный минимум (линия каймы),
    как и на настоящих швах — не двойной провал и не ровный участок без
    провала вовсе.
    """
    w, h = strip.size
    x = w // 2
    px = strip.load()

    real_seam_y = row_h * 1  # граница ряда 1|2 — настоящая, для сравнения
    synth_seam_y = row_h * (row_count - 1)  # граница ряда 4|5 — синтетическая

    for label, seam_y in (("настоящий шов 1|2", real_seam_y),
                           ("синтетический шов 4|5", synth_seam_y)):
        lo, hi = max(0, seam_y - 6), min(h, seam_y + 6)
        line = brightness_slice(px, x, lo, hi)
        vals = [v for _, v in line]
        min_v = min(vals)
        min_at = [y for y, v in line if v == min_v]
        print(f"  {label} (y={seam_y}), срез x={x}:")
        print("    " + "  ".join(f"{y}:{v}" for y, v in line))
        print(f"    минимум яркости {min_v} на y={min_at}")


def build(args):
    colors = [c.strip() for c in args.colors.split(",") if c.strip()]
    if args.check_colors:
        check_cross_color(args.source_color, colors)
        print()

    src_path = os.path.join(UI_DIR, f"heroscr4_{args.source_color}.png")
    if not os.path.exists(src_path):
        sys.exit(f"нет исходной панели: {src_path}")
    src = Image.open(src_path).convert("RGB")
    print(f"исходник: {src_path}  {src.size}")

    rows = [src.crop(row_box(n)) for n in range(ROW_COUNT_SRC)]
    rows.append(rows[0].copy())  # ряд 5 — копия ряда 1

    out = Image.new("RGB", (ROW_W, ROW_H * len(rows)))
    for i, row in enumerate(rows):
        out.paste(row, (0, ROW_H * i))

    print(f"собрано {len(rows)} рядов -> {out.size}")
    check_seam(out, ROW_H, len(rows))

    if args.dry_run:
        print("--dry-run: файл не записан")
        return

    dst = os.path.join(UI_DIR, args.out_name)
    out.save(dst)
    print(f"записан {dst} ({out.width}x{out.height})")


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source-color", default="black")
    ap.add_argument("--colors", default=",".join(ALL_COLORS))
    ap.add_argument("--check-colors", action="store_true", default=True,
                     help="сверить все 4 ряда со всеми цветовыми панелями (по умолчанию включено)")
    ap.add_argument("--no-check-colors", dest="check_colors", action="store_false")
    ap.add_argument("--out-name", default="secondary_skill_rows.png")
    ap.add_argument("--dry-run", action="store_true")
    build(ap.parse_args())


if __name__ == "__main__":
    main()
