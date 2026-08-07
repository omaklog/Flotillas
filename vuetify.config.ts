// Tema Vuetify extraído de docs/design-system.md ("Precision Fleet Systems").
// Fuente de verdad de los tokens: docs/design-system.md — cualquier cambio de marca
// se hace ahí primero y se refleja aquí, no al revés.
export default {
  ssr: true,
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          primary: '#03224d',
          'on-primary': '#ffffff',
          'primary-container': '#1f3864',
          'on-primary-container': '#8ba2d5',

          secondary: '#0b61a1',
          'on-secondary': '#ffffff',
          'secondary-container': '#7cbaff',
          'on-secondary-container': '#004a7d',

          tertiary: '#361e00',
          'on-tertiary': '#ffffff',
          'tertiary-container': '#543100',
          'on-tertiary-container': '#cc995f',

          error: '#ba1a1a',
          'on-error': '#ffffff',
          'error-container': '#ffdad6',
          'on-error-container': '#93000a',

          // No definidos en docs/design-system.md (Stitch no generó success/warning/info) —
          // success viene de la sección "Components > Status Chips" del propio documento;
          // warning/info quedan en los valores por defecto de Vuetify hasta que el diseño los
          // defina explícitamente.
          success: '#2e7d32',
          'on-success': '#ffffff',
          warning: '#fb8c00',
          // T083 (WCAG 2.1 AA): texto blanco sobre este naranja da ~2.37:1 — muy por debajo del
          // mínimo de 4.5:1 para texto normal (afecta el chip "Pendiente" de listados de
          // usuarios). Texto oscuro sobre el mismo naranja da ~6.43:1.
          'on-warning': '#3a1f00',
          info: '#2196f3',
          // Mismo problema que 'on-warning': blanco sobre este azul da ~3.1:1, por debajo de
          // 4.5:1. No se usa hoy en ninguna pantalla, pero se corrige para no heredar el bug
          // el día que se use.
          'on-info': '#062b47',

          background: '#f8f9fa',
          'on-background': '#191c1d',

          surface: '#f8f9fa',
          'on-surface': '#191c1d',
          'surface-variant': '#e1e3e4',
          'on-surface-variant': '#44474f',
          'surface-container-lowest': '#ffffff',
          'surface-container-low': '#f3f4f5',
          'surface-container': '#edeeef',
          'surface-container-high': '#e7e8e9',
          'surface-container-highest': '#e1e3e4',
          'surface-dim': '#d9dadb',
          'surface-bright': '#f8f9fa',
          'surface-tint': '#475e8c',

          'inverse-surface': '#2e3132',
          'inverse-on-surface': '#f0f1f2',
          'inverse-primary': '#afc6fb',

          outline: '#747780',
          'outline-variant': '#c4c6d0',

          // Sidebar de navegación — distinto de `primary`: docs/design-system.md → "Sidebar"
          // pide una variante casi negra específica para el sidebar ("strong visual docking"),
          // confirmada contra las capturas reales de Stitch (dashboard-flotilla.png,
          // listado-flotilla.png), no el navy de marca.
          sidebar: '#1a1f26',
          'on-sidebar': '#ffffff'
        }
      }
    }
  },
  defaults: {
    // Radios por defecto según docs/design-system.md "Shapes": componentes 4px (0.25rem),
    // contenedores grandes 8px (0.5rem) — se ajusta caso por caso donde aplique.
    VCard: { rounded: 'lg' },
    VBtn: { rounded: 'sm' },
    VTextField: { rounded: 'sm', variant: 'outlined', density: 'comfortable' },
    VSelect: { rounded: 'sm', variant: 'outlined', density: 'comfortable' }
  }
}
