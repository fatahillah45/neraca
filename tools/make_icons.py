"""Membuat ikon aplikasi Neraca (PNG) dengan Pillow.

Pemakaian: python tools/make_icons.py
Desain: latar gelap, tiga batang (pemasukan, pengeluaran, investasi) di atas garis dasar.
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'app' / 'icons'
BG = (17, 20, 24, 255)
CARD = (26, 31, 38, 255)
GREEN = (63, 179, 127, 255)
RED = (226, 118, 109, 255)
BLUE = (79, 155, 232, 255)
LINE = (233, 237, 242, 255)


def draw(size, maskable=False):
    s = 4  # supersampling agar tepi halus
    W = size * s
    img = Image.new('RGBA', (W, W), BG if maskable else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if not maskable:
        d.rounded_rectangle([0, 0, W - 1, W - 1], radius=int(W * 0.22), fill=BG)
    # Zona aman maskable: 80% tengah.
    pad = W * (0.26 if maskable else 0.2)
    left, right = pad, W - pad
    base = W - pad
    top = pad
    bw = (right - left) / 5
    heights = [0.62, 0.38, 0.88]
    colors = [GREEN, RED, BLUE]
    for i, (h, c) in enumerate(zip(heights, colors)):
        x0 = left + bw * (i * 2 - 0.0) + bw * 0.0
        x0 = left + i * bw * 2
        y0 = base - (base - top) * h
        d.rounded_rectangle([x0, y0, x0 + bw, base], radius=int(bw * 0.28), fill=c)
    d.rounded_rectangle([left - bw * 0.3, base + W * 0.025, right + bw * 0.3, base + W * 0.055], radius=int(W * 0.015), fill=LINE)
    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    draw(192).save(OUT / 'icon-192.png')
    draw(512).save(OUT / 'icon-512.png')
    draw(512, maskable=True).save(OUT / 'icon-maskable-512.png')
    print('Ikon dibuat di', OUT)


if __name__ == '__main__':
    main()
