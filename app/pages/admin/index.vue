<template>
  <DashboardPanelPrincipal />
</template>

<script setup lang="ts">
// US-12.3 (spec.md § Assumptions): reemplaza la pantalla de bienvenida genérica de Feature 001
// por el dashboard — mismo componente compartido con app/pages/operario/index.vue, sin lógica
// distinta por rol (los datos ya varían solo por RLS).
definePageMeta({ layout: 'admin' })
</script>
