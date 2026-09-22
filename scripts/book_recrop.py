#!/usr/bin/env python3
"""
book_recrop.py — подбор кропа книги магии из исходного BMP.

Задача: контент книги сидит во внутреннем окне рамки не по центру — сверху
зазор больше, чем снизу (или наоборот). Пересобираем кроп из исходника,
сдвигая окно кропа по вертикали. Ресемплинга нет никогда: меняется только
то, какой прямоугольник исходника берётся, размер выхода постоянный.

Умеет три вещи:

  --locate   найти в исходнике, каким кропом сделан текущий контент,
             и сказать, сколько пикселей запаса есть сверху и снизу;
  --sweep    выложить веер вариантов со сдвигом по вертикали + контактный
             лист с подписями, чтобы выбрать глазами;
  --dy N     собрать один финальный вариант со сдвигом N пикселей.

Положительный dy = окно кропа едет ВНИЗ по исходнику = картинка внутри
окна поднимается вверх = верхний зазор уменьшается.

Зависимости: Pillow.

Примеры:
    python scripts\\book_recrop.py --src D:\\...\\SpelBack.bmp ^
        --match assets\\ui\\spelback_content.png --locate

    python scripts\\book_recrop.py --src D:\\...\\SpelBack.bmp ^
        --match assets\\ui\\spelback_content.png --sweep -12,12,4 --out recrop_out

    python scripts\\book_recrop.py --src D:\\...\\SpelBack.bmp ^
        --match assets\\ui\\spelback_content.png --dy 6 ^
        --write assets\\ui\\spelback_content.png
"""

import argparse
import os
import sys

from PIL import Image, ImageDraw

# исходный кроп книги, от которого считаются сдвиги
DEFAULT_CROP = (5, 5, 615, 569)


# ------------------------------------------------------- поиск текущего кропа

def sample_points(w, h, margin_x, margin_y, count):
    """
    Точки для сверки, взятые из центральной части кадра.

    Края намеренно исключены: у текущего контента могла быть срезана или
    затёрта собственная рамка, и сверять по краям было бы неверно.
    """
    pts = []
    step = max(1, int(((w - 2 * margin_x) * (h - 2 * margin_y) / count) ** 0.5))
    y = margin_y
    while y < h - margin_y:
        x = margin_x
        while x < w - margin_x:
            pts.append((x, y))
            x += step
        y += step
    return pts


def locate_crop(src, target, margin_frac=0.12, coarse=64, fine=2000):
    """
    Ищет смещение, при котором target вырезается из src без ресемплинга.

    Двухступенчато: сначала грубая отбраковка по нескольким точкам, затем
    точная сверка выживших. Возвращает (x0, y0, mismatches) лучшего варианта.
    """
    sw, sh = src.size
    tw, th = target.size
    if tw > sw or th > sh:
        return None, None, None

    sp = src.convert("RGB").load()
    tp = target.convert("RGB").load()
    mx, my = int(tw * margin_frac), int(th * margin_frac)

    coarse_pts = sample_points(tw, th, mx, my, coarse)
    fine_pts = sample_points(tw, th, mx, my, fine)

    best = None
    for y0 in range(0, sh - th + 1):
        for x0 in range(0, sw - tw + 1):
            ok = True
            for (px, py) in coarse_pts:
                if sp[x0 + px, y0 + py] != tp[px, py]:
                    ok = False
                    break
            if not ok:
                continue
            bad = sum(1 for (px, py) in fine_pts
                      if sp[x0 + px, y0 + py] != tp[px, py])
            if best is None or bad < best[2]:
                best = (x0, y0, bad)
            if bad == 0:
                return best
    return best if best else (None, None, None)


# ------------------------------------------------------------------- сборка

def make_crop(src, base, dx, dy):
    """Кроп со сдвигом относительно базового прямоугольника."""
    x0, y0, x1, y1 = base
    box = (x0 + dx, y0 + dy, x1 + dx, y1 + dy)
    sw, sh = src.size
    if box[0] < 0 or box[1] < 0 or box[2] > sw or box[3] > sh:
        return None, box
    return src.crop(box), box


def headroom(src, base):
    """Сколько пикселей исходника остаётся за краями базового кропа."""
    x0, y0, x1, y1 = base
    sw, sh = src.size
    return {"top": y0, "bottom": sh - y1, "left": x0, "right": sw - x1}


def contact_sheet(items, out_path, scale, label_h=22):
    """Полоса вариантов с подписями сдвига."""
    if not items:
        return
    tw, th = items[0][1].size
    cw, ch = max(1, int(tw * scale)), max(1, int(th * scale))
    cols = len(items)
    sheet = Image.new("RGB", (cols * (cw + 8) + 8, ch + label_h + 16), (24, 20, 16))
    d = ImageDraw.Draw(sheet)
    for i, (dy, img) in enumerate(items):
        x = 8 + i * (cw + 8)
        sheet.paste(img.convert("RGB").resize((cw, ch), Image.NEAREST), (x, 8))
        d.rectangle([x, 8, x + cw - 1, 8 + ch - 1], outline=(90, 80, 60))
        d.text((x + 4, ch + 12), f"dy {dy:+d}", fill=(230, 220, 190))
    sheet.save(out_path)


# -------------------------------------------------------------------- отчёт

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", required=True, help="исходный SpelBack.bmp")
    ap.add_argument("--match", default=None,
                    help="текущий контент книги — из него берётся размер выхода")
    ap.add_argument("--size", default=None,
                    help="размер выхода WxH, если --match не задан")
    ap.add_argument("--base", default=None,
                    help="базовый кроп x0,y0,x1,y1; по умолчанию ищется "
                         "по --match, иначе берётся исторический")
    ap.add_argument("--locate", action="store_true",
                    help="только найти текущий кроп и показать запас")
    ap.add_argument("--sweep", default=None,
                    help="веер вариантов. Два числа = симметрично: "
                         "'12,4' даёт от -12 до +12 шагом 4. "
                         "Три числа = от,до,шаг (ведущий минус писать через "
                         "знак равенства: --sweep=-4,20,4)")
    ap.add_argument("--dx", type=int, default=0)
    ap.add_argument("--dy", type=int, default=0)
    ap.add_argument("--out", default="recrop_out", help="папка для вариантов")
    ap.add_argument("--write", default=None,
                    help="записать финальный вариант по этому пути")
    ap.add_argument("--sheet-scale", type=float, default=0.42)
    args = ap.parse_args()

    if not os.path.exists(args.src):
        sys.exit(f"нет исходника: {args.src}")
    src = Image.open(args.src).convert("RGBA").copy()
    print(f"исходник: {args.src}  {src.size}")

    # --- размер выхода и базовый кроп ---
    target = None
    if args.match:
        if not os.path.exists(args.match):
            sys.exit(f"нет файла: {args.match}")
        target = Image.open(args.match).convert("RGBA").copy()
        print(f"текущий контент: {args.match}  {target.size}")

    if args.base:
        base = tuple(int(v) for v in args.base.split(","))
        print(f"базовый кроп задан вручную: {base}")
    elif target is not None:
        print("ищу текущий кроп в исходнике...")
        x0, y0, bad = locate_crop(src, target)
        if x0 is None:
            print("!! не нашёл — текущий контент не является кропом исходника")
            print("   (был ресемплинг, перекраска или другой источник)")
            print(f"   беру исторический кроп {DEFAULT_CROP}")
            base = DEFAULT_CROP
        else:
            tw, th = target.size
            base = (x0, y0, x0 + tw, y0 + th)
            note = "точное совпадение" if bad == 0 else \
                   f"совпадение с {bad} расхождениями (рамку правили?)"
            print(f"  найден кроп: {base}  — {note}")
    else:
        base = DEFAULT_CROP
        print(f"базовый кроп: {base} (исторический)")

    if target is None:
        if args.size:
            w, h = (int(v) for v in args.size.lower().split("x"))
        else:
            w, h = base[2] - base[0], base[3] - base[1]
        base = (base[0], base[1], base[0] + w, base[1] + h)

    bw, bh = base[2] - base[0], base[3] - base[1]
    room = headroom(src, base)
    print(f"размер выхода: {bw}x{bh}")
    print(f"запас исходника: сверху {room['top']}, снизу {room['bottom']}, "
          f"слева {room['left']}, справа {room['right']}")
    print(f"допустимый сдвиг по вертикали: от {-room['top']:+d} "
          f"до {room['bottom']:+d}")
    print("  (dy > 0 — окно кропа вниз, картинка внутри поднимается,")
    print("   верхний зазор уменьшается)")

    if args.locate:
        return

    os.makedirs(args.out, exist_ok=True)

    if args.sweep:
        nums = [int(v) for v in args.sweep.split(",")]
        if len(nums) == 2:
            radius, step = nums
            a, b = -abs(radius), abs(radius)
        elif len(nums) == 3:
            a, b, step = nums
        else:
            sys.exit("--sweep: ожидается 'радиус,шаг' или 'от,до,шаг'")
        if step <= 0:
            sys.exit("--sweep: шаг должен быть положительным")
        items = []
        skipped = []
        for dy in range(a, b + 1, step):
            img, box = make_crop(src, base, args.dx, dy)
            if img is None:
                skipped.append(dy)
                continue
            img.save(os.path.join(args.out, f"book_dy{dy:+03d}.png"))
            items.append((dy, img))
        contact_sheet(items, os.path.join(args.out, "book_sweep_sheet.png"),
                      args.sheet_scale)
        print(f"вариантов записано: {len(items)}")
        if skipped:
            print(f"! вышли за границы исходника, пропущены: {skipped}")
        print(f"контактный лист: {os.path.join(args.out, 'book_sweep_sheet.png')}")
        return

    img, box = make_crop(src, base, args.dx, args.dy)
    if img is None:
        sys.exit(f"!! кроп {box} выходит за границы исходника {src.size}")
    print(f"итоговый кроп: {box}  (dx {args.dx:+d}, dy {args.dy:+d})")
    dst = args.write or os.path.join(args.out, f"book_dy{args.dy:+03d}.png")
    img.save(dst)
    print(f"записано: {dst}")


if __name__ == "__main__":
    main()
