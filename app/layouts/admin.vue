<template>
  <div>
    <!-- `color="sidebar"` (#1a1f26, docs/design-system.md → "Sidebar"), no `primary`: es una
    variante casi negra distinta del navy de marca, confirmada contra las capturas reales de
    Stitch. Vuetify usa `on-sidebar` (blanco) como color de texto automáticamente. NO agregar
    `theme="dark"` — este proyecto solo define un tema `light`, así que `theme="dark"` cae al
    tema oscuro POR DEFECTO de Vuetify (un azul genérico ajeno a la marca), no a una variante
    oscura de nuestros propios tokens. -->
    <v-navigation-drawer permanent color="sidebar" class="app-drawer-shadow">
      <v-list-item title="Flotillas" subtitle="Administrador" class="text-page-title-mobile" />
      <v-divider />
      <v-list nav>
        <v-list-item to="/admin/usuarios" prepend-icon="mdi-account-group" title="Usuarios" />
        <v-list-item to="/admin/vehiculos" prepend-icon="mdi-truck-outline" title="Vehículos" />
        <v-list-item
          to="/admin/conductores"
          prepend-icon="mdi-card-account-details-outline"
          title="Conductores"
        />
        <v-list-item
          to="/admin/tipos-vehiculo"
          prepend-icon="mdi-car-outline"
          title="Tipos de Vehículo"
        />
        <v-list-item
          to="/admin/aseguradoras"
          prepend-icon="mdi-shield-car"
          title="Aseguradoras"
        />
        <v-list-item
          to="/admin/tipos-permiso"
          prepend-icon="mdi-file-certificate-outline"
          title="Catálogo de Permisos"
        />
        <v-list-item
          to="/admin/proveedores"
          prepend-icon="mdi-truck-delivery-outline"
          title="Proveedores"
        />
        <v-list-item
          to="/admin/productos"
          prepend-icon="mdi-package-variant-closed"
          title="Productos"
        />
        <v-list-item
          to="/admin/combustible"
          prepend-icon="mdi-gas-station-outline"
          title="Combustible"
        />
        <v-list-item
          to="/admin/mantenimiento"
          prepend-icon="mdi-wrench-outline"
          title="Mantenimiento"
        />
        <v-list-item
          to="/admin/checklist"
          prepend-icon="mdi-clipboard-check-outline"
          title="Checklist"
        />
        <v-list-item
          to="/admin/servicios-obligatorios"
          prepend-icon="mdi-file-certificate-outline"
          title="Servicios Obligatorios"
        />
        <v-list-item
          to="/admin/auditoria"
          prepend-icon="mdi-history"
          title="Bitácora de Auditoría"
        />
        <v-list-item to="/admin/configuracion" prepend-icon="mdi-cog" title="Configuración" />
      </v-list>
    </v-navigation-drawer>

    <v-app-bar flat class="app-bar-glass">
      <v-app-bar-title class="text-section-title">Panel de Administrador</v-app-bar-title>
      <v-spacer />
      <AppMenuPerfil />
    </v-app-bar>

    <v-main class="bg-background">
      <v-container fluid>
        <slot />
      </v-container>
    </v-main>
  </div>
</template>
