#!/usr/bin/env python3
r"""
build_faction_art.py — картинки фракций и классов для пикеров и темы городов (docs/rules.md §2.7).

Пишет (из корня репозитория):
  assets/factions/town/<фракция>.png      плитка списка фракций: портрет города с фортом
                                          (ITPT.def, 58×64) → xBRZ ×3 с --pad, 174×192
  assets/factions/backdrop/<фракция>.png  экран подтверждения фракции: фон окна существа
                                          (CRBKG*.bmp, 100×130) → xBRZ ×3 с --pad, 300×390
  assets/classes/<класс>.png              портрет героя класса (HPL*.bmp, 58×64) → xBRZ ×3 с --pad
  assets/music/<фракция>.mp3              тема города: MP3 96 кбит/с, стерео, 44,1 кГц, без тегов

Источники — файлы игры, только читаются:
  --data  распакованные архивы: D:\HOMM3_Extracted\Unpacked_20260802_133005\Data
          (h3bitmap, h3ab_bmp, H3ab_spr; у Причала — HotA_1.8: файлы HotA лежат под хешами,
          настоящих имён в HotA.lod нет — хеши записаны ниже, опознаны по виду и размеру)
  --mp3   папка Mp3 установленной игры: D:\Games\Heroes of Might and Magic III Complete\Mp3

Повторный прогон с теми же Pillow, xbrz.py и ffmpeg даёт те же файлы (PNG без метаданных,
MP3 с -fflags/-flags +bitexact и без тегов).

xBRZ — пакет «xbrz.py», нужен Python 3.9 (как у scripts/upscale_icons.py, см. его шапку):

    %USERPROFILE%\.venvs\xbrz\Scripts\python scripts/build_faction_art.py
    ... --only images | --only music
"""
import argparse
import contextlib
import io
import os
import shutil
import subprocess
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..'))
sys.path.insert(0, HERE)
import def2png  # noqa: E402
import h3pcx2png  # noqa: E402
import upscale_icons  # noqa: E402

DATA = r'D:\HOMM3_Extracted\Unpacked_20260802_133005\Data'
MP3 = r'D:\Games\Heroes of Might and Magic III Complete\Mp3'

# HotA_1.8 — файлы Причала (Cove) под хешами распаковки.
HOTA_ITPT = r'HotA_1.8\03_Raw_DEF\a94f8dd3a046d52e5112d4f45d7f2010.def'   # ITPT HotA, 48 кадров
HOTA_CRBKG_COVE = r'HotA_1.8\01_Raw_PCX\df1961697cfe7204e49f41c791999618.pcx'
HOTA_HPL = {
    'captain': r'HotA_1.8\01_Raw_PCX\c93b80f659e6e87b4b9310ee0c8e7bbe.pcx',
    'navigator': r'HotA_1.8\01_Raw_PCX\d6966575200780128d520cb2a82f962a.pcx',
}

# Фракция проекта → (кадр ITPT «с фортом», файл ITPT, фон существа, тема).
# Кадры ITPT: город N — 2N (2N+1 — «построено в этот ход», с красным крестом); у HotA
# тот же порядок, Причал — 9-й город. Оплот — Rampart, Цитадель — Stronghold,
# Сопряжение — Conflux, Причал — Cove (HotA).
FACTIONS = {
    'castle': (0, r'H3ab_spr\ITPT.def', r'h3bitmap\CRBKGCAS.bmp', 'CstleTown.mp3'),
    'stronghold': (2, r'H3ab_spr\ITPT.def', r'h3bitmap\CRBKGRAM.bmp', 'RAMPART.MP3'),
    'tower': (4, r'H3ab_spr\ITPT.def', r'h3bitmap\CRBKGTOW.bmp', 'TowerTown.mp3'),
    'inferno': (6, r'H3ab_spr\ITPT.def', r'h3bitmap\CRBKGINF.bmp', 'InfernoTown.mp3'),
    'necropolis': (8, r'H3ab_spr\ITPT.def', r'h3bitmap\CRBKGNEC.bmp', 'necroTown.mp3'),
    'dungeon': (10, r'H3ab_spr\ITPT.def', r'h3bitmap\CRBKGDUN.bmp', 'DUNGEON.MP3'),
    'citadel': (12, r'H3ab_spr\ITPT.def', r'h3bitmap\CRBKGSTR.bmp', 'StrongHold.mp3'),
    'fortress': (14, r'H3ab_spr\ITPT.def', r'h3bitmap\CRBKGFOR.bmp', 'FortressTown.mp3'),
    'nexus': (16, r'H3ab_spr\ITPT.def', r'h3bitmap\CrBkgEle.bmp', 'ElemTown.mp3'),
    'haven': (18, HOTA_ITPT, HOTA_CRBKG_COVE, 'CoveTown.mp3'),
}

# Класс → портрет героя HOMM3 (h3ab_bmp\HPL###<код класса>.bmp); Капитан и Навигатор — HotA.
CLASSES = {
    'knight': r'h3ab_bmp\HPL000Kn.bmp',
    'cleric': r'h3ab_bmp\HPL008Cl.bmp',
    'ranger': r'h3ab_bmp\HPL016Rn.bmp',
    'druid': r'h3ab_bmp\HPL024Dr.bmp',
    'alchemist': r'h3ab_bmp\HPL032Al.bmp',
    'mage': r'h3ab_bmp\HPL040Wz.bmp',
    'heretic': r'h3ab_bmp\HPL048Hr.bmp',
    'possessed': r'h3ab_bmp\HPL056Dm.bmp',
    'deathKnight': r'h3ab_bmp\HPL064Dk.bmp',
    'necromancer': r'h3ab_bmp\HPL072Nc.bmp',
    'lord': r'h3ab_bmp\HPL080Ov.bmp',
    'warlock': r'h3ab_bmp\HPL088Wl.bmp',
    'barbarian': r'h3ab_bmp\HPL096Br.bmp',
    'battlemage': r'h3ab_bmp\HPL104Bm.bmp',
    'beastmaster': r'h3ab_bmp\HPL112Bs.bmp',
    'witch': r'h3ab_bmp\HPL120Wh.bmp',
    'wanderer': r'h3ab_bmp\HPL000PL.bmp',
    'elementalist': r'h3ab_bmp\HPL000EL.bmp',
    **HOTA_HPL,
}


def load(data, rel, frame=None):
    """An image from the game files: .bmp, HOMM3/HotA .pcx, or a .def frame."""
    path = os.path.join(data, rel)
    ext = os.path.splitext(path)[1].lower()
    if ext == '.def':
        palette, frames = def2png.read_def(path)
        return def2png.frame_to_image(frames[frame], palette)
    if ext == '.pcx':
        with contextlib.redirect_stdout(io.StringIO()):
            bpp, w, h, raw = h3pcx2png.probe(path)
        if bpp != 8:
            raise ValueError(f'{rel}: expected an 8-bit PCX, got {bpp}')
        img = Image.frombytes('P', (w, h), raw[12:12 + w * h])
        img.putpalette(list(raw[12 + w * h:12 + w * h + 768]))
        return img.convert('RGBA')
    return Image.open(path).convert('RGBA')


def xbrz3(img):
    return upscale_icons._padded(upscale_icons._xbrz, img, 3)


def save_png(img, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    img.save(dest, 'PNG', optimize=True)
    print(f'{os.path.relpath(dest, ROOT)}  {img.width}x{img.height}  {os.path.getsize(dest)} bytes')


def build_images(data):
    for key, (frame, itpt, crbkg, _) in FACTIONS.items():
        save_png(xbrz3(load(data, itpt, frame)), os.path.join(ROOT, 'assets', 'factions', 'town', f'{key}.png'))
        save_png(xbrz3(load(data, crbkg)), os.path.join(ROOT, 'assets', 'factions', 'backdrop', f'{key}.png'))
    for key, rel in CLASSES.items():
        save_png(xbrz3(load(data, rel)), os.path.join(ROOT, 'assets', 'classes', f'{key}.png'))


def build_music(mp3, ffmpeg):
    out = os.path.join(ROOT, 'assets', 'music')
    os.makedirs(out, exist_ok=True)
    for key, (_, _, _, name) in FACTIONS.items():
        dest = os.path.join(out, f'{key}.mp3')
        subprocess.run([ffmpeg, '-loglevel', 'error', '-y', '-i', os.path.join(mp3, name),
                        '-map', '0:a', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact',
                        '-c:a', 'libmp3lame', '-b:a', '96k', '-ac', '2', '-ar', '44100', dest], check=True)
        print(f'{os.path.relpath(dest, ROOT)}  <- {name}  {os.path.getsize(dest)} bytes')


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--data', default=DATA)
    p.add_argument('--mp3', default=MP3)
    p.add_argument('--ffmpeg', default=shutil.which('ffmpeg') or 'ffmpeg')
    p.add_argument('--only', choices=['images', 'music'])
    a = p.parse_args(argv)
    if a.only != 'music':
        build_images(a.data)
    if a.only != 'images':
        build_music(a.mp3, a.ffmpeg)


if __name__ == '__main__':
    main()
