#!/usr/bin/env python3
"""Builds Pearls.apk without the Android SDK/Gradle:
aapt2 (resources+manifest) -> dexgen (smali->dex) -> aligned zip -> v1/v2/v3 signature."""
import os, shutil, subprocess, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TOOLS = os.path.join(ROOT, "tools")
OUT = os.path.join(ROOT, "build")
WWW = os.path.join(ROOT, "www")

def run(*cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout, r.stderr); sys.exit(f"failed: {' '.join(cmd)}")
    return r.stdout

def main():
    shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
    aapt2 = os.path.join(TOOLS, "aapt2"); jar = os.path.join(TOOLS, "android.jar")
    # 1. resources
    run(aapt2, "compile", "--dir", os.path.join(HERE, "res"), "-o", os.path.join(OUT, "res.zip"))
    # 2. assets live under assets/www
    assets = os.path.join(OUT, "assets"); shutil.copytree(WWW, os.path.join(assets, "www"), ignore=shutil.ignore_patterns("icon-512.png"))
    base = os.path.join(OUT, "base.apk")
    run(aapt2, "link", "-I", jar, "--manifest", os.path.join(HERE, "AndroidManifest.xml"),
        "-A", assets, "-o", base, "--auto-add-overlay", "--no-compress-regex", r"\.(png|mp3)$",
        os.path.join(OUT, "res.zip"))
    # 3. dex
    dex = os.path.join(OUT, "classes.dex")
    run(os.path.join(ROOT, "dexgen", "target", "release", "dexgen"), "build", os.path.join(HERE, "smali"), dex)
    # stamp DEX version 035 (readable by every Android version) and recompute signature + checksum
    import hashlib, zlib, struct
    b = bytearray(open(dex, "rb").read())
    b[0:8] = b"dex\n035\x00"
    b[12:32] = hashlib.sha1(bytes(b[32:])).digest()
    b[8:12] = struct.pack("<I", zlib.adler32(bytes(b[12:])) & 0xffffffff)
    open(dex, "wb").write(bytes(b))
    # 4. aligned zip: stored entries start on 4-byte boundaries (resources.arsc must be stored + aligned)
    unsigned = os.path.join(OUT, "unsigned.apk")
    with zipfile.ZipFile(base) as zin, open(unsigned, "wb") as raw:
        zout = zipfile.ZipFile(raw, "w")
        entries = [(i, zin.read(i.filename)) for i in zin.infolist()]
        entries.append((zipfile.ZipInfo("classes.dex", (2008, 1, 1, 0, 0, 0)), open(dex, "rb").read()))
        for info, data in entries:
            ni = zipfile.ZipInfo(info.filename, (2008, 1, 1, 0, 0, 0))
            stored = info.filename == "resources.arsc" or info.filename.endswith(".png") or \
                     (info.filename != "classes.dex" and info.compress_type == zipfile.ZIP_STORED)
            ni.compress_type = zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED
            if stored:
                # local header = 30 + name + extra; pad extra so data offset % 4 == 0
                # zipalign-style padding: a 0xD935 extra field (id, size, alignment, zero fill)
                import struct
                off = raw.tell() + 30 + len(ni.filename.encode())
                L = 6 + ((-(off + 6)) % 4)
                ni.extra = struct.pack("<HHH", 0xD935, L - 4, 4) + b"\x00" * (L - 6)
            zout.writestr(ni, data)
        zout.close()
    # 5. sign (v1+v2+v3)
    final = os.path.join(ROOT, "Pearls.apk")
    run("node", os.path.join(ROOT, "signer", "sign.mjs"), unsigned, final)
    print("APK:", final, os.path.getsize(final), "bytes")

if __name__ == "__main__":
    main()
