#!/usr/bin/env python3
"""Builds Pearls.aab (Android App Bundle, what Google Play requires) from the same inputs as build_apk.py, which
must run first (it leaves build/classes.dex, build/res.zip and build/assets).

Layout (https://developer.android.com/guide/app-bundle/app-bundle-format):
  BundleConfig.pb, base/manifest/AndroidManifest.xml, base/resources.pb, base/res/..., base/assets/..., base/dex/classes.dex
The resources come from aapt2 in protobuf format. The bundle is signed with the upload key (signer/*.pem) by jarsigner.
It is assembled here rather than by bundletool; bundletool (tools/) is only used to validate it and, in tests, to
turn it back into APKs."""
import os, shutil, subprocess, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
TOOLS = os.path.join(ROOT, "tools"); OUT = os.path.join(ROOT, "build")
BUNDLETOOL = os.path.join(TOOLS, "bundletool-all-1.17.2.jar")

def run(*cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout, r.stderr); sys.exit(f"failed: {' '.join(cmd[:4])} …")
    return r.stdout

def pb_string(field, s):
    b = s.encode(); return bytes([(field << 3) | 2, len(b)]) + b

def main():
    aapt2 = os.path.join(TOOLS, "aapt2"); jar = os.path.join(TOOLS, "android.jar")
    for need in ("classes.dex", "res.zip", "assets"):
        if not os.path.exists(os.path.join(OUT, need)): sys.exit("run android/build_apk.py first")
    proto = os.path.join(OUT, "proto.zip")
    run(aapt2, "link", "--proto-format", "-I", jar, "--manifest", os.path.join(HERE, "AndroidManifest.xml"),
        "-A", os.path.join(OUT, "assets"), "-o", proto, "--auto-add-overlay", os.path.join(OUT, "res.zip"))
    unsigned = os.path.join(OUT, "unsigned.aab")
    with zipfile.ZipFile(proto) as zin, zipfile.ZipFile(unsigned, "w", zipfile.ZIP_DEFLATED) as z:
        # BundleConfig { bundletool { version = "1.17.2" } }: the format version this bundle follows
        inner = pb_string(2, "1.17.2")
        z.writestr("BundleConfig.pb", bytes([0x0A, len(inner)]) + inner)
        for info in zin.infolist():
            n = info.filename
            if n == "AndroidManifest.xml": dst = "base/manifest/AndroidManifest.xml"
            elif n == "resources.pb" or n.startswith("res/") or n.startswith("assets/"): dst = "base/" + n
            else: continue
            z.writestr(zipfile.ZipInfo(dst, (2008, 1, 1, 0, 0, 0)), zin.read(n), compress_type=zipfile.ZIP_DEFLATED)
        z.write(os.path.join(OUT, "classes.dex"), "base/dex/classes.dex")
    # sign with the upload key (same key as the APK)
    p12 = os.path.join(OUT, "upload.p12"); pw = "pearls-build"
    run("openssl", "pkcs12", "-export", "-in", os.path.join(ROOT, "signer", "cert.pem"), "-inkey", os.path.join(ROOT, "signer", "key.pem"),
        "-out", p12, "-name", "pearls", "-passout", "pass:" + pw)
    final = os.path.join(ROOT, "Pearls.aab"); shutil.copy(unsigned, final)
    run("jarsigner", "-keystore", p12, "-storetype", "PKCS12", "-storepass", pw, "-sigalg", "SHA256withRSA",
        "-digestalg", "SHA-256", final, "pearls")
    os.remove(p12)
    if os.path.exists(BUNDLETOOL): run("java", "-jar", BUNDLETOOL, "validate", "--bundle", final)
    print("AAB:", final, os.path.getsize(final), "bytes")

if __name__ == "__main__":
    main()
