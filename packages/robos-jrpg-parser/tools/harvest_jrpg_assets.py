#!/usr/bin/env python3
"""
Reusable multi-source asset harvester for classic JRPGs (NES/SNES/GBA).

Discovers and downloads:
  1. 1:1 pixel map PNGs from a VGMaps console index page (URL or local HTML file)
     matching --map-prefix (e.g. "FinalFantasy-", "DragonWarrior-", "ChronoTrigger-").
  2. StrategyWiki guide sub-pages (Walkthrough, Enemies, Weapons, Armor, Shops, Spells,
     Classes, Locations) for --wiki-slug (e.g. "Final_Fantasy").
  3. Any extra direct URLs passed via --extra-url.

Writes:
  - <out-dir>/sources-manifest.json  (discovered URLs and target paths)
  - <out-dir>/download-receipt.json  (SHA-256 hashes, byte sizes, and PNG dimensions)
"""

import argparse
import hashlib
import json
import os
import struct
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

DEFAULT_WIKI_SUBPAGES = [
    "Table_of_Contents",
    "Walkthrough",
    "Enemies",
    "Bosses",
    "Weapons",
    "Armor",
    "Items",
    "Key_items",
    "White_magic",
    "Black_magic",
    "Classes",
    "Characters",
    "Locations",
    "Gameplay",
]


class LinkDiscoverer(HTMLParser):
    """Extracts <a href="..."> links from an HTML index page."""

    def __init__(self, base_url: str):
        super().__init__()
        self.base_url = base_url
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() != "a":
            return
        href = dict(attrs).get("href")
        if href:
            self.links.append(urllib.parse.urljoin(self.base_url, href))


def fetch_bytes(url_or_path: str) -> bytes:
    if os.path.exists(url_or_path):
        return Path(url_or_path).read_bytes()
    req = urllib.request.Request(url_or_path, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def read_png_dimensions(data: bytes):
    if len(data) >= 24 and data[:8] == b"\x89PNG\r\n\x1a\n" and data[12:16] == b"IHDR":
        w, h = struct.unpack(">II", data[16:24])
        return {"width": w, "height": h}
    return None


def discover_manifest(vgmaps_index: str, base_url: str, map_prefix: str, wiki_slug: str):
    manifest = {"maps": [], "strategywiki": []}

    if vgmaps_index:
        raw_html = fetch_bytes(vgmaps_index).decode("utf-8", errors="ignore")
        effective_base = base_url or (
            vgmaps_index if vgmaps_index.startswith("http") else "https://vgmaps.com/Atlas/NES/"
        )
        parser = LinkDiscoverer(effective_base)
        parser.feed(raw_html)
        seen = set()
        for url in parser.links:
            fname = urllib.parse.unquote(url.split("/")[-1])
            if fname.startswith(map_prefix) and fname.lower().endswith(".png") and fname not in seen:
                seen.add(fname)
                manifest["maps"].append({"url": url, "file": fname})

    if wiki_slug:
        for sub in DEFAULT_WIKI_SUBPAGES:
            page_url = f"https://strategywiki.org/wiki/{wiki_slug}/{sub}"
            safe_name = f"{wiki_slug}-{sub}.html"
            manifest["strategywiki"].append({"url": page_url, "file": f"strategywiki/{safe_name}"})

    return manifest


def main():
    ap = argparse.ArgumentParser(description="Discover and download classic JRPG reference assets.")
    ap.add_argument("--out-dir", required=True, help="Target folder (e.g. ~/Downloads/ff1)")
    ap.add_argument("--vgmaps-index", default="", help="VGMaps index URL or local HTML file")
    ap.add_argument("--base-url", default="https://vgmaps.com/Atlas/NES/", help="Base URL for relative map links")
    ap.add_argument("--map-prefix", default="", help="Filename prefix on VGMaps (e.g. FinalFantasy-)")
    ap.add_argument("--wiki-slug", default="", help="StrategyWiki game slug (e.g. Final_Fantasy)")
    ap.add_argument("--manifest", default="", help="Existing sources-manifest.json to use")
    ap.add_argument("--discover-only", action="store_true", help="Write sources-manifest.json without downloading")
    ap.add_argument("--delay", type=float, default=0.5, help="Polite delay in seconds between HTTP requests")
    args = ap.parse_args()

    out_dir = Path(args.out_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_file = Path(args.manifest) if args.manifest else (out_dir / "sources-manifest.json")

    if args.vgmaps_index or args.wiki_slug or not manifest_file.exists():
        manifest = discover_manifest(args.vgmaps_index, args.base_url, args.map_prefix, args.wiki_slug)
        manifest_file.write_text(json.dumps(manifest, indent=2) + "\n")
        print(
            f"[DISCOVER] Wrote {manifest_file} "
            f"({len(manifest['maps'])} map PNGs, {len(manifest['strategywiki'])} wiki pages)"
        )
    else:
        manifest = json.loads(manifest_file.read_text())

    if args.discover_only:
        return

    receipt = []
    items = manifest.get("maps", []) + manifest.get("strategywiki", [])
    for item in items:
        dest = out_dir / item["file"]
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists() and dest.stat().st_size > 0:
            data = dest.read_bytes()
            status = "cached"
        else:
            data = fetch_bytes(item["url"])
            dest.write_bytes(data)
            status = "downloaded"
            time.sleep(args.delay)

        sha256 = hashlib.sha256(data).hexdigest()
        dims = read_png_dimensions(data)
        dim_str = f" ({dims['width']}x{dims['height']})" if dims else ""
        print(f"[{status.upper():10s}] {item['file']:44s} {len(data):8d} B{dim_str}  sha256={sha256[:12]}")
        receipt.append({
            "file": item["file"],
            "url": item["url"],
            "status": status,
            "bytes": len(data),
            "sha256": sha256,
            "dimensions": dims,
        })

    receipt_path = out_dir / "download-receipt.json"
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
    print(f"[DONE] Verified {len(receipt)} files -> {receipt_path}")


if __name__ == "__main__":
    main()
