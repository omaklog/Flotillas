# Contrato: Reportes

## Composable `useReportes.ts` (US-13.1 a US-13.4)

Un método de solo lectura por reporte, mismo patrón que `useDashboard.ts` (un método por
sección, agregación en JS solo donde PostgREST no puede expresarla). Sin `crear`/`editar`/
`eliminar` — es de solo lectura.

- `reporteCostosMantenimiento(filtros: FiltrosReporte)` → `{ total, porTipo: { correctivo,
  preventivo }, porVehiculo: FilaCostoMantenimiento[] }` (data-model.md § FilaCostoMantenimiento).
  Trae `mantenimientos` con `estado='activo'` y `fecha` en `[desde, hasta]`, filtrado
  opcionalmente por `vehiculo_id`; agrega en JS.
- `reporteCombustible(filtros: FiltrosReporte)` → `{ total, porVehiculo: FilaCombustible[] }`.
  Implementa el algoritmo de `research.md R1` (trae historia completa del/los vehículo(s), calcula
  `LAG` en JS, filtra a `[desde, hasta]` para mostrar).
- `reporteVencimientos(rango: RangoFechas)` → `FilaVencimiento[]` (3 queries unidas — licencias,
  pólizas, permisos — cada fila con `estado` calculado según el umbral de 60 días vs. hoy).
- `reporteCumplimiento(rango: RangoFechas)` → `{ checklists: FilaCumplimientoChecklist[],
  serviciosObligatorios: FilaCumplimientoServicio[] }` (dos queries independientes,
  `data-model.md` § FilaCumplimiento — la de servicios obligatorios ignora `rango`).

Los 4 métodos MUST llamar `validarRango(rango)` (data-model.md § Filtros compartidos) como
primer paso, antes de cualquier consulta — lanza si `desde > hasta` (FR-004), con un mensaje
apto para mostrarse directo en la UI (`/speckit-analyze` hallazgo E1).

Cada método MUST lanzar el error de Supabase tal cual (mismo patrón que el resto de composables)
si la consulta falla — RLS ya garantiza que un usuario sin `ver` en el módulo de origen recibe 0
filas, nunca un error (Edge Cases de spec.md), así que ningún método necesita lógica de permisos
propia más allá de lo que la página que lo consume ya verifica con `usePermisos.ts` antes de
mostrar el reporte (FR-002).

## Utilidades de exportación

`app/utils/exportarExcel.ts` — `exportarExcel(nombreArchivo: string, hojas: {
titulo: string, columnas: string[], filas: (string | number)[][] }[]): Promise<void>` — arma un
`Workbook` de `exceljs` (research.md R2) con una hoja por sección relevante del reporte (ej. el
reporte de mantenimiento exporta una hoja "Por tipo" y una hoja "Por vehículo"), dispara la
descarga vía blob.

`app/utils/exportarPdf.ts` — `exportarPdf(nombreArchivo: string, titulo: string, subtitulo:
string, tablas: { titulo: string, columnas: string[], filas: (string | number)[][] }[]): void`
— arma el PDF con `jspdf` + `jspdf-autotable` (research.md R3): encabezado con el nombre del
reporte y el rango de fechas aplicado (`subtitulo`), una tabla `autoTable` por sección, dispara
`doc.save()`.

Ninguna de las dos funciones sabe nada de permisos ni de auditoría — reciben datos ya formateados
por la página/composable que las llama. Las llama el botón "Exportar a Excel"/"Exportar a PDF" de
cada pantalla de reporte, solo si `tienePermiso('reportes', 'exportar')` (FR-014).

Ambas funciones MUST aceptar `filas: []` (arreglo vacío) sin lanzar — generan igual el archivo
con encabezados (`columnas`) y, si la sección incluye una fila de totales, el total en cero
(FR-015, `/speckit-analyze` hallazgo E2). No es un caso especial de código: simplemente no hay
filas de datos que agregar a la tabla/hoja, el resto del armado del archivo es idéntico.

## `POST /api/reportes/auditar-exportacion` (interno, FR-017)

Body: `{ reporte: 'reporte_mantenimiento' | 'reporte_combustible' | 'reporte_vencimientos' |
'reporte_cumplimiento', formato: 'excel' | 'pdf', filtros: FiltrosReporte }`
(`data-model.md` § Evento de auditoría de exportación).

1. `serverSupabaseUser(event)` — `401` si no hay sesión.
2. Resuelve el perfil (`usuarios` por `auth_user_id`) con el cliente de sesión
   (`serverSupabaseClient`, respeta RLS) para obtener `empresa_id`, `rol`, `id`.
3. Verifica el permiso `reportes.exportar`: `rol === 'admin'` siempre pasa; `rol === 'operario'`
   requiere una fila en `usuario_permisos` con `modulo_clave='reportes'` y
   `accion in ('exportar', 'todos')`. Sin ese permiso → `403`.
4. Inserta en `auditoria` con el cliente `service_role` (`server/utils/supabaseAdmin.ts`):
   `{ empresa_id, usuario_id: perfil.id, entidad: body.reporte, entidad_id:
   crypto.randomUUID(), accion: 'exportar', valores_despues: { formato: body.formato, filtros:
   body.filtros } }` (research.md R4 — `entidad_id` sintético, no hay fila real que auditar).
5. Responde `201 { auditado: true }`.

El cliente llama este endpoint **después** de generar el archivo (buffer/blob ya en memoria) y
antes de que termine la interacción del usuario con el botón de exportar — un fallo de este
endpoint MUST NOT impedir la descarga ya iniciada (se loggea el error en consola, no se revierte
la descarga; ver quickstart.md para el caso de prueba).

## Página de reportes

Cuatro secciones (una por reporte) bajo una sola ruta con tabs, o cuatro rutas independientes —
detalle de UI a resolver en `/speckit-tasks` siguiendo el patrón de filtros +
`VDataTable`/tarjetas ya usado en el resto del proyecto (research.md R5). Cada sección MUST
verificar `tienePermiso('reportes', 'ver')` **y** el permiso `ver` del módulo de origen
correspondiente (FR-002) antes de ejecutar su query — si falta cualquiera de los dos, la sección
se oculta o redirige, igual que el resto de páginas del proyecto que ya gatean por permiso antes
de montar su composable.
