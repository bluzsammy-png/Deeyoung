// generate.js — assemble the QuantEdge Pro Phase 0 audit DOCX
const {
  Document, Packer, Paragraph, TextRun, Header, Footer, PageNumber,
  AlignmentType, SectionType, NumberFormat, TableOfContents,
} = require("docx");
const fs = require("fs");
const H = require("./helpers");

const OUT = "/home/z/my-project/download/QuantEdge_Pro_Production_Audit_Phase0.docx";

// ── content ──
const body = []
  .concat(require("./part0")(H))
  .concat(require("./part1a")(H))
  .concat(require("./part1b")(H))
  .concat(require("./part1c")(H))
  .concat(require("./part2")(H))
  .concat(require("./part3")(H));

// ── TOC section children (no trailing PageBreak: section break follows) ──
const tocChildren = [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 480, after: 360, line: 380, lineRule: "atLeast" },
    children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, font: H.FONT_HEAD, color: H.P.heading })],
  }),
  new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }),
  new Paragraph({
    spacing: { before: 200 },
    children: [new TextRun({
      text: "Note: This Table of Contents is generated via field codes. To ensure page number accuracy after editing, please right-click the TOC and select \"Update Field.\"",
      italics: true, size: 18, color: "888888", font: H.FONT_BODY,
    })],
  }),
];

// ── footers/headers ──
const emptyFooter = new Footer({ children: [new Paragraph({ children: [] })] });
const bodyFooter = new Footer({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080", font: H.FONT_BODY })],
  })],
});
const bodyHeader = new Header({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "QuantEdge Pro - Production Audit (Phase 0)", size: 18, color: "888888", font: H.FONT_BODY })],
  })],
});

const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

const doc = new Document({
  creator: "QuantEdge Pro Architecture Desk",
  title: "QuantEdge Pro - Production Audit and Target Architecture (Phase 0)",
  description: "Phase 0 audit mandated by the Master Upgrade Prompt, Sections 62 and 71",
  styles: {
    default: {
      document: {
        run: { font: { ascii: "Times New Roman", eastAsia: "Times New Roman", hAnsi: "Times New Roman" }, size: 24, color: "000000" },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: { ascii: "Arial", eastAsia: "Arial", hAnsi: "Arial" }, size: 32, bold: true, color: H.P.heading },
        paragraph: { spacing: { before: 400, after: 180, line: 380 }, outlineLevel: 0 },
      },
      heading2: {
        run: { font: { ascii: "Arial", eastAsia: "Arial", hAnsi: "Arial" }, size: 27, bold: true, color: H.P.heading },
        paragraph: { spacing: { before: 300, after: 130, line: 340 }, outlineLevel: 1 },
      },
      heading3: {
        run: { font: { ascii: "Arial", eastAsia: "Arial", hAnsi: "Arial" }, size: 24, bold: true, color: H.P.heading },
        paragraph: { spacing: { before: 220, after: 100, line: 312 }, outlineLevel: 2 },
      },
    },
  },
  sections: [
    { // Section 1: Cover — margin 0, no header/footer, no pageNumbers
      properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: H.buildCoverR1({
        title: "QuantEdge Pro",
        subtitle: "Production Audit and Target Architecture - Unified AI Market Intelligence + Trading Terminal",
        englishLabel: "PRODUCTION AUDIT - PHASE 0",
        metaLines: [
          "Audited deployment: https://c1eek7j3be20-d.space-z.ai",
          "Audit date: September 2, 2026",
          "Method: live endpoint probes - bundle analysis - UI walkthrough",
          "Mandate: Master Upgrade Prompt, Sections 62 and 71 (audit before build)",
        ],
        footerLeft: "Prepared by the QuantEdge Pro Architecture Desk",
        footerRight: "Confidential - Internal Working Document",
      }),
    },
    { // Section 2: Front matter (TOC) — no visible page number
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin },
      },
      footers: { default: emptyFooter },
      children: tocChildren,
    },
    { // Section 3: Body — Arabic page numbers starting at 1
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: pgSize, margin: pgMargin,
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
        },
      },
      headers: { default: bodyHeader },
      footers: { default: bodyFooter },
      children: body,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log("WROTE " + OUT + " (" + Math.round(buf.length / 1024) + " KB)");
});
