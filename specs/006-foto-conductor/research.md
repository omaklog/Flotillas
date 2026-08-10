# Research: Foto del Conductor

Feature pequeña sobre una base ya muy conocida: replica el patrón "foto del vehículo" de
Vehículos (003, US-3.7) sobre Conductores (004). La única decisión técnica real (no una copia
directa) es el enum/carpeta de Storage, ya resuelta en `spec.md` como Decisión Confirmada.

## R1 — `conductores` necesita una columna `foto_archivo_id`, igual que `vehiculos.foto_archivo_id`

**Decision**: se agrega `foto_archivo_id uuid references public.archivos(id)` a `conductores`,
nullable, mismo tipo y mismo criterio que `vehiculos.foto_archivo_id` (Feature 003,
`20260808201217_vehiculos_foto.sql`).

**Rationale**: espejo directo del patrón ya construido; sin historial (spec.md FR-003), un solo
puntero a la foto vigente basta.

**Alternatives considered**: N/A.

## R2 — Nuevo valor de enum `foto_conductor`, y su propio segmento en las políticas de `storage.objects`

**Decision**: `alter type tipo_archivo add value 'foto_conductor'` (mismo mecanismo que Vehículos
usó para agregar `'foto'` — `ALTER TYPE ... ADD VALUE` en su propia transacción, sin insertar
filas que usen el valor nuevo en la misma migración). Las 4 políticas de `storage.objects` del
bucket `documentos` (generalizadas por Conductores 004,
`20260809215241_conductores_ajustes.sql`) se **reemplazan de nuevo** (drop + create) agregando un
tercer segmento a la condición: `(storage.foldername(name))[1] = 'foto_conductor'` →
`tiene_permiso('conductores', 'ver'|'editar')`, además de las dos ramas ya existentes
(`poliza`/`foto` → `vehiculos`, `licencia` → `conductores`).

**Rationale**: spec.md ya documenta por qué reutilizar `foto` rompería el propósito de la
generalización de RLS (un operario con permiso solo en `conductores` no podría subir la foto de
un conductor). Un valor de enum y un segmento de ruta propios mantienen la regla ya establecida:
cada tipo de documento atado a un solo módulo.

**Alternatives considered**: agregar `'foto_conductor'` a la lista de la rama `conductores` ya
existente sin cambiar el nombre de la carpeta (dejar el archivo bajo `foto/...` pero con
`tipo='foto_conductor'` en la fila de `archivos`) — rechazado: la política de `storage.objects`
solo puede leer el *nombre del objeto* (la ruta), no el `tipo` de la fila de `archivos`
correspondiente (son dos capas de RLS independientes — una sobre `storage.objects`, otra sobre
`public.archivos` — sin relación directa entre ambas a nivel de política); el segmento de carpeta
**es** la única señal disponible para la política de Storage, así que debe ser distinto.

## R3 — Reutilizar `validarFoto()` y el flujo `adjuntarFoto` tal cual, sin duplicar lógica

**Decision**: `validarFoto()` (`app/utils/archivos.ts`, ya genérica) se reutiliza sin cambios.
`useConductores.ts` agrega su propio `adjuntarFoto(conductorId, archivo)`, calcado línea por
línea del `adjuntarFoto()` de `useVehiculos.ts` (research.md R4 de Vehículos): sube el archivo,
inserta la fila de `archivos` con `tipo='foto_conductor'`, actualiza
`conductores.foto_archivo_id`, y solo *después* de que eso tuvo éxito borra la foto anterior (si
había) — nunca al revés, para no perder la vigente si un paso intermedio falla (mismo edge case
ya cubierto en Vehículos, spec.md de esta feature FR-004).

**Rationale**: mismo criterio ya aplicado en Conductores (research.md R9 de esa feature) — no se
comparte código entre `useVehiculos.ts` y `useConductores.ts`, cada composable tiene su propia
forma acoplada a su tabla; el *patrón* se replica, el *código* no.

**Alternatives considered**: extraer un helper compartido `adjuntarFotoGenerico()` parametrizado
por tabla/columna — rechazado por la misma razón que Conductores R9 rechazó generalizar
`useEntidadConArchivo()`: solo 2 casos de uso no justifican la abstracción todavía.

## R4 — UI: dropzone en el formulario (mismo marcado que Vehículos), detalle según referencia de Stitch

**Decision**: `FormularioConductor.vue` agrega una zona de adjuntar foto idéntica en estructura a
la de `FormularioVehiculo.vue` (`role="button"`, `tabindex="0"`, input oculto,
`data-testid="foto-input"`, validación vía `validarFoto()`) — sin referencia propia para el
formulario, se reutiliza el marcado ya validado de Vehículos.

Para el detalle de solo lectura (`[id]/index.vue`), sí existe ahora una referencia propia:
`docs/design-references/screens/detalle-conductor-datos-generales.png` ("Detalle de Conductor:
Datos Generales", Stitch, 2026-08-10). A diferencia de Vehículos (foto embebida como bloque
rectangular 240×180 dentro de la tarjeta "Identificación del Vehículo"), el mockup separa la
pestaña "Datos" en dos tarjetas lado a lado: una angosta a la izquierda con la foto como avatar
grande (cuadrado con esquinas redondeadas), el nombre completo debajo, y un chip con el tipo de
licencia debajo del nombre (mapeado a "Conductor Federal"/"Conductor Local" desde
`tipo_licencia`); y una ancha a la derecha con "Datos del conductor" (los campos que ya existen,
sin cambios). El estado vacío (sin foto) usa un ícono de placeholder (`mdi-account`) en el mismo
recuadro, mismo criterio que el estado vacío de Vehículos.

**Rationale**: `CLAUDE.md` exige seguir la referencia de Stitch en vez de inventar el layout una
vez que existe una captura para la pantalla — el layout de 2 tarjetas del mockup es distinto al
patrón de Vehículos y se sigue tal cual para el detalle, no se reutiliza el patrón de Vehículos
por defecto.

**Alternatives considered**: mantener el patrón de Vehículos (foto embebida en la misma tarjeta
que los datos) por consistencia entre módulos — rechazado porque iría en contra de la referencia
de Stitch ya generada para esta pantalla específica, y `CLAUDE.md` prioriza la referencia sobre
la consistencia entre módulos cuando ambas están disponibles.

## R5 — Sin `server/api/` nuevos

**Decision**: igual que el resto del proyecto, `adjuntarFoto` en `useConductores.ts` opera
directo vía `useSupabaseClient()`, protegido por la RLS ya existente de `archivos` y la nueva rama
de `storage.objects` (R2).

**Rationale**: ninguna operación necesita bypass de RLS.

**Alternatives considered**: N/A.
