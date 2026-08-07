<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-6">
      <h1 class="text-page-title">Empresas</h1>
      <v-btn color="primary" to="/superusuario/empresas/nueva">Nueva empresa</v-btn>
    </div>

    <v-text-field
      v-model="busqueda"
      label="Buscar por nombre o RFC"
      prepend-inner-icon="mdi-magnify"
      clearable
      class="mb-4"
    />

    <v-alert v-if="errorMsg" type="error" class="mb-4" data-testid="empresas-error">
      {{ errorMsg }}
    </v-alert>

    <v-skeleton-loader v-if="cargando" type="article" />

    <div v-else data-testid="lista-empresas">
      <v-card
        v-for="empresa in empresasFiltradas"
        :key="empresa.id"
        class="mb-4 app-card-shadow"
        variant="flat"
      >
        <v-card-text>
          <div class="d-flex align-center justify-space-between flex-wrap ga-2">
            <div>
              <div class="text-section-title">{{ empresa.nombre }}</div>
              <div class="text-body-main text-medium-emphasis">
                RFC {{ empresa.rfc }} · Alta {{ formatearFecha(empresa.created_at) }}
              </div>
            </div>
            <div class="d-flex align-center ga-2">
              <v-chip
                :color="empresa.activo ? 'success' : 'default'"
                size="small"
                :data-testid="`estado-${empresa.id}`"
              >
                {{ empresa.activo ? 'Activa' : 'Inactiva' }}
              </v-chip>
              <v-btn
                size="small"
                variant="outlined"
                :loading="cambiandoEstado === empresa.id"
                :data-testid="`${empresa.activo ? 'desactivar' : 'activar'}-${empresa.id}`"
                @click="onCambiarEstado(empresa)"
              >
                {{ empresa.activo ? 'Desactivar' : 'Activar' }}
              </v-btn>
              <v-btn
                size="small"
                variant="outlined"
                :to="`/superusuario/empresas/${empresa.id}/administradores`"
                :data-testid="`administradores-${empresa.id}`"
              >
                Administradores
              </v-btn>
            </div>
          </div>

          <div class="mt-3">
            <span class="text-body-main text-medium-emphasis">Administradores activos: </span>
            <span v-if="(administradoresPorEmpresa[empresa.id]?.length ?? 0) === 0"> ninguno </span>
            <span v-else>
              {{ administradoresPorEmpresa[empresa.id]!.map((a) => a.nombre).join(', ') }}
            </span>
          </div>
        </v-card-text>
      </v-card>

      <p v-if="empresasFiltradas.length === 0" class="text-center text-medium-emphasis">
        Sin empresas que mostrar.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'superusuario' })

type Empresa = Database['public']['Tables']['empresas']['Row']
type Administrador = Pick<
  Database['public']['Tables']['usuarios']['Row'],
  'id' | 'nombre' | 'correo'
>

const client = useSupabaseClient<Database>()

const cargando = ref(true)
const errorMsg = ref('')
const busqueda = ref('')
const empresas = ref<Empresa[]>([])
const administradoresPorEmpresa = ref<Record<string, Administrador[]>>({})
const cambiandoEstado = ref<string | null>(null)

const empresasFiltradas = computed(() => {
  const termino = busqueda.value?.trim().toLowerCase()
  if (!termino) return empresas.value
  return empresas.value.filter(
    (e) => e.nombre.toLowerCase().includes(termino) || e.rfc.toLowerCase().includes(termino)
  )
})

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

async function cargarEmpresas() {
  cargando.value = true
  const [{ data: empresasData }, { data: administradoresData }] = await Promise.all([
    client.from('empresas').select('*').order('created_at', { ascending: false }),
    client
      .from('usuarios')
      .select('id, nombre, correo, empresa_id')
      .eq('rol', 'admin')
      .eq('activo', true)
  ])

  empresas.value = empresasData ?? []

  const agrupados: Record<string, Administrador[]> = {}
  for (const admin of administradoresData ?? []) {
    if (!admin.empresa_id) continue
    ;(agrupados[admin.empresa_id] ??= []).push(admin)
  }
  administradoresPorEmpresa.value = agrupados

  cargando.value = false
}

async function onCambiarEstado(empresa: Empresa) {
  cambiandoEstado.value = empresa.id
  errorMsg.value = ''
  try {
    await $fetch(`/api/empresas/${empresa.id}/estado`, {
      method: 'PATCH',
      body: { activo: !empresa.activo }
    })
    await cargarEmpresas()
  } catch {
    errorMsg.value = 'No se pudo cambiar el estado de la empresa.'
  } finally {
    cambiandoEstado.value = null
  }
}

onMounted(cargarEmpresas)
</script>
