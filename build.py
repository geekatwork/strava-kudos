import argparse
import copy
import json
import re
import tempfile
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def build():
    parser = argparse.ArgumentParser(description="Build browser extension ZIPs.")
    parser.add_argument(
        "--firefox-id",
        required=True,
        help="Stable Firefox add-on ID, for example strava-kudos@example.org.",
    )
    args = parser.parse_args()
    if not re.fullmatch(r"[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+", args.firefox_id) or len(args.firefox_id) > 80:
        parser.error("--firefox-id must be an email-shaped add-on ID of at most 80 characters.")

    root = Path(__file__).resolve().parent
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    resources = {"README.txt", *manifest.get("icons", {}).values()}
    for content_script in manifest["content_scripts"]:
        resources.update(content_script.get("js", []))
        resources.update(content_script.get("css", []))

    files = {}
    for resource in sorted(resources):
        path = Path(resource)
        if path.is_absolute() or ".." in path.parts or "\\" in resource:
            raise ValueError(f"Invalid resource path: {resource}")
        source = (root / path).resolve()
        if not source.is_relative_to(root):
            raise ValueError(f"Resource is outside the project: {resource}")
        files[path.as_posix()] = source.read_bytes()

    variants = {}
    for browser in ("chromium", "firefox"):
        variants[browser] = copy.deepcopy(manifest)
        variants[browser].pop("browser_specific_settings", None)
    variants["firefox"]["browser_specific_settings"] = {
        "gecko": {
            "id": args.firefox_id,
            "data_collection_permissions": {"required": ["none"]},
        }
    }

    output = root / "dist"
    output.mkdir(exist_ok=True)
    for browser, browser_manifest in variants.items():
        destination = output / f"{browser}.zip"
        with tempfile.TemporaryDirectory(prefix="strava-kudos-build-") as temporary:
            archive_path = Path(temporary) / destination.name
            with ZipFile(archive_path, "w", compression=ZIP_DEFLATED) as archive:
                archive.writestr(
                    "manifest.json",
                    json.dumps(browser_manifest, indent=2) + "\n",
                )
                for resource, data in files.items():
                    archive.writestr(resource, data)
            destination.write_bytes(archive_path.read_bytes())
        print(f"Created {destination}")


if __name__ == "__main__":
    build()
