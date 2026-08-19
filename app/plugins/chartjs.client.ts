import { Chart as ChartJS, ArcElement, PieController, Tooltip, Legend } from 'chart.js'

// Registro único de Chart.js (research.md R3 de specs/012-alertas-dashboard/, primera librería
// de gráficas del proyecto) — las 3 gráficas de pastel del dashboard (`PanelPrincipal.vue`)
// reutilizan este mismo registro en vez de registrar por instancia.
ChartJS.register(PieController, ArcElement, Tooltip, Legend)

export default defineNuxtPlugin(() => {})
