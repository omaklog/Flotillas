<template>
  <div>
    <v-skeleton-loader v-if="cargando" type="list-item-two-line@2" />

    <v-list v-else data-testid="historial-poliza-lista">
      <v-list-item
        v-for="version in versiones"
        :key="version.id"
        :data-testid="`historial-poliza-item-${version.id}`"
      >
        <template #prepend>
          <v-chip
            v-if="version.id === polizaVigenteId"
            color="success"
            size="small"
            class="mr-3"
            :data-testid="`vigente-badge-${version.id}`"
          >
            Vigente
          </v-chip>
        </template>

        <v-list-item-title>{{ formatearFecha(version.created_at) }}</v-list-item-title>
        <v-list-item-subtitle>
          Subido por {{ version.usuarios?.nombre ?? 'Desconocido' }}
        </v-list-item-subtitle>

        <template #append>
          <v-btn
            variant="text"
            size="small"
            prepend-icon="mdi-download-outline"
            :data-testid="`descargar-btn-${version.id}`"
            @click="descargar(version)"
          >
            Descargar
          </v-btn>
        </template>
      </v-list-item>

      <v-list-item v-if="versiones.length === 0">
        <v-list-item-title class="text-medium-emphasis">
          Sin versiones de póliza registradas.
        </v-list-item-title>
      </v-list-item>
    </v-list>
  </div>
</template>

<script setup lang="ts">
import type { ArchivoRow } from '~/composables/useVehiculos'

const props = defineProps<{
  vehiculoId: string
  polizaVigenteId: string | null
}>()

type VersionPoliza = ArchivoRow & { usuarios: { nombre: string } | null }

const { listarHistorialPoliza, descargarArchivo } = useVehiculos()

const cargando = ref(true)
const versiones = ref<VersionPoliza[]>([])

onMounted(async () => {
  versiones.value = await listarHistorialPoliza(props.vehiculoId)
  cargando.value = false
})

function formatearFecha(fecha: string): string {
  return new Date(fecha).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

async function descargar(version: VersionPoliza) {
  const url = await descargarArchivo(version.storage_path, `poliza-${version.id}.pdf`)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = ''
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
}
</script>
