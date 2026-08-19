# Data Model: Reportes (013)

Ninguna tabla nueva de negocio (spec.md § Decisiones confirmadas). Los 4 reportes son vistas
calculadas en consulta, en el cliente, a partir de tablas ya existentes. La única pieza de
esquema que cambia es el enum `accion_auditoria` (research.md R4).

## Cambio de esquema: `accion_auditoria`

```sql
alter type accion_auditoria add value 'exportar';
```

Sin cambios de tabla, columna ni política RLS — `auditoria`, `usuario_permisos`,
`acciones_disponibles` ya tienen todo lo necesario (research.md R4).

## Entidades calculadas (no persistidas)

### FilaCostoMantenimiento (US-13.1)

Fuente: `mantenimientos` (`estado='activo'`) `join` `vehiculos` (placa, marca, modelo).

| Campo | Origen | Notas |
|---|---|---|
| `vehiculoId` | `mantenimientos.vehiculo_id` | agrupador del desglose |
| `vehiculoLabel` | `vehiculos.placa/marca/modelo` | |
| `tipo` | `mantenimientos.tipo` | `correctivo` \| `preventivo` |
| `costoTotal` | `sum(mantenimientos.costo_total)` | agregado en JS (research.md R1, mismo patrón `montosMantenimientoPorTipo`) |

Agregación: por vehículo (solo vehículos con ≥1 orden activa en el rango — Clarifications sesión
2026-08-19, FR-005) y por tipo; total general = suma de ambos tipos.

### FilaCombustible (US-13.2)

Fuente: `cargas_combustible` (`estado='activo'`) `join` `vehiculos`.

| Campo | Origen | Notas |
|---|---|---|
| `vehiculoId` | `cargas_combustible.vehiculo_id` | |
| `fecha`, `odometro`, `cantidad`, `costoTotal` | columnas homónimas | |
| `rendimiento` | calculado (research.md R1) | `number \| null` ("N/D" en UI) |

Agregación por vehículo (solo con ≥1 carga activa en el rango): `totalCantidad`,
`totalCosto`, `rendimientoPromedio` (promedio de `rendimiento` no nulo, entre las filas
**visibles** del rango). Total general si no se filtra por vehículo específico.

### FilaVencimiento (US-13.3)

Unión de 3 fuentes, cada una con su propio `tipo`:

| `tipo` | Fuente | Fecha de vencimiento | Etiqueta |
|---|---|---|---|
| `licencia` | `conductores` (`activo` o dado de baja) | `fecha_vencimiento_licencia` | `nombre + apellidos`, `numero_licencia` |
| `poliza` | `vehiculos` (`baja` o no) | `fecha_vencimiento_poliza` (nullable — se excluye si es null) | `placa`, `numero_poliza` |
| `permiso` | `vehiculo_permisos` `join` `permisos` (nombre) `join` `vehiculos` | `fecha_vencimiento` (nullable — se excluye si es null) | `placa`, `permisos.nombre` |

El join a `permisos` (catálogo de tipos de permiso, para `permisos.nombre`) depende de
`tiene_permiso('permisos','ver')` vía la RLS de `permisos_select` — permiso independiente de
`vehiculos.ver`/`conductores.ver`, otorgado por defecto igual que el resto
(`schema_03_ver_y_defaults.sql`), no listado como módulo de origen en spec.md FR-002 hasta el
hallazgo C1 de `/speckit-analyze` (2026-08-19).

| Campo | Notas |
|---|---|
| `tipo` | `licencia` \| `poliza` \| `permiso` |
| `entidadLabel` | ver tabla arriba |
| `fechaVencimiento` | filtro: `>= desde` (si se define) `AND <= hasta` (si se define) — FR-009 |
| `estado` | `vigente` \| `por_vencer` \| `vencido`, umbral de 60 días vs. **hoy** (no vs. el rango filtrado) |

FR-010: incluye vehículos/conductores dados de baja — las 3 queries NO filtran por
`activo`/`baja`.

### FilaCumplimiento (US-13.4)

Dos sub-tablas independientes, ambas agrupadas por `tipoVehiculo`:

**Checklists** — fuente `checklists` (`fecha` en rango) `join` `tipos_vehiculo` (nombre):

| Campo | Notas |
|---|---|
| `tipoVehiculoId` / `tipoVehiculoNombre` | `checklists.tipo_vehiculo_id` ya es directo, sin join a `vehiculos` |
| `porcentajeAprobado` | `aprobados / (aprobados + conObservaciones)`, o `null` ("Sin datos") si el tipo de vehículo no tiene ningún checklist en el rango (Clarifications sesión 2026-08-19) |

**Servicios obligatorios** — fuente `servicios_obligatorios` `join` `vehiculos` (para
`tipo_vehiculo_id`) `join` `tipos_vehiculo`. **No** filtra por el rango de fechas del reporte
(FR-012 — vigencia al momento de generar, no depende del filtro):

| Campo | Notas |
|---|---|
| `tipoVehiculoId` / `tipoVehiculoNombre` | vía `vehiculos.tipo_vehiculo_id` |
| `porcentajeVigente` | `vigentes / (vigentes + vencidos)` — binario (vencido si `fecha_vencimiento < hoy`, si no vigente), o `null` ("Sin datos") si el tipo de vehículo no tiene ningún servicio obligatorio registrado |

Ambas sub-tablas se muestran una junto a otra por tipo de vehículo (mismo `tipoVehiculoId` como
llave de unión visual, aunque las queries son independientes).

El join a `tipos_vehiculo` (para `tipoVehiculoNombre`, en ambas sub-tablas) depende de
`tiene_permiso('tipos_vehiculo','ver')` vía la RLS de `tipos_vehiculo_select` — mismo caso que
`permisos.ver` en FilaVencimiento arriba (spec.md FR-002, hallazgo C1 de `/speckit-analyze`).

## Filtros compartidos

```ts
type RangoFechas = { desde?: string; hasta?: string } // ISO yyyy-mm-dd, ambos opcionales
type FiltrosReporte = RangoFechas & { vehiculoId?: string } // vehiculoId no aplica a US-13.3 ni US-13.4 — ambos usan solo RangoFechas (contracts/reportes.md, corrección `/speckit-analyze` hallazgo F1)
```

Atajos de UI (`últimos 30 días` / `mes en curso` / `mes anterior`) se resuelven a un
`RangoFechas` concreto antes de consultar — mismas funciones ya usadas en `useDashboard.ts`
(`fechaEnDiasISO`, `primerDiaMesISO`, `ultimoDiaMesISO`), reexportadas o duplicadas en el
composable nuevo (`useReportes.ts`) si `useDashboard.ts` no las expone públicamente hoy.

`validarRango(rango: RangoFechas): void` — helper compartido de `useReportes.ts` (FR-004): lanza
un error con mensaje claro si `desde` y `hasta` están definidos y `desde > hasta`. Se llama antes
de ejecutar cualquiera de los 4 métodos de reporte, para que el rechazo sea uniforme entre los 4
reportes en vez de reimplementarse por sección (`/speckit-analyze` hallazgo E1).

## Evento de auditoría de exportación (no es tabla nueva, es una fila más de `auditoria`)

```ts
type AuditarExportacionInput = {
  reporte: 'reporte_mantenimiento' | 'reporte_combustible' | 'reporte_vencimientos' | 'reporte_cumplimiento'
  formato: 'excel' | 'pdf'
  filtros: FiltrosReporte
}
```

Ver contracts/reportes.md § `POST /api/reportes/auditar-exportacion`.
