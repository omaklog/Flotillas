import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// jspdf-autotable expone `doc.lastAutoTable` en runtime (no tipado por el paquete —
// `jsPDFDocument` ahí es `any`, ver node_modules/jspdf-autotable/dist/index.d.ts).
declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable?: { finalY: number }
  }
}

interface TablaExportar {
  titulo: string
  columnas: string[]
  filas: (string | number)[][]
}

/**
 * Arma el PDF 100% en el navegador y dispara su descarga (research.md R3):
 * encabezado con `titulo` + `subtitulo` (rango de fechas aplicado), una tabla
 * `autoTable` por elemento de `tablas`. Acepta `filas: []` sin lanzar —
 * `autoTable` dibuja igual la tabla con solo encabezados (FR-015).
 */
export function exportarPdf(
  nombreArchivo: string,
  titulo: string,
  subtitulo: string,
  tablas: TablaExportar[]
): void {
  const doc = new jsPDF()
  let cursorY = 14

  doc.setFontSize(16)
  doc.text(titulo, 14, cursorY)
  cursorY += 7

  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(subtitulo, 14, cursorY)
  cursorY += 6
  doc.setTextColor(0)

  for (const tabla of tablas) {
    doc.setFontSize(12)
    doc.text(tabla.titulo, 14, cursorY)
    cursorY += 4

    autoTable(doc, {
      startY: cursorY,
      head: [tabla.columnas],
      body: tabla.filas,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [31, 56, 100] }
    })

    cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 10
  }

  doc.save(nombreArchivo)
}
