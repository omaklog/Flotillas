<template>
  <v-container>
    <ReportesPanelReportes />
  </v-container>
</template>

<script setup lang="ts">
// Sin layout propio, mismo componente que admin/reportes/index.vue (plan.md § Structure
// Decision) — los datos y permisos ya varían solo por RLS/`usePermisos.ts`, no por lógica
// distinta entre roles.
definePageMeta({ layout: 'default' })
</script>
