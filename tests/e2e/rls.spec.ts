import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../app/types/database.types'

// T085 (constitución §4): cobertura de casos NEGATIVOS de RLS para empresas/usuarios/
// usuario_permisos, golpeando PostgREST directo (no vía server/api/) — a diferencia de la
// mayoría de los tests de este proyecto, que validan la capa de aplicación (endpoints con
// chequeos explícitos de rol). Varios de esos endpoints usan `service_role`, que BYPASSEA RLS
// por completo — ahí RLS no aporta ninguna defensa adicional, así que probarla solo a través
// del endpoint no demuestra que la política de base de datos en sí funcione. Estos tests usan
// clientes autenticados reales (`signInWithPassword`), sin pasar por Nuxt en absoluto.

const PASSWORD_PRUEBAS = 'Flotillas#2026Dev'

function adminSupabaseClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

async function clienteAutenticado(email: string) {
  const client = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD_PRUEBAS })
  if (error) throw new Error(`No se pudo iniciar sesión como ${email}: ${error.message}`)
  return client
}

test.describe('RLS — casos negativos (constitución §4)', () => {
  test.use({ storageState: 'tests/e2e/.auth/superusuario.json' })

  test('empresas: un admin no puede leer ni escribir una empresa que no es la suya', async ({
    request
  }) => {
    const rfc = `T${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).toUpperCase().slice(2, 6)}`
    const correoAdmin = `admin-rls-${Date.now()}@flotillas.local`

    const altaRespuesta = await request.post('/api/empresas', {
      data: {
        empresa: {
          nombre: 'Empresa Ajena RLS',
          rfc,
          pais: 'México',
          moneda: 'MXN',
          unidad_distancia: 'km',
          unidad_combustible: 'litros'
        },
        administrador: { nombre: 'Admin Ajeno', correo: correoAdmin }
      }
    })
    expect(altaRespuesta.status()).toBe(201)
    const { empresa_id: empresaAjenaId } = await altaRespuesta.json()

    const admin = await clienteAutenticado('admin-e2e@flotillas.local')

    const { data: lectura } = await admin.from('empresas').select('*').eq('id', empresaAjenaId)
    expect(lectura).toEqual([])

    const { data: escritura } = await admin
      .from('empresas')
      .update({ nombre: 'Nombre hackeado' })
      .eq('id', empresaAjenaId)
      .select()
    expect(escritura).toEqual([])

    // Confirma que de verdad no cambió nada (control positivo del negativo anterior).
    const service = adminSupabaseClient()
    const { data: siguIgual } = await service
      .from('empresas')
      .select('nombre')
      .eq('id', empresaAjenaId)
      .single()
    expect(siguIgual!.nombre).toBe('Empresa Ajena RLS')
  })

  test('usuarios: un admin no puede leer usuarios de otra empresa', async ({ request }) => {
    const rfc = `T${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).toUpperCase().slice(2, 6)}`
    const correoAdmin = `admin-rls2-${Date.now()}@flotillas.local`

    const altaRespuesta = await request.post('/api/empresas', {
      data: {
        empresa: {
          nombre: 'Empresa Ajena RLS 2',
          rfc,
          pais: 'México',
          moneda: 'MXN',
          unidad_distancia: 'km',
          unidad_combustible: 'litros'
        },
        administrador: { nombre: 'Admin Ajeno 2', correo: correoAdmin }
      }
    })
    expect(altaRespuesta.status()).toBe(201)
    const { empresa_id: empresaAjenaId } = await altaRespuesta.json()

    const admin = await clienteAutenticado('admin-e2e@flotillas.local')
    const { data } = await admin.from('usuarios').select('*').eq('empresa_id', empresaAjenaId)
    expect(data).toEqual([])
  })

  // Feature 002 (Catálogos Base) — T046: aislamiento por empresa en las 3 tablas de catálogo
  // (FR-014), consolidado aquí en vez de repetido por historia — mismo criterio que los 2 tests
  // de arriba (empresas/usuarios). quickstart.md Escenario 5. Cierra G1 de /speckit-analyze.
  test('catálogos: un admin no ve tipos_vehiculo/aseguradoras/permisos de otra empresa, y la misma clave en dos empresas no choca', async ({
    request
  }) => {
    const rfc = `T${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).toUpperCase().slice(2, 6)}`
    const correoAdmin = `admin-rls-catalogos-${Date.now()}@flotillas.local`

    // Alta de una segunda empresa: su trigger de siembra (FR-011) crea 'ligero'/'pesado'/
    // 'mat_peligrosos' — mismas claves que ya existen en la empresa de admin-e2e. Si eso no
    // choca, ya demuestra que UNIQUE es (empresa_id, clave), no global.
    const altaRespuesta = await request.post('/api/empresas', {
      data: {
        empresa: {
          nombre: 'Empresa Ajena Catálogos RLS',
          rfc,
          pais: 'México',
          moneda: 'MXN',
          unidad_distancia: 'km',
          unidad_combustible: 'litros'
        },
        administrador: { nombre: 'Admin Ajeno Catálogos', correo: correoAdmin }
      }
    })
    expect(altaRespuesta.status()).toBe(201)
    const { empresa_id: empresaAjenaId } = await altaRespuesta.json()

    const admin = await clienteAutenticado('admin-e2e@flotillas.local')

    const { data: tiposAjenos } = await admin
      .from('tipos_vehiculo')
      .select('*')
      .eq('empresa_id', empresaAjenaId)
    expect(tiposAjenos).toEqual([])

    const { data: aseguradorasAjenas } = await admin
      .from('aseguradoras')
      .select('*')
      .eq('empresa_id', empresaAjenaId)
    expect(aseguradorasAjenas).toEqual([])

    const { data: permisosAjenos } = await admin
      .from('permisos')
      .select('*')
      .eq('empresa_id', empresaAjenaId)
    expect(permisosAjenos).toEqual([])

    // Confirma explícitamente (vía service_role, que sí puede leer ambas) que 'pesado' existe
    // en las dos empresas como filas distintas — la clave duplicada entre empresas fue
    // aceptada, no rechazada.
    const service = adminSupabaseClient()
    const { data: perfilAdmin } = await service
      .from('usuarios')
      .select('empresa_id')
      .eq('correo', 'admin-e2e@flotillas.local')
      .single()
    const { data: pesadoPropio } = await service
      .from('tipos_vehiculo')
      .select('id')
      .eq('empresa_id', perfilAdmin!.empresa_id!)
      .eq('clave', 'pesado')
      .single()
    const { data: pesadoAjeno } = await service
      .from('tipos_vehiculo')
      .select('id')
      .eq('empresa_id', empresaAjenaId)
      .eq('clave', 'pesado')
      .single()
    expect(pesadoPropio).not.toBeNull()
    expect(pesadoAjeno).not.toBeNull()
    expect(pesadoPropio!.id).not.toBe(pesadoAjeno!.id)
  })

  test('usuario_permisos: un operario no puede otorgarse permisos directamente (solo vía el endpoint de admin)', async () => {
    const operario = await clienteAutenticado('operario-e2e@flotillas.local')

    const {
      data: { user }
    } = await operario.auth.getUser()
    const { data: perfil } = await operario
      .from('usuarios')
      .select('id, empresa_id')
      .eq('auth_user_id', user!.id)
      .single()

    const { error } = await operario.from('usuario_permisos').insert({
      empresa_id: perfil!.empresa_id!,
      usuario_id: perfil!.id,
      modulo_clave: 'vehiculos',
      accion: 'editar',
      otorgado_por: perfil!.id
    })

    // A diferencia de SELECT/UPDATE (que solo filtran filas en silencio), un INSERT que viola
    // el `with check` de RLS sí lanza un error real de Postgres.
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/row-level security/i)
  })

  // Feature 002 (Catálogos Base) — T020/T030/T041: un operario tiene 'ver' por defecto en los
  // 3 módulos de catálogo (modulos_ver en otorgar_permisos_default_operario), pero no
  // 'crear'/'editar'/'eliminar' salvo que el admin se lo otorgue explícitamente (spec FR-015).
  test('tipos_vehiculo: un operario con solo "ver" no puede crear, editar ni eliminar (US1, FR-015)', async () => {
    const operario = await clienteAutenticado('operario-e2e@flotillas.local')
    const {
      data: { user }
    } = await operario.auth.getUser()
    const { data: perfil } = await operario
      .from('usuarios')
      .select('id, empresa_id')
      .eq('auth_user_id', user!.id)
      .single()

    const { error: insertError } = await operario.from('tipos_vehiculo').insert({
      empresa_id: perfil!.empresa_id!,
      clave: `rls_t020_${Date.now()}`,
      nombre: 'Intento Operario T020'
    })
    expect(insertError).not.toBeNull()
    expect(insertError!.message).toMatch(/row-level security/i)

    // 'ligero' ya viene sembrado por defecto (FR-011) — el operario sí puede leerlo (tiene
    // 'ver'), pero no editarlo ni eliminarlo.
    const { data: existente } = await operario
      .from('tipos_vehiculo')
      .select('id')
      .eq('empresa_id', perfil!.empresa_id!)
      .eq('clave', 'ligero')
      .single()

    const { data: actualizado } = await operario
      .from('tipos_vehiculo')
      .update({ nombre: 'Hackeado' })
      .eq('id', existente!.id)
      .select()
    expect(actualizado).toEqual([])

    const { data: eliminado } = await operario
      .from('tipos_vehiculo')
      .delete()
      .eq('id', existente!.id)
      .select()
    expect(eliminado).toEqual([])
  })

  // T030: a diferencia de tipos_vehiculo, aseguradoras no tiene siembra automática (FR-013) —
  // se siembra una fila propia vía service_role para probar UPDATE/DELETE.
  test('aseguradoras: un operario con solo "ver" no puede crear, editar ni eliminar (US2, FR-015)', async () => {
    const admin = adminSupabaseClient()
    const operario = await clienteAutenticado('operario-e2e@flotillas.local')
    const {
      data: { user }
    } = await operario.auth.getUser()
    const { data: perfil } = await operario
      .from('usuarios')
      .select('id, empresa_id')
      .eq('auth_user_id', user!.id)
      .single()

    const { error: insertError } = await operario.from('aseguradoras').insert({
      empresa_id: perfil!.empresa_id!,
      razon_social: 'Intento Operario T030',
      rfc: 'OPE010101AAA'
    })
    expect(insertError).not.toBeNull()
    expect(insertError!.message).toMatch(/row-level security/i)

    const { data: aseguradora } = await admin
      .from('aseguradoras')
      .insert({
        empresa_id: perfil!.empresa_id!,
        razon_social: `Aseguradora RLS T030 ${Date.now()}`,
        rfc: 'RLS010101AAA'
      })
      .select('id')
      .single()

    const { data: actualizado } = await operario
      .from('aseguradoras')
      .update({ razon_social: 'Hackeado' })
      .eq('id', aseguradora!.id)
      .select()
    expect(actualizado).toEqual([])

    const { data: eliminado } = await operario
      .from('aseguradoras')
      .delete()
      .eq('id', aseguradora!.id)
      .select()
    expect(eliminado).toEqual([])
  })

  // T041: igual que aseguradoras, `permisos` no tiene siembra automática (FR-013) — se
  // siembra una fila propia vía service_role para probar UPDATE/DELETE.
  test('permisos: un operario con solo "ver" no puede crear, editar ni eliminar (US3, FR-015)', async () => {
    const admin = adminSupabaseClient()
    const operario = await clienteAutenticado('operario-e2e@flotillas.local')
    const {
      data: { user }
    } = await operario.auth.getUser()
    const { data: perfil } = await operario
      .from('usuarios')
      .select('id, empresa_id')
      .eq('auth_user_id', user!.id)
      .single()

    const { error: insertError } = await operario.from('permisos').insert({
      empresa_id: perfil!.empresa_id!,
      clave: `rls_t041_${Date.now()}`,
      nombre: 'Intento Operario T041',
      tipo: 'estatal'
    })
    expect(insertError).not.toBeNull()
    expect(insertError!.message).toMatch(/row-level security/i)

    const { data: permiso } = await admin
      .from('permisos')
      .insert({
        empresa_id: perfil!.empresa_id!,
        clave: `rls_t041_seed_${Date.now()}`,
        nombre: 'Permiso RLS T041',
        tipo: 'federal'
      })
      .select('id')
      .single()

    const { data: actualizado } = await operario
      .from('permisos')
      .update({ nombre: 'Hackeado' })
      .eq('id', permiso!.id)
      .select()
    expect(actualizado).toEqual([])

    const { data: eliminado } = await operario
      .from('permisos')
      .delete()
      .eq('id', permiso!.id)
      .select()
    expect(eliminado).toEqual([])
  })

  // Feature 003 (Vehículos) — T046: mismo criterio que las 3 pruebas de arriba, consolidado en
  // una sola porque `vehiculos_write`/`vehiculo_permisos_write` gatean TODAS las operaciones de
  // escritura (crear/editar/baja/reactivar/eliminar/permisos asignados) tras un único chequeo de
  // `tiene_permiso('vehiculos','editar')` — no hay una política por acción que probar por
  // separado (research.md R1 de 003-vehiculos). quickstart.md Escenario 7.
  test('vehiculos: un operario con solo "ver" no puede crear, editar, dar de baja, reactivar ni eliminar vehículos, ni gestionar sus permisos asignados (US1-US6, FR-015)', async () => {
    const admin = adminSupabaseClient()
    const operario = await clienteAutenticado('operario-e2e@flotillas.local')
    const {
      data: { user }
    } = await operario.auth.getUser()
    const { data: perfil } = await operario
      .from('usuarios')
      .select('id, empresa_id')
      .eq('auth_user_id', user!.id)
      .single()
    const { data: tipo } = await operario
      .from('tipos_vehiculo')
      .select('id')
      .eq('empresa_id', perfil!.empresa_id!)
      .eq('clave', 'ligero')
      .single()

    // Crear: bloqueado.
    const { error: insertError } = await operario.from('vehiculos').insert({
      empresa_id: perfil!.empresa_id!,
      marca: 'Intento Operario T046',
      modelo: 'X',
      placa: `RLS-T046-${Date.now()}`,
      tipo_vehiculo_id: tipo!.id
    })
    expect(insertError).not.toBeNull()
    expect(insertError!.message).toMatch(/row-level security/i)

    // El operario sí puede leer (tiene 'ver') un vehículo sembrado por el admin.
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .insert({
        empresa_id: perfil!.empresa_id!,
        marca: 'Vehículo RLS T046',
        modelo: 'X',
        placa: `RLS-T046-SEED-${Date.now()}`,
        tipo_vehiculo_id: tipo!.id
      })
      .select('id')
      .single()
    const { data: leido } = await operario.from('vehiculos').select('id').eq('id', vehiculo!.id).single()
    expect(leido!.id).toBe(vehiculo!.id)

    // Editar: bloqueado.
    const { data: editado } = await operario
      .from('vehiculos')
      .update({ modelo: 'Hackeado' })
      .eq('id', vehiculo!.id)
      .select()
    expect(editado).toEqual([])

    // Dar de baja: bloqueado (es un UPDATE de baja/motivo_baja, misma política).
    const { data: dadoDeBaja } = await operario
      .from('vehiculos')
      .update({ baja: true, motivo_baja: 'Intento operario' })
      .eq('id', vehiculo!.id)
      .select()
    expect(dadoDeBaja).toEqual([])

    // Reactivar: bloqueado (sembrado ya-de-baja por el admin, el operario intenta reactivar).
    await admin.from('vehiculos').update({ baja: true, motivo_baja: 'Sembrado por T046' }).eq('id', vehiculo!.id)
    const { data: reactivado } = await operario
      .from('vehiculos')
      .update({ baja: false })
      .eq('id', vehiculo!.id)
      .select()
    expect(reactivado).toEqual([])

    // Eliminar: bloqueado.
    const { data: eliminado } = await operario.from('vehiculos').delete().eq('id', vehiculo!.id).select()
    expect(eliminado).toEqual([])

    // Permisos asignados al vehículo: crear/editar/quitar, todos bloqueados.
    const { data: permiso } = await admin
      .from('permisos')
      .insert({
        empresa_id: perfil!.empresa_id!,
        clave: `rls_t046_${Date.now()}`,
        nombre: 'Permiso RLS T046',
        tipo: 'estatal'
      })
      .select('id')
      .single()
    const { error: asignarError } = await operario.from('vehiculo_permisos').insert({
      empresa_id: perfil!.empresa_id!,
      vehiculo_id: vehiculo!.id,
      permiso_id: permiso!.id
    })
    expect(asignarError).not.toBeNull()
    expect(asignarError!.message).toMatch(/row-level security/i)

    const { data: asignacion } = await admin
      .from('vehiculo_permisos')
      .insert({ empresa_id: perfil!.empresa_id!, vehiculo_id: vehiculo!.id, permiso_id: permiso!.id })
      .select('id')
      .single()
    const { data: vencimientoEditado } = await operario
      .from('vehiculo_permisos')
      .update({ fecha_vencimiento: '2030-01-01' })
      .eq('id', asignacion!.id)
      .select()
    expect(vencimientoEditado).toEqual([])

    const { data: asignacionQuitada } = await operario
      .from('vehiculo_permisos')
      .delete()
      .eq('id', asignacion!.id)
      .select()
    expect(asignacionQuitada).toEqual([])

    // Control positivo del negativo anterior: sigue existiendo, sin cambios.
    const { data: siguIgual } = await admin
      .from('vehiculos')
      .select('marca, baja')
      .eq('id', vehiculo!.id)
      .single()
    expect(siguIgual!.marca).toBe('Vehículo RLS T046')
    expect(siguIgual!.baja).toBe(true)
  })

  // T047 (003-vehiculos, SC-007): aislamiento del bucket `documentos` por empresa. A diferencia
  // de las tablas normales (donde el filtro de empresa vive en la fila), aquí vive en el propio
  // nombre del objeto (`storage.foldername(name)`) — se prueba por separado porque ejercita la
  // política de `storage.objects`, no la de `public.vehiculos`.
  test('documentos: un administrador de una empresa no puede generar una URL firmada válida ni listar la carpeta de otra empresa (SC-007)', async ({
    request
  }) => {
    const rfc = `T${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).toUpperCase().slice(2, 6)}`
    const correoAdminAjeno = `admin-rls-storage-${Date.now()}@flotillas.local`
    const altaRespuesta = await request.post('/api/empresas', {
      data: {
        empresa: {
          nombre: 'Empresa Ajena RLS Storage',
          rfc,
          pais: 'México',
          moneda: 'MXN',
          unidad_distancia: 'km',
          unidad_combustible: 'litros'
        },
        administrador: { nombre: 'Admin Ajeno Storage', correo: correoAdminAjeno }
      }
    })
    expect(altaRespuesta.status()).toBe(201)
    const { empresa_id: empresaAjenaId } = await altaRespuesta.json()

    const admin = adminSupabaseClient()
    const { data: tipoAjeno } = await admin
      .from('tipos_vehiculo')
      .select('id')
      .eq('empresa_id', empresaAjenaId)
      .eq('clave', 'ligero')
      .single()
    const { data: vehiculoAjeno } = await admin
      .from('vehiculos')
      .insert({
        empresa_id: empresaAjenaId,
        marca: 'Vehículo Ajeno T047',
        modelo: 'X',
        placa: `RLS-T047-${Date.now()}`,
        tipo_vehiculo_id: tipoAjeno!.id
      })
      .select('id')
      .single()
    const rutaAjena = `poliza/${empresaAjenaId}/${vehiculoAjeno!.id}/seed.pdf`
    const { error: errSubida } = await admin.storage
      .from('documentos')
      .upload(rutaAjena, Buffer.from('%PDF-1.4 documento de otra empresa'), {
        contentType: 'application/pdf'
      })
    expect(errSubida).toBeNull()

    const adminPropio = await clienteAutenticado('admin-e2e@flotillas.local')

    const { error: errFirma } = await adminPropio.storage.from('documentos').createSignedUrl(rutaAjena, 60)
    expect(errFirma).not.toBeNull()

    const { data: listado } = await adminPropio.storage
      .from('documentos')
      .list(`poliza/${empresaAjenaId}/${vehiculoAjeno!.id}`)
    expect(listado ?? []).toEqual([])
  })

  // T045 (004-conductores, FR-018): caso POSITIVO y NEGATIVO juntos — constitución §2 "no basta
  // con probar el camino permitido". El positivo (operario SÍ puede leer) es la mitad que
  // `/speckit-analyze` encontró sin cobertura la primera vez que se escribió esta fase.
  test('conductores: un operario con solo "ver" puede leer, pero no crear, editar, desactivar, reactivar ni eliminar conductores; tampoco subir a documentos/licencia ni documentos/poliza (US1-US6, FR-018)', async () => {
    const admin = adminSupabaseClient()
    const operario = await clienteAutenticado('operario-e2e@flotillas.local')
    const {
      data: { user }
    } = await operario.auth.getUser()
    const { data: perfil } = await operario
      .from('usuarios')
      .select('id, empresa_id')
      .eq('auth_user_id', user!.id)
      .single()

    // Sembrado por el admin.
    const { data: conductor } = await admin
      .from('conductores')
      .insert({
        empresa_id: perfil!.empresa_id!,
        nombre: 'Conductor RLS T045',
        apellidos: 'X',
        numero_licencia: `RLS-T045-${Date.now()}`,
        tipo_licencia: 'federal',
        fecha_vencimiento_licencia: '2030-01-01'
      })
      .select('id')
      .single()

    // Positivo: el operario SÍ puede leerlo (tiene 'ver').
    const { data: leido } = await operario
      .from('conductores')
      .select('id, nombre')
      .eq('id', conductor!.id)
      .single()
    expect(leido!.id).toBe(conductor!.id)

    // Crear: bloqueado.
    const { error: insertError } = await operario.from('conductores').insert({
      empresa_id: perfil!.empresa_id!,
      nombre: 'Intento Operario T045',
      apellidos: 'X',
      numero_licencia: `RLS-T045-INTENTO-${Date.now()}`,
      tipo_licencia: 'federal',
      fecha_vencimiento_licencia: '2030-01-01'
    })
    expect(insertError).not.toBeNull()
    expect(insertError!.message).toMatch(/row-level security/i)

    // Editar: bloqueado.
    const { data: editado } = await operario
      .from('conductores')
      .update({ apellidos: 'Hackeado' })
      .eq('id', conductor!.id)
      .select()
    expect(editado).toEqual([])

    // Desactivar: bloqueado (es un UPDATE de activo/motivo_baja, misma política).
    const { data: desactivado } = await operario
      .from('conductores')
      .update({ activo: false, motivo_baja: 'Intento operario' })
      .eq('id', conductor!.id)
      .select()
    expect(desactivado).toEqual([])

    // Reactivar: bloqueado (sembrado ya-inactivo por el admin, el operario intenta reactivar).
    await admin
      .from('conductores')
      .update({ activo: false, motivo_baja: 'Sembrado por T045' })
      .eq('id', conductor!.id)
    const { data: reactivado } = await operario
      .from('conductores')
      .update({ activo: true })
      .eq('id', conductor!.id)
      .select()
    expect(reactivado).toEqual([])

    // Eliminar: bloqueado.
    const { data: eliminado } = await operario.from('conductores').delete().eq('id', conductor!.id).select()
    expect(eliminado).toEqual([])

    // Subir a documentos/licencia/...: bloqueado (RLS de storage.objects, no tiene 'editar' en
    // el módulo conductores).
    const { error: errSubidaLicencia } = await operario.storage
      .from('documentos')
      .upload(
        `licencia/${perfil!.empresa_id}/${conductor!.id}/intento-operario.pdf`,
        Buffer.from('%PDF-1.4 intento'),
        { contentType: 'application/pdf' }
      )
    expect(errSubidaLicencia).not.toBeNull()

    // Tampoco puede subir a documentos/poliza/...: confirma que la generalización de las
    // políticas de storage.objects (research.md R4 de 004-conductores) no le da, de paso, acceso
    // de escritura sobre los archivos de otro módulo (vehiculos) solo por tener el de
    // conductores.
    const { data: tipoVehiculo } = await admin
      .from('tipos_vehiculo')
      .select('id')
      .eq('empresa_id', perfil!.empresa_id!)
      .eq('clave', 'ligero')
      .single()
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .insert({
        empresa_id: perfil!.empresa_id!,
        marca: 'Vehículo RLS T045',
        modelo: 'X',
        placa: `RLS-T045-${Date.now()}`,
        tipo_vehiculo_id: tipoVehiculo!.id
      })
      .select('id')
      .single()
    const { error: errSubidaPoliza } = await operario.storage
      .from('documentos')
      .upload(
        `poliza/${perfil!.empresa_id}/${vehiculo!.id}/intento-operario.pdf`,
        Buffer.from('%PDF-1.4 intento'),
        { contentType: 'application/pdf' }
      )
    expect(errSubidaPoliza).not.toBeNull()

    // Control positivo del negativo anterior: sigue existiendo, sin cambios.
    const { data: sigueIgual } = await admin
      .from('conductores')
      .select('apellidos, activo')
      .eq('id', conductor!.id)
      .single()
    expect(sigueIgual!.apellidos).toBe('X')
    expect(sigueIgual!.activo).toBe(false)
  })

  // T046 (004-conductores, FR-017/SC-007): aislamiento del bucket `documentos` por empresa para
  // archivos de licencia — mismo criterio que el test de `poliza` (T047 de 003-vehiculos) arriba,
  // pero ejercitando el segmento `licencia` de la política generalizada (research.md R4).
  test('documentos (licencia): un administrador de una empresa no puede generar una URL firmada válida ni listar la carpeta de licencia de otra empresa (SC-007)', async ({
    request
  }) => {
    const rfc = `T${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).toUpperCase().slice(2, 6)}`
    const correoAdminAjeno = `admin-rls-storage-licencia-${Date.now()}@flotillas.local`
    const altaRespuesta = await request.post('/api/empresas', {
      data: {
        empresa: {
          nombre: 'Empresa Ajena RLS Storage Licencia',
          rfc,
          pais: 'México',
          moneda: 'MXN',
          unidad_distancia: 'km',
          unidad_combustible: 'litros'
        },
        administrador: { nombre: 'Admin Ajeno Storage Licencia', correo: correoAdminAjeno }
      }
    })
    expect(altaRespuesta.status()).toBe(201)
    const { empresa_id: empresaAjenaId } = await altaRespuesta.json()

    const admin = adminSupabaseClient()
    const { data: conductorAjeno } = await admin
      .from('conductores')
      .insert({
        empresa_id: empresaAjenaId,
        nombre: 'Conductor Ajeno T046',
        apellidos: 'X',
        numero_licencia: `RLS-T046-${Date.now()}`,
        tipo_licencia: 'federal',
        fecha_vencimiento_licencia: '2030-01-01'
      })
      .select('id')
      .single()
    const rutaAjena = `licencia/${empresaAjenaId}/${conductorAjeno!.id}/seed.pdf`
    const { error: errSubida } = await admin.storage
      .from('documentos')
      .upload(rutaAjena, Buffer.from('%PDF-1.4 documento de otra empresa'), {
        contentType: 'application/pdf'
      })
    expect(errSubida).toBeNull()

    const adminPropio = await clienteAutenticado('admin-e2e@flotillas.local')

    const { error: errFirma } = await adminPropio.storage.from('documentos').createSignedUrl(rutaAjena, 60)
    expect(errFirma).not.toBeNull()

    const { data: listado } = await adminPropio.storage
      .from('documentos')
      .list(`licencia/${empresaAjenaId}/${conductorAjeno!.id}`)
    expect(listado ?? []).toEqual([])
  })

  // T027 (005-asignacion-conductor-vehiculo, FR-011): caso positivo Y negativo — constitución §2
  // "no basta con probar el camino permitido". Cualquiera de los dos módulos (vehiculos O
  // conductores) con 'editar' MUST alcanzar, reflejando la política RLS ya vigente.
  test('asignaciones_conductor_vehiculo: un operario con solo "ver" en ambos módulos puede leer pero no escribir; con "editar" en cualquiera de los dos, sí puede (US1-US3, FR-011)', async () => {
    const admin = adminSupabaseClient()
    const operario = await clienteAutenticado('operario-e2e@flotillas.local')
    const {
      data: { user }
    } = await operario.auth.getUser()
    const { data: perfil } = await operario
      .from('usuarios')
      .select('id, empresa_id')
      .eq('auth_user_id', user!.id)
      .single()
    const { data: tipo } = await admin
      .from('tipos_vehiculo')
      .select('id')
      .eq('empresa_id', perfil!.empresa_id!)
      .eq('clave', 'ligero')
      .single()

    const { data: vehiculo } = await admin
      .from('vehiculos')
      .insert({
        empresa_id: perfil!.empresa_id!,
        marca: 'Vehículo RLS T027',
        modelo: 'X',
        placa: `RLS-T027-${Date.now()}`,
        tipo_vehiculo_id: tipo!.id
      })
      .select('id')
      .single()
    const { data: conductor } = await admin
      .from('conductores')
      .insert({
        empresa_id: perfil!.empresa_id!,
        nombre: 'Conductor RLS T027',
        apellidos: 'X',
        numero_licencia: `RLS-T027-${Date.now()}`,
        tipo_licencia: 'federal',
        fecha_vencimiento_licencia: '2030-01-01'
      })
      .select('id')
      .single()
    const { data: asignacion } = await admin
      .from('asignaciones_conductor_vehiculo')
      .insert({
        empresa_id: perfil!.empresa_id!,
        vehiculo_id: vehiculo!.id,
        conductor_id: conductor!.id,
        asignado_por: perfil!.id
      })
      .select('id')
      .single()

    // Positivo: el operario SÍ puede leerla (tiene 'ver' en ambos módulos por defecto).
    const { data: leida } = await operario
      .from('asignaciones_conductor_vehiculo')
      .select('id')
      .eq('id', asignacion!.id)
      .single()
    expect(leida!.id).toBe(asignacion!.id)

    // Negativo: sin 'editar' en ninguno de los dos módulos, no puede finalizarla.
    const { data: intento1 } = await operario
      .from('asignaciones_conductor_vehiculo')
      .update({ fecha_fin: '2030-01-01' })
      .eq('id', asignacion!.id)
      .select()
    expect(intento1).toEqual([])

    // Positivo: con 'editar' otorgado SOLO en 'conductores' (no 'vehiculos'), sí puede.
    await admin.from('usuario_permisos').insert({
      empresa_id: perfil!.empresa_id!,
      usuario_id: perfil!.id,
      modulo_clave: 'conductores',
      accion: 'editar',
      otorgado_por: perfil!.id
    })
    const { data: intento2 } = await operario
      .from('asignaciones_conductor_vehiculo')
      .update({ fecha_fin: '2030-01-01' })
      .eq('id', asignacion!.id)
      .select()
    expect(intento2).not.toEqual([])
    await admin
      .from('usuario_permisos')
      .delete()
      .eq('usuario_id', perfil!.id)
      .eq('modulo_clave', 'conductores')
      .eq('accion', 'editar')

    // Positivo: con 'editar' otorgado SOLO en 'vehiculos' (no 'conductores'), también alcanza.
    const { data: asignacion2 } = await admin
      .from('asignaciones_conductor_vehiculo')
      .insert({
        empresa_id: perfil!.empresa_id!,
        vehiculo_id: vehiculo!.id,
        conductor_id: conductor!.id,
        asignado_por: perfil!.id
      })
      .select('id')
      .single()
    await admin.from('usuario_permisos').insert({
      empresa_id: perfil!.empresa_id!,
      usuario_id: perfil!.id,
      modulo_clave: 'vehiculos',
      accion: 'editar',
      otorgado_por: perfil!.id
    })
    const { data: intento3 } = await operario
      .from('asignaciones_conductor_vehiculo')
      .update({ fecha_fin: '2030-01-01' })
      .eq('id', asignacion2!.id)
      .select()
    expect(intento3).not.toEqual([])
    await admin
      .from('usuario_permisos')
      .delete()
      .eq('usuario_id', perfil!.id)
      .eq('modulo_clave', 'vehiculos')
      .eq('accion', 'editar')
  })

  // T019 (004-conductores, actualización posterior "Foto del Conductor", FR-007, SC-003): caso
  // positivo — constitución §2 "no basta con probar el camino permitido". Un operario con
  // 'editar' otorgado ÚNICAMENTE en 'conductores' (sin 'vehiculos') debe poder subir a
  // documentos/foto_conductor/..., mismo permiso que ya le alcanza para la licencia (research.md
  // R11 de specs/004-conductores/). El caso negativo (operario sin ese permiso, bloqueado) ya lo
  // cubre el test de arriba "conductores: un operario con solo
  // 'ver'..." sobre el segmento `licencia` — la cláusula de RLS de `foto_conductor` es
  // estructuralmente idéntica (mismo `tiene_permiso('conductores','editar')`). No se repite aquí
  // como pre-chequeo porque esta suite corre en paralelo en 4 proyectos de Playwright
  // (admin/operario/superusuario/anonimo) contra el mismo usuario `operario-e2e` compartido: un
  // pre-chequeo negativo local puede correr justo cuando OTRO proyecto ya otorgó el permiso vía
  // el `insert` de abajo, dando un falso negativo intermitente (confirmado al reproducirlo).
  test('documentos (foto_conductor): un operario con "editar" otorgado únicamente en conductores puede subir la foto de un conductor (FR-007, SC-003)', async () => {
    const admin = adminSupabaseClient()
    const operario = await clienteAutenticado('operario-e2e@flotillas.local')
    const {
      data: { user }
    } = await operario.auth.getUser()
    const { data: perfil } = await operario
      .from('usuarios')
      .select('id, empresa_id')
      .eq('auth_user_id', user!.id)
      .single()

    // Sufijo con entropía extra (no solo Date.now()): este test corre en paralelo en varios
    // proyectos de Playwright (admin/operario/superusuario/anonimo) contra la misma empresa E2E,
    // y dos workers pueden ejecutar este insert en el mismo milisegundo — Date.now() a secas
    // choca contra UNIQUE(empresa_id, numero_licencia) y deja `conductor` en null.
    const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const { data: conductor } = await admin
      .from('conductores')
      .insert({
        empresa_id: perfil!.empresa_id!,
        nombre: 'Conductor RLS T019',
        apellidos: 'X',
        numero_licencia: `RLS-T019-${sufijo}`,
        tipo_licencia: 'federal',
        fecha_vencimiento_licencia: '2030-01-01'
      })
      .select('id')
      .single()

    // Positivo: con 'editar' otorgado SOLO en 'conductores' (no 'vehiculos'), sí puede.
    await admin.from('usuario_permisos').insert({
      empresa_id: perfil!.empresa_id!,
      usuario_id: perfil!.id,
      modulo_clave: 'conductores',
      accion: 'editar',
      otorgado_por: perfil!.id
    })
    const { error: errConPermiso } = await operario.storage
      .from('documentos')
      .upload(
        `foto_conductor/${perfil!.empresa_id}/${conductor!.id}/con-permiso.jpg`,
        Buffer.from('foto de prueba'),
        { contentType: 'image/jpeg' }
      )
    expect(errConPermiso).toBeNull()
    await admin
      .from('usuario_permisos')
      .delete()
      .eq('usuario_id', perfil!.id)
      .eq('modulo_clave', 'conductores')
      .eq('accion', 'editar')
  })

  // T020 (004-conductores, actualización posterior "Foto del Conductor"): aislamiento del bucket
  // `documentos` por empresa para archivos de foto_conductor — mismo criterio que el test de
  // `licencia` arriba, ejercitando el segmento foto_conductor de la política generalizada
  // (research.md R11 de specs/004-conductores/).
  test('documentos (foto_conductor): un administrador de una empresa no puede generar una URL firmada válida ni listar la carpeta de foto de un conductor de otra empresa', async ({
    request
  }) => {
    const rfc = `T${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).toUpperCase().slice(2, 6)}`
    const correoAdminAjeno = `admin-rls-storage-foto-conductor-${Date.now()}@flotillas.local`
    const altaRespuesta = await request.post('/api/empresas', {
      data: {
        empresa: {
          nombre: 'Empresa Ajena RLS Storage Foto Conductor',
          rfc,
          pais: 'México',
          moneda: 'MXN',
          unidad_distancia: 'km',
          unidad_combustible: 'litros'
        },
        administrador: { nombre: 'Admin Ajeno Storage Foto Conductor', correo: correoAdminAjeno }
      }
    })
    expect(altaRespuesta.status()).toBe(201)
    const { empresa_id: empresaAjenaId } = await altaRespuesta.json()

    const admin = adminSupabaseClient()
    const { data: conductorAjeno } = await admin
      .from('conductores')
      .insert({
        empresa_id: empresaAjenaId,
        nombre: 'Conductor Ajeno T020',
        apellidos: 'X',
        numero_licencia: `RLS-T020-${Date.now()}`,
        tipo_licencia: 'federal',
        fecha_vencimiento_licencia: '2030-01-01'
      })
      .select('id')
      .single()
    const rutaAjena = `foto_conductor/${empresaAjenaId}/${conductorAjeno!.id}/seed.jpg`
    const { error: errSubida } = await admin.storage
      .from('documentos')
      .upload(rutaAjena, Buffer.from('foto de otra empresa'), { contentType: 'image/jpeg' })
    expect(errSubida).toBeNull()

    const adminPropio = await clienteAutenticado('admin-e2e@flotillas.local')

    const { error: errFirma } = await adminPropio.storage.from('documentos').createSignedUrl(rutaAjena, 60)
    expect(errFirma).not.toBeNull()

    const { data: listado } = await adminPropio.storage
      .from('documentos')
      .list(`foto_conductor/${empresaAjenaId}/${conductorAjeno!.id}`)
    expect(listado ?? []).toEqual([])
  })

  // T024 (004-conductores, actualización posterior "Foto del Conductor", Convergence, FR-007 /
  // constitución §4): caso negativo dedicado
  // para la rama foto_conductor — el pre-chequeo equivalente se quitó de T019 porque competía
  // contra los otros 3 proyectos de Playwright otorgando/revocando permisos sobre el mismo
  // `operario-e2e` compartido. Aquí se crea un operario AISLADO (usuario propio, sin ningún
  // usuario_permisos otorgado más allá de los defaults del trigger
  // otorgar_permisos_default_operario) para que el negativo no dependa de estado compartido.
  test('documentos (foto_conductor): un operario recién creado sin "editar" en conductores no puede subir la foto de un conductor (FR-007)', async () => {
    const admin = adminSupabaseClient()
    const { data: perfilAdmin } = await admin
      .from('usuarios')
      .select('empresa_id')
      .eq('correo', 'admin-e2e@flotillas.local')
      .single()
    const empresaId = perfilAdmin!.empresa_id!

    const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const correoOperarioAislado = `operario-rls-t024-${sufijo}@flotillas.local`
    const { data: authOperario, error: errAuth } = await admin.auth.admin.createUser({
      email: correoOperarioAislado,
      password: PASSWORD_PRUEBAS,
      email_confirm: true
    })
    if (errAuth) throw errAuth
    await admin.from('usuarios').insert({
      auth_user_id: authOperario!.user.id,
      empresa_id: empresaId,
      nombre: 'Operario RLS T024',
      correo: correoOperarioAislado,
      rol: 'operario',
      activo: true
    })

    const { data: conductor } = await admin
      .from('conductores')
      .insert({
        empresa_id: empresaId,
        nombre: 'Conductor RLS T024',
        apellidos: 'X',
        numero_licencia: `RLS-T024-${sufijo}`,
        tipo_licencia: 'federal',
        fecha_vencimiento_licencia: '2030-01-01'
      })
      .select('id')
      .single()

    const operarioAislado = await clienteAutenticado(correoOperarioAislado)

    // Negativo: el operario recién creado solo tiene 'ver' por defecto (sin 'editar' en
    // conductores) — bloqueado.
    const { error: errSubida } = await operarioAislado.storage
      .from('documentos')
      .upload(
        `foto_conductor/${empresaId}/${conductor!.id}/intento-sin-permiso.jpg`,
        Buffer.from('foto de prueba'),
        { contentType: 'image/jpeg' }
      )
    expect(errSubida).not.toBeNull()

    await admin.auth.admin.deleteUser(authOperario!.user.id)
  })

  // T030 (006-catalogos-base-ii, FR-011, SC-004): caso positivo Y negativo — constitución §2 "no
  // basta con probar el camino permitido". Operario aislado (usuario propio, sin más permisos que
  // los defaults del trigger otorgar_permisos_default_operario) para evitar la condición de
  // carrera entre proyectos de Playwright sobre el `operario-e2e` compartido (mismo criterio que
  // T024 de 006-foto-conductor).
  test('proveedores: un operario sin "editar" no puede crear/editar/desactivar/eliminar; con el permiso otorgado, sí puede', async () => {
    const admin = adminSupabaseClient()
    const { data: perfilAdmin } = await admin
      .from('usuarios')
      .select('empresa_id')
      .eq('correo', 'admin-e2e@flotillas.local')
      .single()
    const empresaId = perfilAdmin!.empresa_id!

    const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const correoOperarioAislado = `operario-rls-t030-${sufijo}@flotillas.local`
    const { data: authOperario, error: errAuth } = await admin.auth.admin.createUser({
      email: correoOperarioAislado,
      password: PASSWORD_PRUEBAS,
      email_confirm: true
    })
    if (errAuth) throw errAuth
    const { data: perfilOperario } = await admin
      .from('usuarios')
      .insert({
        auth_user_id: authOperario!.user.id,
        empresa_id: empresaId,
        nombre: 'Operario RLS T030',
        correo: correoOperarioAislado,
        rol: 'operario',
        activo: true
      })
      .select('id')
      .single()

    const { data: proveedor } = await admin
      .from('proveedores')
      .insert({ empresa_id: empresaId, nombre: `Proveedor RLS T030 ${sufijo}` })
      .select('id')
      .single()

    const operarioAislado = await clienteAutenticado(correoOperarioAislado)

    // Negativo: solo 'ver' por defecto — bloqueado en crear/editar/desactivar/eliminar.
    const { data: intentoCrear } = await operarioAislado
      .from('proveedores')
      .insert({ empresa_id: empresaId, nombre: 'Intento sin permiso' })
      .select()
    expect(intentoCrear).toBeNull()
    const { data: intentoEditar } = await operarioAislado
      .from('proveedores')
      .update({ nombre: 'Hackeado' })
      .eq('id', proveedor!.id)
      .select()
    expect(intentoEditar).toEqual([])
    const { data: intentoEliminar } = await operarioAislado
      .from('proveedores')
      .delete()
      .eq('id', proveedor!.id)
      .select()
    expect(intentoEliminar).toEqual([])

    // Positivo: con 'editar' otorgado explícitamente, sí puede.
    await admin.from('usuario_permisos').insert({
      empresa_id: empresaId,
      usuario_id: perfilOperario!.id,
      modulo_clave: 'proveedores',
      accion: 'editar',
      otorgado_por: perfilOperario!.id
    })
    const { data: intentoConPermiso } = await operarioAislado
      .from('proveedores')
      .update({ activo: false, motivo_baja: 'con permiso' })
      .eq('id', proveedor!.id)
      .select()
    expect(intentoConPermiso).not.toEqual([])

    await admin.auth.admin.deleteUser(authOperario!.user.id)
  })

  // T031 (006-catalogos-base-ii, FR-011, SC-004): mismo patrón que T030 para productos.
  test('productos: un operario sin "editar" no puede crear/editar/eliminar; con el permiso otorgado, sí puede', async () => {
    const admin = adminSupabaseClient()
    const { data: perfilAdmin } = await admin
      .from('usuarios')
      .select('empresa_id')
      .eq('correo', 'admin-e2e@flotillas.local')
      .single()
    const empresaId = perfilAdmin!.empresa_id!

    const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const correoOperarioAislado = `operario-rls-t031-${sufijo}@flotillas.local`
    const { data: authOperario, error: errAuth } = await admin.auth.admin.createUser({
      email: correoOperarioAislado,
      password: PASSWORD_PRUEBAS,
      email_confirm: true
    })
    if (errAuth) throw errAuth
    const { data: perfilOperario } = await admin
      .from('usuarios')
      .insert({
        auth_user_id: authOperario!.user.id,
        empresa_id: empresaId,
        nombre: 'Operario RLS T031',
        correo: correoOperarioAislado,
        rol: 'operario',
        activo: true
      })
      .select('id')
      .single()

    const { data: producto } = await admin
      .from('productos')
      .insert({ empresa_id: empresaId, nombre: `Producto RLS T031 ${sufijo}`, tipo: 'refaccion' })
      .select('id')
      .single()

    const operarioAislado = await clienteAutenticado(correoOperarioAislado)

    // Negativo: solo 'ver' por defecto.
    const { data: intentoCrear } = await operarioAislado
      .from('productos')
      .insert({ empresa_id: empresaId, nombre: 'Intento sin permiso', tipo: 'refaccion' })
      .select()
    expect(intentoCrear).toBeNull()
    const { data: intentoEditar } = await operarioAislado
      .from('productos')
      .update({ nombre: 'Hackeado' })
      .eq('id', producto!.id)
      .select()
    expect(intentoEditar).toEqual([])
    const { data: intentoEliminar } = await operarioAislado
      .from('productos')
      .delete()
      .eq('id', producto!.id)
      .select()
    expect(intentoEliminar).toEqual([])

    // Positivo: con 'editar' otorgado explícitamente, sí puede.
    await admin.from('usuario_permisos').insert({
      empresa_id: empresaId,
      usuario_id: perfilOperario!.id,
      modulo_clave: 'productos',
      accion: 'editar',
      otorgado_por: perfilOperario!.id
    })
    const { data: intentoConPermiso } = await operarioAislado
      .from('productos')
      .update({ unidad: 'litro' })
      .eq('id', producto!.id)
      .select()
    expect(intentoConPermiso).not.toEqual([])

    await admin.auth.admin.deleteUser(authOperario!.user.id)
  })

  // T036 (007-combustible, FR-012, SC-004): mismo patrón que T030/T031 — operario aislado, sin
  // más permisos que los defaults (`ver`+`crear` en `combustible`, sin `cancelar`).
  test('cargas_combustible: un operario sin "cancelar" no puede cancelar una carga activa; con el permiso otorgado, sí puede', async () => {
    const admin = adminSupabaseClient()
    const { data: perfilAdmin } = await admin
      .from('usuarios')
      .select('id, empresa_id')
      .eq('correo', 'admin-e2e@flotillas.local')
      .single()
    const empresaId = perfilAdmin!.empresa_id!

    const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const correoOperarioAislado = `operario-rls-t036-${sufijo}@flotillas.local`
    const { data: authOperario, error: errAuth } = await admin.auth.admin.createUser({
      email: correoOperarioAislado,
      password: PASSWORD_PRUEBAS,
      email_confirm: true
    })
    if (errAuth) throw errAuth
    const { data: perfilOperario } = await admin
      .from('usuarios')
      .insert({
        auth_user_id: authOperario!.user.id,
        empresa_id: empresaId,
        nombre: 'Operario RLS T036',
        correo: correoOperarioAislado,
        rol: 'operario',
        activo: true
      })
      .select('id')
      .single()

    const { data: tipo } = await admin
      .from('tipos_vehiculo')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('clave', 'ligero')
      .single()
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .insert({
        empresa_id: empresaId,
        marca: 'Vehiculo RLS T036',
        modelo: 'X',
        placa: `RLS-T036-${sufijo}`,
        tipo_vehiculo_id: tipo!.id
      })
      .select('id')
      .single()
    const { data: proveedor } = await admin
      .from('proveedores')
      .insert({ empresa_id: empresaId, nombre: `Proveedor RLS T036 ${sufijo}` })
      .select('id')
      .single()
    const { data: producto } = await admin
      .from('productos')
      .insert({ empresa_id: empresaId, nombre: `Diesel RLS T036 ${sufijo}`, tipo: 'combustible' })
      .select('id')
      .single()
    const { data: carga } = await admin
      .from('cargas_combustible')
      .insert({
        empresa_id: empresaId,
        vehiculo_id: vehiculo!.id,
        proveedor_id: proveedor!.id,
        producto_id: producto!.id,
        fecha: '2026-08-01',
        odometro: 1,
        cantidad: 1,
        costo_unitario: 1,
        costo_total: 1,
        creado_por: perfilAdmin!.id
      })
      .select('id')
      .single()

    const operarioAislado = await clienteAutenticado(correoOperarioAislado)

    // Negativo: solo 'ver'+'crear' por defecto — bloqueado en cancelar.
    const { data: intentoCancelar } = await operarioAislado
      .from('cargas_combustible')
      .update({ estado: 'cancelado', motivo_cancelacion: 'Intento sin permiso' })
      .eq('id', carga!.id)
      .select()
    expect(intentoCancelar).toEqual([])

    // Positivo: con 'cancelar' otorgado explícitamente, sí puede.
    await admin.from('usuario_permisos').insert({
      empresa_id: empresaId,
      usuario_id: perfilOperario!.id,
      modulo_clave: 'combustible',
      accion: 'cancelar',
      otorgado_por: perfilOperario!.id
    })
    const { data: intentoConPermiso } = await operarioAislado
      .from('cargas_combustible')
      .update({ estado: 'cancelado', motivo_cancelacion: 'Con permiso otorgado' })
      .eq('id', carga!.id)
      .select()
    expect(intentoConPermiso).not.toEqual([])

    await admin.auth.admin.deleteUser(authOperario!.user.id)
  })

  // T038 (008-mantenimiento, FR-015, SC-004): mismo patrón que T036 de Combustible (007).
  test('mantenimientos: un operario sin "cancelar" no puede cancelar una orden activa; con el permiso otorgado, sí puede', async () => {
    const admin = adminSupabaseClient()
    const { data: perfilAdmin } = await admin
      .from('usuarios')
      .select('id, empresa_id')
      .eq('correo', 'admin-e2e@flotillas.local')
      .single()
    const empresaId = perfilAdmin!.empresa_id!

    const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const correoOperarioAislado = `operario-rls-t038-${sufijo}@flotillas.local`
    const { data: authOperario, error: errAuth } = await admin.auth.admin.createUser({
      email: correoOperarioAislado,
      password: PASSWORD_PRUEBAS,
      email_confirm: true
    })
    if (errAuth) throw errAuth
    const { data: perfilOperario } = await admin
      .from('usuarios')
      .insert({
        auth_user_id: authOperario!.user.id,
        empresa_id: empresaId,
        nombre: 'Operario RLS T038',
        correo: correoOperarioAislado,
        rol: 'operario',
        activo: true
      })
      .select('id')
      .single()

    const { data: tipo } = await admin
      .from('tipos_vehiculo')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('clave', 'ligero')
      .single()
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .insert({
        empresa_id: empresaId,
        marca: 'Vehiculo RLS T038',
        modelo: 'X',
        placa: `RLS-T038-${sufijo}`,
        tipo_vehiculo_id: tipo!.id
      })
      .select('id')
      .single()
    const { data: proveedor } = await admin
      .from('proveedores')
      .insert({ empresa_id: empresaId, nombre: `Proveedor RLS T038 ${sufijo}` })
      .select('id')
      .single()
    const { data: orden } = await admin
      .from('mantenimientos')
      .insert({
        empresa_id: empresaId,
        vehiculo_id: vehiculo!.id,
        proveedor_id: proveedor!.id,
        tipo: 'correctivo',
        fecha: '2026-08-01',
        costo_total: 100,
        creado_por: perfilAdmin!.id
      })
      .select('id')
      .single()

    const operarioAislado = await clienteAutenticado(correoOperarioAislado)

    // Negativo: solo 'ver'+'crear' por defecto — bloqueado en cancelar.
    const { data: intentoCancelar } = await operarioAislado
      .from('mantenimientos')
      .update({ estado: 'cancelado', motivo_cancelacion: 'Intento sin permiso' })
      .eq('id', orden!.id)
      .select()
    expect(intentoCancelar).toEqual([])

    // Positivo: con 'cancelar' otorgado explícitamente, sí puede.
    await admin.from('usuario_permisos').insert({
      empresa_id: empresaId,
      usuario_id: perfilOperario!.id,
      modulo_clave: 'mantenimiento',
      accion: 'cancelar',
      otorgado_por: perfilOperario!.id
    })
    const { data: intentoConPermiso } = await operarioAislado
      .from('mantenimientos')
      .update({ estado: 'cancelado', motivo_cancelacion: 'Con permiso otorgado' })
      .eq('id', orden!.id)
      .select()
    expect(intentoConPermiso).not.toEqual([])

    await admin.auth.admin.deleteUser(authOperario!.user.id)
  })
})
