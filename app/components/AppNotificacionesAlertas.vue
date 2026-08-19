<template>
  <v-btn
    icon
    variant="text"
    data-testid="notificaciones-alertas"
    :aria-label="etiquetaAccesible"
    @click="irAAlertas"
  >
    <v-badge
      :model-value="abiertas > 0"
      :content="abiertas"
      color="error"
      data-testid="notificaciones-alertas-badge"
    >
      <v-icon icon="mdi-bell-outline" />
    </v-badge>
  </v-btn>
</template>

<script setup lang="ts">
const { usuario } = useAuth()
const { contarAbiertas } = useAlertas()
const router = useRouter()

const abiertas = ref(0)

// T037 (WCAG 2.1 AA, 4.1.2 Name Role Value): sin esto, el botón solo tenía el dígito del badge
// como contenido de texto — un lector de pantalla lo anunciaba como "166", no como una acción de
// navegación con contexto.
const etiquetaAccesible = computed(() =>
  abiertas.value > 0 ? `Alertas: ${abiertas.value} abiertas` : 'Alertas: sin alertas abiertas'
)

async function cargar() {
  abiertas.value = await contarAbiertas()
}

onMounted(cargar)

function irAAlertas() {
  const prefijo = usuario.value?.rol === 'operario' ? '/operario' : '/admin'
  router.push(`${prefijo}/alertas`)
}
</script>
