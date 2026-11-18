"""
Generate the extension icons from the Leepaak logo.

The source logo is black-on-white with a coral sparkle. We key the white
background out, recolour the dark mark to white and the sparkle to the brand
coral, then compose both onto a rounded tile using the brand blue.

    python tools/make_icons.py

Requires Pillow.
"""

import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "leepaak-logo.webp")
OUT_DIR = os.path.join(ROOT, "icons")

# Brand tokens pulled from leepaak.ir's own stylesheet.
BLUE_TOP = (83, 72, 245)      # #5348F5
BLUE_BOTTOM = (58, 46, 220)   # #3A2EDC
CORAL = (238, 103, 90)        # #EE675A
CORAL_G = 103                 # green channel of CORAL, used to recover alpha

SS = 512           # supersampled tile size
RADIUS = 0.225     # corner radius as a fraction of the tile
SPARKLE_MIN_SAT = 60  # saturation above which a pixel counts as the sparkle

# The mark is detailed, so small tiles get a tighter crop to stay legible
# once Chrome downscales them into the toolbar.
MARK_SCALE = {16: 0.84, 48: 0.72, 128: 0.66}


def split_layers(src):
    """Return (white_alpha, coral_alpha) masks derived from the source logo."""
    src = src.convert("RGB")
    w, h = src.size
    px = src.load()

    white = Image.new("L", (w, h), 0)
    coral = Image.new("L", (w, h), 0)
    wp, cp = white.load(), coral.load()

    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            sat = max(r, g, b) - min(r, g, b)
            if sat > SPARKLE_MIN_SAT:
                # Coloured pixel: the coral sparkle. Alpha from how far the
                # green channel has moved away from white.
                a = (255 - g) * 255 // (255 - CORAL_G)
                cp[x, y] = max(0, min(255, a))
            else:
                # Greyscale pixel: the black mark. Alpha from darkness.
                lum = 0.299 * r + 0.587 * g + 0.114 * b
                wp[x, y] = max(0, min(255, round(255 - lum)))
    return white, coral


def trimmed_bounds(*masks):
    box = None
    for m in masks:
        b = m.getbbox()
        if not b:
            continue
        box = b if box is None else (
            min(box[0], b[0]), min(box[1], b[1]),
            max(box[2], b[2]), max(box[3], b[3]),
        )
    return box


def build_mark(white, coral, box):
    """White mark + coral sparkle on transparency, trimmed to `box`."""
    w = box[2] - box[0]
    h = box[3] - box[1]
    mark = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    layer = Image.new("RGBA", (w, h), (255, 255, 255, 255))
    layer.putalpha(white.crop(box))
    mark.alpha_composite(layer)

    layer = Image.new("RGBA", (w, h), CORAL + (255,))
    layer.putalpha(coral.crop(box))
    mark.alpha_composite(layer)

    return mark


def build_tile(size):
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    grad = Image.new("RGBA", (1, size))
    gp = grad.load()
    for y in range(size):
        t = y / max(1, size - 1)
        gp[0, y] = (
            round(BLUE_TOP[0] + (BLUE_BOTTOM[0] - BLUE_TOP[0]) * t),
            round(BLUE_TOP[1] + (BLUE_BOTTOM[1] - BLUE_TOP[1]) * t),
            round(BLUE_TOP[2] + (BLUE_BOTTOM[2] - BLUE_TOP[2]) * t),
            255,
        )
    grad = grad.resize((size, size))

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=int(size * RADIUS), fill=255
    )
    tile.paste(grad, (0, 0), mask)
    return tile


def fit(mark, target):
    mw, mh = mark.size
    scale = min(target / mw, target / mh)
    return mark.resize(
        (max(1, int(round(mw * scale))), max(1, int(round(mh * scale)))),
        Image.LANCZOS,
    )


def compose_tile(mark, size, scale_factor):
    tile = build_tile(size)
    resized = fit(mark, int(size * scale_factor))
    tile.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return tile


def compose_mark_only(mark, size):
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    resized = fit(mark, int(size * 0.94))
    out.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return out


def main():
    if not os.path.exists(SRC):
        raise SystemExit("source logo not found: " + SRC)
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)

    white, coral = split_layers(Image.open(SRC))
    box = trimmed_bounds(white, coral)
    if not box:
        raise SystemExit("could not separate the logo layers")
    mark = build_mark(white, coral, box)

    for size in (16, 48, 128):
        compose_tile(mark, SS, MARK_SCALE[size]).resize((size, size), Image.LANCZOS).save(
            os.path.join(OUT_DIR, "icon%d.png" % size)
        )

    # Larger copies for the README and the popup header.
    compose_tile(mark, SS, MARK_SCALE[128]).resize((256, 256), Image.LANCZOS).save(
        os.path.join(ROOT, "docs", "icon.png")
    )
    compose_mark_only(mark, SS).resize((128, 128), Image.LANCZOS).save(
        os.path.join(OUT_DIR, "mark.png")
    )

    print("icons written to", OUT_DIR)
    for f in sorted(os.listdir(OUT_DIR)):
        print("  ", f)


if __name__ == "__main__":
    main()
