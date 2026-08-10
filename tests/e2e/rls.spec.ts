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
})
