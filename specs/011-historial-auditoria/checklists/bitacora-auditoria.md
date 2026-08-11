# Bitácora de Auditoría & Diff Checklist: Historial por Vehículo y Bitácora de Auditoría

**Purpose**: Validar la calidad de los requisitos de US-11.2 (Bitácora de auditoría) — filtros,
qué cuenta como "campo que cambió" en el diff, el manejo de creación/eliminación sin ambos lados
del jsonb, y el acceso exclusivo administrador/superusuario — antes de `/speckit-implement`.
**Created**: 2026-08-11
**Feature**: [spec.md](../spec.md)

**Note**: Generado por `/speckit-checklist`. Foco: bitácora de auditoría y diff (US-11.2).
Profundidad: estándar (revisión pre-implementación). Audiencia: quien revisa el spec antes de
aprobar `/speckit-implement`.

## Requirement Completeness

- [x] CHK001 - ¿FR-006/US-11.2 enumera todos los valores reales de `accion` que el filtro debe
      ofrecer? El texto lista solo "crear/editar/eliminar/cancelar", pero `data-model.md`
      documenta 6 valores del enum `accion_auditoria` (incluye `desactivar`/`reactivar`, que
      `spec.md` § Assumptions incluso menciona explícitamente para `audit_vehiculos()`).
      [Completeness, Gap, Spec §FR-006, §US-11.2] — **Resuelto**: FR-006 y AC1 ahora listan los 6
      valores reales. De paso se corrigió una contradicción real encontrada en §Decisiones (que
      afirmaba, incorrectamente, que "dar de baja un vehículo" es `accion='editar'`, cuando
      §Assumptions ya documentaba correctamente que `audit_vehiculos()` lo distingue como
      `desactivar`) — reescrita para explicar la regla real: genérico para tablas con
      `audit_catalogo()`, distinguido para tablas con trigger dedicado.
- [ ] CHK002 - ¿Define la especificación qué ocurre cuando el usuario que generó un evento de
      auditoría ya no está disponible para mostrar (desactivado o eliminado)? FR-008 exige
      mostrar "usuario" en cada fila, pero no cubre este caso. [Completeness, Gap, Spec §FR-008]
- [ ] CHK003 - ¿Especifica la especificación el orden de listado de la bitácora de auditoría
      (US-11.2), de forma tan explícita como FR-001 lo hace para la línea de tiempo ("más
      reciente primero")? [Completeness, Gap, Spec §FR-006, §FR-008]
- [x] CHK004 - ¿Define la especificación cómo se combinan múltiples filtros activos a la vez
      (entidad + usuario + acción + rango de fechas simultáneos) — todos deben cumplirse a la
      vez, o basta con que se cumpla alguno? [Completeness, Gap, Spec §FR-006] — **Resuelto**:
      FR-006 ahora especifica combinación AND explícita.

## Requirement Clarity

- [ ] CHK005 - ¿Es "campo cuyo valor cambió" (FR-009) suficientemente preciso sobre qué cuenta
      como cambio cuando el mismo valor lógico tiene una representación distinta (ej. un campo
      que antes no existía en el jsonb y ahora existe con un valor, vs. un campo que existía con
      `null` y ahora tiene un valor — ¿ambos casos cuentan como "cambió"?)? [Clarity, Ambiguity,
      Spec §FR-009]
- [ ] CHK006 - ¿Es "columnas puramente técnicas de timestamp de fila" (FR-009, Edge Cases)
      exhaustivo, o deja ambigüedad sobre si otras columnas técnicas no mencionadas explícitamente
      (ej. un `id` que cambia en un `INSERT` pero nunca en un `UPDATE`) deberían excluirse del
      diff también? [Clarity, Spec §FR-009]
- [ ] CHK007 - ¿Distingue la especificación con claridad entre "eliminar" (borrado físico de un
      registro, ej. Servicios Obligatorios) y "cancelar" (soft-cancel, ej. Combustible/
      Mantenimiento) como dos acciones de auditoría distintas con implicaciones distintas para el
      diff (una tiene `valores_despues = null`, la otra tiene ambos lados)? [Clarity, Spec
      §Decisiones y Restricciones Confirmadas]

## Requirement Consistency

- [x] CHK008 - ¿Es consistente el conjunto de acciones filtrable (FR-006) con el conjunto de
      acciones que `FR-009`/`FR-010` describen cómo mostrar (con diff vs. sin diff)? Por ejemplo,
      ¿`desactivar`/`reactivar` (ambos lados presentes, como `editar`) siguen el mismo camino de
      FR-009, o el camino de FR-010? No queda explícito. [Consistency, Spec §FR-006, §FR-009,
      §FR-010] — **Resuelto**: FR-009 ahora aclara explícitamente que aplica por presencia de
      datos, no por valor de `accion`, y nombra los 4 valores que siempre dejan ambos lados
      poblados (`editar`/`cancelar`/`desactivar`/`reactivar`).
- [ ] CHK009 - ¿Usa la especificación terminología consistente entre "campo" (FR-009, a nivel de
      columna de base de datos) y cualquier término de UI relacionado (ej. "propiedad", "dato") a
      través de las Acceptance Scenarios de US-11.2? [Consistency, Spec §US-11.2]

## Acceptance Criteria Quality / Measurability

- [ ] CHK010 - ¿Es SC-003 ("localizar un evento... sin tener que recorrer el listado completo")
      medible de forma objetiva, o depende de un juicio subjetivo de qué cuenta como "recorrer
      completo"? [Measurability, Spec §SC-003]
- [ ] CHK011 - ¿Es SC-004 ("100% de los eventos... reflejan exactamente los campos que
      cambiaron") verificable sin ambigüedad para los casos límite de CHK005 (valor `null` vs.
      campo ausente)? [Acceptance Criteria, Spec §SC-004]
- [ ] CHK012 - ¿Tiene la Acceptance Scenario 5 de US-11.2 ("un operario... intenta acceder...
      MUST impedirlo") un criterio de éxito verificable independientemente de la capa que lo
      implemente (redirect de UI vs. rechazo de RLS), o dan por hecho un mecanismo específico?
      [Acceptance Criteria, Spec §US-11.2/AC5]

## Scenario Coverage

- [x] CHK013 - ¿Cubre la especificación el escenario de un evento de auditoría con `accion =
      'cancelar'` (Combustible/Mantenimiento) al expandirlo — sigue el camino de diff de FR-009
      (ambos lados presentes) o necesita su propio tratamiento? [Scenario Coverage, Gap, Spec
      §FR-009] — **Resuelto**: mismo fix que CHK008, FR-009 ya lo cubre explícitamente.
- [ ] CHK014 - ¿Cubre la especificación qué pasa si se aplican filtros que no arrojan ningún
      resultado (ningún evento de auditoría cumple la combinación elegida)? US-11.2 no tiene un
      escenario equivalente al de FR-005 (vehículo sin eventos) para este caso. [Scenario
      Coverage, Gap, Spec §US-11.2]
- [ ] CHK015 - ¿Cubre la especificación el volumen esperado de la bitácora de auditoría (podría
      crecer sin límite, a través de TODA la empresa, a diferencia de la línea de tiempo que está
      acotada a un solo vehículo — Edge Cases sí lo cubre para US-11.1 pero no para US-11.2)?
      [Scenario Coverage, Gap, Spec §Edge Cases]

## Edge Case Coverage

- [ ] CHK016 - ¿Define la especificación el comportamiento del diff cuando `valores_antes` y
      `valores_despues` tienen conjuntos de claves distintos (ej. una columna nueva agregada por
      una migración posterior, presente solo en filas más recientes)? [Edge Case, Gap, Spec
      §FR-009]
- [ ] CHK017 - ¿Cubren los Edge Cases el caso de un rango de fechas invertido (fecha "desde"
      posterior a fecha "hasta") en los filtros de la bitácora de auditoría? [Edge Case, Gap,
      Spec §Edge Cases]

## Dependencies & Assumptions

- [ ] CHK018 - ¿Está validada (no solo asumida) la premisa de que las 19 tablas ya auditadas por
      su propio trigger seguirán generando exactamente una fila por evento después de esta
      feature — o es una afirmación sin un mecanismo de verificación descrito en la
      especificación misma (más allá de `quickstart.md`, un artefacto de plan)? [Assumption,
      Spec §Assumptions]
- [ ] CHK019 - ¿Documenta la especificación qué pasa con el filtro de "entidad" cuando una
      feature futura agregue una tabla auditada nueva — el filtro se actualiza manualmente, o hay
      alguna expectativa de que se mantenga sincronizado automáticamente? [Dependency, Gap, Spec
      §Assumptions]

## Ambiguities & Conflicts

- [ ] CHK020 - Sin relación con la redacción original del bullet de §Decisiones (ya corregida por
      CHK001): ¿aclara la especificación si un administrador de una empresa puede ver el
      `valores_antes`/`valores_despues` de un cambio hecho por **otro** administrador de esa
      misma empresa, o solo los suyos propios? FR-007 solo distingue admin/superusuario vs.
      operario, no aclara visibilidad entre administradores de la misma empresa. La
      especificación no lo aclara explícitamente.
      [Ambiguity, Spec §FR-006, §FR-007]

## Notes

- **CHK001/CHK004/CHK008/CHK013 resueltos** en una sola pasada de ediciones a `spec.md`: FR-006 y
  AC1 ahora listan los 6 valores reales de `accion` y especifican combinación AND entre filtros;
  FR-009 ahora aclara que su regla depende de la presencia de datos, no del valor de `accion`,
  nombrando explícitamente `editar`/`cancelar`/`desactivar`/`reactivar`. De paso se corrigió una
  contradicción real ya presente en `spec.md`: §Decisiones afirmaba que "dar de baja un
  vehículo" es `accion='editar'`, mientras que §Assumptions (escrita después, tras revisar el
  código real de `audit_vehiculos()`) ya decía correctamente que esa transición es `desactivar`,
  un valor propio. La redacción de §Decisiones se corrigió para eliminar esa contradicción.
- CHK002, CHK003, CHK005-CHK007, CHK009-CHK012, CHK014-CHK019 y CHK020 siguen abiertos — ninguno
  se pidió resolver en esta pasada.
