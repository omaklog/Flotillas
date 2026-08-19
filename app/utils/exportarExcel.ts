import ExcelJS from 'exceljs'

interface HojaExportar {
  titulo: string
  columnas: string[]
  filas: (string | number)[][]
}

/**
 * Arma un `.xlsx` real (no CSV) 100% en el navegador y dispara su descarga
 * (research.md R2). Una hoja por elemento de `hojas` — encabezados en negrita,
 * ancho de columna ajustado al contenido. Acepta `filas: []` sin lanzar: la
 * hoja se genera igual, solo con encabezados (FR-015).
 */
export async function exportarExcel(nombreArchivo: string, hojas: HojaExportar[]): Promise<void> {
  const workbook = new ExcelJS.Workbook()

  for (const hoja of hojas) {
    const sheet = workbook.addWorksheet(hoja.titulo.slice(0, 31))
    sheet.columns = hoja.columnas.map((columna) => ({
      header: columna,
      key: columna,
      width: Math.max(columna.length + 2, 12)
    }))
    sheet.getRow(1).font = { bold: true }
    for (const fila of hoja.filas) {
      sheet.addRow(fila)
    }
    for (const [indice, columna] of hoja.columnas.entries()) {
      const anchoContenido = hoja.filas.reduce(
        (maximo, fila) => Math.max(maximo, String(fila[indice] ?? '').length),
        columna.length
      )
      sheet.getColumn(indice + 1).width = Math.max(anchoContenido + 2, 12)
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombreArchivo
  enlace.click()
  URL.revokeObjectURL(url)
}
