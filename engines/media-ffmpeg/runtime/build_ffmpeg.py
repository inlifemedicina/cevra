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
MSVC_DEPENDENCY_FILTER_PACKAGED = "sources/ffmpeg/CEVRA_MSVC_DEPENDENCIES.awk"
ZLIB_SELECTION_METHOD = "msvc-static-lib-search-v1"
WINDOWS_SYSTEM_DLLS = frozenset({
    "advapi32.dll", "avicap32.dll", "bcrypt.dll", "cfgmgr32.dll", "combase.dll", "crypt32.dll", "d3d11.dll", "dxgi.dll",
    "dxva2.dll", "gdi32.dll", "kernel32.dll", "mf.dll", "mfplat.dll", "mfreadwrite.dll", "mfuuid.dll",
    "ntdll.dll", "ole32.dll", "oleaut32.dll", "propsys.dll", "rpcrt4.dll", "secur32.dll", "shell32.dll",
    "shlwapi.dll", "user32.dll", "version.dll", "winmm.dll", "ws2_32.dll",
})

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
        "--pkg-config=false",
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


def install_msvc_dependency_filter(source: Path, helper: Path = MSVC_DEPENDENCY_FILTER) -> dict[str, object]:
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
    if count != 4:
        raise SystemExit(f"unexpected FFmpeg MSVC dependency command ({count} matches); refusing an unreviewed build adjustment")
    helper_path = helper.resolve().as_posix()
    replacement = f" | awk -v target=\"$@\" -f {shlex.quote(helper_path)} > $(@:.o=.d)"
    config.write_text(text.replace(expected, replacement), encoding="utf-8")
    return {
        "id": MSVC_DEPENDENCY_FILTER_ID,
        "helperSha256": sha256(helper),
        "helperPath": MSVC_DEPENDENCY_FILTER_PACKAGED,
        "generatedFile": "ffbuild/config.mak",
        "sourcePatternId": "ffmpeg-9.0.1-msvc-inline-awk-v1",
        "sourcePatternSha256": hashlib.sha256(expected.encode("utf-8")).hexdigest(),
        "generatedCommandCount": count,
        "sourceArchiveModified": False,
    }


def validate_unique_zlib_library(prefix: Path, env: dict[str, str]) -> dict[str, object]:
    expected = (prefix / "lib/zlib.lib").resolve(strict=True)
    visible: list[Path] = []
    for raw in env.get("LIB", "").split(";"):
        if not raw:
            continue
        directory = Path(raw)
        candidate = directory / "zlib.lib"
        if candidate.is_file():
            resolved = candidate.resolve(strict=True)
            if resolved not in visible:
                visible.append(resolved)
    if visible != [expected]:
        rendered = [str(path) for path in visible]
        raise SystemExit(f"Windows linker zlib.lib selection is ambiguous or missing: {rendered}")
    return {
        "method": ZLIB_SELECTION_METHOD,
        "pkgConfigDisabled": True,
        "librarySha256": sha256(expected),
        "uniqueVisibleZlibLib": True,
    }


def verify_zlib_configure_probe(source: Path) -> dict[str, object]:
    config_log = source / "ffbuild/config.log"
    config_header = source / "config.h"
    if not config_log.is_file() or not config_header.is_file():
        raise SystemExit("FFmpeg configure did not retain zlib probe evidence")
    log_lines = config_log.read_text(encoding="utf-8", errors="replace").splitlines()
    selected = [line.strip() for line in log_lines if "zlib" in line.lower() or "zlibVersion" in line]
    if not any("zlibVersion" in line for line in selected) or not any("-lz" in line for line in selected):
        raise SystemExit("FFmpeg configure did not prove its zlib link probe")
    if "#define CONFIG_ZLIB 1" not in config_header.read_text(encoding="utf-8", errors="replace"):
        raise SystemExit("FFmpeg configure did not enable zlib")
    bounded = [
        "check_lib zlib zlib.h zlibVersion -lz",
        "config.h:#define CONFIG_ZLIB 1",
        "pkg-config:false",
    ]
    return {
        "enabled": True,
        "probeSymbol": "zlibVersion",
        "linkArgument": "-lz",
        "summarySha256": hashlib.sha256("\n".join(bounded).encode("utf-8")).hexdigest(),
        "summary": bounded,
    }


def binary_dependencies(binary: Path, env: dict[str, str]) -> dict[str, list[str]]:
    proc = subprocess.run(
        ["dumpbin", "/nologo", "/dependents", str(binary)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        env=env,
        timeout=30,
    )
    if proc.returncode != 0:
        raise SystemExit(f"could not inspect Windows binary dependencies: {binary.name}")
    dependencies = sorted(set(re.findall(r"^\s+([A-Za-z0-9_.-]+\.dll)\s*$", proc.stdout, re.MULTILINE)), key=str.lower)
    if not dependencies:
        raise SystemExit(f"Windows binary dependency inventory is empty: {binary.name}")
    if any(name.lower() in {"zlib.dll", "zlib1.dll"} or name.lower().startswith("zlib") for name in dependencies):
        raise SystemExit(f"Windows FFmpeg unexpectedly depends on a dynamic zlib: {dependencies}")
    bundled_names = {path.name.lower() for path in binary.parent.glob("*.dll") if path.is_file()}
    bundled = [name for name in dependencies if name.lower() in bundled_names]
    system = [name for name in dependencies if name.lower() in WINDOWS_SYSTEM_DLLS or name.lower().startswith(("api-ms-win-", "ext-ms-win-"))]
    unexpected = [name for name in dependencies if name not in bundled and name not in system]
    if unexpected:
        raise SystemExit(f"Windows FFmpeg has unexpected external DLL dependencies: {unexpected}")
    return {"all": dependencies, "system": system, "bundled": bundled, "unexpectedExternal": unexpected}


def ffmpeg_png_smoke(binary: Path, probe: Path, env: dict[str, str]) -> dict[str, object]:
    with tempfile.TemporaryDirectory(prefix="cevra-ffmpeg-png-", dir=binary.parent.parent) as temp_name:
        output = Path(temp_name) / "zlib-smoke.png"
        proc = subprocess.run(
            [str(binary), "-hide_banner", "-nostdin", "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=16x16:r=1:d=1", "-frames:v", "1", "-c:v", "png", str(output)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
            timeout=30,
        )
        if proc.returncode != 0 or not output.is_file() or not output.read_bytes().startswith(b"\x89PNG\r\n\x1a\n"):
            detail = "\n".join(proc.stderr.splitlines()[-20:])
            raise SystemExit(f"final FFmpeg PNG/zlib smoke failed: {detail}")
        probe_result = subprocess.run(
            [str(probe), "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height", "-of", "json", str(output)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
            timeout=30,
        )
        try:
            streams = json.loads(probe_result.stdout).get("streams", [])
        except json.JSONDecodeError as exc:
            raise SystemExit("final FFmpeg PNG/zlib smoke produced invalid probe JSON") from exc
        if probe_result.returncode != 0 or streams != [{"codec_name": "png", "width": 16, "height": 16}]:
            raise SystemExit("final FFmpeg PNG/zlib smoke did not decode as the expected frame")
        return {"kind": "png-roundtrip-v1", "status": "pass", "bytes": output.stat().st_size, "sha256": sha256(output)}


def validate_windows_build_instructions(value: str) -> None:
    required = (
        "<FFMPEG_SOURCE>", "<ZLIB_PREFIX>", "<INSTALL_PREFIX>", "SOURCE_DATE_EPOCH=0", "VSLANG=1033",
        "INCLUDE", "LIB", "--pkg-config=false", "--enable-zlib", "ffbuild/config.mak", "exactly four",
        "CEVRA_MSVC_DEPENDENCIES.awk", "make", "DESTDIR=<STAGING_ROOT>",
    )
    missing = [marker for marker in required if marker not in value]
    if missing:
        raise SystemExit(f"Windows FFmpeg BUILD.md is incomplete: {missing}")


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
    zlib_selection: dict[str, object] | None = None
    if system == "Windows":
        if zlib_prefix is None:
            raise SystemExit("Windows FFmpeg build requires --zlib-prefix with the pinned prepared zlib 1.3.2 input")
        zlib_provenance = validate_zlib_prefix(zlib_prefix)
        env["INCLUDE"] = str(zlib_prefix / "include") + (";" + env["INCLUDE"] if env.get("INCLUDE") else "")
        env["LIB"] = str(zlib_prefix / "lib") + (";" + env["LIB"] if env.get("LIB") else "")
        env["VSLANG"] = "1033"
        zlib_selection = validate_unique_zlib_library(zlib_prefix, env)

    # configure is a POSIX shell script. On Windows this script is expected to run inside
    # an MSYS2/Git-Bash environment with the MSVC toolchain environment already activated.
    shell = shutil.which("bash")
    if shell is None:
        raise SystemExit("bash is required to configure FFmpeg")
    make = shutil.which("make")
    if make is None:
        raise SystemExit("make is required to build FFmpeg")

    run([shell, str(configure), *flags], cwd=source, env=env)
    build_adjustments: list[dict[str, object]] = []
    if system == "Windows":
        build_adjustments.append(install_msvc_dependency_filter(source))
        assert zlib_selection is not None
        zlib_selection["configureProbe"] = verify_zlib_configure_probe(source)
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
    if system == "Windows":
        packaged_helper = prefix / MSVC_DEPENDENCY_FILTER_PACKAGED
        shutil.copy2(MSVC_DEPENDENCY_FILTER, packaged_helper)
        if not build_adjustments or build_adjustments[0]["helperSha256"] != sha256(packaged_helper):
            raise SystemExit("packaged MSVC dependency filter does not match the applied build helper")
    compiler = compiler_banner(system, env)
    toolchain = {"host": system, "arch": platform.machine() or "unknown", "compiler": compiler, "python": platform.python_version(), "sourceDateEpoch": "0"}
    if system == "Windows":
        documented_flags = " ".join(
            "--prefix=<INSTALL_PREFIX>" if flag.startswith("--prefix=") else flag for flag in flags
        )
        build_instructions = (
            f"# Reproducing CEVRA FFmpeg {PIN['version']} on Windows x64\n\n"
            f"Verify `ffmpeg-{PIN['version']}.tar.xz` against SHA-256 `{PIN['archiveSha256']}` and its detached signature with the included key. "
            "Prepare the pinned zlib 1.3.2 prefix first according to `../zlib/BUILD.md`.\n\n"
            "Use the Visual Studio x64 developer environment. Set `SOURCE_DATE_EPOCH=0` and `VSLANG=1033`; prepend "
            "`<ZLIB_PREFIX>/include` to `INCLUDE` and `<ZLIB_PREFIX>/lib` to `LIB`. Fail if another active `LIB` directory contains `zlib.lib`.\n\n"
            "Configure `<FFMPEG_SOURCE>` with these exact flags:\n\n"
            f"```text\n{documented_flags}\n```\n\n"
            "After configure, require exactly four generated dependency commands in `<FFMPEG_SOURCE>/ffbuild/config.mak` containing "
            "`awk '/including/ { sub(/^.*file: */, \"\"); gsub(/\\\\/, \"/\"); if (!match($$0, / /)) print \"$@:\", $$0 }'`. "
            "Copy `CEVRA_MSVC_DEPENDENCIES.awk` from beside this BUILD.md to `<FFMPEG_SOURCE>/CEVRA_MSVC_DEPENDENCIES.awk`. "
            "Replace the complete awk pipeline with the invocation below and fail unless exactly four replacements occur:\n\n"
            "```text\n | awk -v target=\"$@\" -f <FFMPEG_SOURCE>/CEVRA_MSVC_DEPENDENCIES.awk > $(@:.o=.d)\n```\n\n"
            "The helper is packaged beside this file as `CEVRA_MSVC_DEPENDENCIES.awk`; verify its SHA-256 against `provenance/ffmpeg.json`. "
            "Run `make`, then `make DESTDIR=<STAGING_ROOT> install`, and promote `<STAGING_ROOT>/<INSTALL_PREFIX>` to the runtime prefix.\n\n"
            f"Recorded toolchain: `{compiler}` on `{system} {platform.machine()}`.\n"
        )
    else:
        build_instructions = (
            f"# Reproducing CEVRA FFmpeg {PIN['version']}\n\n"
            f"Verify `ffmpeg-{PIN['version']}.tar.xz` against SHA-256 `{PIN['archiveSha256']}` and its detached signature with the included key.\n\n"
            "Configure the verified source with these exact flags, then run `make` and `make install` using `SOURCE_DATE_EPOCH=0`:\n\n"
            "```text\n" + " ".join(flags) + "\n```\n\n"
            f"Recorded toolchain: `{compiler}` on `{system} {platform.machine()}`.\n"
        )
    if system == "Windows":
        validate_windows_build_instructions(build_instructions)
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
        assert zlib_selection is not None
        zlib_selection["dynamicZlibDependency"] = False
        zlib_selection["binaryDependencies"] = {
            "ffmpeg": binary_dependencies(binary, env),
            "ffprobe": binary_dependencies(probe, env),
        }
        zlib_selection["functionalSmoke"] = ffmpeg_png_smoke(binary, probe, env)
        build_provenance["zlib"] = {
            "version": zlib_provenance["version"],
            "license": zlib_provenance["license"],
            "sourceArchiveSha256": zlib_provenance["sourceArchiveSha256"],
            "librarySha256": zlib_provenance["librarySha256"],
            "staticLink": True,
            "preparedBuildInput": True,
            "provenance": "provenance/zlib.json",
            "selection": zlib_selection,
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
