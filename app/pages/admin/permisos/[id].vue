<template>
  <div>
    <h1 class="text-page-title mb-2">Permisos</h1>
    <p v-if="operario" class="text-body-main mb-6">{{ operario.nombre }} — {{ operario.correo }}</p>

    <v-skeleton-loader v-if="cargando" type="article" />

    <template v-else-if="!operario">
      <v-alert type="error" data-testid="operario-no-encontrado">
        No se encontró ese operario en tu empresa.
      </v-alert>
    </template>

    <template v-else>
      <PermisosTablaPermisosModulo
        v-for="modulo in modulos"
        :key="modulo.clave"
        :modulo-clave="modulo.clave"
        :modulo-nombre="modulo.nombre"
        :acciones="accionesPorModulo[modulo.clave] ?? []"
        :seleccionadas="permisosPorModulo[modulo.clave] ?? []"
        @update:seleccionadas="(siguiente) => (permisosPorModulo[modulo.clave] = siguiente)"
      />

      <v-alert v-if="errorMsg" type="error" class="mb-4" data-testid="permisos-error">
        {{ errorMsg }}
      </v-alert>
      <v-alert v-if="guardadoOk" type="success" class="mb-4" data-testid="permisos-guardados">
        Permisos actualizados.
      </v-alert>

      <v-divider class="mb-4" />
      <div class="d-flex justify-end ga-2">
        <v-btn variant="outlined" :to="'/admin/usuarios'" data-testid="cancelar-btn">
          Cancelar
        </v-btn>
        <v-btn color="primary" :loading="enviando" data-testid="submit-btn" @click="onGuardar">
          Guardar Cambios
        </v-btn>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'admin' })

type Modulo = Database['public']['Tables']['modulos']['Row']
type AccionDisponible = Database['public']['Tables']['acciones_disponibles']['Row']
type Usuario = Database['public']['Tables']['usuarios']['Row']

const route = useRoute()
const usuarioId = route.params.id as string

const client = useSupabaseClient<Database>()

const cargando = ref(true)
const enviando = ref(false)
const errorMsg = ref('')
const guardadoOk = ref(false)

const operario = ref<Usuario | null>(null)
const modulos = ref<Modulo[]>([])
const accionesPorModulo = reactive<Record<string, AccionDisponible[]>>({})
const permisosPorModulo = reactive<Record<string, string[]>>({})

onMounted(async () => {
  const [
    { data: operarioData },
    { data: modulosData },
    { data: accionesData },
    { data: permisosData }
  ] = await Promise.all([
    client.from('usuarios').select('*').eq('id', usuarioId).eq('rol', 'operario').maybeSingle(),
    client.from('modulos').select('*').order('orden'),
    client.from('acciones_disponibles').select('*'),
    client.from('usuario_permisos').select('modulo_clave, accion').eq('usuario_id', usuarioId)
  ])

  operario.value = operarioData ?? null
  modulos.value = modulosData ?? []

  for (const accion of accionesData ?? []) {
    ;(accionesPorModulo[accion.modulo_clave] ??= []).push(accion)
  }
  for (const permiso of permisosData ?? []) {
    ;(permisosPorModulo[permiso.modulo_clave] ??= []).push(permiso.accion)
  }

  cargando.value = false
})

async function onGuardar() {
  enviando.value = true
  errorMsg.value = ''
  guardadoOk.value = false
  try {
    const permisos = Object.entries(permisosPorModulo).flatMap(([moduloClave, acciones]) =>
      acciones.map((accion) => ({ modulo_clave: moduloClave, accion }))
    )
    await $fetch(`/api/usuarios/${usuarioId}/permisos`, {
      method: 'PUT',
      body: { permisos }
    })
    guardadoOk.value = true
  } catch {
    errorMsg.value = 'No se pudieron guardar los permisos. Intenta de nuevo.'
  } finally {
    enviando.value = false
  }
}
</script>
