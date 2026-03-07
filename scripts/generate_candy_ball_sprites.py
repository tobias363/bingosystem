#!/usr/bin/env python3
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path("/Users/tobiashaugen/Projects/Bingo")
OUTPUT_DIR = ROOT / "Candy/Assets/Resources/CandyBallSprites"
META_TEMPLATE_PATH = OUTPUT_DIR / "60_turquoise.png.meta"
SIZE = 600
BALL_BOUNDS = (40, 40, SIZE - 40, SIZE - 40)
FONT_PATHS = [
    Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
    Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
]
PALETTE = {
    "blue": ((25, 90, 220), (100, 200, 255)),
    "red": ((190, 50, 55), (255, 110, 110)),
    "green": ((30, 165, 60), (120, 235, 120)),
    "purple": ((150, 65, 190), (235, 120, 255)),
    "turquoise": ((20, 205, 190), (120, 255, 245)),
}
COLOR_ORDER = ["blue", "red", "green", "purple", "turquoise"]


def resolve_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_PATHS:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def lerp_color(start: tuple[int, int, int], end: tuple[int, int, int], t: float) -> tuple[int, int, int, int]:
    return tuple(
        int(start[channel] + (end[channel] - start[channel]) * t)
        for channel in range(3)
    ) + (255,)


def build_ball_base(number: int) -> Image.Image:
    key = COLOR_ORDER[(number - 1) % len(COLOR_ORDER)]
    edge_color, center_color = PALETTE[key]
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.ellipse((68, 84, SIZE - 20, SIZE - 8), fill=(0, 0, 0, 85))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    image.alpha_composite(shadow)

    pixels = image.load()
    center_x = SIZE / 2
    center_y = SIZE / 2
    radius = (BALL_BOUNDS[2] - BALL_BOUNDS[0]) / 2
    for y in range(SIZE):
        for x in range(SIZE):
            dx = x - center_x
            dy = y - center_y
            distance = math.sqrt(dx * dx + dy * dy)
            if distance > radius:
                continue

            nx = dx / radius
            ny = dy / radius
            highlight = max(0.0, 1.0 - math.sqrt((nx + 0.28) ** 2 + (ny + 0.36) ** 2))
            radial = min(1.0, distance / radius)
            mix = max(0.0, min(1.0, radial * 0.85))
            base = lerp_color(center_color, edge_color, mix)
            boost = 0.22 * (highlight ** 2)
            pixels[x, y] = tuple(
                min(255, int(base[channel] * (1.0 + boost)))
                for channel in range(3)
            ) + (255,)

    draw = ImageDraw.Draw(image)
    draw.ellipse(BALL_BOUNDS, outline=(255, 255, 255, 110), width=8)
    draw.arc((58, 56, SIZE - 58, SIZE - 52), start=206, end=334, fill=(255, 255, 255, 85), width=12)
    draw.arc((64, 72, SIZE - 86, SIZE - 112), start=198, end=270, fill=(255, 255, 255, 78), width=10)
    draw.ellipse((112, 112, 248, 196), fill=(255, 255, 255, 76))
    draw.ellipse((140, 130, 222, 178), fill=(255, 255, 255, 42))

    sparkle_points = [
        (106, 146),
        (166, 98),
        (454, 124),
        (490, 214),
        (136, 454),
        (452, 432),
    ]
    for x, y in sparkle_points:
        draw.ellipse((x - 5, y - 5, x + 5, y + 5), fill=(255, 255, 255, 120))
    return image


def draw_number(ball: Image.Image, number: int) -> Image.Image:
    image = ball.copy()
    draw = ImageDraw.Draw(image)
    label = str(number)
    font_size = 242 if number < 10 else 214
    font = resolve_font(font_size)

    while True:
        bbox = draw.textbbox((0, 0), label, font=font)
        width = bbox[2] - bbox[0]
        if width <= 344 or font_size <= 140:
            break
        font_size -= 8
        font = resolve_font(font_size)

    bbox = draw.textbbox((0, 0), label, font=font)
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    x = (SIZE - width) / 2 - bbox[0]
    y = (SIZE - height) / 2 - bbox[1] + 26

    shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.text((x + 10, y + 12), label, font=font, fill=(60, 70, 78, 110))
    shadow = shadow.filter(ImageFilter.GaussianBlur(6))
    image.alpha_composite(shadow)

    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.text((x, y), label, font=font, fill=(255, 255, 255, 160))
    glow = glow.filter(ImageFilter.GaussianBlur(2))
    image.alpha_composite(glow)

    draw = ImageDraw.Draw(image)
    draw.text((x, y), label, font=font, fill=(245, 246, 250, 255))
    return image


def ensure_missing_ball_sprite(number: int) -> bool:
    color_key = COLOR_ORDER[(number - 1) % len(COLOR_ORDER)]
    output_path = OUTPUT_DIR / f"{number:02d}_{color_key}.png"
    created = False
    if not output_path.exists():
        output_path.parent.mkdir(parents=True, exist_ok=True)
        draw_number(build_ball_base(number), number).save(output_path)
        created = True

    ensure_sprite_meta(output_path)
    return created


def ensure_sprite_meta(output_path: Path) -> None:
    template_path = META_TEMPLATE_PATH
    meta_path = output_path.with_suffix(output_path.suffix + ".meta")
    if not template_path.exists() or not meta_path.exists():
        return

    template_lines = template_path.read_text().splitlines()
    meta_lines = meta_path.read_text().splitlines()
    if len(template_lines) < 2 or len(meta_lines) < 2:
        return

    current_guid = meta_lines[1]
    rebuilt = [template_lines[0], current_guid] + template_lines[2:]
    meta_path.write_text("\n".join(rebuilt) + "\n")


def main() -> None:
    created = []
    for ball_number in range(1, 76):
        if ensure_missing_ball_sprite(ball_number):
            created.append(ball_number)

    if created:
        print("created", ",".join(str(number) for number in created))
    else:
        print("created none")


if __name__ == "__main__":
    main()
