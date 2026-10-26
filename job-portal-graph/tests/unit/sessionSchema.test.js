/**
 * TEST ONLY — tests/unit/sessionSchema.test.js (Ticket 12)
 *
 * Login body validation. The HTTP session flow itself (401, cookie, /me after
 * a restart) is checked against the throwaway instance in 7688.
 */
import { describe, it, expect } from 'vitest';
import { loginSchema } from '../../src/routes/auth.js';

describe('loginSchema', () => {
  it('normalises the email', () => {
    const parsed = loginSchema.parse({ email: ' User@Example.com ', password: 'secret' });
    expect(parsed.email).toBe('user@example.com');
  });

  it('requires a password and rejects extra fields', () => {
    expect(loginSchema.safeParse({ email: 'user@example.com', password: '' }).success).toBe(false);
    expect(
      loginSchema.safeParse({ email: 'user@example.com', password: 'secret', admin: true }).success,
    ).toBe(false);
  });
});
