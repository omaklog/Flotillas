# Constitución del Proyecto — Sistema de Gestión de Flotilla de Vehículos

> Este archivo va en `.specify/memory/constitution.md`. Se genera/actualiza con
> `/speckit.constitution`. Toda especificación, plan y tarea debe respetar estas reglas.

## 1. Principios de arquitectura
- El sistema es una aplicación web full-stack en **TypeScript estricto** (sin `any` implícito).
- Arquitectura **monolito modular** sobre Nuxt 4 (Vue 3 + Vuetify): un solo repo/deploy,
  módulos desacoplados por dominio (vehículos, conductores, mantenimiento, combustible, seguros,
  reportes).
- No se introducen microservicios ni colas de mensajería en esta fase; la simplicidad operativa
  para un equipo de un desarrollador tiene prioridad sobre la escalabilidad prematura.
- Es obligatorio que la aplicación funcione como **PWA instalable** (manifest + service worker),
  con soporte responsivo completo para escritorio, tablet y celular.

## 2. Datos e integridad
- Toda entidad de negocio (vehículo, conductor, proveedor, aseguradora, producto, permiso,
  mantenimiento, carga de combustible) vive en **PostgreSQL gestionado por Supabase**, con el
  esquema versionado mediante migraciones SQL (Supabase CLI). No se permiten cambios de esquema
  manuales en producción, ni políticas de RLS agregadas fuera de una migración versionada.
- **Row Level Security (RLS) obligatorio en todas las tablas**, sin excepción. RLS es la línea de
  defensa principal de autorización a nivel de dato; la validación en `server/api/` y en el
  cliente son capas adicionales, nunca sustitutos de RLS.
- Ninguna función `SECURITY DEFINER` ni uso de la `service_role key` de Supabase se expone al
  cliente. Su uso se limita al servidor y se documenta explícitamente en el código.
- Los registros de **carga de combustible** y **mantenimiento** son inmutables una vez capturados:
  solo admiten cancelación (soft-cancel), nunca edición ni borrado físico.
- Toda eliminación de catálogos (vehículo, conductor, proveedor, aseguradora) debe validar
  ausencia de registros dependientes antes de proceder (regla de integridad referencial de negocio).
- Toda acción de creación, edición, eliminación y cancelación queda registrada en la
  **bitácora de auditoría** (usuario, fecha/hora, entidad, acción, valores antes/después).

## 3. Seguridad y acceso
- Autenticación obligatoria con captcha y flujo de recuperación de contraseña.
- Modelo de roles de tres niveles: **Superusuario > Administrador > Operario**, con permisos
  granulares por módulo. Ningún endpoint de escritura queda accesible sin verificar rol.
- Archivos adjuntos (pólizas, licencias, facturas) se validan por tipo (PDF/imagen) y tamaño antes
  de almacenarse; nunca se ejecutan ni se sirven como HTML.
- Nunca se registran datos fiscales, contraseñas o credenciales en logs de aplicación.

## 4. Calidad
- Toda regla de negocio explícita en `spec.md` (ej. "no se puede elegir fecha posterior",
  "el tipo combustible solo aplica en carga de combustible") requiere una prueba automatizada
  con **Playwright**, la herramienta principal de pruebas del proyecto.
- Toda tabla con políticas de RLS requiere, como mínimo, un test Playwright que confirme que el
  rol restringido (operario) NO puede realizar la operación bloqueada, además de los tests que
  confirman que el rol autorizado sí puede. No basta con probar el camino permitido.
- Cobertura mínima de pruebas E2E: 70% sobre los módulos de captura de datos (vehículos,
  conductores, mantenimiento, combustible) y 100% sobre las políticas de RLS de tablas sensibles.
- Accesibilidad mínima: WCAG 2.1 AA en formularios y tablas de captura.
- Todo módulo con fechas de vencimiento (licencias, pólizas, permisos, servicios obligatorios)
  debe implementar su alerta automática correspondiente antes de considerarse completo.

## 5. Proceso
- Se sigue el flujo Spec Kit: `constitution → specify → clarify → plan → tasks → analyze → implement`.
- No se ejecuta `/speckit.implement` sobre más de 5-8 tareas sin revisión humana intermedia.
- Cambios de alcance (ej. activar el módulo de Reportes Inteligentes IA) requieren actualizar
  primero `spec.md`, nunca improvisarse directamente en el código.
