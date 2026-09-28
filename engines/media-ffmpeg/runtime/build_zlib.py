#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
VERSIONS = json.loads((HERE / "versions.json").read_text(encoding="utf-8"))
PIN = VERSIONS["zlib"]
STATIC_CFLAGS = "-nologo -MT -W3 -O2 -Oy- -Zi -Fd\"zlib\""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(argv: list[str], *, cwd: Path, env: dict[str, str] | None = None) -> str:
    proc = subprocess.run(
        argv,
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if proc.returncode != 0:
        raise SystemExit(f"command failed ({proc.returncode}): {' '.join(argv)}\n{proc.stdout}")
    return proc.stdout


def read_json(path: Path, name: str) -> dict[str, object]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise SystemExit(f"invalid {name}") from exc
    if not isinstance(value, dict):
        raise SystemExit(f"invalid {name}")
    return value


def validate_source(source: Path) -> dict[str, object]:
    required = ("zlib.h", "zconf.h", "LICENSE", "win32/Makefile.msc")
    for relative in required:
        if not (source / relative).is_file():
            raise SystemExit(f"prepared zlib source is missing {relative}")
    provenance = read_json(source / "CEVRA_SOURCE_PROVENANCE.json", "zlib source provenance")
    expected = {
        "id": "zlib-source",
        "version": PIN["version"],
        "source": PIN["source"],
        "signature": PIN["signature"],
        "signingKeySource": PIN["signingKey"],
        "signingFingerprint": PIN["signingFingerprint"],
        "verifiedSignerFingerprint": PIN["signingFingerprint"].upper(),
        "archiveSha256": PIN["archiveSha256"],
        "signatureSha256": PIN["signatureSha256"],
        "signingKeySha256": PIN["signingKeySha256"],
        "license": PIN["license"],
        "licenseSha256": PIN["licenseSha256"],
        "verified": True,
    }
    if any(provenance.get(key) != value for key, value in expected.items()):
        raise SystemExit("zlib source provenance does not match the pinned verified release")
    if sha256(source / "LICENSE") != PIN["licenseSha256"]:
        raise SystemExit("zlib source license does not match the pin")
    return provenance


def validate_static_library(library: Path, *, cwd: Path, env: dict[str, str]) -> dict[str, str]:
    headers = run(["dumpbin", "/headers", str(library)], cwd=cwd, env=env)
    if re.search(r"\b8664 machine \(x64\)", headers, re.IGNORECASE) is None:
        raise SystemExit("zlib.lib is not an x64 static library")
    directives = run(["dumpbin", "/directives", str(library)], cwd=cwd, env=env)
    normalized = directives.upper()
    if "DEFAULTLIB:LIBCMT" not in normalized or "DEFAULTLIB:MSVCRT" in normalized:
        raise SystemExit("zlib.lib does not use the required static /MT C runtime")
    return {"machine": "x64", "crt": "static-mt"}


def smoke_test(source: Path, library: Path, *, cwd: Path, env: dict[str, str]) -> str:
    smoke = cwd / "cevra-zlib-smoke.c"
    executable = cwd / "cevra-zlib-smoke.exe"
    smoke.write_text(
        "#include <stdio.h>\n"
        "#include <string.h>\n"
        "#include \"zlib.h\"\n\n"
        "int main(void) {\n"
        "  const unsigned char input[] = \"CEVRA zlib static-link smoke\";\n"
        "  unsigned char compressed[128];\n"
        "  unsigned char restored[128];\n"
        "  uLongf compressed_len = sizeof(compressed);\n"
        "  uLongf restored_len = sizeof(restored);\n"
        "  if (strcmp(zlibVersion(), \"1.3.2\") != 0) return 10;\n"
        "  if (compress2(compressed, &compressed_len, input, sizeof(input), Z_BEST_COMPRESSION) != Z_OK) return 11;\n"
        "  if (uncompress(restored, &restored_len, compressed, compressed_len) != Z_OK) return 12;\n"
        "  if (restored_len != sizeof(input) || memcmp(restored, input, sizeof(input)) != 0) return 13;\n"
        "  printf(\"zlib=%s roundtrip=%lu\\n\", zlibVersion(), (unsigned long)restored_len);\n"
        "  return 0;\n"
        "}\n",
        encoding="utf-8",
    )
    run(
        [
            "cl",
            "/nologo",
            "/MT",
            f"/I{source}",
            str(smoke),
            str(library),
            f"/Fe:{executable}",
        ],
        cwd=cwd,
        env=env,
    )
    output = run([str(executable)], cwd=cwd, env=env).strip()
    if not output.startswith("zlib=1.3.2 roundtrip="):
        raise SystemExit(f"zlib static smoke returned unexpected output: {output}")
    return output


def build(source: Path, prefix: Path) -> Path:
    if os.name != "nt":
        raise SystemExit("the pinned zlib static build is supported only in an MSVC Windows environment")
    provenance = validate_source(source)
    for tool in ("cl", "nmake", "lib", "dumpbin"):
        if shutil.which(tool) is None:
            raise SystemExit(f"MSVC build tool is missing: {tool}")
    if prefix.exists():
        if not prefix.is_dir() or any(prefix.iterdir()):
            raise SystemExit(f"zlib output prefix must be empty: {prefix}")
        prefix.rmdir()
    prefix.parent.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["SOURCE_DATE_EPOCH"] = "0"
    build_output = run(
        ["nmake", "/nologo", "/f", "win32/Makefile.msc", f"CFLAGS={STATIC_CFLAGS}", "zlib.lib"],
        cwd=source,
        env=env,
    )
    library = source / "zlib.lib"
    if not library.is_file():
        raise SystemExit("MSVC zlib build did not produce zlib.lib")
    library_properties = validate_static_library(library, cwd=source, env=env)
    with tempfile.TemporaryDirectory(prefix="cevra-zlib-smoke-") as temp_name:
        smoke_output = smoke_test(source, library, cwd=Path(temp_name), env=env)

    (prefix / "include").mkdir(parents=True)
    (prefix / "lib").mkdir()
    (prefix / "licenses/zlib").mkdir(parents=True)
    (prefix / "sources/zlib").mkdir(parents=True)
    (prefix / "provenance").mkdir()
    shutil.copy2(source / "zlib.h", prefix / "include/zlib.h")
    shutil.copy2(source / "zconf.h", prefix / "include/zconf.h")
    shutil.copy2(library, prefix / "lib/zlib.lib")
    shutil.copy2(source / "LICENSE", prefix / "licenses/zlib/LICENSE")
    source_inputs = {
        "CEVRA_SOURCE_ARCHIVE.tar.xz": f"zlib-{PIN['version']}.tar.xz",
        "CEVRA_SOURCE_ARCHIVE.tar.xz.asc": f"zlib-{PIN['version']}.tar.xz.asc",
        "CEVRA_SIGNING_KEY.asc": "mark-adler.asc",
    }
    for source_name, target_name in source_inputs.items():
        item = source / source_name
        if not item.is_file():
            raise SystemExit(f"verified zlib source artifact is missing: {source_name}")
        shutil.copy2(item, prefix / "sources/zlib" / target_name)
    build_instructions = (
        f"# Reproducing CEVRA zlib {PIN['version']} for Windows x64\n\n"
        f"Verify the archive SHA-256 `{PIN['archiveSha256']}` and detached signature with fingerprint "
        f"`{PIN['signingFingerprint']}`. In an x64 Visual Studio developer environment run:\n\n"
        "```text\n"
        f"nmake /nologo /f win32/Makefile.msc CFLAGS={STATIC_CFLAGS} zlib.lib\n"
        "```\n\nThe source is unmodified. The explicit CFLAGS override replaces upstream `/MD` with `/MT`.\n"
    )
    (prefix / "sources/zlib/BUILD.md").write_text(build_instructions, encoding="utf-8")
    compiler_proc = subprocess.run(
        ["cl"],
        cwd=source,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    compiler_lines = [line.strip() for line in compiler_proc.stdout.splitlines() if line.strip()]
    if not compiler_lines:
        raise SystemExit("could not identify MSVC compiler")
    compiler = compiler_lines[0]
    built_library = prefix / "lib/zlib.lib"
    build_provenance = {
        "id": "zlib",
        "version": PIN["version"],
        "license": PIN["license"],
        "source": PIN["source"],
        "sourceSignature": PIN["signature"],
        "signingKeySource": PIN["signingKey"],
        "signingFingerprint": PIN["signingFingerprint"],
        "verifiedSignerFingerprint": provenance["verifiedSignerFingerprint"],
        "sourceArchiveSha256": PIN["archiveSha256"],
        "sourceSignatureSha256": PIN["signatureSha256"],
        "signingKeySha256": PIN["signingKeySha256"],
        "licenseSha256": PIN["licenseSha256"],
        "librarySha256": sha256(built_library),
        "zlibHeaderSha256": sha256(prefix / "include/zlib.h"),
        "zconfHeaderSha256": sha256(prefix / "include/zconf.h"),
        "staticLink": True,
        "sourceModified": False,
        "machine": library_properties["machine"],
        "crt": library_properties["crt"],
        "smoke": smoke_output,
        "buildMethod": "win32/Makefile.msc",
        "cflags": STATIC_CFLAGS,
        "toolchain": {
            "host": "Windows",
            "arch": platform.machine() or "unknown",
            "compiler": compiler,
            "python": platform.python_version(),
            "sourceDateEpoch": "0",
        },
        "sourceArchive": f"sources/zlib/zlib-{PIN['version']}.tar.xz",
        "sourceSignatureFile": f"sources/zlib/zlib-{PIN['version']}.tar.xz.asc",
        "signingKeyFile": "sources/zlib/mark-adler.asc",
        "buildInstructions": "sources/zlib/BUILD.md",
        "licenseFile": "licenses/zlib/LICENSE",
    }
    (prefix / "provenance/zlib.json").write_text(json.dumps(build_provenance, indent=2) + "\n", encoding="utf-8")
    (prefix / "provenance/zlib-build.log").write_text(build_output[-32768:], encoding="utf-8")
    return prefix


def main() -> int:
    parser = argparse.ArgumentParser(description="Build and smoke-test pinned static zlib for Windows FFmpeg")
    parser.add_argument("source", type=Path)
    parser.add_argument("prefix", type=Path)
    args = parser.parse_args()
    print(build(args.source.resolve(), args.prefix.resolve()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
