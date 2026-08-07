import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../app/types/database.types'
import { esperarHidratacion } from './helpers'

// `data-testid` queda en el `<div class="v-input">` que envuelve a v-checkbox, no en el
// `<input type="checkbox">` real — `toBeChecked()` exige apuntar al input.
function checkboxPermiso(page: import('@playwright/test').Page, testId: string) {
  return page.getByTestId(testId).locator('input[type="checkbox"]')
}

function adminSupabaseClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

test.describe('US6 — Administrador asigna permisos granulares a un operario', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  test('T055: ver/crear aparecen premarcados por defecto; editar/eliminar no', async ({
    page,
    request
  }) => {
    const correo = `operario-t055-${Date.now()}@flotillas.local`
    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    const respuesta = await request.post('/api/usuarios', {
      headers: { cookie: cookieHeader },
      data: { nombre: 'Operario Permisos T055', correo }
    })
    expect(respuesta.status()).toBe(201)
    const { usuario_id: usuarioId } = await respuesta.json()

    await page.goto(`/admin/permisos/${usuarioId}`)
    await esperarHidratacion(page)

    // 'archivos' está en modulos_ver Y modulos_crear del trigger (ver+crear premarcados);
    // 'eliminar' existe como acción del módulo pero el trigger nunca lo otorga por defecto.
    await expect(checkboxPermiso(page, 'permiso-archivos-ver')).toBeChecked()
    await expect(checkboxPermiso(page, 'permiso-archivos-crear')).toBeChecked()
    await expect(checkboxPermiso(page, 'permiso-archivos-eliminar')).not.toBeChecked()

    // 'vehiculos' solo trae 'ver' por defecto (no está en modulos_crear).
    await expect(checkboxPermiso(page, 'permiso-vehiculos-ver')).toBeChecked()
    await expect(checkboxPermiso(page, 'permiso-vehiculos-editar')).not.toBeChecked()
  })

  test('T056: cambio de permiso se refleja en la sesión activa del operario sin reautenticar', async ({
    page,
    request
  }) => {
    const admin = adminSupabaseClient()
    const { data: operarioE2E } = await admin
      .from('usuarios')
      .select('id, empresa_id')
      .eq('correo', 'operario-e2e@flotillas.local')
      .single()

    // Login del operario UNA SOLA VEZ — el punto de la prueba es que el MISMO cliente/JWT, sin
    // volver a autenticarse, cambia de resultado cuando el admin otorga el permiso.
    const operarioClient = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    )
    const { error: signInError } = await operarioClient.auth.signInWithPassword({
      email: 'operario-e2e@flotillas.local',
      password: 'Flotillas#2026Dev'
    })
    expect(signInError).toBeNull()

    const { data: archivoInsertado, error: insertError } = await operarioClient
      .from('archivos')
      .insert({
        empresa_id: operarioE2E!.empresa_id!,
        tipo: 'factura',
        storage_path: `test/${Date.now()}.pdf`,
        entidad_tipo: 'vehiculo',
        entidad_id: randomUUID(),
        subido_por: operarioE2E!.id
      })
      .select('id')
      .single()
    expect(insertError).toBeNull()
    const archivoId = archivoInsertado!.id

    const { data: permisosOriginales } = await admin
      .from('usuario_permisos')
      .select('modulo_clave, accion')
      .eq('usuario_id', operarioE2E!.id)

    try {
      // Antes de otorgar 'archivos.eliminar': RLS bloquea el borrado (0 filas afectadas, no
      // lanza error — `archivos_delete` exige rol admin o `tiene_permiso('archivos','eliminar')`).
      const { data: borradosAntes } = await operarioClient
        .from('archivos')
        .delete()
        .eq('id', archivoId)
        .select()
      expect(borradosAntes).toEqual([])

      const { data: sigueExistiendo } = await admin
        .from('archivos')
        .select('id')
        .eq('id', archivoId)
        .maybeSingle()
      expect(sigueExistiendo).not.toBeNull()

      // El admin otorga el permiso vía la misma API que usaría la UI — el operario nunca cierra
      // ni reabre sesión.
      const cookies = await page.context().cookies()
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
      const nuevosPermisos = [
        ...(permisosOriginales ?? []).map((p) => ({
          modulo_clave: p.modulo_clave,
          accion: p.accion
        })),
        { modulo_clave: 'archivos', accion: 'eliminar' }
      ]
      const respuestaPermisos = await request.put(`/api/usuarios/${operarioE2E!.id}/permisos`, {
        headers: { cookie: cookieHeader },
        data: { permisos: nuevosPermisos }
      })
      expect(respuestaPermisos.status()).toBe(200)

      // Mismo `operarioClient`, mismo JWT que en el insert de arriba — ahora sí debe borrar.
      const { data: borradosDespues, error: borrarConPermisoError } = await operarioClient
        .from('archivos')
        .delete()
        .eq('id', archivoId)
        .select()
      expect(borrarConPermisoError).toBeNull()
      expect(borradosDespues).toHaveLength(1)
    } finally {
      // Restaurar el operario E2E compartido a su set de permisos original (quita
      // 'archivos.eliminar' si el test llegó a otorgarlo).
      await admin.from('usuario_permisos').delete().eq('usuario_id', operarioE2E!.id)
      if (permisosOriginales && permisosOriginales.length > 0) {
        await admin.from('usuario_permisos').insert(
          permisosOriginales.map((p) => ({
            empresa_id: operarioE2E!.empresa_id!,
            usuario_id: operarioE2E!.id,
            modulo_clave: p.modulo_clave,
            accion: p.accion,
            otorgado_por: operarioE2E!.id
          }))
        )
      }
      // Por si el borrado de prueba nunca llegó a proceder (ej. si el test falla antes).
      await admin.from('archivos').delete().eq('id', archivoId)
    }
  })
})
