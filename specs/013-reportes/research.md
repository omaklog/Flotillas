# Research: Reportes (013)

## R1 — Cálculo de rendimiento de combustible: JS en el cliente, no SQL/RPC

**Decision**: El `LAG` sobre odómetro (spec.md § Decisiones confirmadas, Clarifications sesión
2026-08-19) se calcula **en el composable, en JavaScript**, no con una función/vista de Postgres
nueva. Algoritmo:

1. Traer **toda la historia** de `cargas_combustible` con `estado='activo'` del/los vehículo(s)
   relevantes (sin filtrar por `fecha` — el rango del reporte decide qué filas se **muestran**,
   no cuáles participan en el cálculo, por la Clarification del `LAG` cruzando el límite del
   rango).
2. Ordenar cada grupo (por `vehiculo_id`) por `fecha` ascendente.
3. Recorrer el arreglo ordenado calculando, para cada carga `i > 0`:
   `(odometro[i] − odometro[i-1]) ÷ cantidad[i]`. La carga `i = 0` de cada vehículo (la más
   antigua de toda su historia activa) queda `null` ("N/D").
4. Filtrar el resultado a las filas cuya `fecha` cae dentro de `[desde, hasta]` para mostrar/
   exportar; el promedio del periodo se calcula solo sobre las filas visibles con rendimiento no
   nulo (FR-006).

**Rationale**: Mismo patrón ya establecido en `useDashboard.ts`
(`montosMantenimientoPorTipo`) — PostgREST no soporta funciones de ventana ni `GROUP BY`/`SUM`
agregados en el query builder de `supabase-js`, así que toda agregación de este proyecto ya se
hace trayendo filas mínimas y reduciendo en JS. Introducir una función Postgres (`rpc()`) o una
vista con `LAG` sería el primer caso del proyecto que rompe ese patrón, sin necesidad real: el
volumen de cargas de combustible de una flotilla (incluso de varios años) es manejable en
memoria del navegador, y la constitución (§1) prioriza simplicidad operativa.

**Alternatives considered**:
- Vista SQL o función `rpc()` con `LAG() OVER (PARTITION BY vehiculo_id ORDER BY fecha)` —
  correcta y más eficiente en volumen extremo, pero introduce el primer objeto de esquema
  "de lectura" del proyecto (hasta ahora todas las migraciones son tablas/triggers/RLS, nunca
  vistas ni funciones invocadas por el cliente) y contradice la decisión ya confirmada del spec
  de "no requiere schema nuevo". Se descarta por ahora; queda como optimización futura si el
  volumen real de una flotilla lo justifica.
- Calcular el rendimiento solo dentro del rango filtrado (ignorar historial previo) — descartado
  explícitamente por la Clarification de `/speckit-clarify` (sesión 2026-08-19, Q1).

## R2 — Exportación a Excel: `exceljs`, generado 100% en el cliente

**Decision**: Nueva dependencia `exceljs`. El composable/página arma un `Workbook` en memoria
(encabezados + filas + fila de totales) y usa `workbook.xlsx.writeBuffer()` → `Blob` →
descarga vía un `<a>` temporal con `URL.createObjectURL`, igual que cualquier descarga de
archivo ya existente en el proyecto (`descargarArchivo` en cada composable de listado, que ya
usa `createSignedUrl` + descarga de blob).

**Rationale**: No existe ningún endpoint `server/api/` de solo lectura en el proyecto — todos los
listados consultan Supabase directo desde el cliente (research.md de features anteriores, mismo
patrón confirmado en `useCargasCombustible.ts`, `useDashboard.ts`). Generar el archivo también en
el cliente evita ser la primera feature en introducir un endpoint de servidor solo para
"renderizar lo que el cliente ya tiene en memoria". `exceljs` tiene build de navegador oficial,
soporta encabezados con estilo (negritas, anchos de columna) sin dependencias nativas, y es la
opción más usada para generar `.xlsx` reales (no CSV) desde JS sin backend.

**Alternatives considered**:
- `xlsx` (SheetJS Community Edition) — también viable, API más minimalista; se prefiere
  `exceljs` por su soporte más directo de estilos de encabezado (útil para que el Excel
  exportado sea legible sin trabajo extra) y por ser la opción con mejor mantenimiento activo al
  momento de esta decisión.
- Generar el archivo en un endpoint `server/api/reportes/exportar.post.ts` — descartado: movería
  la única fuente de verdad de los datos (hoy 100% RLS + cliente) a un segundo camino de lectura
  server-side que tendría que duplicar cada query ya escrita en el composable, sin beneficio real
  (el archivo de todas formas via download, no hay streaming de archivos grandes en el volumen
  esperado).

## R3 — Exportación a PDF: `jspdf` + `jspdf-autotable`, también en el cliente

**Decision**: Nuevas dependencias `jspdf` y `jspdf-autotable`. Mismo criterio que R2: se arma el
PDF en memoria (`jsPDF` + `autoTable` para la tabla de datos, encabezado con nombre del reporte y
rango de fechas aplicado) y se descarga con `doc.save(nombreArchivo)`.

**Rationale**: Es la combinación más usada para "tabla de datos → PDF" puramente client-side sin
un motor de renderizado HTML→PDF pesado (`puppeteer`/`playwright` como generador de PDF en
producción implicaría empaquetar un Chromium headless en el servidor Nitro — desproporcionado
para 4 reportes tabulares, y el proyecto ya usa Playwright solo como herramienta de test, nunca
como dependencia de runtime, constitución §4).

**Alternatives considered**:
- `pdfmake` — también viable (declarativo, buen soporte de tablas), pero `jspdf-autotable` tiene
  una API más directa para "array de filas → tabla" sin tener que aprender su formato de
  document-definition propio.
- PDF generado server-side con una librería Node headless-browser — descartado por el motivo de
  peso/operación ya explicado; iría en contra de la simplicidad operativa (constitución §1).

## R4 — Auditoría de exportaciones: endpoint privilegiado nuevo, no insert directo del cliente

**Decision**: Nuevo endpoint `server/api/reportes/auditar-exportacion.post.ts`. Recibe
`{ reporte, formato, filtros }` del cliente ya autenticado, verifica la sesión
(`serverSupabaseUser`), confirma que el usuario tiene el permiso `reportes.exportar` (admin por
rol, u operario con el permiso explícito en `usuario_permisos`) y, si es válido, inserta en
`auditoria` usando el cliente `service_role` (`server/utils/supabaseAdmin.ts`, ya existente) con
`accion='exportar'`, `entidad` = clave del reporte (`reporte_mantenimiento` /
`reporte_combustible` / `reporte_vencimientos` / `reporte_cumplimiento`), `entidad_id` = un uuid
sintético generado en el propio endpoint (no hay una fila real que auditar — un reporte no es una
entidad de negocio), y `valores_despues` = `{ formato, filtros }` (jsonb). El botón de
exportación llama a este endpoint **después** de generar el archivo (R2/R3) y antes/junto con
disparar la descarga.

**Rationale**: `useAuditoria.ts` documenta explícitamente una decisión arquitectónica ya tomada
en el proyecto: *"`auditoria` solo se escribe vía triggers, nunca directo desde el cliente"*. La
política RLS `auditoria_insert` sí permitiría un insert directo desde cualquier usuario de la
misma empresa (solo valida `empresa_id`, no el permiso `exportar`), pero seguir esa ruta
rompería esa convención ya establecida y dejaría la verificación del permiso `exportar` sin
ningún gate real más allá de "el botón estaba oculto en la UI" (`usePermisos.ts` es explícito:
solo es UI, la autorización real vive en otra capa). El endpoint nuevo es esa capa para este caso
puntual — mismo patrón ya usado por `server/api/alertas/notificar.post.ts` (acción privilegiada
vía `service_role`, secreto/sesión verificada antes de escribir).

**Alternatives considered**:
- Insert directo del cliente a `auditoria` — descartado por lo anterior (rompe convención
  documentada + sin verificación real del permiso `exportar`).
- Nueva tabla `reporte_exportaciones` que se audite sola vía el trigger genérico ya existente
  (`private.registrar_auditoria()`, agregándola al arreglo de `schema_13`) — descartado: crea una
  tabla de negocio nueva solo para tener a quién auditar, contradiciendo la decisión ya confirmada
  en `spec.md` ("Reportes... no requiere schema nuevo... ninguno persiste su propio resultado").
- Dejar `entidad_id` nullable vía migración — innecesario: `entidad_id` no tiene FK real (es un
  campo polimórfico de texto/uuid resuelto en conjunto con `entidad`), así que un uuid sintético
  generado en el endpoint (`crypto.randomUUID()`) satisface la columna `not null` sin tocar su
  definición.

**Migración necesaria**: `accion_auditoria` (enum) no incluye `'exportar'` — se agrega con
`alter type accion_auditoria add value 'exportar';` en una migración dedicada (Postgres exige que
un valor de enum agregado no se use en la misma transacción en la que se agrega; una migración
propia, separada de cualquier otro cambio, evita el problema). El permiso `reportes.exportar` en
sí **ya existe** en el catálogo (`acciones_disponibles`, `schema_02_permisos.sql:113`) y `ver` ya
viene otorgado por defecto a todo operario (`schema_03_ver_y_defaults.sql:100`) — nada que
sembrar ahí.

## R5 — Referencia visual (Stitch): sin pantalla dedicada, se reutilizan componentes ya aprobados

**Decision**: El proyecto Stitch (`docs/design-references/screens.md`) no tiene ninguna pantalla
de "Reportes" (se confirmó listando las 17 pantallas existentes vía `list_screens` — la más
cercana es "Dashboard de Flotilla", que es la pantalla de Feature 012, un layout de KPIs/gráficas
distinto al tabular que pide esta feature). En vez de generar una pantalla nueva en Stitch antes
de implementar, esta feature reutiliza **exclusivamente** primitivas visuales ya aprobadas y
documentadas en `docs/design-system.md`, sin introducir ningún token/valor nuevo:

- Barra de filtros: mismo patrón que `app/pages/admin/mantenimiento/index.vue` (tarjeta
  `app-card-shadow` + `v-autocomplete`/`v-text-field type="date"`/`v-select`, `density="compact"`,
  `data-testid` por campo) — solo cambia qué filtros aplican por reporte (spec.md FR-003/FR-009).
- Tabla paginada: patrón ya normado en `docs/design-system.md` línea 174 ("Toda tabla que pueda
  superar los registros de una página pagina en cliente... 10 por página por defecto"), mismo
  componente de paginación que `TablaCatalogo.vue`.
- Botones de exportación (único elemento nuevo de esta feature): variante "secundaria" ya definida
  (`docs/design-system.md` línea 170, "Secondary buttons use a subtle gray border with the Accent
  Blue for text" → `variant="outlined"`, mismo criterio que el botón "Filtros" ya documentado en
  línea 180), con `prepend-icon="mdi-file-excel"` / `prepend-icon="mdi-file-pdf-box"`
  respectivamente — íconos ya incluidos en `@mdi/font` (dependencia ya instalada), sin necesidad
  de un asset nuevo.
- Tarjetas de resumen (totales del reporte de mantenimiento/combustible, porcentajes del reporte
  de cumplimiento): mismo componente de tarjeta KPI ya introducido en el Dashboard (Feature 012,
  pantalla "Dashboard de Flotilla" sí tiene referencia Stitch).

**Rationale**: `CLAUDE.md` exige leer `docs/design-system.md` + referencias antes de tocar
CSS/markup y no inventar valores — no exige que cada pantalla nueva tenga su propio mockup de
Stitch si se compone enteramente de elementos ya validados en pantallas anteriores. Reportes no
introduce ningún patrón visual nuevo (no hay gráficas nuevas, no hay color/espaciado/sombra
nuevo) salvo el botón de exportación, que ya queda cubierto por un patrón de botón existente
citado arriba. Si en la fase de implementación surge un elemento genuinamente nuevo no cubierto
por `docs/design-system.md` (por ejemplo, cómo se ve visualmente una celda "N/D" o "Sin datos"),
la persona implementando MUST volver a `docs/design-system.md` primero y, si de verdad no hay
precedente, fetch una pantalla nueva de Stitch antes de decidir por su cuenta — no se guessea.

**Alternatives considered**: Generar una pantalla nueva en Stitch antes de continuar con el plan
— no bloqueante dado que el flujo `tools/call` documentado en `CLAUDE.md` solo cubre
`list_screens`/descarga de pantallas **existentes**, no generación de pantallas nuevas (esa
función no está documentada como parte del workaround); forzar esa llamada sin saber el nombre de
la tool correcta arriesga una llamada fallida o un efecto no deseado en el proyecto Stitch
compartido. Se documenta como decisión abierta para quien implemente, no se bloquea el plan por
esto.

## R6 — Límite de 1000 filas de PostgREST: mismo riesgo aceptado ya documentado

**Decision**: No se agrega paginación de servidor ni límite especial para las consultas de
reportes (mantenimientos/cargas de combustible/checklists de un rango amplio podrían, en teoría,
superar el límite por defecto de PostgREST de 1000 filas por respuesta).

**Rationale**: Mismo riesgo ya identificado y aceptado explícitamente en
`specs/012-alertas-dashboard/plan.md` § Technical Context para el listado de alertas sin filtrar
— el volumen real de datos de prueba/flotillas actuales no lo alcanza, y agregar paginación de
servidor a las 4 consultas de reportes sería una optimización prematura fuera del alcance de esta
feature (spec.md § Assumptions ya lo señala: "sigue el mismo patrón de listado ya usado... sin un
límite especial propio de Reportes").
