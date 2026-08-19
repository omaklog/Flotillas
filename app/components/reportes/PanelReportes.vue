<template>
  <div>
    <div class="mb-6">
      <h1 class="text-page-title">Reportes</h1>
      <p class="text-metadata mt-1">Reportes detallados y exportables de tu flotilla.</p>
    </div>

    <v-tabs v-model="tabActiva" data-testid="reportes-tabs">
      <v-tab value="mantenimiento" data-testid="reportes-tab-mantenimiento">
        Costos de mantenimiento
      </v-tab>
      <v-tab value="combustible" data-testid="reportes-tab-combustible"> Combustible </v-tab>
      <v-tab value="vencimientos" data-testid="reportes-tab-vencimientos"> Vencimientos </v-tab>
      <v-tab value="cumplimiento" data-testid="reportes-tab-cumplimiento"> Cumplimiento </v-tab>
    </v-tabs>

    <v-window v-model="tabActiva" class="mt-4">
      <v-window-item value="mantenimiento">
        <ReportesSeccionMantenimiento />
      </v-window-item>
      <v-window-item value="combustible">
        <ReportesSeccionCombustible />
      </v-window-item>
      <v-window-item value="vencimientos">
        <ReportesSeccionVencimientos />
      </v-window-item>
      <v-window-item value="cumplimiento">
        <ReportesSeccionCumplimiento />
      </v-window-item>
    </v-window>
  </div>
</template>

<script setup lang="ts">
const tabActiva = ref('mantenimiento')
</script>
