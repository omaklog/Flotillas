# Quickstart: Catálogos Base (Tipos de Vehículo, Aseguradoras, Permisos)

Guía para validar la feature end-to-end una vez implementada. No es una guía de implementación —
para eso está `tasks.md` (siguiente comando: `/speckit-tasks`).

## Prerrequisitos

- Entorno local levantado igual que en Feature 001 (`supabase start`, `.env` configurado).
- Migración nueva de esta feature aplicada (`supabase db reset` o `supabase migration up`):
  `CHECK` de formato de `clave`, `updated_at` en `tipos_vehiculo`/`permisos`, trigger de siembra
  de tipos de vehículo por defecto, triggers de auditoría de las 3 tablas (`data-model.md`).
- Un administrador activo de una empresa de prueba (reutilizable del seed/tests de Feature 001).
- Un operario activo de esa misma empresa, sin permisos de escritura otorgados sobre los 3
  módulos de catálogo (estado por defecto tras invitarlo — solo `ver`).

## Escenario 1 — Siembra automática y CRUD de tipos de vehículo (US-2.1)

1. Como superusuario, dar de alta una empresa nueva.
2. Iniciar sesión como el administrador de esa empresa recién creada, ir a "Tipos de Vehículo".
3. **Esperado**: el listado ya muestra 3 filas — `ligero`/"Vehículo ligero",
   `pesado`/"Servicio pesado (más de 3.5 toneladas)", `mat_peligrosos`/"Transporte de materiales
   peligrosos" — sin haberlas creado manualmente.
4. Abrir "Nuevo tipo de vehículo", escribir un nombre (p. ej. "Grúa de plataforma"), presionar
   "Autogenerar" junto a Clave.
5. **Esperado**: el campo de clave se llena con `grua_de_plataforma` (minúsculas, sin acentos,
   espacios convertidos a `_`).
6. Guardar. **Esperado**: aparece en el listado.
7. Repetir el alta usando manualmente la clave `pesado` (ya existente).
8. **Esperado**: el formulario marca el campo de clave como duplicado antes de enviar, sin llegar
   a golpear la base de datos.
9. Buscar "pesado" en el buscador del listado. **Esperado**: se filtra a esa fila.
10. Intentar eliminar el tipo `ligero` (o cualquiera con vehículos asociados, una vez exista
    Vehículos 003). **Esperado**: mensaje "No se puede eliminar: hay vehículos usando este tipo",
    el registro sigue en el listado.
11. Eliminar el tipo "Grúa de plataforma" creado en el paso 6 (sin vehículos asociados).
    **Esperado**: desaparece del listado sin error.

## Escenario 2 — CRUD de aseguradoras (US-2.2)

1. Como el mismo administrador, ir a "Aseguradoras".
2. **Esperado**: catálogo vacío (a diferencia de tipos de vehículo, sin siembra automática).
3. Dar de alta una aseguradora con razón social y RFC, guardar.
4. **Esperado**: aparece en el listado.
5. Buscar por una parte del RFC capturado. **Esperado**: se filtra a esa fila.
6. Editar la razón social. **Esperado**: el cambio se refleja en el listado sin afectar ninguna
   asociación existente con vehículos (una vez exista Vehículos 003).
7. Eliminar la aseguradora (sin vehículos asociados). **Esperado**: desaparece sin error.

## Escenario 3 — CRUD de tipos de permiso (US-2.3)

1. Como el mismo administrador, ir a "Catálogo de Permisos".
2. **Esperado**: catálogo vacío.
3. Dar de alta un permiso: clave autogenerada desde "Verificación físico-mecánica", nombre igual,
   tipo "Estatal". Guardar.
4. **Esperado**: aparece en el listado con tipo "Estatal" visible.
5. Intentar crear otro permiso con la misma clave. **Esperado**: el formulario lo marca como
   duplicado antes de enviar.
6. Buscar por nombre y por clave. **Esperado**: ambos criterios filtran correctamente.
7. Eliminar el permiso creado (sin asignaciones vía `vehiculo_permisos`). **Esperado**: desaparece
   sin error.

## Escenario 4 — Operario de solo lectura (RLS negativo, constitución §4)

1. Iniciar sesión como el operario (permisos por defecto: solo `ver` en los 3 módulos).
2. Abrir "Tipos de Vehículo" / "Aseguradoras" / "Catálogo de Permisos".
3. **Esperado**: puede ver y buscar en los tres listados, pero no ve controles de alta/edición/
   eliminación (o, si se intenta la operación directo contra la API/RLS, es rechazada).
4. Confirmar a nivel de base de datos (o con un test Playwright que llame directo al cliente
   Supabase del operario) que un `insert`/`update`/`delete` contra cualquiera de las 3 tablas
   devuelve un error de RLS, no un éxito silencioso.

## Escenario 5 — Aislamiento por empresa

1. Con dos empresas de prueba (A y B), crear un tipo de vehículo con la misma clave en ambas
   (p. ej. `especial`).
2. **Esperado**: ambas altas tienen éxito — la unicidad de clave es por empresa, no global
   (`UNIQUE (empresa_id, clave)`).
3. Como administrador de la empresa A, confirmar que el listado no muestra ningún registro de la
   empresa B en ninguno de los 3 catálogos.

## Notas de validación no funcional

- **Auditoría** (constitución §2): tras cada alta/edición/eliminación de los 3 escenarios
  anteriores, confirmar en `public.auditoria` que existe la fila correspondiente con `entidad`
  (`tipos_vehiculo`/`aseguradoras`/`permisos`), `accion` (`crear`/`editar`/`eliminar`) y
  `valores_antes`/`valores_despues` coherentes.
- **Accesibilidad** (constitución §4): los 3 formularios y listados deben cumplir WCAG 2.1 AA
  (labels asociados, foco visible, contraste) — verificar con las mismas herramientas ya usadas en
  Feature 001.
