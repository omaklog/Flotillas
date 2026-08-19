<template>
  <v-container>
    <DashboardPanelPrincipal />
  </v-container>
</template>

<script setup lang="ts">
// Sin layout propio (T022 solo define default/superusuario/admin) — usa el layout default,
// que desde US10 ya trae su propio app-bar + AppMenuPerfil (con "Cerrar sesión") cuando hay
// sesión — no hace falta repetirlo aquí. US-12.3 (spec.md § Assumptions): reemplaza la pantalla
// de bienvenida genérica de Feature 001 por el dashboard — mismo componente compartido con
// app/pages/admin/index.vue, sin lógica distinta por rol (los datos ya varían solo por RLS).
definePageMeta({ layout: 'default' })
</script>
