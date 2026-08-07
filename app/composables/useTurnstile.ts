// Cloudflare Turnstile no tiene SDK — es un <script> + una función global `window.turnstile`
// (research.md R5). Se evita una dependencia npm de mantenimiento incierto para esto.

interface TurnstileRenderOptions {
  sitekey: string
  callback: (token: string) => void
  'error-callback'?: () => void
  'expired-callback'?: () => void
  theme?: 'light' | 'dark' | 'auto'
}

interface TurnstileGlobal {
  render: (container: string | HTMLElement, options: TurnstileRenderOptions) => string
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileGlobal
  }
}

const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

let scriptPromise: Promise<void> | undefined

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = TURNSTILE_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('No se pudo cargar el script de Cloudflare Turnstile.'))
    document.head.appendChild(script)
  })

  return scriptPromise
}

export function useTurnstile() {
  const config = useRuntimeConfig()
  const token = ref<string | null>(null)
  const error = ref(false)
  const expired = ref(false)
  let widgetId: string | undefined

  async function render(container: string | HTMLElement) {
    await loadTurnstileScript()
    if (!window.turnstile) {
      error.value = true
      return
    }
    widgetId = window.turnstile.render(container, {
      sitekey: config.public.turnstileSiteKey as string,
      callback: (t) => {
        token.value = t
        error.value = false
        expired.value = false
      },
      'error-callback': () => {
        error.value = true
        token.value = null
      },
      'expired-callback': () => {
        expired.value = true
        token.value = null
      }
    })
  }

  function reset() {
    token.value = null
    error.value = false
    expired.value = false
    if (window.turnstile && widgetId) window.turnstile.reset(widgetId)
  }

  onBeforeUnmount(() => {
    if (window.turnstile && widgetId) window.turnstile.remove(widgetId)
  })

  return { token, error, expired, render, reset }
}
