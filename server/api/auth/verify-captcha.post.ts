interface TurnstileSiteverifyResponse {
  success: boolean
  'error-codes'?: string[]
}

/** Ver contracts/auth.md — POST /api/auth/verify-captcha (US2). No requiere sesión. */
export default defineEventHandler(async (event) => {
  const { token } = await readBody<{ token?: string }>(event)

  if (!token) {
    setResponseStatus(event, 400)
    return { valid: false, error: 'captcha_invalid' }
  }

  const config = useRuntimeConfig()
  const secret = config.turnstileSecretKey as string

  const body = new URLSearchParams()
  body.set('secret', secret)
  body.set('response', token)

  const result = await $fetch<TurnstileSiteverifyResponse>(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      body
    }
  )

  if (!result.success) {
    setResponseStatus(event, 400)
    return { valid: false, error: 'captcha_invalid' }
  }

  return { valid: true }
})
