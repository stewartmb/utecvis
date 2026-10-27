"""Descarga las fotos publicadas de la cohorte para la presentación sin conexión."""

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


def download_photos(
    network_file=ROOT / "data/network.json", output=ROOT / "app/static/photos"
):
    nodes = json.loads(Path(network_file).read_text())["nodes"]
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)

    def fetch(node):
        if not node.get("image_url"):
            return "missing"
        if any((output / f"{node['id']}{ext}").is_file() for ext in (".jpg", ".png")):
            return "cached"
        try:
            request = Request(
                node["image_url"],
                headers={"User-Agent": "UtecVis academic visualization"},
            )
            with urlopen(request, timeout=20) as response:
                content = response.read(2_000_001)
            if len(content) > 2_000_000:
                return "failed"
            extension = (
                ".jpg"
                if content.startswith(b"\xff\xd8\xff")
                else ".png"
                if content.startswith(b"\x89PNG\r\n\x1a\n")
                else None
            )
            if extension is None:
                return "failed"
            (output / f"{node['id']}{extension}").write_bytes(content)
            return "downloaded"
        except (OSError, ValueError):
            return "failed"

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(fetch, nodes))
    summary = {
        key: results.count(key) for key in ("downloaded", "cached", "missing", "failed")
    }
    print(summary)
    return summary


if __name__ == "__main__":
    download_photos()
