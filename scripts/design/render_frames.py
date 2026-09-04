#!/usr/bin/env python3
"""Render DeeYoung Pro UI/UX design frames (HTML -> 1920x1080 PNG)."""
from pathlib import Path
from playwright.sync_api import sync_playwright

SRC = Path("/home/z/my-project/scripts/design")
OUT = Path("/home/z/my-project/download/design-frames")
OUT.mkdir(parents=True, exist_ok=True)

SCENES = [
    ("scene1-site-layout.html", "01-site-layout.png"),
    ("scene2-loop.html", "02-how-it-works-loop.png"),
    ("scene3-dashboard.html", "03-terminal-dashboard.png"),
    ("scene4-tradedesk.html", "04-trade-desk-ai-analyst.png"),
    ("scene5-engine.html", "05-paper-engine-venue-ladder.png"),
    ("scene6-sentinel.html", "06-sentinel-safety.png"),
    ("scene7-mobile.html", "07-mobile-layout.png"),
    ("scene8-architecture.html", "08-architecture.png"),
]

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
    for src, dst in SCENES:
        page.goto(f"file://{SRC / src}")
        page.wait_for_timeout(350)
        page.screenshot(path=str(OUT / dst))
        print(f"rendered {dst}")
    browser.close()
print("done ->", OUT)
