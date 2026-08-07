<template>
  <v-app :data-hydrated="hidratado">
    <!-- @vite-pwa/nuxt no inyecta el <link rel="manifest"> automáticamente — requiere este
    componente explícito en algún punto del árbol (T086: sin él, ningún navegador detecta la
    app como instalable, aunque /manifest.webmanifest sí se sirva bien por separado). -->
    <VitePwaManifest />
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </v-app>
</template>

<script setup lang="ts">
// Señal determinista de "hidratación de Vue completa", para que las pruebas Playwright no
// interactúen con formularios antes de tiempo. `onMounted` en app.vue solo corre en el
// cliente, después de que la hidratación terminó — a diferencia de heurísticas como
// `waitForLoadState('networkidle')` (poco fiable en dev: el WebSocket de HMR de Vite
// mantiene la red activa indefinidamente) o reintentar fill()/toHaveValue() (puede dar
// falso positivo si un evento de hidratación tardío resetea el campo justo después de
// verificarlo).
const hidratado = ref(false)
onMounted(() => {
  hidratado.value = true
})
</script>
