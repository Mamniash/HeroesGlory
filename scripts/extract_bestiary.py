#!/usr/bin/env python3
"""
extract_bestiary.py -- bestiary statblocks from OKP_Heroes_Glory_v2_1.pdf
into scripts/data/bestiary/<faction>.json, one faction per run.

Plain PDF text is NOT used for any value: it already scrambled the race
statblocks' captions once, and scrambles the bestiary the same way (p.73:
Копейщик's numbers come out interleaved with the next row). Three
geometry-based channels instead:

1. Statblock -- PyMuPDF table detection over the ruled table: every value
   comes from its own cell, so a caption can't drift onto another row.
2. Damage row (x0.5/x1/x2) -- the same table detection when it finds the
   small table; otherwise (it misses several, e.g. Джинны p.83) the words
   inside the frame to the right of the "Урон" label, by coordinates.
3. Epic table -- the grey box around "Атаки в ближнем бою.". Each text
   line goes to the range marker ("1-2", "3", "1 – 2") nearest by
   vertical CENTRE: a two-line row centres its marker between its lines
   (Ангелы p.76, row 3), so "text after the marker" would silently hand
   the first line to the previous row.

Three check layers (all reported as flags, see --review):
- invariants: damage row == floor(d/2), d, 2d of the first creature;
  epic ranges cover 1..6 exactly once; numbers are integers; headings
  come in the configured order; parentheses balance in special skills;
  every epic line lands on a marker unambiguously.
- a second, independent path: every number taken from a table cell must
  also occur in pdftotext's plain text of the same page (multiset).
- by eye: --review writes a crop of every entry for the side-by-side
  HTML sheet. The page image is the only authority.

Everything a person decides -- entry order, portrait frames, the literal
wording of a hit-location pictogram, book typo fixes, legendary flags --
lives in FACTIONS below, so a rerun reproduces the JSON exactly.

Usage:
    python scripts/extract_bestiary.py tower
    python scripts/extract_bestiary.py tower --review <dir>
"""

import argparse
import collections
import json
import math
import os
import re
import subprocess
import sys

import pymupdf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(ROOT, 'docs', 'OKP_Heroes_Glory_v2_1.pdf')
DATA_DIR = os.path.join(ROOT, 'scripts', 'data', 'bestiary')
PICTOGRAM_DIR = os.path.join(ROOT, 'assets', 'bestiary')
PORTRAIT_SRC = 'systems/heroes-glory/assets/twcrport/twcrport_g00_f{:03d}.png'
PICTOGRAM_SRC = 'systems/heroes-glory/assets/bestiary/{}'

# Book page N is PDF page index N (the PDF has one extra leading page).
# Legs/arms pictogram wording: "слева/справа" as seen on the drawing.
LEG_OR_LEG_IS_TORSO = 'фигура с закрашенной ногой слева · «Или» · фигура с закрашенной ногой справа · «=» · фигура с закрашенным торсом'
HEAD_EXCLUDED = '«Искл.» · фигура с закрашенной головой'
ARMS_IS_LEGS = 'фигура с закрашенными руками · «=» · фигура с закрашенными ногами'

FACTIONS = {
    'castle': {
        'pages': (73, 76),
        # Book order == HOMM3 order (ids 0-13), checked portrait by portrait.
        'entries': [
            ('Копейщики', 'pikemen'), ('Арбалетчики', 'crossbowmen'), ('Грифоны', 'griffins'),
            ('Мечники', 'swordsmen'), ('Монахи', 'monks'), ('Кавалеристы', 'cavaliers'), ('Ангелы', 'angels'),
        ],
        'portraitFrames': list(range(2, 16)),
        'legendary': set(),
        'pictogramText': {
            'Грифоны': 'фигура с закрашенными ногами · «=» · фигура с закрашенными руками',
        },
        'fixes': [
            {'creature': 'Алебардщик', 'field': 'specialSkillsRaw',
             'from': 'кавалерийс-кому', 'to': 'кавалерийскому',
             'reason': 'дефис посреди слова внутри строки; стр. 114 — «Иммунитет к кавалерийскому бонусу»'},
            {'entry': 'Арбалетчики', 'field': 'epicTable', 'rows': [2, 3],
             'from': 'колящий', 'to': 'колющий', 'reason': 'орфография'},
            {'entry': 'Монахи', 'field': 'epicTable', 'rows': [1, 2, 3],
             'from': 'эрегией', 'to': 'энергией', 'reason': 'пропущена буква'},
            {'entry': 'Ангелы', 'field': 'epicTable', 'rows': [6],
             'from': 'на цель стремясь, пронзить', 'to': 'на цель, стремясь пронзить',
             'reason': 'запятая не на месте'},
        ],
    },
    'stronghold': {
        'pages': (77, 80),
        # Book order == HOMM3 order (ids 14-27), checked portrait by portrait.
        'entries': [
            ('Кентавры', 'centaurs'), ('Гномы', 'dwarves'), ('Эльфы', 'elves'), ('Пегасы', 'pegasi'),
            ('Дендроиды', 'dendroids'), ('Единорог', 'unicorns'), ('Зеленые и Золотые драконы', 'dragons'),
        ],
        'portraitFrames': list(range(16, 30)),
        'legendary': set(),
        'pictogramText': {
            'Дендроиды': 'фигура с закрашенной головой · «=» · фигура с закрашенным торсом',
            'Единорог': 'фигура с закрашенными руками · «=» · фигура с закрашенными ногами',
        },
        'fixes': [],
    },
    'inferno': {
        'pages': (85, 88),
        # Book order == HOMM3 order (ids 42-55), checked portrait by portrait.
        'entries': [
            ('Бесы', 'imps'), ('Гоги', 'gogs'), ('Адские гончие', 'hellhounds'), ('Демоны', 'demons'),
            ('Отродья пропасти', 'pitfiends'), ('Ифриты', 'efreets'), ('Дьяволы', 'devils'),
        ],
        'portraitFrames': list(range(44, 58)),
        'legendary': set(),
        'pictogramText': {
            'Адские гончие': 'фигура с закрашенными руками · «=» · фигура с закрашенными ногами · «Искл.» · фигура с закрашенной головой',
            'Ифриты': LEG_OR_LEG_IS_TORSO,
        },
        'epicRangeFixes': {
            'Бесы': {'4-7': {'to': '4-6', 'reason': 'на d6 нет грани 7; вместе с «1-3» покрывает 1–6'}},
        },
        'fixes': [
            {'creature': 'Гоги', 'field': 'specialSkillsRaw',
             'from': 'Стрелок Атакует', 'to': 'Стрелок, Атакует',
             'reason': 'нет разделителя между двумя навыками (у Магогов он есть)'},
            {'creature': 'Магоги', 'field': 'specialSkillsRaw',
             'from': 'Шар,8d6', 'to': 'Шар, 8d6', 'reason': 'нет пробела после запятой'},
            {'creature': 'Султаны Ифриты', 'field': 'specialSkillsRaw',
             'from': 'Щит(3d6)', 'to': 'Щит (3d6)', 'reason': 'нет пробела перед скобкой'},
            {'creature': 'Властилели Пропасти', 'field': 'name',
             'from': 'Властилели', 'to': 'Властители', 'reason': 'орфография'},
        ],
    },
    'necropolis': {
        'pages': (89, 92),
        # Book order == HOMM3 order (ids 56-69), checked portrait by portrait.
        'entries': [
            ('Скелеты', 'skeletons'), ('Живые мертвецы', 'zombies'), ('Духи', 'wights'), ('Вампиры', 'vampires'),
            ('Личи', 'liches'), ('Черные рыцари', 'blackknights'), ('Костяные и призрачные драконы', 'bonedragons'),
        ],
        'portraitFrames': list(range(58, 72)),
        'legendary': set(),
        'pictogramText': {
            'Скелеты': HEAD_EXCLUDED,
            'Живые мертвецы': HEAD_EXCLUDED,
            'Духи': 'фигура с закрашенными ногами · «=» · фигура с закрашенным торсом · ' + HEAD_EXCLUDED,
            'Вампиры': HEAD_EXCLUDED,
            'Личи': HEAD_EXCLUDED,
            'Черные рыцари': HEAD_EXCLUDED,
            'Костяные и призрачные драконы': HEAD_EXCLUDED,
        },
        'fixes': [
            {'entry': 'Духи', 'field': 'epicTable', 'rows': [1, 2],
             'from': 'Атакая', 'to': 'Атакуя', 'reason': 'орфография'},
            {'creature': 'Вампиры', 'field': 'specialSkillsRaw',
             'from': 'Удар2+', 'to': 'Удар 2+', 'reason': 'нет пробела (у Лордов Вампиров он есть)'},
            {'entry': 'Черные рыцари', 'field': 'epicTable', 'rows': [6],
             'from': 'колит', 'to': 'колет', 'reason': 'орфография'},
        ],
    },
    'dungeon': {
        'pages': (93, 96),
        # Book order == HOMM3 order (ids 70-83), checked portrait by portrait.
        'entries': [
            ('Троглодиты', 'troglodytes'), ('Гарпии', 'harpies'), ('Созерцатели', 'beholders'), ('Медузы', 'medusas'),
            ('Минотавр', 'minotaurs'), ('Мантикоры', 'manticores'), ('Красные и чёрные драконы', 'dragons'),
        ],
        'portraitFrames': list(range(72, 86)),
        'legendary': set(),
        'pictogramText': {
            'Созерцатели': 'фигура с закрашенными руками · «+» · фигура с закрашенными ногами · «=» · фигура с закрашенным торсом',
            'Медузы': '«Искл.» · фигура с закрашенным торсом',
            'Минотавр': ARMS_IS_LEGS,
        },
        'fixes': [],
    },
    'citadel': {
        'pages': (97, 100),
        # Book order == HOMM3 order (ids 84-97), checked portrait by portrait.
        'entries': [
            ('Гоблины', 'goblins'), ('Наездники на волках', 'wolfriders'), ('Орки', 'orcs'), ('Огры', 'ogres'),
            ('Рухи', 'rocs'), ('Циклопы', 'cyclopes'), ('Чудища', 'behemoths'),
        ],
        'portraitFrames': list(range(86, 100)),
        # p.99: «Но величественней всех легендарная и таинственная птица
        # грома» — named legendary outright in the prose (docs/rules.md §11).
        'legendary': {'Птицы Грома'},
        'pictogramText': {
            'Рухи': ARMS_IS_LEGS,
        },
        'fixes': [],
    },
    'tower': {
        'pages': (81, 84),
        # (heading, slug) in book order. TwCrPort frame = HOMM3 creature
        # id + 2; Башня is ids 28-41 in exactly the book's order (checked
        # frame by frame against the portraits).
        'entries': [
            ('Гремлины', 'gremlins'), ('Горгульи', 'gargoyles'), ('Големы', 'golems'),
            ('Маги', 'mages'), ('Джинны', 'genies'), ('Наги', 'nagas'), ('Гиганты', 'giants'),
        ],
        'portraitFrames': list(range(30, 44)),
        'legendary': set(),
        # Literal description of what is drawn -- no reading of what it
        # means for "Куда попал" (docs/rules.md §11). "слева/справа" is as
        # seen on the drawing.
        'pictogramText': {
            'Джинны': LEG_OR_LEG_IS_TORSO,
            'Големы': 'фигура с закрашенной головой · «=» · фигура с закрашенным торсом',
            'Наги': '«Искл.» · фигура с закрашенным торсом',
        },
        # Book typos, confirmed against the page image. Applied to the
        # extracted value; each one is listed in docs/rules.md §11.
        'fixes': [
            {'creature': 'Каменные Горгулии', 'field': 'name',
             'from': 'Горгулии', 'to': 'Горгульи',
             'reason': 'в таблице «Горгулии», в заголовке и тексте статьи «Горгульи»'},
            {'creature': 'Обсидиановые Горгулии', 'field': 'name',
             'from': 'Горгулии', 'to': 'Горгульи',
             'reason': 'в таблице «Горгулии», в заголовке и тексте статьи «Горгульи»'},
            {'creature': 'Маги', 'field': 'specialSkillsRaw',
             'from': '4d6,пять зарядов', 'to': '4d6, пять зарядов)',
             'reason': 'не закрыта скобка, нет пробела после запятой'},
            {'creature': 'Архимаги', 'field': 'specialSkillsRaw',
             'from': '5d6,пять зарядов', 'to': '5d6, пять зарядов)',
             'reason': 'не закрыта скобка, нет пробела после запятой'},
            {'entry': 'Джинны', 'field': 'epicTable', 'row': 4,
             'from': 'Хватает противника и рукой и наносит удар второй',
             'to': 'Хватает противника одной рукой и наносит удар второй',
             'reason': 'искажение «и рукой» вместо «одной рукой» (решение Сени)'},
        ],
    },
}

HEADING_SIZE = 22.0
LORE_SIZE = 12.0
EPIC_LABEL = 'Атаки в ближнем бою.'
MARKER_RE = re.compile(r'^(\d)(?:\s*[-–]\s*(\d))?$')
MARKER_WITH_TEXT_RE = re.compile(r'^(\d)(?:\s*[-–]\s*(\d))?\s+(\S.*)$')
STAT_COLUMNS = ['name', 'attack', 'defense', 'damage', 'attacksCount', 'health', 'speed', 'specialSkillsRaw', 'level']


class Flags:
    """Everything a check layer found, with how it was resolved."""

    def __init__(self):
        self.items = []

    def add(self, level, where, message):
        # level: error (unresolved), fixed (resolved by a FACTIONS fix),
        # review (joined/guessed text -- look at the crop), info.
        self.items.append({'level': level, 'where': where, 'message': message})


def join_cell(text):
    """Table-cell text across line breaks: a wrap-hyphen before a
    lowercase letter is a word split (кавалерийс-/кому), before an
    uppercase one it's a real hyphen (Наги-/Королевы)."""
    text = (text or '').strip()
    text = re.sub(r'-\n(?=[а-яё])', '', text)
    text = re.sub(r'-\n(?=[А-ЯЁ])', '-', text)
    return re.sub(r'\s*\n\s*', ' ', text).strip()


def split_skills(raw):
    """Top-level ',' / '.' separate skills; separators inside parentheses
    belong to the skill (Атакует Магией (Цепь Молний 10d6, 1 заряд. ...))."""
    tags, depth, current = [], 0, ''
    for ch in raw:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth = max(0, depth - 1)
        if ch in ',.' and depth == 0:
            if current.strip():
                tags.append(current.strip())
            current = ''
            continue
        current += ch
    if current.strip():
        tags.append(current.strip())
    return tags


def page_lines(page):
    """(bbox, spans) per text line; spans keep font size and boldness."""
    out = []
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines', []):
            spans = [s for s in line['spans'] if s['text'].strip()]
            if spans:
                out.append((pymupdf.Rect(line['bbox']), spans))
    return out


def line_text(spans):
    return ''.join(s['text'] for s in spans).strip()


def is_bold(span):
    return 'Bold' in span['font']


def is_italic(span):
    return 'Italic' in span['font']


def styled(text, bold, italic):
    """Wrap `text` in <strong>/<em>, keeping its own leading/trailing
    whitespace OUTSIDE the tags so the words around it stay separated."""
    lead, core, trail = re.match(r'(\s*)(.*?)(\s*)$', text, re.S).groups()
    core = html_escape(core)
    if core and italic:
        core = f'<em>{core}</em>'
    if core and bold:
        core = f'<strong>{core}</strong>'
    return lead + core + trail


def html_escape(text):
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def lore_html(lines, where, flags):
    """Lore lines -> <p> paragraphs. A first-line indent starts a new
    paragraph; bold spans (the book bolds creature names) stay <strong>.
    Every line-end hyphen join is flagged for a look at the crop."""
    paragraphs, current, left = [], [], min(r.x0 for r, _ in lines)
    for rect, spans in lines:
        if current and rect.x0 > left + 10:
            paragraphs.append(current)
            current = []
        current.append(spans)
    if current:
        paragraphs.append(current)

    html = []
    for para in paragraphs:
        pieces = []  # (text, bold)
        for i, spans in enumerate(para):
            for j, s in enumerate(spans):
                pieces.append([s['text'], (is_bold(s), is_italic(s))])
            if i < len(para) - 1:
                tail = pieces[-1][0].rstrip()
                nxt = line_text(para[i + 1])
                if tail.endswith('-') and nxt[:1].islower():
                    pieces[-1][0] = tail[:-1]
                    flags.add('review', where, f'перенос склеен: «{tail.split()[-1]}{nxt.split()[0]}»')
                else:
                    pieces[-1][0] = tail + ' '
        merged = []
        for text, style in pieces:
            if merged and merged[-1][1] == style:
                merged[-1][0] += text
            else:
                merged.append([text, style])
        body = ''.join(styled(t, *style) for t, style in merged)
        html.append('<p>' + re.sub(r'\s+', ' ', body).strip() + '</p>')
    return html


def pdftotext_numbers(page_no):
    out = subprocess.run(['pdftotext', '-layout', '-enc', 'UTF-8', '-f', str(page_no + 1), '-l', str(page_no + 1), PDF, '-'],
                         capture_output=True, check=True).stdout.decode('utf-8')
    return collections.Counter(int(n) for n in re.findall(r'(?<![\dd])\d+(?![\dd])', out))


def extract_entry(page, heading_rect, heading, next_top, flags, cfg):
    where = f'{heading} (стр. {page.number})'
    lines = page_lines(page)
    band = (heading_rect.y0 - 6, heading_rect.y1 + 6)

    tables = page.find_tables().tables
    stat = next((t for t in tables if heading_rect.y1 < t.bbox[1] < next_top and (t.extract()[0][0] or '') == 'Имя'), None)
    if stat is None:
        flags.add('error', where, 'статблок не найден')
        return None
    rows = stat.extract()
    stat_rect = pymupdf.Rect(stat.bbox)

    # Damage row: the "Урон" label on the heading line, then its frame.
    uron = next((r for r, s in lines if line_text(s) == 'Урон' and band[0] <= (r.y0 + r.y1) / 2 <= band[1] + 10), None)
    damage_row = None
    small = next((t for t in tables if t.extract() and t.extract()[0][0] == 'х0.5'
                  and band[0] - 10 <= t.bbox[1] <= band[1] + 10), None)
    if small:
        damage_row = [int(v) for v in small.extract()[1]]
    elif uron:
        frame = pymupdf.Rect(uron.x1, band[0] - 6, page.rect.x1, band[1] + 10)
        words = [w for w in page.get_text('words') if pymupdf.Rect(w[:4]).intersects(frame) and re.fullmatch(r'\d+', w[4])]
        words.sort(key=lambda w: w[0])
        if len(words) == 3:
            damage_row = [int(w[4]) for w in words]
            flags.add('info', where, 'строка урона взята по координатам (детектор таблиц её не нашёл)')
    if damage_row is None:
        flags.add('error', where, 'строка урона ×0.5/×1/×2 не найдена')

    # Pictogram: vector drawings on the heading line between the title
    # and "Урон".
    right = uron.x0 - 4 if uron else page.rect.x1 * 0.72
    picto_rect = None
    for d in page.get_drawings():
        r = d['rect']
        if r.x0 > heading_rect.x1 + 5 and r.x1 < right and r.y0 >= band[0] - 6 and r.y1 <= band[1] + 6:
            picto_rect = r if picto_rect is None else picto_rect | r
    for r, s in lines:
        if line_text(s) in ('Искл.', 'Или', '=') and picto_rect is not None and band[0] <= (r.y0 + r.y1) / 2 <= band[1] + 6:
            picto_rect |= r
    pictogram = None
    if picto_rect is not None:
        text = cfg['pictogramText'].get(heading)
        if not text:
            flags.add('error', where, 'на странице есть пиктограмма, но нет её описания в FACTIONS.pictogramText')
        pictogram = {'rect': picto_rect + (-4, -4, 4, 4), 'text': text}
    elif heading in cfg['pictogramText']:
        flags.add('error', where, 'в FACTIONS.pictogramText есть описание, а пиктограмма на странице не найдена')

    # Lore: 12pt lines between the heading line and the statblock.
    lore_lines = [(r, s) for r, s in lines
                  if band[1] < (r.y0 + r.y1) / 2 < stat_rect.y0
                  and all(abs(sp['size'] - LORE_SIZE) < 0.6 for sp in s)
                  and not (uron and r.y0 < uron.y1 + 4 and r.x0 >= uron.x0 - 2)]
    lore = lore_html(lore_lines, where, flags) if lore_lines else []
    if not lore:
        flags.add('error', where, 'художественный текст не найден')

    # Epic table: the grey box holding the label, below the statblock.
    label = next(((r, s) for r, s in lines if line_text(s) == EPIC_LABEL and stat_rect.y1 < r.y0 < next_top), None)
    epic = None
    epic_box = None
    if label is None:
        flags.add('error', where, f'подпись «{EPIC_LABEL}» не найдена')
    else:
        lab_rect = label[0]
        # The label's centre, not its whole rect: on p.87 the label pokes
        # 1pt above the box's top edge.
        centre = pymupdf.Point((lab_rect.x0 + lab_rect.x1) / 2, (lab_rect.y0 + lab_rect.y1) / 2)
        boxes = [d['rect'] for d in page.get_drawings() if d.get('fill') and d['rect'].contains(centre)]
        epic_box = min(boxes, key=lambda r: r.width * r.height) if boxes else None
        if epic_box is None:
            flags.add('error', where, 'серая плашка эпик-таблицы не найдена')
        else:
            epic = parse_epic(lines, epic_box, lab_rect, where, flags, cfg.get('epicRangeFixes', {}).get(heading, {}))

    creatures = []
    for row in rows[1:]:
        cells = dict(zip(STAT_COLUMNS, row))
        creature = {'name': join_cell(cells['name']), 'specialSkillsRaw': join_cell(cells['specialSkillsRaw'])}
        for key in ('attack', 'defense', 'damage', 'attacksCount', 'health', 'speed', 'level'):
            value = join_cell(cells[key])
            if not re.fullmatch(r'\d+', value):
                flags.add('error', where, f'{creature["name"]}: «{key}» не целое число: «{value}»')
                creature[key] = None
            else:
                creature[key] = int(value)
        creatures.append(creature)

    top = heading_rect.y0 - 10
    bottom = (epic_box.y1 if epic_box else stat_rect.y1) + 10
    return {
        'heading': heading, 'page': page.number, 'lore': lore, 'damageRow': damage_row,
        'epicTable': epic, 'creatures': creatures, 'pictogram': pictogram,
        'cropRect': pymupdf.Rect(page.rect.x0 + 40, top, page.rect.x1 - 30, bottom),
    }


def parse_epic(lines, box, label_rect, where, flags, range_fixes):
    markers, texts = [], []
    for r, s in lines:
        if not box.contains(r) and not (box & r).get_area() > 0.6 * r.get_area():
            continue
        t = line_text(s)
        if r.x0 < label_rect.x1 and abs(r.y0 - label_rect.y0) < 3:
            continue  # the label itself
        m = MARKER_RE.match(t)
        mt = MARKER_WITH_TEXT_RE.match(t)
        if m:
            markers.append((int(m.group(1)), int(m.group(2) or m.group(1)), (r.y0 + r.y1) / 2))
        elif mt and r.x0 < box.x0 + (box.width * 0.35):
            markers.append((int(mt.group(1)), int(mt.group(2) or mt.group(1)), (r.y0 + r.y1) / 2))
            texts.append(((r.y0 + r.y1) / 2, mt.group(3)))
        elif re.fullmatch(r'[.,·\s]+', t):
            flags.add('info', where, f'в плашке эпик-таблицы отброшен мусорный символ «{t}»')
        else:
            texts.append(((r.y0 + r.y1) / 2, t))

    # Book typos in a range marker itself («4-7» on a d6) — fixed before
    # the coverage check, which would otherwise (rightly) refuse the table.
    for i, (lo, hi, y) in enumerate(markers):
        fix = range_fixes.get(f'{lo}-{hi}')
        if fix:
            new_lo, new_hi = (int(v) for v in fix['to'].split('-'))
            markers[i] = (new_lo, new_hi, y)
            flags.add('fixed', where, f'опечатка книги в диапазоне эпик-таблицы ({fix["reason"]}): «{lo}-{hi}» → «{fix["to"]}»')

    covered = [n for lo, hi, _ in markers for n in range(lo, hi + 1)]
    if sorted(covered) != [1, 2, 3, 4, 5, 6]:
        flags.add('error', where, f'диапазоны эпик-таблицы не покрывают 1–6 ровно по разу: {sorted(covered)}')
        return None

    rows = collections.defaultdict(list)
    for y, t in texts:
        dist = sorted((abs(y - my), i) for i, (_, _, my) in enumerate(markers))
        if len(dist) > 1 and dist[1][0] - dist[0][0] < 2.5:
            flags.add('error', where, f'строка эпик-таблицы на равном расстоянии от двух номеров: «{t}»')
        rows[dist[0][1]].append((y, t))

    table = [None] * 6
    for i, (lo, hi, _) in enumerate(markers):
        parts = [t for _, t in sorted(rows.get(i, []))]
        if not parts:
            flags.add('error', where, f'у номера {lo}–{hi} эпик-таблицы нет текста')
            continue
        text = parts[0]
        for p in parts[1:]:
            if text.endswith('-') and p[:1].islower():
                text = text[:-1] + p
            else:
                text = text + ' ' + p
        if len(parts) > 1:
            flags.add('review', where, f'строка эпик-таблицы {lo}–{hi} собрана из {len(parts)} строк: «{text}»')
        for n in range(lo, hi + 1):
            table[n - 1] = text
    return table


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('faction', choices=sorted(FACTIONS))
    ap.add_argument('--review', help='directory for per-entry crops + flags.json (not source)')
    args = ap.parse_args()
    cfg = FACTIONS[args.faction]
    flags = Flags()
    doc = pymupdf.open(PDF)

    # Top-to-bottom within each page: the PDF's own text order is not
    # (p.86 lists «Демоны» before «Адские гончие», which sits above it), and
    # each entry is bounded by the NEXT heading on its page.
    headings = []
    for page_no in range(cfg['pages'][0], cfg['pages'][1] + 1):
        page = doc[page_no]
        found = sorted(((page_no, r, line_text(s)) for r, s in page_lines(page)
                        if all(is_bold(sp) and abs(sp['size'] - HEADING_SIZE) < 0.6 for sp in s)),
                       key=lambda h: h[1].y0)
        # A heading can wrap onto a second line (p.92 «Костяные» / «и
        # призрачные драконы»): lines closer than a line gap are one heading.
        for h in found:
            if headings and headings[-1][0] == page_no and h[1].y0 - headings[-1][1].y1 < 6:
                prev = headings.pop()
                h = (page_no, prev[1] | h[1], f'{prev[2]} {h[2]}')
            headings.append(h)
    expected = [h for h, _ in cfg['entries']]
    if [h for _, _, h in headings] != expected:
        flags.add('error', args.faction, f'заголовки не совпали с FACTIONS: {[h for _, _, h in headings]}')
        print(json.dumps(flags.items, ensure_ascii=False, indent=1))
        sys.exit(1)

    entries = []
    for i, (page_no, rect, heading) in enumerate(headings):
        page = doc[page_no]
        next_top = headings[i + 1][1].y0 if i + 1 < len(headings) and headings[i + 1][0] == page_no else page.rect.y1
        entry = extract_entry(page, rect, heading, next_top, flags, cfg)
        if entry:
            entry['slug'] = dict(cfg['entries'])[heading]
            entries.append(entry)

    creatures_flat = [c for e in entries for c in e['creatures']]
    if len(creatures_flat) != len(cfg['portraitFrames']):
        flags.add('error', args.faction, f'существ {len(creatures_flat)}, кадров портретов {len(cfg["portraitFrames"])}')

    # Fixes (book typos), then derived fields. A fix names either a
    # creature (statblock fields) or an entry + epic row (shared table).
    for fix in cfg['fixes']:
        if 'entry' in fix:
            # One book row can fill several of the 6 d6 rows ("1-3"), so a
            # fix lists every row it covers; `from` is a substring.
            entry = next((e for e in entries if e['heading'] == fix['entry']), None)
            rows = entry and entry['epicTable']
            numbers = fix.get('rows') or [fix['row']]
            if not rows or any(fix['from'] not in rows[n - 1] for n in numbers):
                flags.add('error', fix['entry'], f'исправление строк {numbers} не применилось: «{fix["from"]}» не найдено')
                continue
            for n in numbers:
                rows[n - 1] = rows[n - 1].replace(fix['from'], fix['to'])
            flags.add('fixed', fix['entry'], f'опечатка книги ({fix["reason"]}), эпик {numbers}: «{fix["from"]}» → «{fix["to"]}»')
            continue
        target = next((c for c in creatures_flat if c['name'] == fix['creature']), None)
        if target is None or fix['from'] not in target[fix['field']]:
            flags.add('error', fix['creature'], f'исправление не применилось: «{fix["from"]}» не найдено')
            continue
        target[fix['field']] = target[fix['field']].replace(fix['from'], fix['to'])
        flags.add('fixed', fix['creature'], f'опечатка книги ({fix["reason"]}): «{fix["from"]}» → «{fix["to"]}»')

    frames = iter(cfg['portraitFrames'])
    for e in entries:
        where = f'{e["heading"]} (стр. {e["page"]})'
        d = e['creatures'][0]['damage']
        if e['damageRow'] and d is not None and e['damageRow'] != [d // 2, d, d * 2]:
            flags.add('error', where, f'строка урона {e["damageRow"]} не равна floor(d/2), d, 2d для урона {d}')
        for c in e['creatures']:
            raw = c['specialSkillsRaw']
            if raw.count('(') != raw.count(')'):
                flags.add('error', where, f'{c["name"]}: скобки в особых навыках не сбалансированы: «{raw}»')
            c['specialSkills'] = split_skills(raw)
            c['legendary'] = c['name'] in cfg['legendary']
            c['portraitFrame'] = next(frames, None)

    # Layer 2: numbers must also occur in plain text of the same page.
    by_page = collections.defaultdict(collections.Counter)
    for e in entries:
        nums = [c[k] for c in e['creatures'] for k in ('attack', 'defense', 'damage', 'attacksCount', 'health', 'speed', 'level') if c[k] is not None]
        by_page[e['page']].update(nums + (e['damageRow'] or []))
    for page_no, needed in by_page.items():
        have = pdftotext_numbers(page_no)
        missing = needed - have
        if missing:
            flags.add('error', f'стр. {page_no}', f'числа из таблиц не найдены в тексте страницы: {dict(missing)}')

    # Pictogram crops -> assets/bestiary, same naming as the faction data.
    os.makedirs(PICTOGRAM_DIR, exist_ok=True)
    for e in entries:
        if e['pictogram']:
            name = f'{args.faction}-{e["slug"]}-pictogram.png'
            doc[e['page']].get_pixmap(dpi=200, clip=e['pictogram']['rect']).save(os.path.join(PICTOGRAM_DIR, name))
            e['pictogram'] = {'img': PICTOGRAM_SRC.format(name), 'text': e['pictogram']['text']}

    if args.review:
        os.makedirs(args.review, exist_ok=True)
        for e in entries:
            doc[e['page']].get_pixmap(dpi=130, clip=e['cropRect']).save(os.path.join(args.review, f'{args.faction}-{e["slug"]}.png'))
        with open(os.path.join(args.review, f'{args.faction}-flags.json'), 'w', encoding='utf-8') as f:
            json.dump(flags.items, f, ensure_ascii=False, indent=1)

    out = {
        'faction': args.faction,
        'source': 'OKP_Heroes_Glory_v2_1.pdf',
        'entries': [{
            'heading': e['heading'], 'slug': e['slug'], 'page': e['page'], 'damageRow': e['damageRow'],
            'epicTable': e['epicTable'], 'pictogram': e['pictogram'], 'lore': e['lore'],
            'creatures': [{
                'name': c['name'], 'attack': c['attack'], 'defense': c['defense'], 'damage': c['damage'],
                'attacksCount': c['attacksCount'], 'health': c['health'], 'speed': c['speed'], 'level': c['level'],
                'specialSkills': c['specialSkills'], 'legendary': c['legendary'],
                'img': PORTRAIT_SRC.format(c['portraitFrame']) if c['portraitFrame'] is not None else None,
            } for c in e['creatures']],
        } for e in entries],
    }
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(os.path.join(DATA_DIR, f'{args.faction}.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write('\n')

    counts = collections.Counter(i['level'] for i in flags.items)
    print(f'{args.faction}: {len(entries)} статей, {len(creatures_flat)} существ; флаги: {dict(counts)}')
    for item in flags.items:
        print(f'  [{item["level"]}] {item["where"]}: {item["message"]}')
    if counts.get('error'):
        sys.exit(1)


if __name__ == '__main__':
    main()
