"""Comandos explícitos: adquisición -> transformación -> exportación."""

import argparse
import hashlib
import json
import re
import sys
import tomllib
import uuid
from datetime import datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup
from jsonschema import ValidationError

from extraccion_datos.cris import ADAPTER_VERSION, next_page, parse_profile, profile_links
from extraccion_datos.http import AcquisitionError, SourceClient
from extraccion_datos.quality import example_compatible, validate_nodes
from extraccion_datos.storage import ROOT, utc_now, write_json


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def new_run(root, mode):
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    manifest = {
        "run_id": run_id,
        "mode": mode,
        "started_at": utc_now(),
        "status": "running",
        "coverage": "pilot",
        "directory_complete": False,
        "adapter_version": ADAPTER_VERSION,
        "pages": [],
        "profiles": [],
        "errors": [],
    }
    return manifest, root / "data/manifests" / f"{run_id}.json"


def snapshot(root, run_id, url, body):
    key = hashlib.sha256(url.encode()).hexdigest()[:20]
    path = root / "data/raw" / run_id / f"{key}.html"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    return str(path.relative_to(root))


def acquire(args):
    root = args.root.resolve()
    settings = tomllib.loads((root / "config/sources.toml").read_text())["cris"]
    if args.transport == "safari":
        from extraccion_datos.safari import SafariClient

        client = SafariClient(settings)
    elif args.transport == "browser":
        from extraccion_datos.browser import BrowserClient

        client = BrowserClient(
            settings,
            channel=args.browser_channel,
            headed=args.headed,
            profile_dir=root / "local_state/cris_browser" / args.browser_channel,
        )
    else:
        client = SourceClient(settings)
    manifest, manifest_path = new_run(root, args.command)
    args.acquisition_manifest = manifest_path
    manifest["transport"] = args.transport
    manifest["settings"] = settings
    write_json(manifest_path, manifest)
    try:
        url = settings["directory_url"]
        visited, profiles = set(), set()
        expected_count = None
        for _ in range(args.max_pages):
            if url in visited:
                raise AcquisitionError("Se detectó un ciclo de paginación.")
            visited.add(url)
            body, response = client.get(url)
            html = body.decode("utf-8", errors="replace")
            path = snapshot(root, manifest["run_id"], url, body)
            manifest["pages"].append(
                {
                    "url": url,
                    "snapshot": path,
                    "retrieved_at": utc_now(),
                    "sha256": hashlib.sha256(body).hexdigest(),
                    **response,
                }
            )
            if args.command == "probe":
                manifest["status"] = "probe_ok"
                return 0
            links = profile_links(html, url)
            if not links:
                raise AcquisitionError("El directorio no contiene perfiles reconocibles.")
            profiles.update(links)
            page_text = BeautifulSoup(html, "html.parser").get_text(" ", strip=True)
            count = re.search(r"\bde\s+([\d.,]+)\s+resultados\b", page_text, re.I)
            if count:
                expected_count = int(re.sub(r"[.,]", "", count[1]))
            following = next_page(html, url)
            if not following:
                manifest["directory_complete"] = (
                    expected_count is not None and len(profiles) == expected_count
                )
                break
            url = following
        manifest["discovered_count"] = len(profiles)
        manifest["expected_count"] = expected_count
        if args.all and not manifest["directory_complete"]:
            raise AcquisitionError(
                "No se pudo demostrar cobertura completa del directorio; revisar paginación."
            )
        selected = sorted(profiles) if args.all else sorted(profiles)[: args.limit]
        manifest["selected_count"] = len(selected)
        write_json(manifest_path, manifest)
        for profile_url in selected:
            try:
                body, response = client.get(profile_url)
                path = snapshot(root, manifest["run_id"], profile_url, body)
                manifest["profiles"].append(
                    {
                        "url": profile_url,
                        "snapshot": path,
                        "retrieved_at": utc_now(),
                        "sha256": hashlib.sha256(body).hexdigest(),
                        **response,
                    }
                )
            except AcquisitionError as exc:
                manifest["errors"].append({"url": profile_url, "error": str(exc)})
                if args.transport == "safari" or "cloudflare" in str(exc).casefold():
                    manifest["status"] = "partial"
                    return 1
            write_json(manifest_path, manifest)
        if manifest["errors"]:
            manifest["status"] = "partial"
            return 1
        manifest["status"] = "acquired"
        manifest["coverage"] = "full" if args.all else "pilot"
        return 0
    except AcquisitionError as exc:
        manifest["status"] = "failed"
        manifest["errors"].append({"error": str(exc)})
        return 1
    finally:
        if hasattr(client, "close"):
            client.close()
        manifest["finished_at"] = utc_now()
        write_json(manifest_path, manifest)
        print(
            json.dumps(
                {
                    "manifest": str(manifest_path),
                    "status": manifest["status"],
                    "downloaded_profiles": len(manifest["profiles"]),
                    "errors": manifest["errors"],
                },
                ensure_ascii=False,
            )
        )


def transform(args):
    root = args.root.resolve()
    manifest = load_json(args.manifest)
    nodes, errors = [], []
    for profile in manifest["profiles"]:
        try:
            path = root / profile["snapshot"]
            body = path.read_bytes()
            if hashlib.sha256(body).hexdigest() != profile["sha256"]:
                raise ValueError("El snapshot no coincide con su hash registrado.")
            nodes.append(
                parse_profile(
                    body.decode("utf-8", errors="replace"),
                    profile["url"],
                    profile["retrieved_at"],
                    profile["snapshot"],
                )
            )
        except (ValueError, OSError) as exc:
            errors.append({"url": profile["url"], "error": str(exc)})
    out = root / "data/interim" / manifest["run_id"]
    report = {
        "parse_errors": errors,
        "run_id": manifest["run_id"],
        "transformation_version": ADAPTER_VERSION,
        "transformed_at": utc_now(),
    }
    try:
        report.update(validate_nodes(nodes))
    except (ValueError, ValidationError) as exc:
        report["validation_error"] = str(exc)
        write_json(out / "quality.json", report)
        raise
    write_json(out / "faculty.normalized.json", {"nodes": sorted(nodes, key=lambda n: n["id"])})
    write_json(out / "quality.json", report)
    print(json.dumps({"output": str(out), **report}, ensure_ascii=False))
    return 1 if errors else 0


def export(args):
    root = args.root.resolve()
    manifest = load_json(args.manifest)
    interim = root / "data/interim" / manifest["run_id"]
    nodes = load_json(interim / "faculty.normalized.json")["nodes"]
    quality = load_json(interim / "quality.json")
    if (
        manifest["status"] != "acquired"
        or manifest["errors"]
        or quality["parse_errors"]
        or quality.get("validation_error")
    ):
        raise ValueError("La ejecución no está completa o tiene errores; no se exportará.")
    if len(nodes) != manifest["selected_count"]:
        raise ValueError("No coincide la cantidad descargada y normalizada.")
    is_full = manifest["coverage"] == "full" and manifest["directory_complete"]
    if not is_full and not args.allow_pilot:
        raise ValueError("Es un piloto. Usar --allow-pilot para exportarlo solo dentro de interim.")
    target = (root / "data/processed" / manifest["run_id"]) if is_full else (interim / "export")
    write_json(target / "faculty_nodes.json", {"nodes": nodes})
    write_json(target / "faculty_network.json", example_compatible(nodes))
    write_json(
        target / "metadata.json",
        {
            "run_id": manifest["run_id"],
            "coverage": manifest["coverage"],
            "exported_at": utc_now(),
            "quality": quality,
            "note": "Solo nodos. Aristas pendientes de definición y evidencia.",
        },
    )
    print(json.dumps({"output": str(target), "coverage": manifest["coverage"]}))
    return 0


def positive_int(value):
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("Debe ser mayor que cero.")
    return number


def pipeline(args):
    """Ejecuta adquisición, transformación y exportación sin intervención de un agente."""
    result = acquire(args)
    if result:
        return result
    args.manifest = args.acquisition_manifest
    result = transform(args)
    if result:
        return result
    args.allow_pilot = not args.all
    return export(args)


def prepare_access(args):
    from extraccion_datos.browser import BrowserClient

    root = args.root.resolve()
    settings = tomllib.loads((root / "config/sources.toml").read_text())["cris"]
    client = BrowserClient(
        settings,
        channel=args.browser_channel,
        headed=True,
        profile_dir=root / "local_state/cris_browser" / args.browser_channel,
    )
    try:
        result = client.prepare_access(settings["directory_url"])
        print(json.dumps({"access_confirmed": True, **result}, ensure_ascii=False))
        return 0
    except (AcquisitionError, EOFError) as exc:
        print(f"Acceso no confirmado: {exc}", file=sys.stderr)
        return 1
    finally:
        client.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT, help="Raíz del checkout del proyecto")
    commands = parser.add_subparsers(dest="command", required=True)
    access = commands.add_parser("access", help="Preparar manualmente el acceso del perfil CRIS")
    access.add_argument(
        "--browser-channel", choices=("chromium", "chrome", "msedge", "webkit"), default="chrome"
    )
    access.set_defaults(handler=prepare_access)
    for name in ("probe", "extract", "run"):
        sub = commands.add_parser(name)
        sub.add_argument("--max-pages", type=positive_int, default=20)
        sub.add_argument("--limit", type=positive_int, default=5)
        sub.add_argument("--all", action="store_true", help="Solicitar censo completo")
        sub.add_argument("--transport", choices=("http", "browser", "safari"), default="http")
        sub.add_argument(
            "--browser-channel",
            choices=("chromium", "chrome", "msedge", "webkit"),
            default="chromium",
        )
        sub.add_argument("--headed", action="store_true", help="Mostrar el navegador automatizado")
        sub.set_defaults(handler=pipeline if name == "run" else acquire)
    for name, handler in (("transform", transform), ("export", export)):
        sub = commands.add_parser(name)
        sub.add_argument("--manifest", type=Path, required=True)
        if name == "export":
            sub.add_argument("--allow-pilot", action="store_true")
        sub.set_defaults(handler=handler)
    sub = commands.add_parser("validate")
    sub.add_argument("file", type=Path)

    def validate(args):
        print(json.dumps(validate_nodes(load_json(args.file)["nodes"])))
        return 0

    sub.set_defaults(handler=validate)
    args = parser.parse_args(argv)
    try:
        return args.handler(args)
    except (ValueError, KeyError, OSError, ValidationError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
