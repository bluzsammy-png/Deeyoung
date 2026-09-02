// helpers.js — shared builders for the QuantEdge audit document (English formal report, Profile A)
const {
  Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  AlignmentType, HeadingLevel, WidthType, BorderStyle, ShadingType,
  TableLayoutType,
} = require("docx");
const fs = require("fs");

// ── IG-1 Ink Gold palette (design-system.md) ──
const P = {
  bg: "1A1A1A", accent: "C9A84C",
  titleColor: "FFFFFF", subtitleColor: "B0B8C0", metaColor: "90989F", footerColor: "687078",
  heading: "1A1A1A", body: "000000", secondary: "606060",
  tableHeaderBg: "C9A84C", tableHeaderText: "1A1A1A", accentLine: "C9A84C", innerLine: "DDD5C0", surface: "F5F2E8",
};

const FONT_BODY = { ascii: "Times New Roman", eastAsia: "Times New Roman", hAnsi: "Times New Roman" };
const FONT_HEAD = { ascii: "Arial", eastAsia: "Arial", hAnsi: "Arial" };

const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

// ── inline **bold** parser ──
function parseRuns(text, base) {
  const runs = [];
  const parts = String(text).split("**");
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "") continue;
    runs.push(new TextRun(Object.assign({}, base, { text: parts[i], bold: i % 2 === 1 ? true : base.bold || false })));
  }
  return runs.length ? runs : [new TextRun(Object.assign({}, base, { text: "" }))];
}

// ── headings ──
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1, keepNext: true,
    spacing: { before: 400, after: 180, line: 380, lineRule: "atLeast" },
    children: [new TextRun({ text, bold: true, size: 32, color: P.heading, font: FONT_HEAD })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2, keepNext: true,
    spacing: { before: 300, after: 130, line: 340, lineRule: "atLeast" },
    children: [new TextRun({ text, bold: true, size: 27, color: P.heading, font: FONT_HEAD })],
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3, keepNext: true,
    spacing: { before: 220, after: 100, line: 312 },
    children: [new TextRun({ text, bold: true, size: 24, color: P.heading, font: FONT_HEAD })],
  });
}

// ── body paragraph (justified, 1.3x) ──
function p(text, opts) {
  opts = opts || {};
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: opts.after !== undefined ? opts.after : 120, line: 312 },
    keepNext: opts.keepNext || false,
    children: parseRuns(text, { size: 24, color: P.body, font: FONT_BODY }),
  });
}

// ── note (italic gray) ──
function note(text) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 120, line: 312 },
    children: parseRuns(text, { size: 20, color: P.secondary, italics: true, font: FONT_BODY }),
  });
}

// ── bullet list (left-aligned per list rule; one item per paragraph) ──
function bullets(items) {
  return items.map((t) => new Paragraph({
    alignment: AlignmentType.LEFT,
    bullet: { level: 0 },
    spacing: { after: 70, line: 312 },
    children: parseRuns(t, { size: 24, color: P.body, font: FONT_BODY }),
  }));
}

// ── table builder (percentage widths, WPS-safe) ──
function table(headers, rows, widths) {
  const cellMargins = { top: 70, bottom: 70, left: 120, right: 120 };
  const headerRow = new TableRow({
    tableHeader: true, cantSplit: true,
    children: headers.map((txt, i) => new TableCell({
      shading: { type: ShadingType.CLEAR, fill: P.tableHeaderBg },
      margins: cellMargins,
      width: { size: widths[i], type: WidthType.PERCENTAGE },
      children: [new Paragraph({
        alignment: AlignmentType.LEFT, spacing: { line: 312 },
        children: [new TextRun({ text: txt, bold: true, size: 20, color: P.tableHeaderText, font: FONT_HEAD })],
      })],
    })),
  });
  const dataRows = rows.map((r, ri) => new TableRow({
    cantSplit: true,
    children: r.map((txt, i) => new TableCell({
      shading: ri % 2 === 1 ? { type: ShadingType.CLEAR, fill: P.surface } : undefined,
      margins: cellMargins,
      width: { size: widths[i], type: WidthType.PERCENTAGE },
      children: [new Paragraph({
        alignment: AlignmentType.LEFT, spacing: { line: 312 },
        children: parseRuns(txt, { size: 20, color: P.body, font: FONT_BODY }),
      })],
    })),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: P.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accentLine },
      left: NB, right: NB,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: P.innerLine },
      insideVertical: NB,
    },
    rows: [headerRow].concat(dataRows),
  });
}

// ── table caption ──
let tableNo = 0;
function tCaption(text) {
  tableNo += 1;
  return new Paragraph({
    keepNext: true, alignment: AlignmentType.LEFT,
    spacing: { before: 160, after: 90, line: 312 },
    children: [new TextRun({ text: "Table " + tableNo + ": " + text, bold: true, size: 21, color: P.heading, font: FONT_HEAD })],
  });
}

// ── figure embed (aspect ratio from PNG IHDR) ──
let figNo = 0;
function pngDims(path) {
  const buf = fs.readFileSync(path);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
function figure(path, caption, displayWidth) {
  displayWidth = displayWidth || 560;
  const dim = pngDims(path);
  const displayHeight = Math.round(displayWidth * (dim.h / dim.w));
  figNo += 1;
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, keepNext: true,
      spacing: { before: 180, after: 60 },
      children: [new ImageRun({
        data: fs.readFileSync(path),
        transformation: { width: displayWidth, height: displayHeight },
        type: "png",
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200, line: 312 },
      children: [new TextRun({ text: "Figure " + figNo + ": " + caption, italics: true, size: 20, color: P.secondary, font: FONT_BODY })],
    }),
  ];
}

// ── cover recipe R1 (design-system.md) with dynamic layout ──
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([",", ".", " ", "-", "_", "\u2014", "\u00b7", "/", ":"]);
  const lines = [];
  let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = -1;
    for (let i = charsPerLine; i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
    }
    if (breakAt === -1) {
      const limit = Math.min(remaining.length, Math.ceil(charsPerLine * 1.3));
      for (let i = charsPerLine + 1; i < limit; i++) {
        if (breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
      }
    }
    if (breakAt === -1) breakAt = charsPerLine;
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) lines.push(remaining);
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) {
    const last = lines.pop();
    lines[lines.length - 1] += " " + last;
  }
  return lines;
}

function calcTitleLayout(title, maxWidthTwips, preferredPt, minPt) {
  preferredPt = preferredPt || 40; minPt = minPt || 24;
  const charWidth = (pt) => pt * 11; // English average glyph width
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) {
    lines = splitTitleLines(title, charsPerLine(minPt));
    titlePt = minPt;
  }
  return { titlePt, titleLines: lines };
}

function calcCoverSpacing(params) {
  const {
    titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false,
    metaLineCount = 0, fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0,
  } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const remainingSpace = usableHeight - contentHeight;
  const safeRemaining = Math.max(remainingSpace, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

function buildCoverR1(config) {
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const layout = calcTitleLayout(config.title, availableWidth, 40, 24);
  const titlePt = layout.titlePt, titleLines = layout.titleLines;
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: P.accent, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));
  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "), size: 18, color: P.accent, font: FONT_HEAD, characterSpacing: 40 })],
    }));
  }
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true, color: P.titleColor, font: FONT_HEAD })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 800, line: 340, lineRule: "atLeast" },
      children: [new TextRun({ text: config.subtitle, size: 24, color: P.subtitleColor, font: FONT_HEAD })],
    }));
  }
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200, right: padR }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 22, color: P.metaColor, font: FONT_HEAD })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));
  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: P.footerColor, font: FONT_HEAD }),
      new TextRun({ text: "                                                            ", size: 16 }),
      new TextRun({ text: config.footerRight || "", size: 16, color: P.footerColor, font: FONT_HEAD }),
    ],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: P.bg }, borders: noBorders,
        children,
      })],
    })],
  })];
}

module.exports = {
  P, FONT_BODY, FONT_HEAD, NB, noBorders, allNoBorders,
  h1, h2, h3, p, note, bullets, table, tCaption, figure, buildCoverR1,
};
