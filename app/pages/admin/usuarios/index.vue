<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">Gestión de Operarios</h1>
        <p class="text-metadata text-medium-emphasis mt-1">
          Administra accesos, permisos y estado del personal operativo.
        </p>
      </div>
      <v-btn
        color="primary-container"
        prepend-icon="mdi-plus"
        data-testid="abrir-invitar-btn"
        @click="dialogoInvitarAbierto = true"
      >
        Invitar Operario
      </v-btn>
    </div>

    <v-alert v-if="operarioCreado" type="success" class="mb-6" data-testid="invitacion-exitosa">
      Se invitó a <strong>{{ operarioCreado.nombreOperario }}</strong> por correo.
    </v-alert>

    <div class="d-flex align-start ga-2 mb-4">
      <v-text-field
        v-model="busqueda"
        label="Buscar por nombre o correo electrónico"
        prepend-inner-icon="mdi-magnify"
        clearable
        hide-details
        class="flex-grow-1"
      />

      <v-menu :close-on-content-click="false">
        <template #activator="{ props: menuProps }">
          <v-btn
            variant="outlined"
            prepend-icon="mdi-filter-variant"
            height="48"
            data-testid="filtros-btn"
            v-bind="menuProps"
          >
            Filtros
            <v-badge
              v-if="filtroEstados.length > 0"
              :content="filtroEstados.length"
              color="primary-container"
              inline
            />
          </v-btn>
        </template>
        <v-card class="app-card-shadow" variant="flat" min-width="220">
          <v-card-text>
            <p class="text-label-caps text-medium-emphasis mb-2">Estado</p>
            <v-checkbox
              v-for="opcion in OPCIONES_ESTADO"
              :key="opcion.value"
              v-model="filtroEstados"
              :value="opcion.value"
              :label="opcion.title"
              density="compact"
              hide-details
              :data-testid="`filtro-estado-${opcion.value}`"
            />
            <v-btn
              v-if="filtroEstados.length > 0"
              variant="text"
              size="small"
              class="mt-2"
              data-testid="limpiar-filtros-btn"
              @click="filtroEstados = []"
            >
              Limpiar filtros
            </v-btn>
          </v-card-text>
        </v-card>
      </v-menu>
    </div>

    <v-alert v-if="errorAccion" type="error" class="mb-4" data-testid="accion-error">
      {{ errorAccion }}
    </v-alert>
    <v-alert v-if="mensajeExito" type="success" class="mb-4" data-testid="accion-exito">
      {{ mensajeExito }}
    </v-alert>

    <v-skeleton-loader v-if="cargando" type="table" />

    <v-table v-else data-testid="tabla-operarios">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Correo</th>
          <th>Estado</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="operario in operariosPaginados" :key="operario.id">
          <td>
            <div class="d-flex align-center ga-3">
              <v-avatar :color="colorAvatar(operario.id).bg" size="36">
                <span
                  class="text-label-caps"
                  style="letter-spacing: 0"
                  :style="{ color: colorAvatar(operario.id).fg }"
                >
                  {{ iniciales(operario.nombre) }}
                </span>
              </v-avatar>
              {{ operario.nombre }}
            </div>
          </td>
          <td>{{ operario.correo }}</td>
          <td>
            <v-chip
              :color="colorEstado(operario)"
              size="small"
              :data-testid="`estado-${operario.id}`"
            >
              {{ textoEstado(operario) }}
            </v-chip>
          </td>
          <td>
            <div class="d-flex justify-end ga-1">
              <v-tooltip :text="`Permisos de ${operario.nombre}`" location="top">
                <template #activator="{ props: tooltipProps }">
                  <v-btn
                    icon="mdi-shield-account-outline"
                    size="small"
                    variant="text"
                    density="comfortable"
                    :to="`/admin/permisos/${operario.id}`"
                    :aria-label="`Permisos de ${operario.nombre}`"
                    :data-testid="`permisos-${operario.id}`"
                    v-bind="tooltipProps"
                  />
                </template>
              </v-tooltip>

              <v-tooltip
                :text="
                  operario.activo
                    ? `Desactivar a ${operario.nombre}`
                    : `Reactivar a ${operario.nombre}`
                "
                location="top"
              >
                <template #activator="{ props: tooltipProps }">
                  <v-btn
                    :icon="
                      operario.activo ? 'mdi-account-off-outline' : 'mdi-account-check-outline'
                    "
                    size="small"
                    variant="text"
                    density="comfortable"
                    :loading="accionEnCurso === `estado-${operario.id}`"
                    :aria-label="
                      operario.activo
                        ? `Desactivar a ${operario.nombre}`
                        : `Reactivar a ${operario.nombre}`
                    "
                    :data-testid="`${operario.activo ? 'desactivar' : 'reactivar'}-${operario.id}`"
                    v-bind="tooltipProps"
                    @click="onCambiarEstado(operario)"
                  />
                </template>
              </v-tooltip>

              <v-tooltip
                v-if="operario.pendiente"
                :text="`Reenviar invitación a ${operario.nombre}`"
                location="top"
              >
                <template #activator="{ props: tooltipProps }">
                  <v-btn
                    icon="mdi-email-send-outline"
                    size="small"
                    variant="text"
                    density="comfortable"
                    :loading="accionEnCurso === `reenviar-${operario.id}`"
                    :aria-label="`Reenviar invitación a ${operario.nombre}`"
                    :data-testid="`reenviar-${operario.id}`"
                    v-bind="tooltipProps"
                    @click="onReenviarInvitacion(operario)"
                  />
                </template>
              </v-tooltip>

              <v-tooltip :text="`Eliminar a ${operario.nombre}`" location="top">
                <template #activator="{ props: tooltipProps }">
                  <v-btn
                    icon="mdi-delete-outline"
                    size="small"
                    variant="text"
                    color="error"
                    density="comfortable"
                    :aria-label="`Eliminar a ${operario.nombre}`"
                    :data-testid="`eliminar-${operario.id}`"
                    v-bind="tooltipProps"
                    @click="abrirDialogoEliminar(operario)"
                  />
                </template>
              </v-tooltip>
            </div>
          </td>
        </tr>
        <tr v-if="operariosFiltrados.length === 0">
          <td colspan="4" class="text-center text-medium-emphasis">Sin operarios que mostrar.</td>
        </tr>
      </tbody>
    </v-table>

    <div
      v-if="!cargando && operariosFiltrados.length > 0"
      class="d-flex align-center justify-space-between flex-wrap ga-2 mt-4"
    >
      <p class="text-metadata text-medium-emphasis" data-testid="paginacion-resumen">
        Mostrando {{ inicioRango }} a {{ finRango }} de {{ operariosFiltrados.length }} operarios
      </p>
      <v-pagination
        v-if="totalPaginas > 1"
        v-model="paginaActual"
        :length="totalPaginas"
        density="comfortable"
        total-visible="5"
        variant="text"
        active-color="primary"
        rounded="lg"
        class="app-pagination"
        data-testid="paginacion-operarios"
      />
    </div>

    <UsuariosDialogoConfirmarEliminarOperario
      v-model="dialogoEliminarAbierto"
      :nombre-operario="operarioAEliminar?.nombre ?? ''"
      :eliminando="accionEnCurso === `eliminar-${operarioAEliminar?.id}`"
      @confirmar="onConfirmarEliminar"
    />

    <v-dialog v-model="dialogoInvitarAbierto" max-width="480">
      <v-card class="app-modal-shadow" variant="flat">
        <v-card-title class="text-section-title">Invitar operario</v-card-title>
        <v-card-text>
          <UsuariosFormularioInvitarOperario @creado="onCreado" />
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'admin' })

type Operario = Database['public']['Functions']['listar_operarios_propios']['Returns'][number]

const client = useSupabaseClient<Database>()
const { iniciales, colorAvatar } = useAvatarIniciales()

const cargando = ref(true)
const operarios = ref<Operario[]>([])
const busqueda = ref('')
const operarioCreado = ref<{ usuarioId: string; nombreOperario: string } | null>(null)
const dialogoInvitarAbierto = ref(false)

const accionEnCurso = ref<string | null>(null)
const errorAccion = ref('')
const mensajeExito = ref('')

const dialogoEliminarAbierto = ref(false)
const operarioAEliminar = ref<Operario | null>(null)

type EstadoOperario = 'activo' | 'pendiente' | 'inactivo'

const OPCIONES_ESTADO: Array<{ value: EstadoOperario; title: string }> = [
  { value: 'activo', title: 'Activo' },
  { value: 'pendiente', title: 'Pendiente' },
  { value: 'inactivo', title: 'Inactivo' }
]

const filtroEstados = ref<EstadoOperario[]>([])

function estadoDe(operario: Operario): EstadoOperario {
  if (!operario.activo) return 'inactivo'
  if (operario.pendiente) return 'pendiente'
  return 'activo'
}

const operariosFiltrados = computed(() => {
  const termino = busqueda.value?.trim().toLowerCase()
  return operarios.value.filter((o) => {
    const coincideTermino =
      !termino ||
      o.nombre.toLowerCase().includes(termino) ||
      o.correo.toLowerCase().includes(termino)
    const coincideEstado =
      filtroEstados.value.length === 0 || filtroEstados.value.includes(estadoDe(o))
    return coincideTermino && coincideEstado
  })
})

const OPERARIOS_POR_PAGINA = 10
const paginaActual = ref(1)

const totalPaginas = computed(() =>
  Math.max(1, Math.ceil(operariosFiltrados.value.length / OPERARIOS_POR_PAGINA))
)

const operariosPaginados = computed(() => {
  const inicio = (paginaActual.value - 1) * OPERARIOS_POR_PAGINA
  return operariosFiltrados.value.slice(inicio, inicio + OPERARIOS_POR_PAGINA)
})

const inicioRango = computed(() =>
  operariosFiltrados.value.length === 0 ? 0 : (paginaActual.value - 1) * OPERARIOS_POR_PAGINA + 1
)

const finRango = computed(() =>
  Math.min(paginaActual.value * OPERARIOS_POR_PAGINA, operariosFiltrados.value.length)
)

watch([busqueda, filtroEstados], () => {
  paginaActual.value = 1
})

// Recargar la lista (p.ej. tras eliminar) puede reducir el total de páginas y dejar
// `paginaActual` apuntando a una página vacía.
watch(totalPaginas, () => {
  if (paginaActual.value > totalPaginas.value) paginaActual.value = totalPaginas.value
})

function textoEstado(operario: Operario): string {
  if (!operario.activo) return 'Inactivo'
  if (operario.pendiente) return 'Pendiente'
  return 'Activo'
}

function colorEstado(operario: Operario): string {
  if (!operario.activo) return 'default'
  if (operario.pendiente) return 'warning'
  return 'success'
}

async function cargarOperarios() {
  cargando.value = true
  const { data } = await client.rpc('listar_operarios_propios')
  operarios.value = data ?? []
  cargando.value = false
}

function onCreado(payload: { usuarioId: string; nombreOperario: string }) {
  operarioCreado.value = payload
  dialogoInvitarAbierto.value = false
  cargarOperarios()
}

function limpiarMensajes() {
  errorAccion.value = ''
  mensajeExito.value = ''
}

function codigoError(err: unknown): string | undefined {
  const fetchError = err as { data?: { data?: { error?: string } } }
  return fetchError?.data?.data?.error
}

async function onCambiarEstado(operario: Operario) {
  limpiarMensajes()
  accionEnCurso.value = `estado-${operario.id}`
  try {
    await $fetch(`/api/usuarios/${operario.id}/estado`, {
      method: 'PATCH',
      body: { activo: !operario.activo }
    })
    await cargarOperarios()
  } catch {
    errorAccion.value = 'No se pudo cambiar el estado del operario.'
  } finally {
    accionEnCurso.value = null
  }
}

async function onReenviarInvitacion(operario: Operario) {
  limpiarMensajes()
  accionEnCurso.value = `reenviar-${operario.id}`
  try {
    await $fetch(`/api/usuarios/${operario.id}/reenviar-invitacion`, { method: 'POST' })
    mensajeExito.value = `Se reenvió la invitación a ${operario.nombre}.`
  } catch {
    errorAccion.value = 'No se pudo reenviar la invitación.'
  } finally {
    accionEnCurso.value = null
  }
}

function abrirDialogoEliminar(operario: Operario) {
  limpiarMensajes()
  operarioAEliminar.value = operario
  dialogoEliminarAbierto.value = true
}

async function onConfirmarEliminar() {
  const operario = operarioAEliminar.value
  if (!operario) return

  accionEnCurso.value = `eliminar-${operario.id}`
  try {
    await $fetch(`/api/usuarios/${operario.id}`, { method: 'DELETE' })
    dialogoEliminarAbierto.value = false
    mensajeExito.value = `${operario.nombre} fue eliminado.`
    await cargarOperarios()
  } catch (err: unknown) {
    dialogoEliminarAbierto.value = false
    errorAccion.value =
      codigoError(err) === 'tiene_operaciones_registradas'
        ? `${operario.nombre} tiene operaciones registradas y no puede eliminarse. Puedes desactivarlo en su lugar.`
        : 'No se pudo eliminar al operario.'
  } finally {
    accionEnCurso.value = null
  }
}

onMounted(cargarOperarios)
</script>

<style scoped>
/* Ver la misma nota en app/components/catalogos/TablaCatalogo.vue — `variant="text"` deja
prev/next/elipsis/inactivas transparentes (correcto), pero también a la página activa; se fuerza
su relleno sólido aquí, dirigido a la clase de estado que v-pagination ya agrega. */
.app-pagination :deep(.v-pagination__item--is-active .v-btn) {
  background-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}
</style>
