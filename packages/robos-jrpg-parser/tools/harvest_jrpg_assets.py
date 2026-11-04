#!/usr/bin/env python3
"""
Practice-site asset harvester for the JRPG demo.

Only talks to this machine. Real fan sites are collected by hand by a person, so any
other host is refused, whether it comes from an argument, a manifest, a link on a page
or a redirect.

Discovers and downloads:
  1. 1:1 pixel map PNGs from an index page on this machine (URL or local HTML file)
     matching --map-prefix (e.g. "EmberQuest-").
  2. Anything else already listed in a manifest passed via --manifest.

Writes:
  - <out-dir>/sources-manifest.json  (discovered URLs and target paths)
  - <out-dir>/download-receipt.json  (SHA-256 hashes, byte sizes, and PNG dimensions)
"""

import argparse
import hashlib
import ipaddress
import json
import os
import struct
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

HEADERS = {"User-Agent": "robos-jrpg-harvester/1.0 (+https://rowbose.com)"}


def is_this_machine(url: str) -> bool:
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ("http", "https") or "@" in parts.netloc:
        return False
    if parts.hostname == "localhost":
        return True
    try:
        return ipaddress.ip_address(parts.hostname or "").is_loopback
    except ValueError:
        return False


def require_this_machine(url: str):
    if not is_this_machine(url):
        raise SystemExit(
            f"Refusing {url}: this tool only downloads from this machine. "
            "Collect files from real websites by hand."
        )


class ThisMachineRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        require_this_machine(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


# An empty ProxyHandler stops a proxy from the environment carrying requests off this machine.
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}), ThisMachineRedirects())


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
    require_this_machine(url_or_path)
    req = urllib.request.Request(url_or_path, headers=HEADERS)
    with OPENER.open(req, timeout=30) as resp:
        return resp.read()


def read_png_dimensions(data: bytes):
    if len(data) >= 24 and data[:8] == b"\x89PNG\r\n\x1a\n" and data[12:16] == b"IHDR":
        w, h = struct.unpack(">II", data[16:24])
        return {"width": w, "height": h}
    return None


def discover_manifest(vgmaps_index: str, base_url: str, map_prefix: str):
    manifest = {"maps": [], "strategywiki": []}

    if vgmaps_index:
        raw_html = fetch_bytes(vgmaps_index).decode("utf-8", errors="ignore")
        parser = LinkDiscoverer(base_url or vgmaps_index)
        parser.feed(raw_html)
        seen = set()
        for url in parser.links:
            fname = urllib.parse.unquote(url.split("/")[-1])
            if fname.startswith(map_prefix) and fname.lower().endswith(".png") and fname not in seen:
                seen.add(fname)
                manifest["maps"].append({"url": url, "file": fname})

    return manifest


def main():
    ap = argparse.ArgumentParser(description="Discover and download the practice site's files from this machine.")
    ap.add_argument("--out-dir", required=True, help="Target folder (e.g. ~/ember-quest/collection)")
    ap.add_argument("--vgmaps-index", default="", help="Index page on this machine, as a URL or local HTML file")
    ap.add_argument("--base-url", default="", help="Base URL for relative map links, required with a local HTML file")
    ap.add_argument("--map-prefix", default="", help="Filename prefix to keep (e.g. EmberQuest-)")
    ap.add_argument("--manifest", default="", help="Existing sources-manifest.json to use")
    ap.add_argument("--discover-only", action="store_true", help="Write sources-manifest.json without downloading")
    ap.add_argument("--delay", type=float, default=0.5, help="Polite delay in seconds between HTTP requests")
    args = ap.parse_args()

    out_dir = Path(args.out_dir).expanduser().resolve()
    manifest_file = Path(args.manifest) if args.manifest else (out_dir / "sources-manifest.json")

    if not args.vgmaps_index and not manifest_file.exists():
        ap.error("pass --vgmaps-index or an existing --manifest; there is no default site")
    if args.vgmaps_index and not args.base_url and os.path.exists(args.vgmaps_index):
        ap.error("--base-url is required when --vgmaps-index is a local HTML file")

    out_dir.mkdir(parents=True, exist_ok=True)

    if args.vgmaps_index:
        manifest = discover_manifest(args.vgmaps_index, args.base_url, args.map_prefix)
    else:
        manifest = json.loads(manifest_file.read_text())

    items = manifest.get("maps", []) + manifest.get("strategywiki", [])
    for item in items:
        require_this_machine(item["url"])

    if args.vgmaps_index:
        manifest_file.write_text(json.dumps(manifest, indent=2) + "\n")
        print(
            f"[DISCOVER] Wrote {manifest_file} "
            f"({len(manifest['maps'])} map PNGs, {len(manifest['strategywiki'])} wiki pages)"
        )

    if args.discover_only:
        return

    receipt = []
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
