import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { imageSize } from "image-size";
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  AlignmentType,
  ImageRun,
  Table,
  TableCell,
  TableRow,
  WidthType,
  BorderStyle,
} from "docx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const capturasDir = path.resolve(__dirname, "..", "Capturas");
const outputPath = path.resolve(__dirname, "Manual-de-usuario-Numerador.docx");
const MAX_IMAGE_WIDTH = 920;

const screenshot = {
  login: "Captura de pantalla 2026-05-05 105244.png",
  oficio: "Captura de pantalla 2026-05-05 105132.png",
  dependencia: "Captura de pantalla 2026-05-05 105141.png",
  auto: "Captura de pantalla 2026-05-05 105151.png",
  sentenciaDefinitiva: "Captura de pantalla 2026-05-05 105157.png",
  sentenciaRelatoria: "Captura de pantalla 2026-05-05 105203.png",
  buscador: "Captura de pantalla 2026-05-05 105209.png",
  estadisticas: "Captura de pantalla 2026-05-05 105215.png",
  catalogo: "Captura de pantalla 2026-05-05 105220.png",
  catalogoTipos: "Captura de pantalla 2026-05-05 105227.png",
};

function p(text, options = {}) {
  return new Paragraph({
    children: [new TextRun({ text, ...options })],
    spacing: { after: 180 },
  });
}

function h(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    text,
    heading: level,
    spacing: { before: 240, after: 160 },
  });
}

function strong(text) {
  return new TextRun({ text, bold: true });
}

function linkText(parts) {
  return new Paragraph({
    children: parts,
    spacing: { after: 180 },
  });
}

function bullet(text) {
  return new Paragraph({
    children: [new TextRun(text)],
    bullet: { level: 0 },
    spacing: { after: 100 },
  });
}

function note(text) {
  return new Paragraph({
    children: [new TextRun({ text, italics: true, color: "475569" })],
    spacing: { before: 80, after: 180 },
  });
}

function makeCell(text, options = {}) {
  return new TableCell({
    width: { size: options.width || 50, type: WidthType.PERCENTAGE },
    shading: options.header ? { fill: "D9EAF7" } : undefined,
    margins: { top: 90, bottom: 90, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: !!options.header })],
      }),
    ],
  });
}

function table(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "B7CAD8" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "B7CAD8" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "B7CAD8" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "B7CAD8" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "D5E2EA" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "D5E2EA" },
    },
    rows: rows.map(
      (row, rowIndex) =>
        new TableRow({
          children: row.map((cell, cellIndex) =>
            makeCell(cell, {
              header: rowIndex === 0,
              width: cellIndex === 0 ? 30 : 70,
            })
          ),
        })
    ),
  });
}

function image(key, caption) {
  const file = screenshot[key];
  const fullPath = path.join(capturasDir, file);
  if (!file || !fs.existsSync(fullPath)) {
    return [
      note(`Captura pendiente: ${caption}`),
    ];
  }
  const img = fs.readFileSync(fullPath);
  const meta = imageSize(img);
  const originalW = Number(meta.width || MAX_IMAGE_WIDTH);
  const originalH = Number(meta.height || Math.round(MAX_IMAGE_WIDTH * 0.56));
  const scale = Math.min(1, MAX_IMAGE_WIDTH / originalW);
  const width = Math.round(originalW * scale);
  const height = Math.round(originalH * scale);
  return [
    new Paragraph({
      children: [new TextRun({ text: caption, bold: true, color: "234B63" })],
      spacing: { before: 160, after: 100 },
    }),
    new Paragraph({
      children: [
        new ImageRun({
          data: img,
          transformation: { width, height },
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 260 },
    }),
  ];
}

const children = [];

children.push(
  new Paragraph({
    children: [new TextRun({ text: "Manual de Usuario - Sistema Numerador", bold: true, size: 40 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Gestión y numeración de recaudos judiciales", bold: true, size: 24 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Poder Judicial del Chaco", italics: true })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 360 },
  }),
  p(
    "Este manual acompaña al usuario desde el ingreso al sistema hasta el uso de cada opción disponible. Su objetivo es explicar qué hace Numerador, cómo debe utilizarse y por qué la dependencia activa es un dato central en todo el proceso."
  )
);

children.push(
  h("1. Finalidad del sistema"),
  linkText([
    new TextRun("El Sistema Numerador sirve para "),
    strong("asignar, consultar y controlar la numeración correlativa de recaudos judiciales"),
    new TextRun(" dentro de cada dependencia. La numeración no es global para todo el Poder Judicial: es "),
    strong("única por dependencia, tipo de recaudo y año"),
    new TextRun("."),
  ]),
  p(
    "Este diseño evita colisiones al enumerar documentos. Dos dependencias pueden trabajar en paralelo sin pisarse entre sí, porque cada una opera sobre su propio contexto de trabajo y sus propios correlativos."
  ),
  bullet("Cada usuario trabaja sobre la dependencia activa que figura en la barra superior."),
  bullet("Los números se calculan por tipo documental y por año."),
  bullet("El sistema conserva registros para consulta, control, anulación y seguimiento."),
  bullet("La integración con SIGI ayuda a validar expediente y dependencia antes de utilizar un dato."),
  h("2. Recaudos judiciales contemplados"),
  p(
    "Numerador organiza la carga de recaudos por tipo. En las pantallas operativas se navega por pestañas y cada pestaña mantiene su próximo número disponible."
  ),
  table([
    ["Tipo de recaudo", "Uso dentro del sistema"],
    ["Oficios", "Carga y numeración de oficios. Es el único tipo que permite marcar el estado Remitido."],
    ["Autos", "Carga y numeración de autos judiciales de la dependencia activa."],
    ["Sentencia Definitiva", "Carga y numeración de sentencias definitivas. Según la configuración visible, esta opción puede aparecer como Sentencia Trámite."],
    ["Sentencia Relatoria", "Carga y numeración de sentencias relatorías."],
  ]),
  note("El punto clave para el usuario es verificar siempre la dependencia activa antes de guardar: el número generado pertenece a esa dependencia."),
  h("3. Ingreso al sistema"),
  p("Al abrir Numerador se muestra la pantalla de inicio de sesión. El usuario debe completar sus credenciales y validar el código de verificación."),
  bullet("Usuario: nombre de usuario asignado por la administración o por el mecanismo institucional configurado."),
  bullet("Contraseña: clave del usuario."),
  bullet("Código de verificación: debe copiarse exactamente como aparece. Si no se lee correctamente, se usa Regenerar."),
  bullet("Iniciar Sesión: valida los datos y permite acceder al sistema."),
  ...image("login", "Figura 1. Pantalla de inicio de sesión con usuario, contraseña y captcha."),
  p(
    "Si el sistema informa que existe una sesión activa en otra computadora, puede solicitar confirmación para forzar el ingreso. Esta opción debe usarse solo cuando el usuario tenga certeza de que no hay otra persona utilizando la misma cuenta."
  ),
  h("4. Pantalla principal y dependencia activa"),
  p(
    "Después del ingreso, la aplicación muestra la barra superior, las pestañas de navegación y el área de trabajo. La barra superior indica nombre del operador, usuario, rol, fuero y dependencia activa."
  ),
  bullet("Refrescar: vuelve a cargar los datos de la pantalla actual."),
  bullet("Salir: cierra la sesión."),
  bullet("Actuar en: permite seleccionar dependencia cuando el usuario tiene más de una asignada."),
  ...image("oficio", "Figura 2. Pantalla principal: barra superior, pestañas y formulario de Oficio."),
  h("4.1 Selector Actuar en"),
  p(
    "Cuando SIGI informa más de una dependencia habilitada para el usuario, Numerador muestra el selector Actuar en. Al cambiar la dependencia, cambian también los próximos números, las búsquedas, las estadísticas y los registros visibles."
  ),
  ...image("dependencia", "Figura 3. Selector de dependencia activa para operar en el contexto correcto."),
  note(
    "Esta selección es la medida principal para evitar colisiones: cada dependencia enumera sus propios recaudos, aun cuando varios usuarios trabajen al mismo tiempo."
  ),
  h("5. Navegación por pestañas"),
  p(
    "La navegación principal se realiza mediante pestañas. Las pestañas de recaudos comparten una lógica común: muestran el próximo número, permiten cargar expediente y detalle, ofrecen búsqueda o consulta SIGI y listan los registros del tipo seleccionado."
  ),
  table([
    ["Pestaña", "Funcionalidad"],
    ["OFICIO", "Alta, búsqueda, consulta SIGI y seguimiento de oficios. Permite alternar Remitido."],
    ["AUTO", "Alta, búsqueda y consulta de autos."],
    ["SENTENCIA TRAMITE / DEFINITIVA", "Alta, búsqueda y consulta de sentencias definitivas según el catálogo configurado."],
    ["SENTENCIA RELATORIA", "Alta, búsqueda y consulta de sentencias relatorías."],
    ["BUSCADOR", "Búsqueda transversal entre tipos, filtros por fecha y exportación Excel."],
    ["ESTADISTICAS", "Totales por tipo y ranking de detalles para un año."],
    ["CATALOGO", "Administración de categorías y opciones de detalle, disponible para perfiles administradores."],
  ]),
  h("6. Carga de recaudos"),
  p("Para cargar un recaudo, el usuario debe ubicarse en la pestaña correspondiente al tipo documental y completar los campos del formulario."),
  bullet("Próximo número: indica el número que se asignará al siguiente registro válido para esa dependencia, tipo y año."),
  bullet("Expediente: se completa con formato NNNNNNNN/AAAA-CC, por ejemplo 3500384/2026-91."),
  bullet("Seleccione detalle: lista alimentada por el catálogo del sistema."),
  bullet("Guardar: registra el recaudo, actualiza la grilla y recalcula el próximo número."),
  bullet("Icono de limpiar: vacía los campos del formulario y el filtro de búsqueda."),
  h("6.1 Oficios"),
  p("La pestaña OFICIO se utiliza para enumerar oficios. Además de las acciones comunes, en los registros de este tipo puede marcarse el estado Remitido."),
  ...image("oficio", "Figura 4. Carga y listado de oficios."),
  h("6.2 Autos"),
  p("La pestaña AUTO conserva la misma experiencia de carga: expediente, detalle, consulta SIGI y tabla de registros del tipo seleccionado."),
  ...image("auto", "Figura 5. Carga y listado de autos."),
  h("6.3 Sentencia Definitiva"),
  p(
    "La opción de sentencia definitiva permite enumerar ese tipo de recaudo judicial. En algunas pantallas del sistema puede verse rotulada como SENTENCIA TRAMITE por configuración interna, aunque en el catálogo se administra como Sentencia Definitiva."
  ),
  ...image("sentenciaDefinitiva", "Figura 6. Carga y listado de sentencia definitiva / sentencia trámite."),
  h("6.4 Sentencia Relatoria"),
  p("La pestaña SENTENCIA RELATORIA permite cargar, consultar y listar las sentencias relatorías de la dependencia activa."),
  ...image("sentenciaRelatoria", "Figura 7. Carga y listado de sentencia relatoría."),
  h("7. Consulta SIGI y filtros por tipo"),
  p(
    "En las pestañas de recaudos, el campo inferior permite filtrar registros del tipo actual o consultar SIGI. La consulta SIGI ayuda a validar el expediente antes de utilizarlo en un nuevo registro."
  ),
  bullet("Buscar: aplica el filtro escrito y recarga la grilla."),
  bullet("Consultar SIGI: busca el expediente en SIGI usando el formato esperado."),
  bullet("Usar expediente: solo corresponde cuando la fila devuelta por SIGI pertenece a la dependencia activa del Numerador."),
  note(
    "Si SIGI devuelve un expediente de otra dependencia, el sistema advierte que debe cambiarse la dependencia activa o verificarse la radicación antes de continuar."
  ),
  h("8. Tabla de registros y acciones"),
  p(
    "Cada pantalla con registros muestra columnas como tipo, número, expediente, detalle, remitido, fecha, usuario, datos de anulación y acciones disponibles."
  ),
  bullet("Modificar: permite corregir expediente y detalle cuando la acción está habilitada."),
  bullet("Anular: registra motivo y observación. La acción queda limitada por el plazo configurado por el sistema."),
  bullet("Remitido: disponible para oficios, alterna el estado del documento."),
  bullet("Paginación: permite elegir cantidad de registros por página y navegar con Anterior o Siguiente."),
  h("9. Buscador global"),
  p(
    "La pestaña BUSCADOR permite consultar registros de la dependencia activa sin limitarse a una sola pestaña documental. Es útil para ubicar antecedentes, revisar cargas y generar exportes."
  ),
  bullet("Texto: criterio libre de búsqueda."),
  bullet("Tipo: permite buscar en todos los tipos o limitar a uno específico."),
  bullet("Fechas desde/hasta: acotan el rango temporal."),
  bullet("Exportar Excel: descarga los resultados del filtro aplicado."),
  ...image("buscador", "Figura 8. Buscador global con filtros de texto, tipo y fecha."),
  h("10. Estadísticas"),
  p(
    "La pestaña ESTADISTICAS resume la actividad de la dependencia activa para el año indicado. Sirve para seguimiento interno y control operativo."
  ),
  bullet("Año: período a consultar."),
  bullet("Cargar: actualiza los indicadores."),
  bullet("Totales por tipo: muestra cantidades por oficio, auto, sentencia definitiva y sentencia relatoría."),
  bullet("Ranking de detalles: muestra los detalles más utilizados y su cantidad."),
  ...image("estadisticas", "Figura 9. Estadísticas por año y ranking de detalles."),
  h("11. Catálogo de recaudos"),
  p(
    "La pestaña CATALOGO está orientada a perfiles administradores. Desde allí se administran los tipos, categorías y opciones que luego aparecen en el desplegable de detalle durante la carga de recaudos."
  ),
  bullet("Tipo de recaudo: selecciona el catálogo a administrar."),
  bullet("Nueva categoría: agrega un grupo de opciones para el tipo seleccionado."),
  bullet("Nueva opción: agrega un detalle dentro de una categoría."),
  bullet("Editar categoría / Editar: permite corregir textos existentes."),
  ...image("catalogo", "Figura 10. Catálogo de recaudos con categorías y opciones."),
  p("El selector de tipo permite administrar catálogos separados para Oficios, Autos, Sentencia Relatoria y Sentencia Definitiva."),
  ...image("catalogoTipos", "Figura 11. Selector de tipos administrables dentro del catálogo."),
  h("12. Buenas prácticas de uso"),
  bullet("Verificar la dependencia activa antes de guardar, buscar, exportar o consultar estadísticas."),
  bullet("Usar Consulta SIGI cuando el expediente provenga de ese sistema o cuando existan dudas sobre radicación."),
  bullet("No compartir usuario ni contraseña."),
  bullet("Revisar el detalle antes de guardar, porque el número se asigna al confirmar el registro."),
  bullet("Ante errores de DNI, dependencia, permisos o catálogo, solicitar intervención del administrador del sistema."),
  h("13. Resumen operativo"),
  p("El flujo recomendado para un usuario es: ingresar al sistema, confirmar la dependencia activa, elegir la pestaña del recaudo, completar expediente y detalle, consultar SIGI si corresponde, guardar y verificar el registro en la tabla."),
  p(
    "El flujo recomendado para un administrador es: además de las tareas operativas, mantener actualizado el catálogo para que los usuarios seleccionen detalles claros y homogéneos."
  ),
  note(`Última actualización: ${new Date().toLocaleDateString("es-AR")}`)
);

const doc = new Document({
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: 720,
            right: 540,
            bottom: 720,
            left: 540,
          },
        },
      },
      children,
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outputPath, buffer);
console.log(`DOCX generado: ${outputPath}`);
