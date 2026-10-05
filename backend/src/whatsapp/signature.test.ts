import { describe, expect, it } from 'vitest';

import { metaFixture, signMetaBody } from './fixtures';
import { verifyMetaSignature } from './signature';

const SECRET = 'app-secret-123';

describe('verifyMetaSignature', () => {
  const { raw } = metaFixture('text');

  it('accepts the HMAC-SHA256 of the raw body', () => {
    expect(verifyMetaSignature(raw, signMetaBody(raw, SECRET), SECRET)).toBe(true);
  });

  it('accepts upper-case hex', () => {
    const header = `sha256=${signMetaBody(raw, SECRET).slice(7).toUpperCase()}`;
    expect(verifyMetaSignature(raw, header, SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const header = signMetaBody(raw, SECRET);
    expect(verifyMetaSignature(raw.replace('Fatou', 'Fatim'), header, SECRET)).toBe(false);
  });

  it('rejects a signature made with another secret', () => {
    expect(verifyMetaSignature(raw, signMetaBody(raw, 'other-secret'), SECRET)).toBe(false);
  });

  it('rejects malformed or missing headers', () => {
    const hex = signMetaBody(raw, SECRET).slice(7);
    for (const header of [undefined, '', 'sha256=', hex, `sha1=${hex}`, `sha256=${hex.slice(2)}`, `sha256=${hex}zz`, `sha256=${'g'.repeat(64)}`]) {
      expect(verifyMetaSignature(raw, header, SECRET)).toBe(false);
    }
  });

  it('rejects when the secret is empty', () => {
    expect(verifyMetaSignature(raw, signMetaBody(raw, ''), '')).toBe(false);
  });
});
