#!/usr/bin/env python3
"""
extract_creature_abilities.py -- «Способности существ» (book pp. 113-116)
into scripts/data/bestiary/abilities.json for the creature-abilities journal.

Same principle as extract_bestiary.py: no value comes from plain PDF text.
The pages are read span by span in reading order; an ability starts at a
bold-italic span ending with ":" (the book sets every ability name that
way), everything until the next one is its text -- including across a page
break (p.115 -> p.116). Page numbers (a line of digits only) are dropped.

Check layers:
- invariants (errors): exactly EXPECTED_COUNT abilities, unique names,
  non-empty text, no word mixing Latin and Cyrillic letters, every fix
  in FIXES applies exactly once;
- review flags: every line-end hyphen join, for a look at the crop;
- by eye: --review writes one crop per ability for the review sheet.

Usage:
    python scripts/extract_creature_abilities.py
    python scripts/extract_creature_abilities.py --review <dir>
"""

import argparse
import json
import os
import re
import sys

import pymupdf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(ROOT, 'docs', 'OKP_Heroes_Glory_v2_1.pdf')
OUT = os.path.join(ROOT, 'scripts', 'data', 'bestiary', 'abilities.json')
PAGES = (113, 116)  # book page N == PDF page index N
EXPECTED_COUNT = 55

# Book typos, confirmed against the page image (docs/rules.md §11 list).
FIXES = [
    {'name': 'Месть', 'field': 'text', 'from': 'не полное здоровье', 'to': 'неполное здоровье',
     'reason': 'слитно, как в «Гнев» на той же странице'},
    {'name': 'Элементаль', 'field': 'text', 'from': 'не работает заклинание «Воскрешение» и «Волна смерти»',
     'to': 'не работают заклинания «Воскрешение» и «Волна смерти»', 'reason': 'согласование: два заклинания'},
]

MIXED = re.compile(r'\w*(?:[A-Za-z][А-Яа-яЁё]|[А-Яа-яЁё][A-Za-z])\w*')


def is_name(span):
    return 'Bold' in span['font'] and 'Ital' in span['font']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--review')
    args = ap.parse_args()
    doc = pymupdf.open(PDF)
    flags = []

    abilities = []  # {name, page, parts:[(text, is_line_start)], rects:[(page, rect)]}
    for p in range(PAGES[0], PAGES[1] + 1):
        for block in doc[p].get_text('dict')['blocks']:
            for line in block.get('lines', []):
                spans = [s for s in line['spans'] if s['text'].strip()]
                if not spans:
                    continue
                text = ''.join(s['text'] for s in spans).strip()
                if re.fullmatch(r'\d+', text) or text == 'Способности существ':
                    continue
                rect = pymupdf.Rect(line['bbox'])
                if is_name(spans[0]):
                    name = spans[0]['text'].strip()
                    if not name.endswith(':'):
                        flags.append(('error', name, 'имя способности не заканчивается двоеточием'))
                    abilities.append({'name': name.rstrip(':').strip(), 'page': p, 'lines': [], 'rects': []})
                    rest = ''.join(s['text'] for s in spans[1:]).strip()
                    if rest:
                        abilities[-1]['lines'].append(rest)
                elif abilities:
                    abilities[-1]['lines'].append(text)
                else:
                    flags.append(('error', f'стр. {p}', f'текст до первой способности: «{text}»'))
                    continue
                abilities[-1]['rects'].append((p, rect))

    out = []
    for a in abilities:
        text = ''
        for line in a['lines']:
            line = re.sub(r'\s+', ' ', line).strip()
            if text.endswith('-') and line[:1].islower():
                flags.append(('review', a['name'], f'перенос склеен: «{text.split()[-1]}{line.split()[0]}»'))
                text = text[:-1] + line
            else:
                text = (text + ' ' + line).strip()
        if not text:
            flags.append(('error', a['name'], 'пустой текст'))
        out.append({'name': a['name'], 'page': a['page'], 'text': text})

    for fix in FIXES:
        hits = [o for o in out if o['name'] == fix['name'] and fix['from'] in o[fix['field']]]
        if len(hits) != 1:
            flags.append(('error', fix['name'], f'исправление не применилось: «{fix["from"]}»'))
            continue
        hits[0][fix['field']] = hits[0][fix['field']].replace(fix['from'], fix['to'])
        flags.append(('fixed', fix['name'], f'опечатка книги ({fix["reason"]}): «{fix["from"]}» → «{fix["to"]}»'))

    names = [o['name'] for o in out]
    if len(out) != EXPECTED_COUNT:
        flags.append(('error', 'все', f'способностей {len(out)}, ожидалось {EXPECTED_COUNT}'))
    if len(set(names)) != len(names):
        flags.append(('error', 'все', 'повторяющиеся имена'))
    for o in out:
        for word in MIXED.findall(o['name'] + ' ' + o['text']):
            flags.append(('error', o['name'], f'латиница и кириллица вперемешку: «{word}»'))

    if args.review:
        os.makedirs(args.review, exist_ok=True)
        for i, a in enumerate(abilities):
            by_page = {}
            for p, r in a['rects']:
                by_page[p] = r if p not in by_page else by_page[p] | r
            for k, (p, r) in enumerate(sorted(by_page.items())):
                clip = pymupdf.Rect(doc[p].rect.x0 + 30, r.y0 - 3, doc[p].rect.x1 - 30, r.y1 + 3)
                doc[p].get_pixmap(dpi=130, clip=clip).save(os.path.join(args.review, f'ability-{i:02d}-{k}.png'))
        with open(os.path.join(args.review, 'abilities-flags.json'), 'w', encoding='utf-8') as f:
            json.dump([{'level': l, 'where': w, 'message': m} for l, w, m in flags], f, ensure_ascii=False, indent=1)

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'source': 'OKP_Heroes_Glory_v2_1.pdf, стр. 113-116', 'abilities': out}, f, ensure_ascii=False, indent=2)
        f.write('\n')

    levels = {}
    for l, _, _ in flags:
        levels[l] = levels.get(l, 0) + 1
    print(f'способностей: {len(out)}; флаги: {levels}')
    for l, w, m in flags:
        print(f'  [{l}] {w}: {m}')
    if levels.get('error'):
        sys.exit(1)


if __name__ == '__main__':
    main()
