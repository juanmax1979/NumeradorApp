import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mdPath = path.join(__dirname, "Instructivo-de-uso-Numerador.md");
const outPath = path.join(__dirname, "Instructivo-de-uso-Numerador.pdf");

let md = fs.readFileSync(mdPath, "utf8");
md = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");

function stripInline(mdLine) {
  return mdLine
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*(.+?)\*/g, "$1");
}

const doc = new PDFDocument({
  size: "A4",
  margin: 54,
  bufferPages: true,
});
const stream = fs.createWriteStream(outPath);
doc.pipe(stream);

const contentWidth = doc.page.width - 108;
function drawFooter() {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    const footY = doc.page.height - 40;
    doc.fontSize(8).fillColor("#555555").font("Helvetica");
    doc.text(`${i + 1} / ${range.count}`, 54, footY, {
      width: contentWidth,
      align: "center",
    });
    doc.fillColor("#000000");
  }
}

const lines = md.split(/\r?\n/);
doc.font("Helvetica");

for (const raw of lines) {
  const line = raw.trimEnd();
  const t = line.trim();

  if (t === "") {
    doc.moveDown(0.25);
    continue;
  }

  if (t === "---") {
    doc.moveDown(0.35);
    doc
      .moveTo(54, doc.y)
      .lineTo(54 + contentWidth, doc.y)
      .strokeColor("#cccccc")
      .lineWidth(0.5)
      .stroke()
      .strokeColor("#000000");
    doc.moveDown(0.45);
    continue;
  }

  if (t.startsWith("# ")) {
    doc.moveDown(0.4);
    doc.fontSize(16).font("Helvetica-Bold").text(stripInline(t.slice(2)), { width: contentWidth });
    doc.font("Helvetica");
    continue;
  }

  if (t.startsWith("## ")) {
    doc.moveDown(0.35);
    doc.fontSize(13).font("Helvetica-Bold").text(stripInline(t.slice(3)), { width: contentWidth });
    doc.font("Helvetica");
    continue;
  }

  if (t.startsWith("### ")) {
    doc.moveDown(0.28);
    doc.fontSize(11).font("Helvetica-Bold").text(stripInline(t.slice(4)), { width: contentWidth });
    doc.font("Helvetica");
    continue;
  }

  if (t.startsWith("|")) {
    if (/^\|[\s\-:|]+\|$/.test(t)) continue;
    const cells = t
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    const rowText = cells.join(" — ");
    doc.fontSize(9).font("Helvetica").text(stripInline(rowText), { width: contentWidth });
    continue;
  }

  if (t.startsWith("- ")) {
    doc
      .fontSize(10)
      .font("Helvetica")
      .text(`\u2022 ${stripInline(t.slice(2))}`, { width: contentWidth - 12, indent: 12 });
    continue;
  }

  doc.fontSize(10).font("Helvetica").text(stripInline(t), { width: contentWidth });
}

drawFooter();
doc.end();

stream.on("finish", () => {
  process.stdout.write(`PDF generado: ${outPath}\n`);
});
