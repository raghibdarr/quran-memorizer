import { describe, expect, it } from 'vitest'
import { mayHaveSession } from './lazy'

const store = (keys: string[]) => ({ length: keys.length, key: (i: number) => keys[i] ?? null })

describe('mayHaveSession', () => {
  it('is true only with a Supabase auth key or an auth link in the address', () => {
    expect(mayHaveSession(store(['onboarding-complete', 'quran-progress']), 'https://x.test/')).toBe(false)
    expect(mayHaveSession(store(['sb-abcd-auth-token']), 'https://x.test/')).toBe(true)
    expect(mayHaveSession(store(['sb-abcd-auth-token-code-verifier']), 'https://x.test/')).toBe(true)
    expect(mayHaveSession(store([]), 'https://x.test/auth/callback#access_token=abc&type=signup')).toBe(true)
    expect(mayHaveSession(store([]), 'https://x.test/auth/callback?code=abc')).toBe(true)
    expect(mayHaveSession(store([]), 'https://x.test/learn?s=1&l=2')).toBe(false)
  })
})
