<template>
  <v-container>
    <AlertasPanel />
  </v-container>
</template>

<script setup lang="ts">
// Sin layout propio (spec.md § Assumptions) — usa el layout default, mismo componente
// <AlertasPanel /> que admin/alertas/index.vue (plan.md, corrección T026/T027): los datos y la
// acción de resolver ya varían solo por RLS/permiso, no por lógica distinta entre roles.
definePageMeta({ layout: 'default' })
</script>
