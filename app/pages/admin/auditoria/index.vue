<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">Bitácora de Auditoría</h1>
        <p class="text-metadata text-medium-emphasis mt-1">
          Quién cambió qué, cuándo, en cualquier tabla del sistema.
        </p>
      </div>
    </div>

    <v-alert v-if="auditoria.error.value" type="error" class="mb-4" data-testid="listado-error">
      {{ auditoria.error.value }}
    </v-alert>

    <v-card class="app-card-shadow mb-4" variant="flat">
      <v-card-text>
        <v-row dense>
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="filtros.entidad"
              label="Entidad"
              :items="entidadesAuditadas"
              clearable
              hide-details
              density="compact"
              data-testid="filtro-entidad"
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="filtros.usuarioId"
              label="Usuario"
              :items="usuariosOpciones"
              item-title="nombre"
              item-value="id"
              clearable
              hide-details
              density="compact"
              data-testid="filtro-usuario"
            />
          </v-col>
          <v-col cols="12" sm="6" md="2">
            <v-select
              v-model="filtros.accion"
              label="Acción"
              :items="accionesOpciones"
              clearable
              hide-details
              density="compact"
              data-testid="filtro-accion"
            />
          </v-col>
          <v-col cols="12" sm="6" md="2">
            <v-text-field
              v-model="filtros.fechaDesde"
              label="Desde"
              type="date"
              clearable
              hide-details
              density="compact"
              data-testid="filtro-fecha-desde"
            />
          </v-col>
          <v-col cols="12" sm="6" md="2">
            <v-text-field
              v-model="filtros.fechaHasta"
              label="Hasta"
              type="date"
              clearable
              hide-details
              density="compact"
              data-testid="filtro-fecha-hasta"
            />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-skeleton-loader v-if="auditoria.cargando.value" type="table" />

    <v-table v-else data-testid="auditoria-tabla">
      <thead>
        <tr>
          <th />
          <th>Usuario</th>
          <th>Fecha</th>
          <th>Entidad</th>
          <th>Acción</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="item in itemsPaginados" :key="item.id">
          <tr :data-testid="`auditoria-fila-${item.id}`">
            <td>
              <v-btn
                :icon="expandidos.has(item.id) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                :aria-label="expandidos.has(item.id) ? 'Ocultar detalle' : 'Mostrar detalle'"
                :aria-expanded="expandidos.has(item.id)"
                variant="text"
                size="small"
                :data-testid="`auditoria-expandir-${item.id}`"
                @click="toggleExpandido(item.id)"
              />
            </td>
            <td>{{ item.usuarios?.nombre ?? '—' }}</td>
            <td>{{ formatearFechaHora(item.created_at) }}</td>
            <td>{{ etiquetaEntidad(item.entidad) }}</td>
            <td>
              <v-chip size="small">{{ etiquetaAccion(item.accion) }}</v-chip>
            </td>
          </tr>
          <tr v-if="expandidos.has(item.id)" :data-testid="`auditoria-detalle-${item.id}`">
            <td colspan="5">
              <template v-if="diffDe(item).length > 0">
                <v-table density="compact">
                  <thead>
                    <tr>
                      <th>Campo</th>
                      <th>Antes</th>
                      <th>Después</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="campo in diffDe(item)" :key="campo.campo" :data-testid="`campo-${campo.campo}`">
                      <td>{{ campo.campo }}</td>
                      <td>{{ formatearValor(campo.antes) }}</td>
                      <td>{{ formatearValor(campo.despues) }}</td>
                    </tr>
                  </tbody>
                </v-table>
              </template>
              <template v-else-if="item.valores_antes || item.valores_despues">
                <p class="text-label-caps text-medium-emphasis mb-2">
                  {{ item.valores_despues ? 'Estado al crear' : 'Estado antes de eliminar' }}
                </p>
                <v-table density="compact">
                  <tbody>
                    <tr
                      v-for="[campo, valor] in Object.entries(item.valores_despues ?? item.valores_antes ?? {})"
                      :key="campo"
                      :data-testid="`campo-${campo}`"
                    >
                      <td>{{ campo }}</td>
                      <td>{{ formatearValor(valor) }}</td>
                    </tr>
                  </tbody>
                </v-table>
              </template>
              <p v-else class="text-metadata text-medium-emphasis">Sin cambios en los campos comparados.</p>
            </td>
          </tr>
        </template>
        <tr v-if="auditoria.registros.value.length === 0">
          <td colspan="5" class="text-center text-medium-emphasis">
            Sin eventos de auditoría que mostrar.
          </td>
        </tr>
      </tbody>
    </v-table>

    <div
      v-if="!auditoria.cargando.value && auditoria.registros.value.length > 0"
      class="d-flex align-center justify-space-between flex-wrap ga-4 mt-4"
    >
      <div class="d-flex align-center ga-4">
        <p class="text-metadata text-medium-emphasis">
          Mostrando {{ inicioRango }} a {{ finRango }} de {{ auditoria.registros.value.length }} registros
        </p>
        <div class="d-flex align-center ga-1">
          <span class="text-metadata text-medium-emphasis">Filas por página:</span>
          <v-menu>
            <template #activator="{ props: activatorProps }">
              <button v-bind="activatorProps" type="button" class="app-selector-por-pagina text-metadata">
                {{ itemsPorPagina }}
                <v-icon icon="mdi-chevron-down" size="18" />
              </button>
            </template>
            <v-list density="compact">
              <v-list-item
                v-for="opcion in [5, 10, 20]"
                :key="opcion"
                :title="String(opcion)"
                :active="opcion === itemsPorPagina"
                @click="itemsPorPagina = opcion"
              />
            </v-list>
          </v-menu>
        </div>
      </div>
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
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { AuditoriaListado } from '~/composables/useAuditoria'
import { entidadesAuditadas, etiquetaEntidad, calcularDiff, type CampoDiff } from '~/utils/auditoria'

definePageMeta({ layout: 'admin' })

type AccionAuditoria = Database['public']['Enums']['accion_auditoria']

const client = useSupabaseClient<Database>()
const auditoria = useAuditoria()

const usuariosOpciones = ref<{ id: string; nombre: string }[]>([])

const accionesOpciones: { title: string; value: AccionAuditoria }[] = [
  { title: 'Creación', value: 'crear' },
  { title: 'Edición', value: 'editar' },
  { title: 'Eliminación', value: 'eliminar' },
  { title: 'Cancelación', value: 'cancelar' },
  { title: 'Baja', value: 'desactivar' },
  { title: 'Reactivación', value: 'reactivar' }
]

function etiquetaAccion(accion: AccionAuditoria): string {
  return accionesOpciones.find((a) => a.value === accion)?.title ?? accion
}

const filtros = reactive({
  entidad: '' as string,
  usuarioId: '' as string,
  accion: '' as AccionAuditoria | '',
  fechaDesde: '' as string,
  fechaHasta: '' as string
})

function formatearFechaHora(fecha: string): string {
  return new Date(fecha).toLocaleString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function formatearValor(valor: unknown): string {
  if (valor === null || valor === undefined) return '—'
  if (typeof valor === 'object') return JSON.stringify(valor)
  return String(valor)
}

const expandidos = ref<Set<string>>(new Set())
function toggleExpandido(id: string) {
  const nuevo = new Set(expandidos.value)
  if (nuevo.has(id)) nuevo.delete(id)
  else nuevo.add(id)
  expandidos.value = nuevo
}

function diffDe(item: AuditoriaListado): CampoDiff[] {
  return calcularDiff(
    item.valores_antes as Record<string, unknown> | null,
    item.valores_despues as Record<string, unknown> | null
  )
}

async function cargar() {
  await auditoria.listar({
    entidad: filtros.entidad || undefined,
    usuarioId: filtros.usuarioId || undefined,
    accion: (filtros.accion || undefined) as AccionAuditoria | undefined,
    fechaDesde: filtros.fechaDesde || undefined,
    fechaHasta: filtros.fechaHasta || undefined
  })
  paginaActual.value = 1
}

watch(filtros, cargar, { deep: true })

onMounted(async () => {
  // Sin `.eq('empresa_id', ...)`: `usuarios_select` ya restringe a la propia empresa para un
  // admin (RLS), y depender de `usuario.value` aquí puede ejecutarse antes de que la sesión
  // termine de hidratarse.
  const { data } = await client.from('usuarios').select('id, nombre').order('nombre')
  usuariosOpciones.value = data ?? []
  await cargar()
})

const paginaActual = ref(1)
const itemsPorPagina = ref(10)

watch(itemsPorPagina, () => {
  paginaActual.value = 1
})

const totalPaginas = computed(() => Math.ceil(auditoria.registros.value.length / itemsPorPagina.value))
const itemsPaginados = computed(() => {
  const inicio = (paginaActual.value - 1) * itemsPorPagina.value
  return auditoria.registros.value.slice(inicio, inicio + itemsPorPagina.value)
})
const inicioRango = computed(() =>
  auditoria.registros.value.length === 0 ? 0 : (paginaActual.value - 1) * itemsPorPagina.value + 1
)
const finRango = computed(() =>
  Math.min(paginaActual.value * itemsPorPagina.value, auditoria.registros.value.length)
)
</script>

<style scoped>
.app-pagination :deep(.v-pagination__item--is-active .v-btn) {
  background-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.app-selector-por-pagina {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: transparent;
  border: none;
  padding: 0;
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
}
</style>
