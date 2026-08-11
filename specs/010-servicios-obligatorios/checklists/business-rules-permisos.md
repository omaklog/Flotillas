# Business Rules & Permissions Checklist: Bitácora de Servicios Obligatorios

**Purpose**: Validar la calidad de los requisitos de reglas de fecha (FR-003/FR-004), el modelo
de permisos de escritura (FR-001/FR-006/FR-007/FR-011), y el indicador de vigencia (FR-009) —
las tres áreas de esta especificación con más matices, antes de `/speckit-implement`.
**Created**: 2026-08-11
**Feature**: [spec.md](../spec.md)

**Note**: Generado por `/speckit-checklist`. Foco: reglas de negocio y permisos. Profundidad:
estándar (revisión pre-implementación). Audiencia: quien revisa el spec antes de aprobar
`/speckit-implement`.

## Requirement Completeness

- [ ] CHK001 - ¿La especificación define en qué zona horaria se ancla "hoy" para la regla de
      `fecha_realizado` (FR-003) — servidor, navegador del usuario, o zona configurada de la
      empresa? [Completeness, Gap, Spec §FR-003]
- [ ] CHK002 - ¿Están definidos los requisitos de comportamiento cuando falla la subida del
      comprobante después de que el servicio ya se registró exitosamente (fallo parcial de
      FR-005)? [Completeness, Gap, Spec §FR-005]
- [ ] CHK003 - ¿Especifica el spec qué ocurre si la eliminación del objeto de Storage del
      comprobante falla después de que la fila del servicio ya se eliminó (FR-007/SC-005,
      inconsistencia de estado parcial)? [Completeness, Gap, Spec §FR-007]
- [ ] CHK004 - ¿Define la especificación un orden por defecto del listado (US-10.2) que soporte
      el propósito declarado de "priorizar cuáles necesitan atención" (SC-003), o el orden queda
      sin especificar en `spec.md` mismo? [Completeness, Spec §US-10.2, §SC-003]
- [ ] CHK005 - ¿Se documentan requisitos de comportamiento ante ediciones concurrentes del mismo
      servicio (dos usuarios editando la misma fila a la vez, US-10.3)? [Completeness, Gap, Spec
      §US-10.3]

## Requirement Clarity

- [ ] CHK006 - ¿Está cuantificado el límite exacto de "posterior a hoy" en FR-003 — se permite
      registrar con `fecha_realizado` igual a hoy, o solo estrictamente anterior? [Clarity, Spec
      §FR-003]
- [ ] CHK007 - ¿Está inequívocamente definido si `fecha_vencimiento` igual a `fecha_realizado`
      se acepta o se rechaza en FR-004 (límite exacto de "posterior")? [Clarity, Spec §FR-004]
- [ ] CHK008 - ¿Especifica FR-009 si un servicio cuya `fecha_vencimiento` es exactamente hoy se
      clasifica como "vencido" o como "por vencer"? [Clarity, Ambiguity, Spec §FR-009]
- [ ] CHK009 - ¿Es "editar cualquier campo" (FR-006) explícito sobre si cambiar el vehículo o el
      tipo de un servicio ya registrado está permitido, o esa frase deja ambigüedad sobre el
      alcance real de la edición? [Clarity, Spec §FR-006]

## Requirement Consistency

- [x] CHK010 - ¿Es consistente la redacción de FR-011 (que nombra `crear`/`editar`/`eliminar`
      como permisos aparentemente independientes) con el modelo real de permisos documentado en
      `research.md` R2 (solo `editar` tiene efecto en la política de escritura)? ¿Un lector de
      `spec.md` sin research.md quedaría con una expectativa correcta? [Consistency, Spec §FR-011]
      — **Resuelto**: FR-011 y §Actores ahora declaran explícitamente que solo `editar` habilita
      escritura, con la advertencia de que `crear`/`eliminar` por separado no bastan.
- [ ] CHK011 - ¿Aplica el requisito de exclusión de vehículos dados de baja (FR-002) también al
      selector de vehículo durante la edición (US-10.3), o solo se declara para el registro
      (US-10.1)? [Consistency, Spec §FR-002, §FR-006]
- [ ] CHK012 - ¿Usa la especificación terminología consistente para el estado de vigencia a
      través de FR-009, la User Story 2, y los Edge Cases (¿"vencido"/"por vencer"/"vigente" en
      todas partes, sin sinónimos alternos)? [Consistency, Spec §FR-009]

## Acceptance Criteria Quality / Measurability

- [ ] CHK013 - ¿Es SC-002 ("100% de los intentos... se rechazan") verificable de forma objetiva
      sin ambigüedad sobre qué combinaciones exactas de fecha cuentan como "inválidas"? [Acceptance
      Criteria, Spec §SC-002]
- [ ] CHK014 - ¿Es SC-003 ("identificar sin abrir ningún detalle... con solo recorrer
      visualmente") medible de forma objetiva, o depende de un juicio subjetivo de "visualmente
      identificable" no cuantificado? [Measurability, Spec §SC-003]
- [ ] CHK015 - ¿Las 3 categorías de vigencia (FR-009) tienen criterios de aceptación
      suficientemente medibles para diseñar un test automatizado por cada una sin interpretación
      adicional? [Acceptance Criteria, Spec §FR-009]

## Scenario Coverage (Permisos)

- [x] CHK016 - ¿Cubre la especificación el escenario donde a un operario se le otorga
      únicamente `crear` (sin `editar`), y qué comportamiento observable debería tener? [Scenario
      Coverage, Gap, Spec §FR-011] — **Resuelto**: FR-011 ahora cubre explícitamente este caso
      (sin `editar`, la UI no muestra ninguna acción de escritura).
- [x] CHK017 - ¿Cubre la especificación el escenario donde a un operario se le otorga
      únicamente `eliminar` (sin `editar`), y qué comportamiento observable debería tener?
      [Scenario Coverage, Gap, Spec §FR-011] — **Resuelto**: mismo texto de FR-011 cubre este
      caso simétricamente.
- [ ] CHK018 - ¿Está definido el comportamiento esperado para un superusuario (rol de
      plataforma, fuera de la empresa) frente a los servicios obligatorios de una empresa
      específica? [Scenario Coverage, Gap, Spec §Actores]

## Edge Case Coverage

- [ ] CHK019 - ¿Los "Edge Cases" documentados (§Edge Cases) cubren el límite exacto entre
      "vigente" y "por vencer" (exactamente 60 días), no solo los casos claramente vencidos o
      claramente vigentes? [Edge Case, Gap, Spec §Edge Cases]
- [ ] CHK020 - ¿Se documenta qué ocurre si se intenta registrar un servicio para un vehículo que
      fue dado de baja *después* de que el formulario ya estaba abierto (condición de carrera
      entre carga del selector y el guardado)? [Edge Case, Gap, Spec §FR-002]

## Dependencies & Assumptions

- [x] CHK021 - ¿Declara explícitamente `spec.md` (no solo `research.md`) que el comprobante NO
      mantiene historial de versiones — o esa decisión de diseño vive únicamente en un artefacto
      de planeación sin respaldo en el texto de la especificación misma? [Assumption,
      Traceability, Spec §Decisiones y Restricciones Confirmadas] — **Resuelto**: el bullet
      "Comprobante opcional en dos pasos" ahora declara explícitamente "sin historial de
      versiones" y explica por qué, en vez de solo compararse con pólizas/facturas (que sí tienen
      historial) sin aclarar la diferencia.
- [ ] CHK022 - ¿Está validada (no solo asumida) la premisa de que ninguna tabla futura
      referenciará `servicios_obligatorios.id`, dado que FR-007 depende de que la eliminación
      nunca quede bloqueada por dependientes? [Assumption, Spec §FR-007]

## Ambiguities & Conflicts

- [x] CHK023 - ¿Existe algún conflicto entre la Actor section (que describe `crear`/`editar`/
      `eliminar` como grados de acceso escalonados y otorgables por separado) y el comportamiento
      real de RLS de un único permiso `editar` (research.md R2)? [Conflict, Spec §Actores] —
      **Resuelto**: §Actores ahora incluye la misma "Nota de permisos" que FR-011.

## Notes

- Ítems marcados `[Gap]` señalan ausencias en el texto de `spec.md`, no necesariamente defectos —
  varios ya tienen una respuesta razonable en `research.md`/`data-model.md`/`contracts/` (capas
  de planeación posteriores); estos ítems preguntan si esa respuesta debería, además, quedar
  explícita en `spec.md` mismo para que un lector del spec solo (sin los artefactos de plan)
  tenga la imagen completa.
- CHK010/CHK016/CHK017/CHK023 eran el mismo hallazgo visto desde 4 ángulos distintos (la brecha
  entre el modelo de permisos "3 acciones independientes" que sugería el texto de FR-011/Actores,
  y la realidad de RLS de "solo `editar` importa", research.md R2) — **resueltos** con una sola
  edición: `spec.md` §Actores y FR-011 ahora declaran explícitamente que `crear`/`eliminar` por
  separado no habilitan escritura, solo `editar`.
