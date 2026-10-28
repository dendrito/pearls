// Signs an APK with v1 + v2 + v3 schemes using the local release key.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApkSigner, SigningKey } from 'apk_sign_ts';

const here = dirname(fileURLToPath(import.meta.url));
const [, , input, output] = process.argv;
const signer = new ApkSigner({
  signingKey: SigningKey.fromPEM(
    readFileSync(join(here, 'key.pem'), 'utf8'),
    readFileSync(join(here, 'cert.pem'), 'utf8')
  ),
});
const { signedApk } = await signer.sign(new Uint8Array(readFileSync(input)));
writeFileSync(output, signedApk);
console.log('signed', output);
