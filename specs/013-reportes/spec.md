# Feature Specification: Reportes

**Feature Branch**: `013-reportes`

**Created**: 2026-08-19

**Status**: Draft

**Input**: User description: "Feature 013 — Reportes: reportes detallados y exportables (Excel y
PDF) de costos de mantenimiento, consumo y rendimiento de combustible, vencimientos, y
cumplimiento de checklists/servicios obligatorios. Distinto del Dashboard (012), que solo muestra
resúmenes tipo KPI/gráfica — aquí es tabular, filtrable y exportable. No requiere schema nuevo,
todo se calcula en consulta. Depende de Combustible (007), Mantenimiento (008), Checklist (009),
Servicios Obligatorios (010) y Vehículos/Conductores (003/004). Última feature del MVP (013 de
13)."

## Resumen

Cuatro reportes tabulares, filtrables por rango de fechas (y por vehículo donde aplica), que se
calculan en consulta a partir de datos ya capturados por otras features — no crean ni almacenan
nada nuevo. A diferencia del Dashboard (Feature 012), que resume el estado de la flotilla con
KPIs y gráficas de alto nivel, aquí el usuario puede ver el detalle línea por línea y exportarlo:
costos de mantenimiento agrupados por tipo, consumo y rendimiento real de combustible por
vehículo, vencimientos de licencias/pólizas/permisos en un rango de fechas libre, y cumplimiento
de checklists y servicios obligatorios por tipo de vehículo. Cada reporte se puede exportar a
Excel (.xlsx) y a PDF de forma independiente. Cierra las 13 features del MVP.

## Actores

- **Administrador**: acceso completo a los 4 reportes y a ambas exportaciones (el rol `admin`
  siempre tiene todos los permisos de todos los módulos).
- **Operario**: tiene el permiso `ver` en el módulo `reportes` otorgado por defecto — puede
  consultar los 4 reportes sin configuración adicional, con los datos que sus propios permisos
  por módulo de origen le dejen ver (ej. si no tiene `mantenimiento.ver`, no puede ver el reporte
  de costos de mantenimiento). Exportar a Excel o PDF requiere el permiso `exportar` del módulo
  `reportes`, que **no** se otorga por defecto — un administrador debe concederlo explícitamente.

## Clarifications

### Session 2026-08-19

- Q: La primera carga activa *dentro del rango de fechas filtrado* — si el vehículo tiene una
  carga activa real anterior a "desde" (fuera del rango), ¿el cálculo de rendimiento la usa como
  referencia, o siempre muestra "N/D" en el límite del rango? → A: Usa la carga real anterior
  aunque esté fuera del rango — el filtro de fechas solo decide qué filas se muestran, no qué
  cuenta como "carga anterior" para el cálculo. "N/D" queda reservado únicamente para la primera
  carga activa de toda la historia del vehículo (sin ninguna carga previa real).
- Q: La constitución del proyecto exige bitácora de auditoría para "creación, edición,
  eliminación y cancelación" — los reportes son de solo lectura (ver/exportar), fuera de esa
  lista literal. ¿Las exportaciones (Excel/PDF) deben quedar registradas en la bitácora de
  auditoría? → A: Sí — cada exportación genera una entrada de auditoría (usuario, fecha/hora,
  reporte, filtros usados), dado que puede sacar del sistema datos financieros, de cumplimiento o
  con PII (números de licencia). Solo consultar en pantalla (`ver`) no se audita.
- Q: En el reporte de cumplimiento (US-13.4), si un tipo de vehículo no tiene ningún checklist
  capturado en el rango (o ningún servicio obligatorio registrado), ¿la celda muestra 0% o "sin
  datos"? → A: "Sin datos", nunca 0% — 0% sugeriría engañosamente que todos los checklists de ese
  tipo de vehículo reprobaron, cuando en realidad no hubo ninguno capturado.
- Q: En el desglose por vehículo de costos de mantenimiento (US-13.1) y combustible (US-13.2),
  ¿se incluyen solo los vehículos con movimientos en el rango, o todos los vehículos activos de
  la empresa (con $0/0 litros)? → A: Solo vehículos con movimientos en el rango — consistente con
  cómo ya funcionan los listados de Órdenes (008) y Cargas (007), que no muestran filas vacías
  por vehículo sin actividad.

## Decisiones y Restricciones Confirmadas

Estas decisiones ya fueron validadas por el usuario y no están abiertas a `/speckit-clarify`:

- **Exportación en ambos formatos**: cada uno de los 4 reportes tiene un botón independiente para
  exportar a Excel (.xlsx) y otro para exportar a PDF — ambos disponibles solo con el permiso
  `exportar`.
- **Rendimiento de combustible se calcula de verdad, no se estima**: por cada vehículo, se
  ordenan sus cargas con `estado='activo'` por fecha, y entre cada par de cargas consecutivas se
  calcula `(odómetro_actual − odómetro_anterior) ÷ cantidad_actual` (equivalente a una función de
  ventana `LAG` sobre odómetro, particionada por vehículo). Las cargas `cancelado` se excluyen
  del cálculo por completo (ni cuentan como "anterior" ni como "actual"). El `LAG` se calcula
  sobre **toda la historia activa del vehículo**, no solo sobre las cargas dentro del rango
  filtrado — el filtro de fechas decide qué filas se muestran, no qué carga cuenta como
  "anterior" (Clarifications, sesión 2026-08-19). Solo la primera carga activa de toda la
  historia del vehículo (sin ninguna carga previa real) no tiene con qué compararse — su
  rendimiento se muestra como "N/D", nunca como error ni como cero.
- **Selector de periodo compartido**: los 4 reportes usan un rango de fechas personalizado
  (desde/hasta, ambos extremos opcionales), con atajos comunes (últimos 30 días, mes en curso,
  mes anterior) para no forzar siempre una selección manual. En el reporte de vencimientos
  (US-13.3), este mismo rango filtra por fecha de vencimiento en vez de fecha del registro —
  dejar "desde" vacío permite incluir todo lo ya vencido sin importar cuándo venció, y dejar
  "hasta" vacío permite ver todo lo que vence a partir de una fecha en adelante.
- **No requiere schema nuevo**: los 4 reportes se calculan en consulta a partir de tablas ya
  existentes de Combustible (007), Mantenimiento (008), Checklist (009), Servicios Obligatorios
  (010), Vehículos (003) y Conductores (004). Ninguno persiste su propio resultado.
- **Última feature del MVP**: cierra las 13 features definidas en el `spec.md` general. Reportes
  predictivos o basados en IA son Feature 014 (fase 2, fuera de alcance, sujeta a aprobación de
  presupuesto adicional).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reporte de costos de mantenimiento (Priority: P1)

Como administrador u operario con permiso de ver reportes, quiero ver el costo total de
mantenimiento de mi flotilla en un rango de fechas, agrupado por tipo (correctivo/preventivo) y
desglosado por vehículo, para entender en qué se está gastando sin tener que sumar manualmente el
listado de órdenes.

**Why this priority**: Es el reporte de mayor valor financiero directo — el gasto en
mantenimiento suele ser la partida más grande y más escrutada del presupuesto de una flotilla, y
hoy no existe ninguna vista agregada de este dato (el listado de órdenes de Feature 008 no
totaliza ni agrupa).

**Independent Test**: Con órdenes de mantenimiento de prueba (correctivas y preventivas, activas
y canceladas, de varios vehículos) dentro y fuera de un rango de fechas elegido, generar el
reporte y confirmar que el total general, el desglose por tipo y el desglose por vehículo
coinciden con la suma esperada de únicamente las órdenes activas dentro del rango.

**Acceptance Scenarios**:

1. **Given** órdenes de mantenimiento activas de ambos tipos dentro del rango de fechas
   seleccionado, **When** se genera el reporte sin filtrar por vehículo, **Then** se muestra el
   total general, un total por tipo (correctivo/preventivo), y un desglose por vehículo con su
   propio subtotal.
2. **Given** el mismo rango de fechas, **When** se filtra adicionalmente por un vehículo
   específico, **Then** el reporte muestra únicamente los totales de ese vehículo.
3. **Given** una orden de mantenimiento con `estado='cancelado'` dentro del rango, **When** se
   genera el reporte, **Then** esa orden no se incluye en ningún total (ni general, ni por tipo,
   ni por vehículo).
4. **Given** el reporte ya generado, **When** el usuario tiene el permiso `exportar` y presiona
   "Exportar a Excel" o "Exportar a PDF", **Then** descarga un archivo en el formato
   correspondiente con los mismos datos mostrados en pantalla.
5. **Given** un operario sin el permiso `exportar` (no otorgado por defecto), **When** ve el
   reporte, **Then** los botones de exportación no están disponibles para su uso.

---

### User Story 2 - Reporte de consumo y rendimiento de combustible (Priority: P2)

Como administrador u operario con permiso de ver reportes, quiero ver, por vehículo, cuánto
combustible consumió, cuánto costó, y qué tan eficiente fue en un rango de fechas, para detectar
vehículos con consumo o rendimiento fuera de lo esperado.

**Why this priority**: Segundo mayor gasto operativo después de mantenimiento, y el único de los
4 reportes que requiere un cálculo propio (rendimiento entre cargas consecutivas) en vez de solo
agregar montos — aporta un dato que hoy no existe en ninguna otra pantalla del sistema.

**Independent Test**: Con al menos 3 cargas activas consecutivas de un mismo vehículo (con
odómetro creciente) y una carga cancelada intercalada, generar el reporte y confirmar que el
rendimiento de cada carga (excepto la primera de toda la historia del vehículo) coincide con el
cálculo esperado excluyendo la cancelada, y que solo esa primera carga histórica muestra "N/D".

**Acceptance Scenarios**:

1. **Given** varias cargas activas de un vehículo dentro del rango de fechas, **When** se genera
   el reporte para ese vehículo, **Then** se muestra el total de litros/galones (según
   `unidad_combustible` configurada por la empresa), el costo total, y el rendimiento promedio
   del periodo.
2. **Given** la primera carga activa de toda la historia de un vehículo (sin ninguna carga
   anterior real), **When** cae dentro del rango filtrado y se genera el reporte, **Then** su
   rendimiento individual se muestra como "N/D", no como error ni como cero, y no distorsiona el
   promedio del periodo.
3. **Given** la primera carga activa *dentro del rango filtrado*, pero con una carga activa real
   anterior a "desde" (fuera del rango), **When** se genera el reporte, **Then** el rendimiento
   de esa fila se calcula usando esa carga anterior real como referencia — no se muestra como
   "N/D" solo por estar en el límite del rango (Clarifications, sesión 2026-08-19).
4. **Given** una carga con `estado='cancelado'` intercalada entre dos cargas activas, **When** se
   calcula el rendimiento, **Then** la cancelada se excluye por completo — el rendimiento se
   calcula entre las dos cargas activas más cercanas, no contra la cancelada.
5. **Given** el reporte sin filtrar por vehículo, **When** se genera, **Then** se muestra un total
   general (litros/galones y costo) además del desglose por vehículo.
6. **Given** el reporte ya generado y el permiso `exportar` otorgado, **When** el usuario exporta
   a Excel o PDF, **Then** el archivo descargado incluye el mismo desglose por vehículo y el
   mismo rendimiento calculado, incluyendo las filas "N/D".

---

### User Story 3 - Reporte de vencimientos (Priority: P3)

Como administrador u operario con permiso de ver reportes, quiero ver, en un rango de fechas que
yo elija libremente, qué licencias de conductor, pólizas de vehículo y permisos de vehículo
vencen o ya vencieron, para planear renovaciones con la anticipación que yo necesite (no solo los
30 días fijos del Dashboard).

**Why this priority**: El Dashboard (Feature 012) ya cubre la necesidad de alerta inmediata a 30
días; este reporte es un complemento de planeación a más largo plazo (ej. 90 días) o de auditoría
retroactiva (todo lo vencido), con menor urgencia operativa que los dos reportes financieros
anteriores.

**Independent Test**: Con licencias, pólizas y permisos de prueba con fechas de vencimiento
pasadas, próximas y lejanas, generar el reporte con distintos rangos (ej. "próximos 90 días" y
"sin fecha desde, hasta hoy") y confirmar que cada uno devuelve exactamente los registros cuya
fecha de vencimiento cae dentro del rango solicitado, con el estado correcto por fila.

**Acceptance Scenarios**:

1. **Given** licencias, pólizas y permisos con distintas fechas de vencimiento, **When** se
   genera el reporte con un rango desde/hasta específico, **Then** se listan únicamente los
   registros cuya fecha de vencimiento cae dentro de ese rango (inclusive), cada uno con su
   estado (vigente/por vencer/vencido, mismo umbral de 60 días ya usado en Vehículos y
   Conductores).
2. **Given** el campo "desde" vacío y "hasta" igual a hoy, **When** se genera el reporte,
   **Then** se listan todos los registros ya vencidos, sin importar qué tan antigua sea su fecha
   de vencimiento.
3. **Given** el campo "hasta" vacío y "desde" igual a hoy, **When** se genera el reporte,
   **Then** se listan todos los registros que vencen desde hoy en adelante, sin límite superior.
4. **Given** un vehículo o conductor dado de baja cuya licencia/póliza/permiso cae dentro del
   rango seleccionado, **When** se genera el reporte, **Then** el registro sigue apareciendo (el
   reporte es histórico, no oculta datos de entidades dadas de baja).
5. **Given** el reporte ya generado y el permiso `exportar` otorgado, **When** el usuario exporta
   a Excel o PDF, **Then** el archivo incluye las tres categorías (licencias, pólizas, permisos)
   con su fecha de vencimiento y estado.

---

### User Story 4 - Reporte de cumplimiento (checklists y servicios obligatorios) (Priority: P4)

Como administrador u operario con permiso de ver reportes, quiero ver, por tipo de vehículo, qué
porcentaje de checklists se aprobaron sin observaciones y qué porcentaje de servicios
obligatorios están vigentes, para identificar qué tipos de vehículo necesitan más atención en
cumplimiento normativo.

**Why this priority**: Es el reporte de menor urgencia inmediata de los 4 — el Dashboard ya
muestra un indicador equivalente de checklists (últimos 30 días); este reporte extiende esa
misma idea a un rango libre y agrega servicios obligatorios, pero no destapa un gasto ni un
vencimiento crítico por sí mismo.

**Independent Test**: Con checklists (`aprobado` y `con_observaciones`) y servicios obligatorios
(vigentes y vencidos) de prueba, de al menos dos tipos de vehículo distintos, generar el reporte
y confirmar que los porcentajes por tipo de vehículo coinciden con el conteo esperado.

**Acceptance Scenarios**:

1. **Given** checklists con ambos resultados capturados dentro del rango de fechas, agrupados por
   tipo de vehículo, **When** se genera el reporte, **Then** se muestra, por tipo de vehículo, el
   % de checklists `aprobado` vs. `con_observaciones` del periodo.
2. **Given** servicios obligatorios de distintos tipos de vehículo con fechas de vencimiento
   pasadas y futuras, **When** se genera el reporte, **Then** se muestra, por tipo de vehículo, el
   % de servicios obligatorios vigentes vs. vencidos al momento de generar el reporte (no depende
   del rango de fechas del filtro, que en este caso aplica solo a los checklists).
3. **Given** un tipo de vehículo sin ningún checklist capturado en el rango (o sin ningún servicio
   obligatorio registrado), **When** se genera el reporte, **Then** ese tipo de vehículo se
   muestra como "Sin datos" en la celda correspondiente — nunca 0% ni un error que rompa el resto
   del reporte (Clarifications, sesión 2026-08-19).
4. **Given** el reporte ya generado y el permiso `exportar` otorgado, **When** el usuario exporta
   a Excel o PDF, **Then** el archivo incluye ambos porcentajes (checklists y servicios
   obligatorios) por cada tipo de vehículo.

---

### Edge Cases

- ¿Qué pasa si un usuario sin el permiso `ver` de un módulo de origen (ej. sin
  `combustible.ver`) intenta acceder al reporte correspondiente? El sistema MUST bloquear el
  acceso a ese reporte específico (no solo ocultar datos dentro de él), igual que bloquearía el
  módulo de origen.
- ¿Qué pasa si el rango de fechas seleccionado no tiene ningún dato (ej. una empresa nueva sin
  historial)? El reporte MUST mostrarse vacío (totales en cero, listados sin filas), nunca como
  error.
- ¿Qué pasa si "desde" es posterior a "hasta"? El sistema MUST rechazar la combinación con un
  mensaje claro antes de generar el reporte, en vez de devolver un resultado vacío silencioso.
- ¿Qué pasa si un vehículo tiene una sola carga de combustible activa en toda su historia? Su
  rendimiento se muestra como "N/D" (no existe ninguna carga anterior real con la cual comparar).
- ¿Qué pasa si la primera carga *dentro del rango filtrado* sí tiene una carga activa anterior
  real, solo que ésta cae fuera del rango (antes de "desde")? El cálculo la usa igual como
  referencia — esa fila NO se muestra como "N/D" (Clarifications, sesión 2026-08-19); el filtro
  de fechas decide qué filas se muestran, no qué cuenta como carga anterior para el cálculo.
- ¿Qué pasa si se exporta un reporte con cero filas? El archivo (Excel o PDF) MUST generarse
  igual, con los encabezados de columna y los totales en cero, no un error de exportación; la
  exportación igual queda registrada en la bitácora de auditoría (FR-017), aunque no tenga filas.
- ¿Qué pasa si solo se consulta un reporte en pantalla, sin exportarlo? No se genera ninguna
  entrada de auditoría — únicamente las exportaciones quedan registradas (Clarifications, sesión
  2026-08-19).
- ¿Qué pasa con un vehículo o conductor eliminado (no solo dado de baja) cuyos registros
  históricos siguen en las tablas de origen? No aplica — Vehículos (003) y Conductores (004) no
  permiten eliminación física si tienen dependientes, y los registros de combustible/
  mantenimiento/checklist/servicios obligatorios cuentan como dependientes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST exponer 4 reportes independientes: costos de mantenimiento,
  consumo y rendimiento de combustible, vencimientos, y cumplimiento (checklists y servicios
  obligatorios).
- **FR-002**: El acceso a cada reporte MUST requerir el permiso `ver` del módulo `reportes`
  **y** el permiso `ver` del módulo de origen correspondiente a los datos que ese reporte
  muestra (`mantenimiento.ver`, `combustible.ver`, `checklist.ver` + `servicios_obligatorios.ver`,
  o `vehiculos.ver` + `conductores.ver`, según el reporte). El reporte de vencimientos también
  depende de `permisos.ver` (catálogo de tipos de permiso, RLS de `permisos_select`) para mostrar
  el nombre del tipo de permiso, y el de cumplimiento depende de `tipos_vehiculo.ver` (RLS de
  `tipos_vehiculo_select`) para la etiqueta de cada grupo — ambos permisos vienen otorgados por
  defecto igual que el resto (`schema_03_ver_y_defaults.sql`), así que en la configuración por
  defecto esto es transparente; solo importa si un administrador revoca alguno explícitamente
  (`/speckit-analyze`, hallazgo C1).
- **FR-003**: El sistema MUST ofrecer un selector de rango de fechas (desde/hasta) en los 4
  reportes, con atajos de "últimos 30 días", "mes en curso" y "mes anterior", además de la
  opción de captura manual de ambas fechas.
- **FR-004**: El sistema MUST rechazar, con un mensaje claro, cualquier rango donde la fecha
  "desde" sea posterior a la fecha "hasta".
- **FR-005**: El reporte de costos de mantenimiento MUST incluir únicamente órdenes con
  `estado='activo'`, agrupadas por tipo (correctivo/preventivo), con un total general y un
  desglose por vehículo, filtrable opcionalmente por vehículo específico. El desglose por
  vehículo MUST listar únicamente vehículos con al menos una orden activa dentro del rango
  seleccionado — MUST NOT incluir filas en $0 para vehículos sin movimientos (Clarifications,
  sesión 2026-08-19).
- **FR-006**: El reporte de combustible MUST incluir únicamente cargas con `estado='activo'`,
  mostrando por vehículo el total de litros/galones (según `unidad_combustible` de la empresa),
  el costo total, y el rendimiento promedio del periodo; y un total general cuando no se filtra
  por vehículo específico. El desglose por vehículo MUST listar únicamente vehículos con al menos
  una carga activa dentro del rango seleccionado — misma regla que FR-005 (Clarifications, sesión
  2026-08-19).
- **FR-007**: El sistema MUST calcular el rendimiento de combustible por vehículo ordenando
  **toda su historia** de cargas activas por fecha (sin restringirse al rango filtrado) y
  aplicando `(odómetro_actual − odómetro_anterior) ÷ cantidad_actual` entre cada par de cargas
  consecutivas; las cargas canceladas MUST excluirse por completo de este cálculo (ni como carga
  anterior ni como carga actual). El rango de fechas filtrado MUST decidir únicamente qué filas
  se muestran en el reporte, nunca qué carga cuenta como "anterior" para el cálculo
  (Clarifications, sesión 2026-08-19).
- **FR-008**: El sistema MUST mostrar "N/D" (no como error ni como cero) para el rendimiento de
  la primera carga activa de toda la historia de un vehículo (sin ninguna carga previa real, sin
  importar el rango de fechas filtrado), ya que no existe una carga anterior con la cual
  comparar.
- **FR-009**: El reporte de vencimientos MUST listar licencias de conductor, pólizas de vehículo
  y permisos de vehículo cuya fecha de vencimiento caiga dentro del rango desde/hasta
  seleccionado (ambos extremos opcionales e independientes entre sí), mostrando por cada
  registro su fecha de vencimiento y su estado (vigente/por vencer/vencido, con el mismo umbral
  de 60 días ya usado en Vehículos y Conductores).
- **FR-010**: El reporte de vencimientos MUST incluir registros de vehículos o conductores dados
  de baja, siempre que su fecha de vencimiento caiga dentro del rango seleccionado — es un
  reporte histórico, no un listado operativo activo.
- **FR-011**: El reporte de cumplimiento MUST mostrar, agrupado por tipo de vehículo, el
  porcentaje de checklists con `resultado='aprobado'` vs. `resultado='con_observaciones'`
  capturados dentro del rango de fechas seleccionado; un tipo de vehículo sin ningún checklist
  capturado en el rango MUST mostrarse como "Sin datos", nunca como 0% (Clarifications, sesión
  2026-08-19).
- **FR-012**: El reporte de cumplimiento MUST mostrar, agrupado por tipo de vehículo, el
  porcentaje de servicios obligatorios vigentes vs. vencidos al momento de generar el reporte; un
  tipo de vehículo sin ningún servicio obligatorio registrado MUST mostrarse como "Sin datos",
  nunca como 0% (misma regla que FR-011).
- **FR-013**: Cada uno de los 4 reportes MUST ofrecer un botón de exportación a Excel (.xlsx) y
  un botón de exportación a PDF, independientes entre sí, con los mismos datos y totales
  mostrados en pantalla.
- **FR-014**: Los botones de exportación MUST estar disponibles únicamente para usuarios con el
  permiso `exportar` del módulo `reportes`; sin ese permiso, el usuario puede ver el reporte en
  pantalla pero no exportarlo.
- **FR-015**: El sistema MUST generar el archivo de exportación (Excel o PDF) incluso cuando el
  reporte no tiene filas dentro del rango filtrado, mostrando encabezados de columna y totales
  en cero en vez de fallar.
- **FR-016**: Cada uno de los 4 reportes MUST respetar el aislamiento por empresa (multi-tenant)
  ya establecido en el resto del sistema — un usuario nunca MUST ver datos de otra empresa en
  ningún reporte.
- **FR-017**: Cada exportación exitosa (Excel o PDF, de cualquiera de los 4 reportes) MUST
  registrarse en la bitácora de auditoría con usuario, fecha/hora, reporte exportado y los
  filtros usados (rango de fechas y vehículo, si aplica); consultar un reporte en pantalla
  (`ver`) MUST NOT generar entrada de auditoría (Clarifications, sesión 2026-08-19).

### Key Entities

- **Reporte de costos de mantenimiento**: vista calculada (no almacenada) sobre las órdenes de
  mantenimiento activas (Feature 008) dentro de un rango de fechas, agregada por tipo y por
  vehículo.
- **Reporte de consumo y rendimiento de combustible**: vista calculada sobre las cargas de
  combustible activas (Feature 007) dentro de un rango de fechas, con litros/galones, costo y
  rendimiento (calculado entre cargas consecutivas) por vehículo.
- **Reporte de vencimientos**: vista calculada que combina licencias de conductor (Feature 004),
  pólizas de vehículo y permisos de vehículo (Feature 003) cuya fecha de vencimiento cae dentro
  de un rango de fechas libre.
- **Reporte de cumplimiento**: vista calculada que combina checklists (Feature 009) y servicios
  obligatorios (Feature 010), agregados por tipo de vehículo como porcentajes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un administrador puede generar cualquiera de los 4 reportes, con el rango de fechas
  que necesite, en menos de 10 segundos desde que entra a la pantalla de reportes.
- **SC-002**: El total general mostrado en el reporte de costos de mantenimiento coincide, en el
  100% de los casos de prueba, con la suma manual de las órdenes activas del mismo rango y
  filtro.
- **SC-003**: El rendimiento de combustible calculado por el sistema coincide, en el 100% de los
  casos de prueba con al menos dos cargas activas consecutivas, con el cálculo manual esperado;
  las cargas sin carga anterior muestran "N/D" en el 100% de los casos, nunca cero ni error.
- **SC-004**: Los archivos exportados (Excel y PDF) contienen exactamente los mismos totales y
  filas que se muestran en pantalla al momento de exportar, en el 100% de los reportes
  verificados.
- **SC-005**: Un operario sin el permiso `exportar` nunca puede descargar un archivo de reporte,
  verificado en el 100% de los intentos de prueba.
- **SC-006**: Un usuario nunca ve, en ningún reporte, datos de una empresa distinta a la suya,
  verificado en el 100% de los casos de prueba multi-tenant.

## Assumptions

- Los 4 reportes se calculan siempre en el momento de la consulta (sin caché ni tablas de
  resumen materializadas) — dado el volumen esperado de una flotilla individual, el rendimiento
  de consulta directa es aceptable sin optimización adicional en esta feature.
- El umbral de "por vencer" del reporte de vencimientos y del reporte de cumplimiento (servicios
  obligatorios) reutiliza los 60 días ya establecidos en Vehículos (003), Conductores (004) y
  Servicios Obligatorios (010), sin volverse configurable por empresa en esta feature.
- El envío periódico de un reporte por correo no está incluido — es una posible extensión futura,
  no solicitada para el MVP.
- La paginación o límite de filas de un reporte muy grande (ej. una flotilla con miles de cargas
  de combustible en un rango amplio) sigue el mismo patrón de listado ya usado en el resto del
  sistema (Feature 007/008/009/010), sin un límite especial propio de Reportes.
- El formato exacto de columnas y diseño visual de los archivos Excel/PDF exportados se define en
  la fase de planeación (`/speckit-plan`), siguiendo `docs/design-system.md` para el PDF; esta
  especificación solo fija qué datos MUST contener cada exportación, no su presentación.
