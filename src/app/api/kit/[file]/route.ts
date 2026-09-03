import { NextRequest } from "next/server";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// Media Kit delivery: streams launch-kit files from the download dir with
// HTTP Range support (so <video> seeking works) and strict name validation.
const DIR = path.join(process.cwd(), "download");

function contentType(name: string): string {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "mp4") return "video/mp4";
  if (ext === "wav") return "audio/wav";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webm") return "video/webm";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "pdf") return "application/pdf";
  if (ext === "md") return "text/markdown; charset=utf-8";
  return "application/octet-stream";
}

function parseRange(range: string | null, size: number): { start: number; end: number } | null {
  if (!range) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m) return null;
  let start = m[1] === "" ? NaN : parseInt(m[1], 10);
  let end = m[2] === "" ? NaN : parseInt(m[2], 10);
  if (Number.isNaN(start)) {
    // suffix range: bytes=-N
    if (Number.isNaN(end) || end <= 0 || end > size) return null;
    start = Math.max(0, size - end);
    end = size - 1;
  } else {
    if (start >= size) return null;
    end = Number.isNaN(end) || end >= size ? size - 1 : end;
    if (end < start) return null;
  }
  return { start, end };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  // Strict name check — no separators, no traversal, exact whitelist match below.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(file)) {
    return new Response("Bad request", { status: 400 });
  }
  let entries: string[];
  try {
    entries = await readdir(DIR);
  } catch {
    return new Response("Kit unavailable", { status: 500 });
  }
  if (!entries.includes(file)) {
    return new Response("Not found", { status: 404 });
  }
  const full = path.join(DIR, file);
  let buf: Buffer;
  try {
    buf = await readFile(full);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const size = buf.length;
  const base: Record<string, string> = {
    "Content-Type": contentType(file),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=300",
    "Content-Disposition": `inline; filename="${file}"`,
  };
  const range = parseRange(req.headers.get("range"), size);
  if (range) {
    const slice = buf.subarray(range.start, range.end + 1);
    return new Response(new Uint8Array(slice), {
      status: 206,
      headers: {
        ...base,
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
        "Content-Length": String(slice.length),
      },
    });
  }
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: { ...base, "Content-Length": String(size) },
  });
}
