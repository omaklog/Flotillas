# Research: Catálogos Base (Tipos de Vehículo, Aseguradoras, Permisos)

A diferencia de la Feature 001 (que fijó el bootstrap técnico completo), esta feature reutiliza
toda la infraestructura ya existente: Nuxt 4 + `@nuxtjs/supabase` + Vuetify, RLS, el sistema de
permisos granulares por módulo/acción, y la bitácora de auditoría. Las decisiones aquí son
puntuales sobre lo que falta para las 3 entidades de este catálogo.

## R1 — Las tablas y su RLS ya existen; no hace falta migración de esquema base

**Decision**: `public.tipos_vehiculo`, `public.aseguradoras` y `public.permisos` ya están creadas
(`supabase/migrations/20260806044218_initial_schema.sql`), con RLS de lectura para toda la
empresa y escritura restringida a `admin`/`superusuario`
(`supabase/migrations/20260806044221_permisos_ver_y_defaults.sql` las refina para además aceptar
`tiene_permiso(<modulo>, 'ver'|'editar')`). Los tres módulos (`tipos_vehiculo`, `aseguradoras`,
`permisos`) y sus acciones (`ver`/`crear`/`editar`/`eliminar`) ya están sembrados en
`modulos`/`acciones`/`modulo_acciones`
(`supabase/migrations/20260806044220_modulos_y_permisos.sql`). Esta feature no repite ese trabajo.

**Rationale**: Evitar migraciones redundantes; el trabajo de esquema pendiente es estrictamente lo
que falta (ver R2–R4), no recrear lo ya construido en la Feature 001.

**Alternatives considered**: N/A — se verificó el estado real de `supabase/migrations/` antes de
planear en vez de asumir que había que crear las tablas desde cero.

## R2 — Falta un CHECK de formato de clave en `tipos_vehiculo` y `permisos`

**Decision**: agregar, en una migración nueva de esta feature, un `CHECK (clave ~ '^[a-z0-9_]+$'
AND char_length(clave) <= 50)` a `public.tipos_vehiculo.clave` y `public.permisos.clave`. La
tabla ya tiene `UNIQUE (empresa_id, clave)`; falta el formato.

**Rationale**: FR-005 exige el formato tanto en el formulario como (según el patrón ya usado en
`placa` de `vehiculos`, ver historial de esta conversación) como respaldo en base de datos — la
validación de cliente nunca es la única línea de defensa. Un `CHECK` es más barato y más explícito
en el esquema que confiar solo en la validación de Zod/formulario.

**Alternatives considered**: Validar solo en el formulario (Zod) — rechazado porque no protege
contra escritura directa (Studio, scripts, futuros endpoints) y contradice el patrón ya sentado
para `vehiculos.placa`.

## R3 — Falta el trigger de siembra automática de tipos de vehículo

**Decision**: nueva función `private.sembrar_tipos_vehiculo_default()` + trigger
`trg_empresas_sembrar_tipos_vehiculo AFTER INSERT ON public.empresas`, que inserta los 3 tipos
predefinidos (`ligero`/`Vehículo ligero`, `pesado`/`Servicio pesado (más de 3.5 toneladas)`,
`mat_peligrosos`/`Transporte de materiales peligrosos`) con el `empresa_id` de la fila recién
creada. Mismo patrón que `private.otorgar_permisos_default_operario()` (trigger `AFTER INSERT` +
`security definer` + `set search_path = ''`), documentado como pendiente en el propio texto de la
Feature 002.

**Rationale**: FR-011 lo exige explícitamente y el propio insumo de la feature ya señala el
trigger análogo a reutilizar como plantilla.

**Alternatives considered**: Sembrar desde `server/api/empresas/index.post.ts` (código de
aplicación) en vez de un trigger de base de datos — rechazado por el mismo motivo que el patrón ya
elegido en Feature 001 para permisos por defecto: un trigger garantiza la siembra sin importar por
qué camino se inserte la empresa (API, Studio, script de soporte), evitando duplicar la lista de
tipos en más de un lugar.

## R4 — Falta auditoría en las 3 tablas de catálogo

**Decision**: nueva función genérica `private.audit_catalogo()` (INSERT/UPDATE/DELETE, sin la
rama `desactivar`/`reactivar` de `private.audit_empresas_usuarios()` porque ninguna de las 3
tablas tiene columna `activo`) + un trigger `trg_<tabla>_auditoria AFTER INSERT OR UPDATE OR
DELETE` por cada una de `tipos_vehiculo`, `aseguradoras`, `permisos`.

**Rationale**: constitución §2 — "Toda acción de creación, edición, eliminación... queda
registrada en la bitácora de auditoría", sin excepción por tabla. `private.audit_empresas_usuarios()`
no es reutilizable tal cual porque referencia `old.activo`/`new.activo` en tiempo de ejecución, y
esas columnas no existen en las tablas de este catálogo (fallaría en runtime, no en definición, al
no existir el campo en la fila).

**Alternatives considered**: Reutilizar `private.audit_empresas_usuarios()` quitándole la rama de
`activo` de forma condicional (detectando si la columna existe) — rechazado por complejidad
innecesaria; es más simple y más legible tener una función de auditoría separada para catálogos
sin estado activo/inactivo, ya que el propio proyecto seguirá necesitando ese mismo molde para
más catálogos futuros (Productos, etc.).

## R5 — Sin `server/api/` nuevos: escritura directa vía cliente Supabase

**Decision**: las operaciones de alta/edición/eliminación de los 3 catálogos se hacen con
`useSupabaseClient()` directo desde composables de `app/`, sin pasar por `server/api/`.

**Rationale**: a diferencia de `empresas`/`usuarios` en Feature 001 (que requerían `service_role`
para `admin.generateLink` e invitaciones), el CRUD de catálogos no necesita ningún privilegio por
encima de lo que ya cubre RLS (`admin` de la propia empresa, o quien tenga el permiso granular
`crear`/`editar`/`eliminar` del módulo correspondiente). Introducir un endpoint intermedio solo
para reenviar la misma operación a Postgres sería una capa sin valor, contra la guía del proyecto
de no añadir abstracciones que la tarea no pide.

**Alternatives considered**: Endpoints `server/api/tipos-vehiculo/*` (y equivalentes) espejo del
patrón de Feature 001 — rechazado porque no hay ninguna operación aquí que requiera
`service_role`; añadirlos sería puro boilerplate.

## R6 — Manejo del error de integridad referencial (FR-010)

**Decision**: al eliminar, capturar el error devuelto por `supabase-js` (`error.code === '23503'`,
código Postgres de `foreign_key_violation`) y mapearlo a un mensaje fijo por entidad ("No se puede
eliminar: hay vehículos usando este tipo" / "...esta aseguradora" / "...este permiso"), sin
mostrar el mensaje crudo de Postgres.

**Rationale**: es exactamente el mecanismo que la Decisión Confirmada del spec pide capturar — la
protección ya vive en la FK (`ON DELETE` por defecto `NO ACTION`), esta feature solo traduce el
error a lenguaje de negocio.

**Alternatives considered**: Verificar de antemano con un `SELECT count(*) FROM vehiculos WHERE
tipo_vehiculo_id = :id` antes de intentar el `DELETE` — rechazado: es una validación redundante
(duplica la que ya hace la base de datos) y abre una ventana de condición de carrera entre el
`SELECT` y el `DELETE` que el manejo de errores del `DELETE` ya evita por construcción.

## R7 — Autogeneración de clave desde el nombre

**Decision**: función de utilidad de cliente (`app/utils/clave.ts` o similar) que normaliza:
minúsculas → quitar diacríticos (`normalize('NFD')` + strip de marcas combinantes) → reemplazar
cualquier carácter fuera de `[a-z0-9]` por `_` → colapsar guiones bajos repetidos → recortar a 50
caracteres → quitar guiones bajos al inicio/fin. Se ejecuta solo al presionar "Autogenerar", nunca
automáticamente al escribir el nombre, para no pelearse con el usuario que edita la clave a mano.

**Rationale**: reproduce exactamente el formato ya validado por el `CHECK` (R2) y por el patrón
usado en los valores sembrados (`ligero`, `pesado`, `mat_peligrosos`).

**Alternatives considered**: Autogenerar en vivo mientras el usuario escribe el nombre —
rechazado explícitamente por el spec ("el admin puede aceptarla tal cual o seguir editándola a
mano"), que implica una acción explícita (botón), no un `watch` reactivo.

## R8 — Referencias visuales pendientes en Stitch

**Decision**: antes de construir las pantallas, generar/descargar en Stitch las referencias de los
3 listados + sus formularios de alta/edición (no existen hoy en
`docs/design-references/screens/` — solo hay `listado-flotilla.png` y `listado-operarios.png`,
ninguna de tipos de vehículo/aseguradoras/permisos), siguiendo el workaround de `curl` documentado
en `CLAUDE.md` del proyecto. Es un prerequisito de implementación, no de este plan, pero se deja
registrado aquí para que `/speckit-tasks` lo capture como tarea explícita.

**Rationale**: `CLAUDE.md` es una instrucción de proyecto de cumplimiento obligatorio: "Si una
pantalla no tiene referencia todavía, tráela de Stitch antes de implementar, no la adivines."

**Alternatives considered**: Reutilizar el layout de `listado-operarios.png` sin pasar por Stitch,
dado que las 3 pantallas son un CRUD de tabla simple — rechazado: la instrucción del proyecto no
distingue por complejidad percibida; aplica siempre.
