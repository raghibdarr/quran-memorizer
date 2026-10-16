import { describe, expect, it } from 'vitest';
import { parseAuthCallback } from './native-auth';

describe('parseAuthCallback', () => {
  it('reads the PKCE code from an OAuth or magic-link return', () => {
    expect(parseAuthCallback('takrar://auth/callback?code=abc123')).toEqual({ code: 'abc123', recovery: false, error: null });
  });

  it('marks a password-reset return', () => {
    expect(parseAuthCallback('takrar://auth/callback?type=recovery&code=xyz')).toEqual({ code: 'xyz', recovery: true, error: null });
  });

  it('reads an error from the fragment', () => {
    expect(parseAuthCallback('takrar://auth/callback#error=access_denied&error_description=User+cancelled')?.error).toBe('User cancelled');
  });

  it('ignores other links', () => {
    expect(parseAuthCallback('takrar://somewhere-else?code=1')).toBeNull();
    expect(parseAuthCallback('https://takrar.app/auth/callback?code=1')).toBeNull();
  });
});
