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
})
