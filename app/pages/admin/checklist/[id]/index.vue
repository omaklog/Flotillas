<template>
  <div>
    <div class="d-flex align-start justify-space-between flex-wrap ga-4 mb-6">
      <div>
        <h1 class="text-page-title">
          {{ checklist ? `Checklist — ${formatearFecha(checklist.fecha)}` : 'Checklist' }}
        </h1>
        <div v-if="checklist" class="d-flex align-center ga-2 mt-1">
          <p class="text-metadata text-medium-emphasis">
            {{ checklist.vehiculos?.marca }} {{ checklist.vehiculos?.modelo }} —
            {{ checklist.vehiculos?.placa }}
          </p>
          <v-chip
            :color="checklist.resultado === 'aprobado' ? 'success' : 'warning'"
            size="small"
            data-testid="resultado-chip"
          >
            {{ checklist.resultado === 'aprobado' ? 'Aprobado' : 'Con observaciones' }}
          </v-chip>
        </div>
      </div>
    </div>

    <v-skeleton-loader v-if="cargando" type="article" />

    <v-alert v-else-if="!checklist" type="error" data-testid="checklist-no-encontrado">
      No se encontró ese checklist en tu empresa.
    </v-alert>

    <template v-else>
      <v-row>
        <v-col cols="12" md="6">
          <v-card class="app-card-shadow mb-4" variant="flat" data-testid="tarjeta-datos">
            <v-card-text>
              <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
                <v-icon icon="mdi-clipboard-check-outline" color="primary" class="mr-2" />
                Datos del checklist
              </h2>
              <v-row>
                <v-col v-for="campo in campos" :key="campo.label" cols="6">
                  <p class="text-label-caps text-medium-emphasis">{{ campo.label }}</p>
                  <p class="text-body-main mt-2">{{ campo.valor ?? '—' }}</p>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12">
          <v-card class="app-card-shadow" variant="flat" data-testid="tarjeta-items">
            <v-card-text>
              <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
                <v-icon icon="mdi-format-list-checks" color="primary" class="mr-2" />
                Ítems ({{ items.length }})
              </h2>
              <v-table data-testid="items-tabla">
                <thead>
                  <tr>
                    <th>Ítem</th>
                    <th>Estado</th>
                    <th>Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in items" :key="item.id">
                    <td>
                      {{ item.nombre_item }}
                      <v-chip v-if="item.es_critico" color="warning" size="small" class="ml-2">Crítico</v-chip>
                    </td>
                    <td>
                      <v-chip :color="item.cumple ? 'success' : 'error'" size="small">
                        {{ item.cumple ? 'Cumple' : 'No cumple' }}
                      </v-chip>
                    </td>
                    <td>{{ item.observaciones ?? '—' }}</td>
                  </tr>
                </tbody>
              </v-table>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { ChecklistListado } from '~/composables/useChecklists'

definePageMeta({ layout: 'admin' })

type ItemRow = Database['public']['Tables']['checklist_items']['Row']

const route = useRoute()
const checklistId = route.params.id as string

const client = useSupabaseClient<Database>()

const cargando = ref(true)
const checklist = ref<ChecklistListado | null>(null)
const items = ref<ItemRow[]>([])

const campos = computed(() => {
  const c = checklist.value
  if (!c) return []
  return [
    { label: 'Conductor', valor: c.conductores ? `${c.conductores.nombre} ${c.conductores.apellidos}` : '—' },
    { label: 'Responsable', valor: c.usuarios?.nombre },
    { label: 'Fecha', valor: formatearFecha(c.fecha) }
  ]
})

function formatearFecha(fecha: string): string {
  return new Date(fecha).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

async function cargar() {
  const { data } = await client
    .from('checklists')
    .select('*, vehiculos(placa, marca, modelo), conductores(nombre, apellidos), usuarios(nombre), checklist_items(count)')
    .eq('id', checklistId)
    .maybeSingle()
  checklist.value = data as unknown as ChecklistListado | null

  if (checklist.value) {
    const { data: detalles } = await client
      .from('checklist_items')
      .select('*')
      .eq('checklist_id', checklistId)
    items.value = detalles ?? []
  }
}

onMounted(async () => {
  cargando.value = true
  await cargar()
  cargando.value = false
})
</script>
