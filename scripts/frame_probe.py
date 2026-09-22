#!/usr/bin/env python3
"""
frame_probe.py — разведка геометрии рамки окон Heroes Glory.

Отвечает на три вопроса, не трогая ни одного файла проекта:

  1. Где именно в панели живёт цвет игрока (маска различий между цветовыми
     вариантами). Для книги магии это заодно ответ на вопрос «можно ли
     сделать контент бесцветным, одним файлом вместо десяти».
  2. Совпадает ли фактическая толщина рамки с заявленными 9px по каждой
     из четырёх сторон.
  3. Насколько глубоко угловой орнамент выступает внутрь — то есть какой
     формы должна быть прозрачная середина у общей рамки.

Ничего не перезаписывает: только читает PNG и складывает отчёт + превью
в отдельную папку.

Зависимости: Pillow.

Примеры:
    python frame_probe.py --ui-dir assets\\ui --out probe_out
    python frame_probe.py --ui-dir assets\\ui --out probe_out --thickness 9 --corner 96
"""

import argparse
import os
import sys

from PIL import Image, ImageChops, ImageDraw

DEFAULT_COLORS = ["red", "blue", "tan", "green", "orange",
                  "purple", "teal", "pink", "black", "white"]

FAMILIES = [
    ("heroscr4", "лист персонажа"),
    ("spelback", "книга магии"),
]


# ---------------------------------------------------------------- загрузка

def load_family(ui_dir, prefix, colors):
    """Возвращает [(имя_цвета, Image RGBA)] для всех найденных вариантов."""
    found = []
    missing = []
    for c in colors:
        path = os.path.join(ui_dir, f"{prefix}_{c}.png")
        if os.path.exists(path):
            found.append((c, Image.open(path).convert("RGBA").copy()))
        else:
            missing.append(c)
    return found, missing


# ------------------------------------------------------------ маска цвета

def colour_mask(variants, threshold):
    """
    Маска пикселей, которые различаются хотя бы между двумя вариантами.

    Считается как поканальный максимум разностей каждого варианта с первым.
    Этого достаточно: если пиксель одинаков у всех, он одинаков и с первым.
    """
    base = variants[0][1].convert("RGB")
    acc = Image.new("L", base.size, 0)
    for _, img in variants[1:]:
        diff = ImageChops.difference(base, img.convert("RGB"))
        r, g, b = diff.split()
        m = ImageChops.lighter(ImageChops.lighter(r, g), b)
        acc = ImageChops.lighter(acc, m)
    return acc.point(lambda v: 255 if v > threshold else 0)


def alpha_varies(variants, threshold):
    """True, если альфа-канал различается между вариантами."""
    base = variants[0][1].getchannel("A")
    for _, img in variants[1:]:
        d = ImageChops.difference(base, img.getchannel("A"))
        if d.getextrema()[1] > threshold:
            return True
    return False


# -------------------------------------------------------------- измерения

def measure_thickness(mask, expected):
    """
    Толщина цветной каймы по каждой стороне.

    Идём от края внутрь по средней линии соответствующей стороны и считаем,
    на какой глубине заканчивается сплошная полоса различающихся пикселей.
    Средняя линия выбрана намеренно: там углового орнамента заведомо нет.
    """
    w, h = mask.size
    px = mask.load()
    mid_x, mid_y = w // 2, h // 2
    limit = max(expected * 6, 64)

    def walk(step_fn):
        depth = 0
        while depth < limit:
            x, y = step_fn(depth)
            if not (0 <= x < w and 0 <= y < h) or px[x, y] == 0:
                break
            depth += 1
        return depth

    return {
        "top":    walk(lambda d: (mid_x, d)),
        "bottom": walk(lambda d: (mid_x, h - 1 - d)),
        "left":   walk(lambda d: (d, mid_y)),
        "right":  walk(lambda d: (w - 1 - d, mid_y)),
    }


def in_corner_box(x, y, w, h, corner):
    """Попадает ли пиксель в один из четырёх угловых квадратов."""
    return ((x < corner or x >= w - corner) and
            (y < corner or y >= h - corner))


def analyse_interior(mask, inset, corner):
    """
    Разбор цветных пикселей ГЛУБЖЕ каймы на две категории.

      ornament — лежат в угловых квадратах: это выступ углового орнамента,
                 так и должно быть.
      content  — лежат вне углов: это цветной контент панели. Ноль здесь
                 означает, что контент можно сделать бесцветным, одним
                 файлом вместо десяти.

    Возвращает (ornament_count, content_count, content_bbox).
    """
    w, h = mask.size
    if w <= inset * 2 or h <= inset * 2:
        return 0, 0, None
    px = mask.load()
    orn = 0
    cnt = 0
    bx0 = by0 = 10 ** 9
    bx1 = by1 = -1
    for y in range(inset, h - inset):
        for x in range(inset, w - inset):
            if not px[x, y]:
                continue
            if in_corner_box(x, y, w, h, corner):
                orn += 1
            else:
                cnt += 1
                bx0 = min(bx0, x); by0 = min(by0, y)
                bx1 = max(bx1, x); by1 = max(by1, y)
    bbox = (bx0, by0, bx1, by1) if bx1 >= 0 else None
    return orn, cnt, bbox


def corner_reach(mask, inset, corner):
    """
    Насколько глубоко угловой орнамент заходит ЗА внутреннюю границу каймы.

    Считаются только пиксели, лежащие внутри внутреннего прямоугольника —
    пиксели самой каймы не участвуют, иначе любой пиксель на верхнем краю
    засчитывался бы как горизонтальный выступ.

    Возвращает по углу (глубина_по_X, глубина_по_Y) в пикселях от линии inset.
    """
    w, h = mask.size
    px = mask.load()
    out = {}
    boxes = {
        "TL": (inset, inset, corner, corner),
        "TR": (w - corner, inset, w - inset, corner),
        "BL": (inset, h - corner, corner, h - inset),
        "BR": (w - corner, h - corner, w - inset, h - inset),
    }
    for name, (x0, y0, x1, y1) in boxes.items():
        reach_x = reach_y = 0
        for y in range(max(inset, y0), min(h - inset, y1)):
            for x in range(max(inset, x0), min(w - inset, x1)):
                if not px[x, y]:
                    continue
                dx = (x - inset + 1) if x < w // 2 else (w - inset - x)
                dy = (y - inset + 1) if y < h // 2 else (h - inset - y)
                reach_x = max(reach_x, dx)
                reach_y = max(reach_y, dy)
        out[name] = (reach_x, reach_y)
    return out


# ---------------------------------------------------------------- превью

def save_corner_crops(img, out_dir, tag, inset, corner, scale=6):
    """Увеличенные углы с отмеченной линией inset — чтобы выбрать канон глазами."""
    w, h = img.size
    boxes = {
        "TL": (0, 0, corner, corner),
        "TR": (w - corner, 0, w, corner),
        "BL": (0, h - corner, corner, h),
        "BR": (w - corner, h - corner, w, h),
    }
    for name, box in boxes.items():
        crop = img.crop(box).resize((corner * scale, corner * scale), Image.NEAREST)
        d = ImageDraw.Draw(crop)
        s = inset * scale
        e = corner * scale
        # линия внутренней границы каймы
        if name in ("TL", "TR"):
            d.line([(0, s), (e, s)], fill=(255, 0, 255, 255), width=1)
        else:
            d.line([(0, e - s), (e, e - s)], fill=(255, 0, 255, 255), width=1)
        if name in ("TL", "BL"):
            d.line([(s, 0), (s, e)], fill=(255, 0, 255, 255), width=1)
        else:
            d.line([(e - s, 0), (e - s, e)], fill=(255, 0, 255, 255), width=1)
        crop.save(os.path.join(out_dir, f"{tag}_corner_{name}_x{scale}.png"))


def save_knockout_preview(img, out_dir, tag, inset, corner):
    """
    Как выглядела бы общая рамка: середина выбита, углы сохранены целиком.

    Это ПРЕВЬЮ для глаз, не готовый ассет — форма выреза здесь прямоугольная
    со срезанными углами, точная форма определяется после замеров.
    """
    w, h = img.size
    layer = img.copy()
    hole = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(hole)
    d.rectangle([inset, inset, w - 1 - inset, h - 1 - inset], fill=255)
    d.rectangle([0, 0, corner, corner], fill=0)
    d.rectangle([w - 1 - corner, 0, w - 1, corner], fill=0)
    d.rectangle([0, h - 1 - corner, corner, h - 1], fill=0)
    d.rectangle([w - 1 - corner, h - 1 - corner, w - 1, h - 1], fill=0)
    alpha = ImageChops.subtract(layer.getchannel("A"), hole)
    layer.putalpha(alpha)
    layer.save(os.path.join(out_dir, f"{tag}_frame_knockout_preview.png"))


def save_mask(mask, out_dir, tag):
    mask.save(os.path.join(out_dir, f"{tag}_colour_mask.png"))


# ------------------------------------------------------------------ отчёт

def report_family(prefix, label, ui_dir, colors, args, out_dir):
    variants, missing = load_family(ui_dir, prefix, colors)
    print(f"\n=== {prefix} ({label}) " + "=" * 30)
    if not variants:
        print("  файлы не найдены — пропускаю")
        return
    if missing:
        print(f"  ! отсутствуют варианты: {', '.join(missing)}")

    sizes = {img.size for _, img in variants}
    if len(sizes) > 1:
        print(f"  !! размеры не совпадают между вариантами: {sizes}")
        return
    w, h = variants[0][1].size
    print(f"  размер: {w}x{h}, вариантов: {len(variants)}")

    if len(variants) < 2:
        print("  нужно минимум два цветовых варианта для диффа — пропускаю")
        return

    if alpha_varies(variants, args.threshold):
        print("  ! альфа-канал различается между вариантами — проверить вручную")

    mask = colour_mask(variants, args.threshold)
    save_mask(mask, out_dir, prefix)

    total = mask.histogram()[255]
    print(f"  цветных пикселей всего: {total} ({100.0 * total / (w * h):.1f}% панели)")

    th = measure_thickness(mask, args.thickness)
    print(f"  толщина каймы по средним линиям: "
          f"верх {th['top']}, низ {th['bottom']}, "
          f"лево {th['left']}, право {th['right']}  "
          f"(ожидалось {args.thickness})")
    if any(v != args.thickness for v in th.values()):
        print("  ! расхождение с ожидаемой толщиной — см. маску")

    orn, cnt, bbox = analyse_interior(mask, args.thickness, args.corner)
    print(f"  цветных пикселей глубже каймы: {orn + cnt}"
          f"  (в углах: {orn}, вне углов: {cnt})")
    if cnt == 0:
        print("    → вне углов цвета нет: контент можно сделать бесцветным,")
        print("      один файл вместо десяти")
    else:
        pct = 100.0 * cnt / max(1, total)
        print(f"    → цветной контент есть ({pct:.1f}% от всех цветных),")
        print(f"      bbox {bbox}: панель остаётся в десяти вариантах")

    reach = corner_reach(mask, args.thickness, args.corner)
    print(f"  выступ орнамента за линию {args.thickness}px (вглубь по X / по Y):")
    for name in ("TL", "TR", "BL", "BR"):
        rx, ry = reach[name]
        print(f"    {name}: {rx}px / {ry}px")
    if cnt:
        print("    ! у панели есть цветной контент — если он подходит близко")
        print("      к углу, числа завышены. Сверить по превью углов.")
    if max(max(v) for v in reach.values()) >= args.corner - args.thickness:
        print(f"    ! выступ упёрся в границу анализа: увеличить --corner")

    sample = args.sample if args.sample else variants[0][0]
    src = dict(variants).get(sample, variants[0][1])
    save_corner_crops(src, out_dir, prefix, args.thickness, args.corner, args.scale)
    save_knockout_preview(src, out_dir, prefix, args.thickness, args.corner)
    print(f"  превью углов и выреза сохранены (вариант: {sample})")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ui-dir", required=True,
                    help="папка с heroscr4_*.png и spelback_*.png")
    ap.add_argument("--out", default="probe_out", help="куда складывать отчёт")
    ap.add_argument("--thickness", type=int, default=9,
                    help="ожидаемая толщина рамки в пикселях (по умолчанию 9)")
    ap.add_argument("--corner", type=int, default=96,
                    help="размер углового квадрата для анализа орнамента")
    ap.add_argument("--scale", type=int, default=6, help="увеличение превью углов")
    ap.add_argument("--threshold", type=int, default=8,
                    help="порог различия каналов, чтобы игнорировать шум")
    ap.add_argument("--sample", default=None,
                    help="какой цветовой вариант брать для превью")
    ap.add_argument("--colors", default=",".join(DEFAULT_COLORS))
    args = ap.parse_args()

    if not os.path.isdir(args.ui_dir):
        sys.exit(f"нет такой папки: {args.ui_dir}")
    os.makedirs(args.out, exist_ok=True)
    colors = [c.strip() for c in args.colors.split(",") if c.strip()]

    for prefix, label in FAMILIES:
        report_family(prefix, label, args.ui_dir, colors, args, args.out)

    print(f"\nготово, файлы в: {os.path.abspath(args.out)}")


if __name__ == "__main__":
    main()
