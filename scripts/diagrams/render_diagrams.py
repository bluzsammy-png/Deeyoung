import asyncio
import os
from playwright.async_api import async_playwright

FIGS = [
    ("fig-system.html", "fig-system.png", 1680),
    ("fig-datamodel.html", "fig-datamodel.png", 1620),
    ("fig-providers.html", "fig-providers.png", 1680),
    ("fig-analytics.html", "fig-analytics.png", 1680),
    ("fig-sentinel.html", "fig-sentinel.png", 1680),
    ("fig-notifications.html", "fig-notifications.png", 1680),
]

SRC = "/home/z/my-project/scripts/diagrams"
OUT = "/home/z/my-project/audit/diagrams"


async def render(page, src, out, width):
    await page.goto(f"file://{src}", wait_until="networkidle")
    await page.wait_for_timeout(400)
    el = page.locator("#root")
    bbox = await el.bounding_box()
    if bbox:
        fit_w = max(width, int(bbox["width"] + 100))
        fit_h = int(bbox["height"] + 100)
        await page.set_viewport_size({"width": fit_w, "height": fit_h})
        await page.wait_for_timeout(250)
    await el.screenshot(path=out)
    print(f"OK {os.path.basename(out)} ({os.path.getsize(out)/1024:.0f} KB, bbox {bbox['width']:.0f}x{bbox['height']:.0f})")


async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(
            viewport={"width": 1680, "height": 900}, device_scale_factor=2
        )
        for src_name, out_name, width in FIGS:
            await render(page, os.path.join(SRC, src_name), os.path.join(OUT, out_name), width)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
