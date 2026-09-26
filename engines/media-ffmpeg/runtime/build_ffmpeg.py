#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
VERSIONS = json.loads((HERE / "versions.json").read_text(encoding="utf-8"))
PIN = VERSIONS["ffmpeg"]
ZLIB_PIN = VERSIONS["zlib"]
INSTALL_PREFIX = "/cevra-media-runtime"
MSVC_DEPENDENCY_FILTER = HERE / "msvc_dependencies.awk"
MSVC_DEPENDENCY_FILTER_ID = "cevra-msvc-dependency-filter-v1"

COMMON_FLAGS = [
    "--disable-autodetect",
    "--disable-gpl",
    "--disable-nonfree",
    "--disable-debug",
    "--disable-doc",
    "--disable-ffplay",
    "--disable-network",
    "--enable-zlib",
    "--enable-ffmpeg",
    "--enable-ffprobe",
]

PLATFORM_FLAGS = {
    "Darwin": [
        "--enable-videotoolbox",
        "--enable-audiotoolbox",
        "--enable-avfoundation",
    ],
    "Windows": [
        "--toolchain=msvc",
        "--enable-mediafoundation",
        "--enable-d3d11va",
        "--enable-dxva2",
    ],
    "Linux": [],
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(argv: list[str], cwd: Path, env: dict[str, str] | None = None) -> None:
    proc = subprocess.run(argv, cwd=cwd, env=env)
    if proc.returncode != 0:
        raise SystemExit(proc.returncode)


def compiler_banner(system: str, env: dict[str, str]) -> str:
    """Return a bounded compiler identity for release provenance.

    MSVC reports its banner on stderr and does not implement the GCC-style
    ``--version`` switch.  Treating every host as GCC prevented a successful
    Windows build from reaching provenance generation even after compilation.
    """
    compiler = env.get("CC") or ("cl" if system == "Windows" else "cc")
    argv = [compiler] if system == "Windows" else [compiler, "--version"]
    try:
        proc = subprocess.run(
            argv,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=env,
            timeout=15,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise SystemExit(f"could not identify compiler {compiler}: {exc}") from exc
    lines = [line.strip() for line in proc.stdout.splitlines() if line.strip()]
    if not lines:
        raise SystemExit(f"could not identify compiler {compiler}")
    if system != "Windows" and proc.returncode != 0:
        raise SystemExit(f"compiler identity command failed ({proc.returncode}): {compiler}")
    return lines[0]


def validate_flags(flags: list[str]) -> None:
    forbidden = ("--enable-gpl", "--enable-nonfree", "--enable-libx264", "--enable-libx265")
    bad = [flag for flag in flags if flag.startswith(forbidden)]
    if bad:
        raise SystemExit(f"forbidden FFmpeg configure flags: {bad}")
    if "--disable-autodetect" not in flags:
        raise SystemExit("CEVRA FFmpeg builds must disable external autodetection")
    if "--enable-zlib" not in flags:
        raise SystemExit("CEVRA FFmpeg builds must enable zlib for typed PNG frame extraction")


def read_json(path: Path, name: str) -> dict[str, object]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise SystemExit(f"invalid {name}") from exc
    if not isinstance(value, dict):
        raise SystemExit(f"invalid {name}")
    return value


def validate_zlib_prefix(prefix: Path) -> dict[str, object]:
    files = {
        "zlib.h": prefix / "include/zlib.h",
        "zconf.h": prefix / "include/zconf.h",
        "zlib.lib": prefix / "lib/zlib.lib",
        "license": prefix / "licenses/zlib/LICENSE",
        "provenance": prefix / "provenance/zlib.json",
    }
    for name, path in files.items():
        if path.is_symlink() or not path.is_file():
            raise SystemExit(f"prepared Windows zlib prefix is missing {name}: {path}")
    provenance = read_json(files["provenance"], "zlib build provenance")
    expected = {
        "id": "zlib",
        "version": ZLIB_PIN["version"],
        "license": ZLIB_PIN["license"],
        "source": ZLIB_PIN["source"],
        "sourceSignature": ZLIB_PIN["signature"],
        "signingKeySource": ZLIB_PIN["signingKey"],
        "signingFingerprint": ZLIB_PIN["signingFingerprint"],
        "verifiedSignerFingerprint": ZLIB_PIN["signingFingerprint"].upper(),
        "sourceArchiveSha256": ZLIB_PIN["archiveSha256"],
        "sourceSignatureSha256": ZLIB_PIN["signatureSha256"],
        "signingKeySourceSha256": ZLIB_PIN["signingKeySourceSha256"],
        "signingKeySha256": ZLIB_PIN["signingKeySha256"],
        "licenseSha256": ZLIB_PIN["licenseSha256"],
        "staticLink": True,
        "sourceModified": False,
        "machine": "x64",
        "crt": "static-mt",
        "buildMethod": "win32/Makefile.msc",
        "licenseFile": "licenses/zlib/LICENSE",
    }
    if any(provenance.get(key) != value for key, value in expected.items()):
        raise SystemExit("prepared Windows zlib provenance does not match the pinned static build")
    digest_fields = {
        "librarySha256": files["zlib.lib"],
        "zlibHeaderSha256": files["zlib.h"],
        "zconfHeaderSha256": files["zconf.h"],
        "licenseSha256": files["license"],
    }
    for field, path in digest_fields.items():
        if provenance.get(field) != sha256(path):
            raise SystemExit(f"prepared Windows zlib {field} does not match its file")
    source_paths = {
        "sourceArchive": (f"sources/zlib/zlib-{ZLIB_PIN['version']}.tar.xz", ZLIB_PIN["archiveSha256"]),
        "sourceSignatureFile": (f"sources/zlib/zlib-{ZLIB_PIN['version']}.tar.xz.asc", ZLIB_PIN["signatureSha256"]),
        "signingKeyFile": ("sources/zlib/mark-adler.asc", ZLIB_PIN["signingKeySha256"]),
        "signingKeySourceFile": ("sources/zlib/mark-adler-pgp.html", ZLIB_PIN["signingKeySourceSha256"]),
    }
    for field, (relative, digest) in source_paths.items():
        if provenance.get(field) != relative:
            raise SystemExit(f"prepared Windows zlib {field} is invalid")
        path = prefix / relative
        if path.is_symlink() or not path.is_file() or sha256(path) != digest:
            raise SystemExit(f"prepared Windows zlib source artifact is invalid: {relative}")
    instructions = prefix / "sources/zlib/BUILD.md"
    if provenance.get("buildInstructions") != "sources/zlib/BUILD.md" or not instructions.is_file():
        raise SystemExit("prepared Windows zlib build instructions are missing")
    if not isinstance(provenance.get("toolchain"), dict):
        raise SystemExit("prepared Windows zlib provenance is missing toolchain identification")
    if not isinstance(provenance.get("smoke"), str) or not str(provenance["smoke"]).startswith("zlib=1.3.2 roundtrip="):
        raise SystemExit("prepared Windows zlib provenance is missing a successful static-link smoke")
    return provenance


def install_msvc_dependency_filter(source: Path, helper: Path = MSVC_DEPENDENCY_FILTER) -> dict[str, str]:
    """Replace FFmpeg's generated inline MSVC awk with a file-backed filter.

    GNU make/MSYS can remove one escaping layer from FFmpeg's inline
    ``gsub(/\\\\/, "/")`` program before awk receives it.  FFmpeg ticket
    #9360 documents the resulting unterminated expression.  Keeping the awk
    program in a file avoids Windows command-line backslash interpretation
    without changing the verified release source archive.
    """
    config = source / "ffbuild/config.mak"
    if not config.is_file():
        raise SystemExit("FFmpeg configure did not produce ffbuild/config.mak")
    if helper.is_symlink() or not helper.is_file():
        raise SystemExit(f"CEVRA MSVC dependency filter is missing: {helper}")
    text = config.read_text(encoding="utf-8")
    expected = " | awk '/including/ { sub(/^.*file: */, \"\"); gsub(/\\\\/, \"/\"); if (!match($$0, / /)) print \"$@:\", $$0 }' > $(@:.o=.d)"
    count = text.count(expected)
    if count != 1:
        raise SystemExit(f"unexpected FFmpeg MSVC dependency command ({count} matches); refusing an unreviewed build adjustment")
    helper_path = helper.resolve().as_posix()
    replacement = f" | awk -v target=\"$@\" -f {shlex.quote(helper_path)} > $(@:.o=.d)"
    config.write_text(text.replace(expected, replacement), encoding="utf-8")
    return {
        "id": MSVC_DEPENDENCY_FILTER_ID,
        "helperSha256": sha256(helper),
        "generatedFile": "ffbuild/config.mak",
        "sourceArchiveModified": "false",
    }


def build(source: Path, prefix: Path, jobs: int, zlib_prefix: Path | None = None) -> None:
    system = platform.system()
    if system not in PLATFORM_FLAGS:
        raise SystemExit(f"unsupported build host {system}")
    configure = source / "configure"
    if not configure.is_file():
        raise SystemExit(f"FFmpeg configure script missing under {source}")
    provenance = source / "CEVRA_SOURCE_PROVENANCE.json"
    if not provenance.is_file():
        raise SystemExit("refusing unverified FFmpeg source: CEVRA_SOURCE_PROVENANCE.json missing")
    source_info = json.loads(provenance.read_text(encoding="utf-8"))
    required_source = {
        "id": "ffmpeg-source",
        "version": PIN["version"],
        "source": PIN["source"],
        "signature": PIN["signature"],
        "signingFingerprint": PIN["signingFingerprint"],
        "verifiedSignerFingerprint": PIN["signingFingerprint"].upper(),
        "verified": True,
    }
    if any(source_info.get(key) != value for key, value in required_source.items()):
        raise SystemExit("FFmpeg source provenance does not match the pinned verified release")
    pinned_digests = {"archiveSha256": PIN["archiveSha256"], "signatureSha256": PIN["signatureSha256"], "signingKeySha256": PIN["signingKeySha256"]}
    for field, expected_digest in pinned_digests.items():
        if source_info.get(field) != expected_digest:
            raise SystemExit(f"FFmpeg source provenance {field} does not match the pin")

    if prefix.exists():
        if not prefix.is_dir() or any(prefix.iterdir()):
            raise SystemExit(f"FFmpeg output prefix must be empty: {prefix}")
        prefix.rmdir()
    prefix.parent.mkdir(parents=True, exist_ok=True)
    flags = [*COMMON_FLAGS, *PLATFORM_FLAGS[system], f"--prefix={INSTALL_PREFIX}"]
    validate_flags(flags)
    env = os.environ.copy()
    env["SOURCE_DATE_EPOCH"] = "0"
    zlib_provenance: dict[str, object] | None = None
    if system == "Windows":
        if zlib_prefix is None:
            raise SystemExit("Windows FFmpeg build requires --zlib-prefix with the pinned prepared zlib 1.3.2 input")
        zlib_provenance = validate_zlib_prefix(zlib_prefix)
        env["INCLUDE"] = str(zlib_prefix / "include") + (";" + env["INCLUDE"] if env.get("INCLUDE") else "")
        env["LIB"] = str(zlib_prefix / "lib") + (";" + env["LIB"] if env.get("LIB") else "")

    # configure is a POSIX shell script. On Windows this script is expected to run inside
    # an MSYS2/Git-Bash environment with the MSVC toolchain environment already activated.
    shell = shutil.which("bash")
    if shell is None:
        raise SystemExit("bash is required to configure FFmpeg")
    make = shutil.which("make")
    if make is None:
        raise SystemExit("make is required to build FFmpeg")

    run([shell, str(configure), *flags], cwd=source, env=env)
    build_adjustments: list[dict[str, str]] = []
    if system == "Windows":
        env["VSLANG"] = "1033"
        build_adjustments.append(install_msvc_dependency_filter(source))
    run([make, f"-j{max(1, jobs)}"], cwd=source, env=env)
    with tempfile.TemporaryDirectory(prefix="cevra-ffmpeg-install-", dir=prefix.parent) as stage_name:
        # GNU make under MSYS accepts the native Windows drive only in
        # forward-slash form.  Keep the stable configure prefix while staging
        # into the runner-owned temporary directory.
        stage_destination = Path(stage_name).as_posix() if system == "Windows" else stage_name
        run([make, f"DESTDIR={stage_destination}", "install"], cwd=source, env=env)
        staged_prefix = Path(stage_name) / INSTALL_PREFIX.lstrip("/")
        if not staged_prefix.is_dir():
            raise SystemExit("FFmpeg staged install did not produce the stable runtime prefix")
        shutil.copytree(staged_prefix, prefix, symlinks=True)

    binary = prefix / "bin" / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")
    probe = prefix / "bin" / ("ffprobe.exe" if os.name == "nt" else "ffprobe")
    if not binary.is_file() or not probe.is_file():
        raise SystemExit("FFmpeg build did not produce ffmpeg and ffprobe")

    version = subprocess.run([str(binary), "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True).stdout
    first = version.splitlines()[0] if version else ""
    if PIN["version"] not in first:
        raise SystemExit(f"built FFmpeg version mismatch: {first}")
    version_match = re.search(r"ffmpeg version\s+([^\s]+)", first)
    if version_match is None:
        raise SystemExit(f"could not identify built FFmpeg: {first}")
    actual_version = version_match.group(1)
    buildconf = subprocess.run([str(binary), "-buildconf"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=True).stdout
    if "--enable-gpl" in buildconf or "--enable-nonfree" in buildconf or "--enable-libx264" in buildconf or "--enable-libx265" in buildconf:
        raise SystemExit("release FFmpeg contains forbidden GPL/nonfree configuration")
    if "--disable-autodetect" not in buildconf:
        raise SystemExit("release FFmpeg provenance is missing --disable-autodetect")
    if "--enable-zlib" not in buildconf:
        raise SystemExit("release FFmpeg provenance is missing --enable-zlib")

    probe_version_output = subprocess.run([str(probe), "-version"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, check=True).stdout
    probe_first = probe_version_output.splitlines()[0] if probe_version_output else ""
    if PIN["version"] not in probe_first:
        raise SystemExit(f"built ffprobe version mismatch: {probe_first}")
    probe_match = re.search(r"ffprobe version\s+([^\s]+)", probe_first)
    if probe_match is None:
        raise SystemExit(f"could not identify built ffprobe: {probe_first}")
    actual_probe_version = probe_match.group(1)
    configure_flags = sorted(set(part for part in buildconf.split() if part.startswith("--")))
    configure_hash = hashlib.sha256("\n".join(configure_flags).encode("utf-8")).hexdigest()
    license_name = "LGPL-3.0-or-later" if "--enable-version3" in configure_flags else "LGPL-2.1-or-later"

    license_source = source / "COPYING.LGPLv2.1"
    if not license_source.is_file():
        raise SystemExit("verified FFmpeg source is missing COPYING.LGPLv2.1")
    license_directory = prefix / "licenses" / "ffmpeg"
    license_directory.mkdir(parents=True, exist_ok=True)
    shutil.copy2(license_source, license_directory / "COPYING.LGPLv2.1")

    source_directory = prefix / "sources" / "ffmpeg"
    source_directory.mkdir(parents=True, exist_ok=True)
    source_inputs = {
        "CEVRA_SOURCE_ARCHIVE.tar.xz": f"ffmpeg-{PIN['version']}.tar.xz",
        "CEVRA_SOURCE_ARCHIVE.tar.xz.asc": f"ffmpeg-{PIN['version']}.tar.xz.asc",
        "CEVRA_SIGNING_KEY.asc": "ffmpeg-devel.asc",
    }
    for source_name, target_name in source_inputs.items():
        source_file = source / source_name
        if not source_file.is_file():
            raise SystemExit(f"verified FFmpeg source artifact is missing: {source_name}")
        shutil.copy2(source_file, source_directory / target_name)
    compiler = compiler_banner(system, env)
    toolchain = {"host": system, "arch": platform.machine() or "unknown", "compiler": compiler, "python": platform.python_version(), "sourceDateEpoch": "0"}
    build_instructions = (
        f"# Reproducing CEVRA FFmpeg {PIN['version']}\n\n"
        f"Verify `ffmpeg-{PIN['version']}.tar.xz` against SHA-256 `{PIN['archiveSha256']}` and its detached signature with the included key.\n\n"
        "Configure the verified source with these exact flags, then run `make` and `make install` using `SOURCE_DATE_EPOCH=0`:\n\n"
        "```text\n" + " ".join(flags) + "\n```\n\n"
        f"Recorded toolchain: `{compiler}` on `{system} {platform.machine()}`.\n"
    )
    (source_directory / "BUILD.md").write_text(build_instructions, encoding="utf-8")

    provenance_directory = prefix / "provenance"
    provenance_directory.mkdir(parents=True, exist_ok=True)
    if system == "Windows":
        assert zlib_prefix is not None and zlib_provenance is not None
        shutil.copytree(zlib_prefix / "licenses/zlib", prefix / "licenses/zlib", symlinks=False)
        shutil.copytree(zlib_prefix / "sources/zlib", prefix / "sources/zlib", symlinks=False)
        shutil.copy2(zlib_prefix / "provenance/zlib.json", prefix / "provenance/zlib.json")

    build_provenance = {
        "id": "ffmpeg",
        "version": actual_version,
        "probeVersion": actual_probe_version,
        "license": license_name,
        "source": source_info["source"],
        "sourceSignature": source_info["signature"],
        "signingFingerprint": source_info["signingFingerprint"],
        "verifiedSignerFingerprint": source_info["verifiedSignerFingerprint"],
        "sourceArchiveSha256": source_info["archiveSha256"],
        "sourceSignatureSha256": source_info["signatureSha256"],
        "signingKeySha256": source_info["signingKeySha256"],
        "verified": True,
        "configureFlags": configure_flags,
        "configureFlagsSha256": configure_hash,
        "ffmpegSha256": sha256(binary),
        "ffprobeSha256": sha256(probe),
        "toolchain": toolchain,
        "sourceArchive": f"sources/ffmpeg/ffmpeg-{PIN['version']}.tar.xz",
        "sourceSignatureFile": f"sources/ffmpeg/ffmpeg-{PIN['version']}.tar.xz.asc",
        "signingKeyFile": "sources/ffmpeg/ffmpeg-devel.asc",
        "buildInstructions": "sources/ffmpeg/BUILD.md",
    }
    if zlib_provenance is not None:
        build_provenance["zlib"] = {
            "version": zlib_provenance["version"],
            "license": zlib_provenance["license"],
            "sourceArchiveSha256": zlib_provenance["sourceArchiveSha256"],
            "librarySha256": zlib_provenance["librarySha256"],
            "staticLink": True,
            "preparedBuildInput": True,
            "provenance": "provenance/zlib.json",
        }
    if build_adjustments:
        build_provenance["buildAdjustments"] = build_adjustments
    (provenance_directory / "ffmpeg.json").write_text(json.dumps(build_provenance, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("source", type=Path)
    ap.add_argument("prefix", type=Path)
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 2)
    ap.add_argument("--zlib-prefix", type=Path)
    args = ap.parse_args()
    build(
        args.source.resolve(),
        args.prefix.resolve(),
        args.jobs,
        args.zlib_prefix.resolve() if args.zlib_prefix is not None else None,
    )
    print(args.prefix.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
