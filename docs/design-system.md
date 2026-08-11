---
name: Precision Fleet Systems
source: Stitch (stitch.googleapis.com) — proyecto "FleetControl Enterprise"
stitchProjectId: "4499192746969655413"
extracted: 2026-08-05
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#44474f'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#747780'
  outline-variant: '#c4c6d0'
  surface-tint: '#475e8c'
  primary: '#03224d'
  on-primary: '#ffffff'
  primary-container: '#1f3864'
  on-primary-container: '#8ba2d5'
  inverse-primary: '#afc6fb'
  secondary: '#0b61a1'
  on-secondary: '#ffffff'
  secondary-container: '#7cbaff'
  on-secondary-container: '#004a7d'
  tertiary: '#361e00'
  on-tertiary: '#ffffff'
  tertiary-container: '#543100'
  on-tertiary-container: '#cc995f'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#afc6fb'
  on-primary-fixed: '#001a41'
  on-primary-fixed-variant: '#2e4673'
  secondary-fixed: '#d1e4ff'
  secondary-fixed-dim: '#9ecaff'
  on-secondary-fixed: '#001d36'
  on-secondary-fixed-variant: '#00497c'
  tertiary-fixed: '#ffddbb'
  tertiary-fixed-dim: '#f4bc7f'
  on-tertiary-fixed: '#2b1700'
  on-tertiary-fixed-variant: '#643e0c'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
  # Formalizado como token el 2026-08-07 — ya estaba descrito en prosa en "## Components >
  # Sidebar" pero no en esta lista estructurada. Es un color aparte de `primary`: el sidebar
  # usa esta variante casi negra para "strong visual docking", no el navy de marca.
  sidebar: '#1a1f26'
  on-sidebar: '#ffffff'
typography:
  page-title:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  section-title:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-main:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  metadata:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  page-title-mobile:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  sidebar-width: 260px
  topbar-height: 64px
  gutter: 24px
  margin-page: 32px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
---

## Origen

Este documento fue generado por Stitch (Text-to-UI de Google) junto con las 7
pantallas del proyecto `FleetControl Enterprise` y extraído vía el MCP server
`stitch.googleapis.com/mcp` el 2026-08-05. Es la fuente de verdad de tokens
visuales (color, tipografía, spacing, radios) para implementar el tema de
Vuetify de este proyecto — no se debe reinterpretar a mano sin actualizar
también este archivo.

Ver `docs/design-references/screens.md` para las capturas de pantalla de
referencia asociadas a cada módulo funcional.

## Brand & Style
The design system is engineered for high-performance B2B logistics and enterprise fleet management. The personality is authoritative, precise, and utilitarian, drawing inspiration from high-end developer tools and fintech platforms.

The aesthetic is **Corporate Modern** with a focus on high information density and technical clarity. It utilizes a refined layering system of pure white surfaces over a cool-toned gray base, accented by sophisticated glassmorphism. The interface prioritizes readability and rapid data processing, ensuring that critical fleet metrics are accessible at a glance without visual fatigue.

## Colors
The palette is anchored by a deep Navy Blue primary color, conveying stability and professional trust. The background uses a specific off-white (#FAFBFC) to reduce glare compared to pure white, while interactive surfaces use pure white to pop against the base.

- **Semantic Logic:** Every status color is paired with a specific light-tinted background for high-legibility badges and alerts.
- **Glassmorphism:** Surfaces utilize a 90% opacity white with an 8px backdrop blur to create a sense of depth and modern sophistication.
- **Grayscale:** Secondary and tertiary grays are strictly neutral to ensure they do not clash with the blue brand anchors.

## Typography
This design system utilizes **Inter** for its systematic, utilitarian nature and exceptional legibility at small sizes—crucial for data-heavy fleet tables.

- **Scale:** A tight typographic scale is used to maintain high information density.
- **Hierarchy:** Page titles use negative letter-spacing for a "premium" feel, while metadata and labels use standard or increased tracking to ensure readability in dense layouts.
- **Functional Use:** `label-caps` is reserved for table headers and small category descriptors to provide clear visual separation from data values.

## Layout & Spacing
The layout follows a **Fixed-Fluid Hybrid** model. A fixed-width left sidebar (260px) provides primary navigation, while the main content area occupies the remaining fluid width, constrained by a max-width on extremely wide monitors to preserve line lengths.

- **Grid:** A 12-column grid is used within the content area.
- **Density:** Elements are spaced using an 8px baseline grid. For data tables, a "compact" mode is encouraged, reducing row heights to 40px.
- **Breakpoints:**
  - Mobile (<768px): Sidebar collapses into a hamburger menu; page margins reduce to 16px.
  - Tablet (768px - 1024px): Sidebar may transition to an icon-only "rail" to maximize workspace.
  - Desktop (>1024px): Standard full-layout.

## Elevation & Depth
Depth is communicated through a combination of **Tonal Layering** and **Ambient Shadows**.

- **Level 0 (Base):** #FAFBFC background.
- **Level 1 (Cards/Panels):** Pure white with 90% opacity, 8px blur, and a 1px border (#E2E8F0). Shadow: `0 2px 8px rgba(16,24,40,0.06)`.
- **Level 2 (Hover/Active):** Lifted state. Shadow increases to `0 4px 12px rgba(16,24,40,0.08)`.
- **Level 3 (Modals/Overlays):** Significant depth. Shadow: `0 8px 24px rgba(16,24,40,0.12)`.

Strict "Flat" design is applied to status badges and tags to prevent them from competing with interactive card surfaces.

## Shapes
The shape language is **Soft** and professional.

- **Components:** Buttons, input fields, and small cards use a 4px (`0.25rem`) radius.
- **Containers:** Main dashboard widgets and larger panels use 8px (`0.5rem`).
- **Icons:** Use a 2px stroke weight with slight rounding on terminals to match the font's geometry.
- **Interactive States:** Maintain consistent corner radii during state transitions (e.g., hover/active) to avoid visual jarring.

## Components
- **Buttons:** Primary buttons use the Navy Blue (#1F3864) background with white text. Secondary buttons use a subtle gray border with the Accent Blue for text.
- **Inputs:** Clean, 1px bordered boxes. On focus, the border transitions to Accent Blue with a 2px soft outer glow (halo) using the primary color at 10% opacity.
- **Status Chips:** Low-contrast badges. Example: Success is #2E7D32 text on #E8F5E9 background with no border.
- **Data Tables:** Zebra striping is avoided in favor of subtle 1px horizontal dividers (#F1F5F9). Row hover state uses #F8FAFC.
- **Pagination:** Toda tabla que pueda superar los registros de una página pagina en cliente, por defecto a **10 elementos por página** (seleccionable entre 5/10/20 vía un control "Por página" junto al resumen), con un resumen "Mostrando X a Y de Z {entidad}" a la izquierda y un `v-pagination` (`density="comfortable"`, `total-visible="5"`, `variant="text"`, `active-color="primary"`, `rounded="lg"`) a la derecha, debajo de la tabla — no se muestra si hay 0 o 1 página. La búsqueda/filtro y el cambio de "Por página" reinician la paginación a la página 1. Estilo de los botones: la página activa es un cuadrado navy sólido (`primary`/`on-primary`) con esquinas redondeadas; páginas inactivas, elipsis y flechas prev/next quedan sin fondo (solo texto/ícono) — Vuetify no soporta variantes distintas por botón vía props, así que el relleno sólido de la activa se fuerza con una regla CSS dirigida a `.v-pagination__item--is-active` (ver `app/components/catalogos/TablaCatalogo.vue`). Referencia: `screens/listado-operarios-paginacion.png` (Stitch) y `app/pages/admin/usuarios/index.vue`.
- **Cards:** Must contain a header section with a 1px bottom border when housing complex data or charts.
- **Sidebar:** Dark theme variant for the sidebar is permitted to create strong visual docking, using #1A1F26 as the background for high contrast against the light content area.
- **List screens (patrón estándar):** Toda pantalla de listado (operarios, y las que se agreguen después — vehículos, mantenimientos, etc.) sigue esta estructura, en este orden:
  1. Header: `<h1 class="text-page-title">` + subtítulo `<p class="text-metadata text-medium-emphasis">` a la izquierda, botón primario de alta (`color="primary-container"`, `prepend-icon="mdi-plus"`) a la derecha, en una fila `d-flex justify-space-between`.
  2. El alta se hace en un **modal** (`v-dialog` + `app-modal-shadow`), no inline en la página — mantiene la lista visible y es consistente entre pantallas.
  3. Fila de búsqueda + filtros: `v-text-field` de búsqueda (busca por los campos relevantes, ej. nombre y correo) a la izquierda, botón "Filtros" (`variant="outlined"`, `prepend-icon="mdi-filter-variant"`) a la derecha, abre un `v-menu` con checkboxes sobre los campos filtrables reales del dominio — no se inventan columnas/filtros que el dominio no tiene.
  4. Tabla: la columna principal (nombre/identificador) va acompañada de un avatar de iniciales (`useAvatarIniciales()` — sin foto de perfil en el dominio, color determinístico por id). Acciones como iconos con tooltip (ver más abajo), no texto.
  5. Pie: resumen + paginación (ver "Pagination" arriba).

  Referencia: `screens/listado-operarios.png` (Stitch) y `app/pages/admin/usuarios/index.vue`, la implementación de referencia.
