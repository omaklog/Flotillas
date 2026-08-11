# Research: Historial por Vehículo y Bitácora de Auditoría

## R1 — La auditoría automática de las 19 tablas de negocio ya está completa; solo falta `usuario_permisos`

**Decision**: No aplicar `schema_13_bitacora_auditoria_automatica.sql` tal cual. Su función
genérica `private.registrar_auditoria()` y el bloque `do $$ ... foreach t in array tablas ...`
que conecta 19 tablas se **descarta por completo** — cada una de esas 19 tablas ya tiene su
propio trigger de auditoría, agregado incrementalmente por Features 001-010 (spec.md §
Assumptions ya documenta el hallazgo completo, tabla por tabla). Lo único que esta feature aplica
de `schema_13` es la pieza final, sin cobertura previa:

```sql
create trigger trg_auditoria_usuario_permisos
  after insert or delete on public.usuario_permisos
  for each row execute function private.registrar_auditoria();
```

Esto SÍ requiere crear la función `private.registrar_auditoria()` (no existe todavía, ninguna
migración previa la definió con ese nombre exacto — las funciones dedicadas de otras features se
llaman distinto, `audit_vehiculos()`, `audit_cargas_combustible()`, etc.), pero el trigger en sí
solo se conecta a `usuario_permisos`, no a las 19 tablas del script original.

**Rationale**: Aplicar el bloque completo duplicaría cada fila de auditoría en 19 tablas — un
riesgo de correctness real, no solo de estilo, que rompería silenciosamente cualquier prueba
existente que asuma una fila de auditoría por evento (varias features anteriores ya tienen tests
así).

**Alternatives considered**: Reemplazar los 19 triggers dedicados por el genérico —
rechazado: fuera de alcance de esta feature (no se pidió refactorizar auditoría existente que ya
funciona), y touching 19 migraciones ya aplicadas en producción local sin necesidad real
aumenta el riesgo sin ningún beneficio para esta feature.

## R2 — La línea de tiempo se arma componiendo los composables ya existentes, no con una consulta UNION nueva

**Decision**: A diferencia de lo que sugería la descripción original de la feature ("se arma con
un UNION directo"), la línea de tiempo (US-11.1) se construye en el cliente llamando en paralelo
a los métodos `listar()`/`listarHistorialVehiculo()` **ya existentes** de cada composable,
filtrando por `vehiculo_id`, y mezclando los resultados:

- `useCargasCombustible().listar({ vehiculoId })`
- `useMantenimientos().listar({ vehiculoId })`
- `useChecklists().listar({ vehiculoId })`
- `useServiciosObligatorios().listar({ vehiculoId })`
- `useAsignaciones().listarHistorialVehiculo(vehiculoId)` — **ya existe**, ya usado por
  `VehiculosConductorAsignado.vue` para la tabla de historial de esa misma pestaña.

Un nuevo composable `useHistorialVehiculo.ts` orquesta las 5 llamadas con `Promise.all`, mapea
cada fila a una forma unificada `EventoHistorial` (tipo, fecha, resumen, ícono/color, ruta de
detalle), concatena, y ordena por fecha descendente en JS.

**Rationale**: Cada composable ya filtra correctamente por RLS/permiso de su propio módulo, ya
está probado, y ya tiene la forma de datos que su feature necesita (incluyendo joins como
`vehiculos(...)`/`conductores(...)`) — reimplementar el mismo filtrado con una consulta SQL nueva
(vista o función) duplicaría lógica ya correcta y añadiría una nueva superficie de RLS que
mantener. Es también el patrón "sin `server/api/`, todo por `useSupabaseClient()`" que el resto
del proyecto ya sigue sin excepción.

**Alternatives considered**: Vista SQL (`create view v_historial_vehiculo as ... union all ...`)
— rechazada: es la primera vista/función de listado que tendría este proyecto (ninguna feature
anterior usa una), y sería más difícil de mantener en sincronía con los `select` (columnas para
resumen) que cada composable ya trae; además cada tabla de origen ya tiene su índice compuesto
`(empresa_id, vehiculo_id, fecha[...] desc)` (schema_04_indices.sql) que 5 consultas paralelas
aprovechan igual de bien que una vista.

## R3 — Fuentes con forma distinta: mapeo de cada una a `EventoHistorial`

**Decision**: Tabla de mapeo tipo → color/ícono → resumen → ruta de detalle:

| Fuente | Fecha usada | Ícono | Color | Resumen | Ruta de detalle |
|---|---|---|---|---|---|
| Carga de combustible | `fecha` | `mdi-gas-station-outline` | primary | `Carga de combustible — {cantidad} L — ${costo_total}` | `/admin/combustible/{id}` |
| Mantenimiento | `fecha` | `mdi-wrench-outline` | primary | `Mantenimiento {tipo} — ${costo_total}` | `/admin/mantenimiento/{id}` |
| Checklist | `fecha` | `mdi-clipboard-check-outline` | según `resultado` (success/warning) | `Checklist — {resultado}` | `/admin/checklist/{id}` |
| Servicio obligatorio | `fecha_realizado` | `mdi-file-certificate-outline` | primary | `{etiquetaTipo(tipo)}` | `/admin/servicios-obligatorios/{id}` |
| Cambio de conductor | `fecha_inicio` | `mdi-account-switch-outline` | secondary | `Conductor asignado — {nombre} {apellidos}` (o "Conductor removido" si el evento es un `fecha_fin` de cierre — ver R4) | pestaña "Conductor Asignado" del propio vehículo (research.md, no ruta propia) |

Estados cancelados (Combustible/Mantenimiento) se distinguen en el resumen con un sufijo
"(cancelada)" y un color `grey`, reutilizando el campo `estado` ya presente en cada fila.

**Rationale**: Necesario para FR-002 (ícono/color distintivo + resumen de una línea) — se decide
en plan, no se deja a criterio de implementación, para que los tests puedan verificar contenido
exacto.

**Alternatives considered**: Ninguna — es una decisión de mapeo de datos, no de arquitectura.

## R4 — Un cambio de conductor genera como máximo 1 evento por asignación, no 2

**Decision**: Cada fila de `asignaciones_conductor_vehiculo` (una asignación, con `fecha_inicio` y
opcionalmente `fecha_fin`) se muestra como **un solo** evento en la línea de tiempo, con fecha
`fecha_inicio` — no se genera un evento separado para el "fin" de la asignación anterior. El
resumen indica si sigue activa ("Conductor asignado — Juan Pérez") o si ya terminó ("Conductor
asignado — Juan Pérez, hasta {fecha_fin}").

**Rationale**: `asignaciones_conductor_vehiculo` no tiene una fila separada por "inicio" y "fin" —
es una sola fila con ambas fechas (research del data-model de Feature 005) — mostrar un evento
por fila es la representación fiel, evita inventar un segundo evento sintético que no existe
como tal en los datos.

**Alternatives considered**: Dos eventos por asignación (uno de "inicio", uno de "fin") —
rechazado: requeriría fecha `fecha_fin` para vehículos con la MISMA asignación activa hoy sin
fecha de fin (null), complicando el ordenamiento sin aportar valor — con un evento por fila el
usuario ya ve claramente desde cuándo hasta cuándo (o "hasta hoy") duró cada asignación.

## R5 — Nombre de la pestaña nueva: "Actividad", no "Historial" (evita colisión)

**Decision**: La pestaña nueva del detalle de vehículo se llama **"Actividad"**, no "Historial"
como sugería la descripción original — el detalle de vehículo ya tiene una pestaña llamada
"Historial de Póliza" (Feature 003); usar "Historial" a secas para la línea de tiempo generaría
confusión entre ambas.

**Rationale**: Claridad de UI — dos pestañas con nombres que empiezan igual ("Historial de
Póliza" vs. "Historial") en el mismo grupo de tabs es una fuente de error de usuario evitable con
un nombre distinto.

**Alternatives considered**: "Línea de Tiempo" — descartado por ser más largo sin aportar más
claridad que "Actividad"; "Historial de Actividad" — descartado por redundante junto a
"Historial de Póliza" en la misma fila de tabs.

## R6 — Bitácora de auditoría: mismo patrón de listado+filtros+paginación cliente ya usado en todo el proyecto

**Decision**: `useAuditoria().listar(filtros)` sigue el mismo patrón que
`useServiciosObligatorios().listar()`/`useChecklists().listar()` — trae todas las filas que
cumplan los filtros activos (sin `.range()`/paginación en el servidor, ninguna feature de este
proyecto la usa) y pagina 5/10/20 en el cliente. El filtro de "entidad" usa una lista fija de las
20 tablas auditadas (research.md R1) con etiqueta en español (`app/utils/auditoria.ts`, mismo
patrón que `tiposServicio` de Servicios Obligatorios) — no una consulta `distinct` aparte. El
filtro de "usuario" consulta `usuarios` de la empresa directo en la página (sin composable
dedicado, mismo criterio que `permisos/[id].vue`).

**Rationale**: Consistencia con el resto del proyecto — no introducir un patrón de paginación de
servidor nuevo solo para esta feature. El mismo riesgo de límite de 1000 filas de PostgREST que
ya existe en todos los demás listados aplica igual aquí; se documenta como Assumption, no se
resuelve con infraestructura nueva no solicitada.

**Alternatives considered**: Paginación de servidor con `.range()` — rechazada por ser la primera
vez que se introduciría en el proyecto, sin que la especificación lo pida explícitamente.

## R7 — Diff legible: comparación campo por campo en el cliente, excluyendo columnas técnicas

**Decision**: `calcularDiff(valoresAntes, valoresDespues)` en `app/utils/auditoria.ts`: recorre
las claves de ambos objetos JSON, compara valor por valor (comparación superficial, suficiente
porque ninguna tabla auditada tiene columnas de tipo objeto/array anidado más allá de jsonb
propio que no se audita recursivamente), devuelve solo los pares `{ campo, antes, despues }` cuyo
valor cambió, excluyendo `updated_at` y `created_at` (FR-009). Si `valoresAntes` es `null`
(creación) o `valoresDespues` es `null` (eliminación), no se calcula diff — se muestra el único
lado disponible como una lista de campo/valor (FR-010).

**Rationale**: Requisito explícito de FR-009/FR-010 y Edge Cases — sin esto, el diff mostraría
`updated_at` como "cambiado" en absolutamente todo `UPDATE`, ensuciando cada fila.

**Alternatives considered**: Librería de diffing genérica (ej. `deep-diff`) — rechazada: sin
dependencias nuevas para una comparación superficial de un solo nivel, ya suficiente para esta
necesidad (research.md, mismo criterio de "sin dependencias nuevas" de features anteriores).

## R8 — Acceso a `/admin/auditoria`: mismo mecanismo de redirect ya existente, sin gate adicional

**Decision**: La pantalla de bitácora de auditoría vive en `/admin/auditoria`. Ningún operario
puede navegar ahí — el middleware global (`app/middleware/auth.global.ts`) ya redirige
categóricamente cualquier usuario con rol `operario` fuera de `/admin/**` (mismo mecanismo ya
verificado en Combustible/Mantenimiento/Checklist/Servicios Obligatorios) — no hace falta ningún
`v-if` de rol adicional en la página ni en el link del menú lateral (que, siguiendo la
convención ya establecida en `admin.vue`, se muestra sin condicionar por rol en ningún otro
ítem tampoco). La autorización real la garantiza la RLS de `auditoria_select`
(`rol() = 'admin'` o superusuario, ya existente sin cambios) — el test de RLS (Polish) verifica
esta capa directamente con un cliente autenticado, no a través de la UI.

**Rationale**: Consistencia total con el patrón ya usado en todas las features anteriores de este
proyecto para "pantalla exclusiva de administrador".

**Alternatives considered**: Ninguna — mismo patrón ya establecido, sin motivo para desviarse.
