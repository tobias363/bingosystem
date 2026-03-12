#!/usr/bin/env python3
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image


@dataclass(frozen=True)
class ControlSpec:
    source_name: str
    output_name: str
    rect: tuple[int, int, int, int]


ROOT = Path(__file__).resolve().parents[1] / "Candy" / "Assets" / "Resources" / "Theme1" / "Controls"

SPECS: tuple[ControlSpec, ...] = (
    ControlSpec("Theme1PlaceBetButton.png", "Theme1PlaceBetButtonShell.png", (860, 450, 2570, 710)),
    ControlSpec("Theme1NextDrawBannerShell.png", "Theme1NextDrawBannerBase.png", (1080, 400, 2310, 830)),
    ControlSpec("Theme1StakePanelShell.png", "Theme1StakePanelBase.png", (1080, 150, 1590, 300)),
    ControlSpec("Theme1SaldoPanel.png", "Theme1SaldoPanelBase.png", (635, 135, 955, 255)),
    ControlSpec("Theme1GevinstPanel.png", "Theme1GevinstPanelBase.png", (635, 140, 1045, 260)),
)


def clamp(value: int, lower: int, upper: int) -> int:
    return max(lower, min(value, upper))


def lerp_color(left: tuple[int, int, int, int], right: tuple[int, int, int, int], t: float) -> tuple[int, int, int, int]:
    return tuple(int(round(left[i] + (right[i] - left[i]) * t)) for i in range(4))


def read_with_fallback(pixels, x: int, y: int, width: int, height: int, dx: int, dy: int) -> tuple[int, int, int, int]:
    px = clamp(x, 0, width - 1)
    py = clamp(y, 0, height - 1)
    color = pixels[px, py]
    if color[3] > 0:
        return color

    search_x = px
    search_y = py
    for _ in range(max(width, height)):
        search_x = clamp(search_x + dx, 0, width - 1)
        search_y = clamp(search_y + dy, 0, height - 1)
        color = pixels[search_x, search_y]
        if color[3] > 0:
            return color

    return pixels[px, py]


def fill_rect(image: Image.Image, rect: tuple[int, int, int, int]) -> Image.Image:
    pixels = image.load()
    width, height = image.size
    x0, y0, x1, y1 = rect

    for y in range(y0, y1):
        left = read_with_fallback(pixels, x0 - 1, y, width, height, -1, 0)
        right = read_with_fallback(pixels, x1, y, width, height, 1, 0)
        for x in range(x0, x1):
            top = read_with_fallback(pixels, x, y0 - 1, width, height, 0, -1)
            bottom = read_with_fallback(pixels, x, y1, width, height, 0, 1)

            tx = 0.5 if x1 == x0 else (x - x0) / float(x1 - x0)
            ty = 0.5 if y1 == y0 else (y - y0) / float(y1 - y0)
            horizontal = lerp_color(left, right, tx)
            vertical = lerp_color(top, bottom, ty)
            pixels[x, y] = tuple((horizontal[i] + vertical[i]) // 2 for i in range(4))

    return image


def main() -> None:
    generated: list[str] = []
    for spec in SPECS:
        source_path = ROOT / spec.source_name
        output_path = ROOT / spec.output_name
        image = Image.open(source_path).convert("RGBA")
        fill_rect(image, spec.rect)
        image.save(output_path)
        generated.append(spec.output_name)

    print("Generated textless Theme1 controls:")
    for name in generated:
        print(f" - {name}")


if __name__ == "__main__":
    main()
