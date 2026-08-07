<template>
  <div>
    <h1 class="text-page-title mb-4">Panel de Administrador</h1>
    <p class="text-body-main">Bienvenido, {{ usuario?.nombre }}.</p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const { usuario } = useAuth()
</script>
