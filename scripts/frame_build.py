#!/usr/bin/env python3
"""
frame_build.py — раскладывает вырезанную вручную рамку на все цветовые варианты.

На вход: один PNG, вырезанный руками из heroscr4_<цвет>.png — рамка сохранена,
середина стёрта в полную прозрачность.

На выход: window_frame_<цвет>.png для всех десяти цветов. Берётся ТОЛЬКО альфа
из ручного выреза, а пиксели — из соответствующего heroscr4_<цвет>.png. Поэтому
резать нужно ровно один раз: перекраска не сдвигает ни одного пикселя, геометрия
во всех вариантах идентична.

Перед сборкой проверяет, что при резке ничего не поехало:
  - размер совпадает с исходной панелью;
  - альфа бинарная (0 или 255), без растушёвки;
  - непрозрачные пиксели совпадают с исходником по RGB — то есть рамку
    не перекрасили, не пересжали и не сдвинули;
  - дырка не касается внешнего края;
  - все десять исходных панелей одного размера.

Заодно печатает геометрию внутреннего окна в пикселях и процентах — это те
числа, по которым контент будущих окон позиционируется под рамкой.

Зависимости: Pillow.

Примеры:
    python scripts\\frame_build.py --cut probe_out\\window_frame_cut.png --dry-run
    python scripts\\frame_build.py --cut probe_out\\window_frame_cut.png
"""

import argparse
import os
import sys

from PIL import Image, ImageDraw

DEFAULT_COLORS = ["red", "blue", "tan", "green", "orange",
                  "purple", "teal", "pink", "black", "white"]


# ---------------------------------------------------------------- проверки

def check_alpha_binary(alpha, tolerance):
    """Возвращает количество пикселей с промежуточной альфой."""
    hist = alpha.histogram()
    partial = sum(hist[tolerance:256 - tolerance])
    return partial


def check_rgb_match(cut, source, alpha, ignore=None):
    """
    Сколько непрозрачных пикселей выреза расходятся с исходником по RGB.

    Ловит случайную перекраску, ресемплинг и сдвиг на пиксель — то есть всё,
    из-за чего рамка перестала бы совпадать с панелью.
    """
    w, h = cut.size
    cp = cut.convert("RGB").load()
    sp = source.convert("RGB").load()
    ap = alpha.load()
    ignore = ignore or set()
    bad = 0
    first = None
    for y in range(h):
        for x in range(w):
            if ap[x, y] < 128 or (x, y) in ignore:
                continue
            if cp[x, y] != sp[x, y]:
                bad += 1
                if first is None:
                    first = (x, y, cp[x, y], sp[x, y])
    return bad, first


def parse_key(text):
    parts = [int(p) for p in text.replace(" ", "").split(",")]
    if len(parts) != 3:
        raise ValueError("ключевой цвет задаётся как R,G,B")
    return tuple(parts)


def key_to_alpha(cut, key, tolerance, restore_specks):
    """
    Строит альфу из заливки ключевым цветом.

    Отдельная забота — белые (или иные совпадающие с ключом) пиксели внутри
    самой рамки: если их вырезать, в филиграни появятся дырки. Поэтому
    заливка ищется как связная область от центра холста, а всё совпавшее
    с ключом, но НЕ связанное с ней, считается частью рисунка и по умолчанию
    возвращается непрозрачным.

    Возвращает (alpha, keyed_total, specks_count, specks_sample).
    """
    w, h = cut.size
    rgb = cut.convert("RGB").load()
    kr, kg, kb = key

    matched = Image.new("L", (w, h), 0)
    mp = matched.load()
    keyed = 0
    for y in range(h):
        for x in range(w):
            r, g, b = rgb[x, y]
            if (abs(r - kr) <= tolerance and abs(g - kg) <= tolerance
                    and abs(b - kb) <= tolerance):
                mp[x, y] = 255
                keyed += 1

    # связная область от центра
    region = matched.copy()
    cx, cy = w // 2, h // 2
    if region.load()[cx, cy] != 255:
        print("!! в центре холста нет ключевого цвета — проверь --key-color")
        return None, keyed, 0, [], set()
    ImageDraw.floodfill(region, (cx, cy), 128, thresh=0)
    rp = region.load()

    alpha = Image.new("L", (w, h), 255)
    apx = alpha.load()
    specks = []
    speck_set = set()
    speck_count = 0
    for y in range(h):
        for x in range(w):
            if mp[x, y] != 255:
                continue
            if rp[x, y] == 128:
                apx[x, y] = 0
            else:
                speck_count += 1
                speck_set.add((x, y))
                if len(specks) < 8:
                    specks.append((x, y))
                if not restore_specks:
                    apx[x, y] = 0
    return alpha, keyed, speck_count, specks, speck_set


def detect_source_color(cut, alpha, ui_dir, prefix, colors, stride=97):
    """
    Определяет, из какого цветового варианта сделан вырез.

    Сравнивает выборку непрозрачных пикселей с каждой панелью и берёт вариант
    с наименьшим числом расхождений. Нужно, чтобы не гадать и не сверять
    вырез с чужим цветом.
    """
    w, h = cut.size
    cp = cut.convert("RGB").load()
    ap = alpha.load()
    samples = []
    i = 0
    for y in range(0, h):
        for x in range(0, w):
            if ap[x, y] < 128:
                continue
            i += 1
            if i % stride == 0:
                samples.append((x, y, cp[x, y]))
    if not samples:
        return None, {}

    scores = {}
    for c in colors:
        p = os.path.join(ui_dir, f"{prefix}_{c}.png")
        if not os.path.exists(p):
            continue
        panel = Image.open(p).convert("RGB")
        if panel.size != cut.size:
            continue
        pp = panel.load()
        bad = sum(1 for x, y, v in samples if pp[x, y] != v)
        scores[c] = bad
    if not scores:
        return None, {}
    best = min(scores, key=scores.get)
    return best, scores


def hole_geometry(alpha):
    """
    Геометрия прозрачной середины.

    Возвращает (bbox, transparent_count, touches_edge, thickness_by_side).
    Толщина по сторонам меряется по средним линиям — там углового орнамента
    заведомо нет, и это честная толщина каймы.
    """
    w, h = alpha.size
    ap = alpha.load()
    bx0 = by0 = 10 ** 9
    bx1 = by1 = -1
    count = 0
    for y in range(h):
        for x in range(w):
            if ap[x, y] >= 128:
                continue
            count += 1
            bx0 = min(bx0, x); by0 = min(by0, y)
            bx1 = max(bx1, x); by1 = max(by1, y)
    bbox = (bx0, by0, bx1, by1) if bx1 >= 0 else None

    touches = False
    for x in range(w):
        if ap[x, 0] < 128 or ap[x, h - 1] < 128:
            touches = True
            break
    if not touches:
        for y in range(h):
            if ap[0, y] < 128 or ap[w - 1, y] < 128:
                touches = True
                break

    mid_x, mid_y = w // 2, h // 2
    def depth(step):
        d = 0
        while d < max(w, h):
            x, y = step(d)
            if ap[x, y] < 128:
                break
            d += 1
        return d

    thickness = {
        "top":    depth(lambda d: (mid_x, d)),
        "bottom": depth(lambda d: (mid_x, h - 1 - d)),
        "left":   depth(lambda d: (d, mid_y)),
        "right":  depth(lambda d: (w - 1 - d, mid_y)),
    }
    return bbox, count, touches, thickness


# ----------------------------------------------------------------- сборка

def build(args):
    if not os.path.exists(args.cut):
        sys.exit(f"нет файла выреза: {args.cut}")
    cut = Image.open(args.cut).convert("RGBA").copy()
    colors = [c.strip() for c in args.colors.split(",") if c.strip()]

    print(f"вырез: {args.cut}  {cut.size}")

    # --- альфа: либо уже в файле, либо вырезается по ключевому цвету ---
    if args.key_color:
        key = parse_key(args.key_color)
        print(f"вырезание по ключевому цвету {key}, допуск {args.key_tolerance}")
        alpha, keyed, specks, sample, speck_set = key_to_alpha(
            cut, key, args.key_tolerance, not args.no_speck_restore)
        if alpha is None:
            sys.exit("не удалось построить альфу")
        print(f"  пикселей ключевого цвета: {keyed}")
        if specks:
            where = "восстановлены непрозрачными" if not args.no_speck_restore \
                    else "ВЫРЕЗАНЫ (--no-speck-restore)"
            print(f"  ! из них не связаны с серединой: {specks} — {where}")
            print(f"    примеры координат: {sample}")
            print("    это пиксели того же цвета внутри самой рамки; "
                  "если их вырезать, в филиграни будут дырки.")
            print("    Цвет для них берётся из панели, так что закраска "
                  "не повредила рисунок.")
        else:
            print("  ключевого цвета внутри рамки нет — чисто")
        restored = set() if args.no_speck_restore else speck_set
    else:
        restored = set()
        alpha = cut.getchannel("A")
        partial = check_alpha_binary(alpha, args.alpha_tolerance)
        if partial:
            print(f"!! полупрозрачных пикселей: {partial} — резали мягким "
                  f"ластиком или со сглаживанием.")
            print("   При image-rendering: pixelated это даст грязную кайму.")
            if not args.allow_partial:
                sys.exit("   Пересохрани с жёстким краем, либо запусти "
                         "с --allow-partial.")
        else:
            print("альфа бинарная — ок")

    # --- из какого варианта резали ---
    if args.source_color == "auto":
        detected, scores = detect_source_color(
            cut, alpha, args.ui_dir, args.prefix, colors)
        if detected is None:
            sys.exit("не удалось определить исходный вариант — "
                     "задай --source-color явно")
        ranked = sorted(scores.items(), key=lambda kv: kv[1])[:3]
        print(f"исходный вариант определён как: {detected}  "
              f"(расхождений по выборке: " +
              ", ".join(f"{c}={n}" for c, n in ranked) + ")")
        args.source_color = detected

    src_path = os.path.join(args.ui_dir, f"{args.prefix}_{args.source_color}.png")
    if not os.path.exists(src_path):
        sys.exit(f"нет исходной панели: {src_path}")
    source = Image.open(src_path).convert("RGBA").copy()
    print(f"исходник: {src_path}  {source.size}")

    if cut.size != source.size:
        sys.exit("!! размер выреза не совпадает с панелью — холст двигали "
                 "или масштабировали, пересохрани без изменения размера")

    bad, first = check_rgb_match(cut, source, alpha, ignore=restored)
    if bad:
        print(f"!! непрозрачных пикселей, расходящихся с исходником: {bad}")
        if first:
            x, y, a, b = first
            print(f"   первый: ({x},{y}) вырез {a} против панели {b}")
        print("   Рамку перекрасили, пересжали или сдвинули на пиксель.")
        if not args.allow_repaint:
            sys.exit("   Проверь; если так и задумано — --allow-repaint.")
    else:
        print("пиксели рамки совпадают с исходником — ок")

    bbox, count, touches, thickness = hole_geometry(alpha)
    if bbox is None:
        sys.exit("!! в вырезе нет ни одного прозрачного пикселя — "
                 "середина не стёрта")
    if touches:
        print("!! прозрачные пиксели касаются внешнего края — "
              "рамка где-то прорезана насквозь")

    w, h = cut.size
    x0, y0, x1, y1 = bbox
    iw, ih = x1 - x0 + 1, y1 - y0 + 1
    print()
    print("--- геометрия внутреннего окна ---")
    print(f"  bbox: x {x0}..{x1}, y {y0}..{y1}   ({iw}x{ih} px)")
    print(f"  в процентах от холста {w}x{h}:")
    print(f"    left   {100.0 * x0 / w:.3f}%")
    print(f"    top    {100.0 * y0 / h:.3f}%")
    print(f"    width  {100.0 * iw / w:.3f}%")
    print(f"    height {100.0 * ih / h:.3f}%")
    print(f"  толщина каймы по средним линиям: верх {thickness['top']}, "
          f"низ {thickness['bottom']}, лево {thickness['left']}, "
          f"право {thickness['right']}")
    fill = 100.0 * count / max(1, iw * ih)
    print(f"  прозрачных пикселей: {count} ({fill:.1f}% площади bbox)")
    if fill < 90:
        print("  ! заметно меньше 100% — либо угловой орнамент выступает "
              "внутрь (норма), либо середина стёрта не вся")
    print()

    if args.dry_run:
        print("--dry-run: файлы не записаны")
        return

    os.makedirs(args.out, exist_ok=True)
    written, missing = [], []
    for c in colors:
        p = os.path.join(args.ui_dir, f"{args.prefix}_{c}.png")
        if not os.path.exists(p):
            missing.append(c)
            continue
        panel = Image.open(p).convert("RGBA").copy()
        if panel.size != cut.size:
            print(f"!! {c}: размер {panel.size} не совпадает — пропускаю")
            continue
        frame = panel.copy()
        frame.putalpha(alpha)
        dst = os.path.join(args.out, f"{args.frame_prefix}_{c}.png")
        frame.save(dst)
        written.append(os.path.basename(dst))

    print(f"записано {len(written)}: {', '.join(written)}")
    if missing:
        print(f"! не найдены панели для: {', '.join(missing)}")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cut", required=True, help="PNG с вырезанной вручную рамкой")
    ap.add_argument("--ui-dir", default=os.path.join("assets", "ui"))
    ap.add_argument("--out", default=os.path.join("assets", "ui"))
    ap.add_argument("--prefix", default="heroscr4", help="имя исходной панели")
    ap.add_argument("--frame-prefix", default="window_frame",
                    help="имя выходных файлов рамки")
    ap.add_argument("--source-color", default="auto",
                    help="из какого варианта резали; auto — определить сам")
    ap.add_argument("--key-color", default=None,
                    help="вырезать по цвету заливки, например 255,255,255")
    ap.add_argument("--key-tolerance", type=int, default=0,
                    help="допуск на канал при вырезании по цвету")
    ap.add_argument("--no-speck-restore", action="store_true",
                    help="не восстанавливать пиксели ключевого цвета "
                         "внутри рамки (по умолчанию восстанавливаются)")
    ap.add_argument("--colors", default=",".join(DEFAULT_COLORS))
    ap.add_argument("--alpha-tolerance", type=int, default=8,
                    help="допуск на почти-0 и почти-255 в альфе")
    ap.add_argument("--allow-partial", action="store_true",
                    help="не падать на полупрозрачных пикселях")
    ap.add_argument("--allow-repaint", action="store_true",
                    help="не падать на расхождении RGB с исходником")
    ap.add_argument("--dry-run", action="store_true",
                    help="только проверки и геометрия, без записи")
    build(ap.parse_args())


if __name__ == "__main__":
    main()
