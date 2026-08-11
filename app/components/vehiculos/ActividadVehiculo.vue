<template>
  <v-card class="app-card-shadow" variant="flat">
    <v-card-text>
      <h2 class="text-section-title d-flex align-center pb-3 mb-4 border-b">
        <v-icon icon="mdi-history" color="primary" class="mr-2" />
        Actividad
      </h2>

      <v-skeleton-loader v-if="historial.cargando.value" type="list-item-three-line@4" />

      <v-alert v-else-if="historial.eventos.value.length === 0" type="info" density="compact" data-testid="sin-eventos">
        Este vehículo no tiene ningún evento registrado todavía.
      </v-alert>

      <template v-else>
        <v-list data-testid="actividad-lista" lines="two">
          <v-list-item
            v-for="evento in itemsPaginados"
            :key="`${evento.tipo}-${evento.id}`"
            :data-testid="`actividad-item-${evento.tipo}-${evento.id}`"
            @click="onClick(evento)"
          >
            <template #prepend>
              <v-avatar :color="evento.color" size="36">
                <v-icon :icon="evento.icono" color="white" size="20" />
              </v-avatar>
            </template>
            <v-list-item-title>{{ evento.resumen }}</v-list-item-title>
            <v-list-item-subtitle>{{ formatearFecha(evento.fecha) }}</v-list-item-subtitle>
          </v-list-item>
        </v-list>

        <div class="d-flex align-center justify-space-between flex-wrap ga-4 mt-4">
          <div class="d-flex align-center ga-4">
            <p class="text-metadata text-medium-emphasis">
              Mostrando {{ inicioRango }} a {{ finRango }} de {{ historial.eventos.value.length }} eventos
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
      </template>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import type { EventoHistorial } from '~/composables/useHistorialVehiculo'

const props = defineProps<{ vehiculoId: string }>()

const emit = defineEmits<{ 'cambiar-pestana': [pestana: string] }>()

const historial = useHistorialVehiculo()

onMounted(async () => {
  await historial.listar(props.vehiculoId)
})

function formatearFecha(fecha: string): string {
  return new Date(fecha).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function onClick(evento: EventoHistorial) {
  if (evento.rutaDetalle) {
    navigateTo(evento.rutaDetalle)
    return
  }
  // Los eventos de conductor no tienen ruta propia (research.md R3) — cambian la pestaña activa
  // del propio detalle de vehículo en vez de navegar.
  emit('cambiar-pestana', 'conductor')
}

const paginaActual = ref(1)
const itemsPorPagina = ref(10)

watch(itemsPorPagina, () => {
  paginaActual.value = 1
})

const totalPaginas = computed(() => Math.ceil(historial.eventos.value.length / itemsPorPagina.value))
const itemsPaginados = computed(() => {
  const inicio = (paginaActual.value - 1) * itemsPorPagina.value
  return historial.eventos.value.slice(inicio, inicio + itemsPorPagina.value)
})
const inicioRango = computed(() =>
  historial.eventos.value.length === 0 ? 0 : (paginaActual.value - 1) * itemsPorPagina.value + 1
)
const finRango = computed(() =>
  Math.min(paginaActual.value * itemsPorPagina.value, historial.eventos.value.length)
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
