<template>
  <div>
    <v-text-field
      :model-value="busqueda"
      :label="etiquetaBusqueda"
      prepend-inner-icon="mdi-magnify"
      clearable
      hide-details
      class="mb-4"
      :data-testid="`${testIdPrefix}-buscar`"
      @update:model-value="(valor) => emit('update:busqueda', valor ?? '')"
    />

    <v-skeleton-loader v-if="cargando" type="table" />

    <v-table v-else :data-testid="`${testIdPrefix}-tabla`">
      <thead>
        <tr>
          <slot name="encabezados" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in itemsPaginados" :key="item.id">
          <slot name="fila" :item="item" />
        </tr>
        <tr v-if="items.length === 0">
          <td :colspan="colspanVacio" class="text-center text-medium-emphasis">
            {{ mensajeVacio }}
          </td>
        </tr>
      </tbody>
    </v-table>

    <div
      v-if="!cargando && items.length > 0"
      class="d-flex align-center justify-space-between flex-wrap ga-4 mt-4"
    >
      <div class="d-flex align-center ga-4">
        <p class="text-metadata text-medium-emphasis" :data-testid="`${testIdPrefix}-resumen`">
          Mostrando {{ inicioRango }} a {{ finRango }} de {{ items.length }} registros
        </p>
        <!-- docs/design-references/screens/listado-operarios-paginacion.png: "Filas por página"
        es texto plano + valor + chevron, sin caja/borde de campo de formulario — no un
        v-select/v-autocomplete (que siempre trae su propio contenedor con borde o línea, aun con
        variant="plain"). Se arma con v-menu sobre un botón sin estilo de v-btn. -->
        <div class="d-flex align-center ga-1">
          <span class="text-metadata text-medium-emphasis">Filas por página:</span>
          <v-menu>
            <template #activator="{ props: activatorProps }">
              <button
                v-bind="activatorProps"
                type="button"
                class="app-selector-por-pagina text-metadata"
                :data-testid="`${testIdPrefix}-items-por-pagina`"
              >
                {{ itemsPorPagina }}
                <v-icon icon="mdi-chevron-down" size="18" />
              </button>
            </template>
            <v-list density="compact">
              <v-list-item
                v-for="opcion in OPCIONES_ITEMS_POR_PAGINA"
                :key="opcion"
                :title="String(opcion)"
                :active="opcion === itemsPorPagina"
                :data-testid="`${testIdPrefix}-items-por-pagina-opcion-${opcion}`"
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
        :data-testid="`${testIdPrefix}-paginacion`"
      />
    </div>
  </div>
</template>

<script setup lang="ts" generic="T extends { id: string }">
const OPCIONES_ITEMS_POR_PAGINA = [5, 10, 20]

const props = withDefaults(
  defineProps<{
    items: T[]
    cargando: boolean
    busqueda: string
    etiquetaBusqueda: string
    mensajeVacio: string
    colspanVacio?: number
    testIdPrefix: string
  }>(),
  { colspanVacio: 1 }
)

const emit = defineEmits<{ 'update:busqueda': [valor: string] }>()

defineSlots<{
  encabezados(): unknown
  fila(props: { item: T }): unknown
}>()

const paginaActual = ref(1)
const itemsPorPagina = ref(10)

watch(
  () => props.items,
  () => {
    paginaActual.value = 1
  }
)

watch(itemsPorPagina, () => {
  paginaActual.value = 1
})

const totalPaginas = computed(() => Math.ceil(props.items.length / itemsPorPagina.value))

const itemsPaginados = computed(() => {
  const inicio = (paginaActual.value - 1) * itemsPorPagina.value
  return props.items.slice(inicio, inicio + itemsPorPagina.value)
})

const inicioRango = computed(() =>
  props.items.length === 0 ? 0 : (paginaActual.value - 1) * itemsPorPagina.value + 1
)
const finRango = computed(() =>
  Math.min(paginaActual.value * itemsPorPagina.value, props.items.length)
)
</script>

<style scoped>
/* docs/design-references/screens/listado-operarios-paginacion.png: la página activa es un
cuadrado navy sólido con texto blanco; el resto (inactivas, prev/next, elipsis) queda sin fondo.
`variant="text"` ya deja todo lo demás transparente — Vuetify no ofrece una combinación de props
para que SOLO la activa use un relleno sólido (`variant` aplica parejo a todos los botones), así
que se fuerza aquí, dirigido a la clase de estado (no de variante) que v-pagination ya agrega. */
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
