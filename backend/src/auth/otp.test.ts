import { describe, expect, it } from 'vitest';

import { SilentLogger, testConfig } from '../test/fakes';
import { codeMatches, generateCode, hashCode, SlidingWindowLimiter, smsText, testCodeFor } from './otp';
import { ConsoleSmsSender } from './sms';

const SECRET = 'test-otp-secret-test-otp-secret-0123456789';

describe('otp codes', () => {
  it('generates 6-digit codes', () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });

  it('hashes phone and code together and compares them', () => {
    const hash = hashCode(SECRET, '+2250700000001', '123456');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(codeMatches(SECRET, '+2250700000001', '123456', hash)).toBe(true);
    expect(codeMatches(SECRET, '+2250700000001', '123457', hash)).toBe(false);
    expect(codeMatches(SECRET, '+2250700000002', '123456', hash)).toBe(false);
    expect(codeMatches('another-secret', '+2250700000001', '123456', hash)).toBe(false);
    expect(codeMatches(SECRET, '+2250700000001', '123456', 'abcd')).toBe(false);
  });

  it('writes the SMS in French with the code first', () => {
    expect(smsText('042117')).toBe('042117 est votre code CréeTonAgent. Il expire dans 10 minutes.');
  });

  it('finds test numbers even when the config spells them differently', () => {
    const config = testConfig({ authTestCodes: new Map([['002250700000000', '111111']]) });
    expect(testCodeFor(config, '+2250700000000')).toBe('111111');
    expect(testCodeFor(config, '+2250700000009')).toBeUndefined();
  });
});

describe('SlidingWindowLimiter', () => {
  it('allows `limit` hits per window and per key', () => {
    const limiter = new SlidingWindowLimiter(2, 60_000);
    const t0 = new Date('2026-10-05T10:00:00Z');
    expect(limiter.hit('a', t0)).toBe(true);
    expect(limiter.hit('a', new Date(t0.getTime() + 10_000))).toBe(true);
    expect(limiter.hit('a', new Date(t0.getTime() + 20_000))).toBe(false);
    expect(limiter.hit('b', t0)).toBe(true);
    // The first hit leaves the window; the rejected one never counted.
    expect(limiter.hit('a', new Date(t0.getTime() + 60_001))).toBe(true);
    expect(limiter.hit('a', new Date(t0.getTime() + 60_002))).toBe(false);
    limiter.reset();
    expect(limiter.hit('a', new Date(t0.getTime() + 60_003))).toBe(true);
  });
});

describe('ConsoleSmsSender', () => {
  it('logs the phone and text', async () => {
    const log = new SilentLogger();
    await new ConsoleSmsSender(log).send('+2250700000001', 'hello');
    expect(log.lines).toEqual([
      { level: 'info', msg: expect.any(String), data: { phone: '+2250700000001', text: 'hello' } },
    ]);
  });
});
