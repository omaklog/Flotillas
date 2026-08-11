# Contrato: Historial por Vehículo y Bitácora de Auditoría

Sin `server/api/` nuevos: toda operación pasa por `useSupabaseClient()` directo (a través de los
composables ya existentes en el caso de la línea de tiempo), protegida por RLS
(`data-model.md`).

## Línea de tiempo de un vehículo (US-11.1)

`useHistorialVehiculo().listar(vehiculoId)`:

1. `Promise.all([...])` de las 5 llamadas ya existentes (research.md R2):
   `useCargasCombustible().listar({ vehiculoId })`,
   `useMantenimientos().listar({ vehiculoId })`,
   `useChecklists().listar({ vehiculoId })`,
   `useServiciosObligatorios().listar({ vehiculoId })`,
   `useAsignaciones().listarHistorialVehiculo(vehiculoId)`.
2. Mapea cada resultado a `EventoHistorial[]` (data-model.md, research.md R3).
3. Concatena los 5 arreglos y ordena por `fecha` descendente.
4. Expone el arreglo combinado a la página, que pagina 5/10/20 en el cliente — mismo patrón que
   todos los listados del proyecto.

**Vehículo sin eventos** (FR-005): si el arreglo combinado queda vacío, la página MUST mostrar un
mensaje de "sin eventos", no una tabla/lista vacía sin explicación.

**Navegación al hacer click** (FR-003): `rutaDetalle` no nula → `navigateTo(evento.rutaDetalle)`;
`rutaDetalle` nula (evento `tipo: 'conductor'`) → cambia la pestaña activa del propio detalle de
vehículo a `'conductor'` (la pestaña "Conductor Asignado" ya existente, Feature 005) en vez de
navegar a otra ruta.

## Bitácora de auditoría (US-11.2)

`useAuditoria().listar(filtros)`:

```ts
type Filtros = {
  entidad?: string
  usuarioId?: string
  accion?: Database['public']['Enums']['accion_auditoria']
  fechaDesde?: string
  fechaHasta?: string
}
```

`supabase.from('auditoria').select('*, usuarios(nombre)')` con `.eq()`/`.gte()`/`.lte()`
encadenados solo para los filtros presentes, `.order('created_at', { ascending: false })`. Sin
`.range()` (research.md R6) — mismo patrón de paginación cliente 5/10/20 que el resto del
proyecto.

**Filtro de entidad**: lista fija de las tablas auditadas con su etiqueta en español
(`app/utils/auditoria.ts`, `entidadesAuditadas`), no una consulta `distinct` (research.md R6).

**Filtro de usuario**: `supabase.from('usuarios').select('id, nombre').order('nombre')` directo
en la página (sin composable dedicado, mismo criterio que `permisos/[id].vue`).

**Diff al expandir una fila** (FR-009/FR-010): `calcularDiff(evento.valores_antes,
evento.valores_despues)` (`app/utils/auditoria.ts`, research.md R7, data-model.md) — si alguno de
los dos lados es `null`, la UI muestra el lado disponible como lista de campo/valor en vez de
llamar a `calcularDiff`.

**Acceso exclusivo admin/superusuario** (FR-007): sin gate adicional en código — el middleware
global ya redirige a cualquier operario fuera de `/admin/**` (research.md R8); la RLS de
`auditoria_select` es la línea de defensa real, verificada por Playwright con un cliente
autenticado directo (Polish), no navegando por la UI.

## Composable `useHistorialVehiculo.ts` — forma esperada

`listar(vehiculoId)` → `EventoHistorial[]` (data-model.md). Sin `crear`/`editar`/`eliminar` — es
una vista compuesta de solo lectura sobre datos que ya se capturan en sus propias features.

## Composable `useAuditoria.ts` — forma esperada

`listar(filtros?)` → llena `registros` (mismo patrón `useState` que el resto de composables de
listado). Sin `crear`/`editar`/`eliminar` — `auditoria` solo se escribe vía triggers, nunca
directo desde el cliente.
