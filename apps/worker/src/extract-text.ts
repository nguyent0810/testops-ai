import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export type ExtractKind = "pdf" | "docx" | "text";

function stripBom(s: string): string {
  return s.replace(/^\uFEFF/, "");
}

/** UTF-16 LE with BOM (common for Windows “Unicode” .txt exports). */
function decodeTextBuffer(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return stripBom(buffer.subarray(2).toString("utf16le"));
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const body = buffer.subarray(2);
    const swapped = Buffer.alloc(body.length);
    for (let i = 0; i + 1 < body.length; i += 2) {
      swapped[i] = body[i + 1]!;
      swapped[i + 1] = body[i]!;
    }
    return stripBom(swapped.toString("utf16le"));
  }
  return stripBom(buffer.toString("utf8"));
}

export function resolveExtractKind(
  mimeType: string,
  filename: string,
): ExtractKind | null {
  const mime = mimeType.toLowerCase();
  const name = filename.toLowerCase();

  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    return "pdf";
  }
  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    return "docx";
  }
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    name.endsWith(".md") ||
    name.endsWith(".txt") ||
    name.endsWith(".markdown") ||
    name.endsWith(".csv")
  ) {
    return "text";
  }
  return null;
}

export async function extractRawText(
  buffer: Buffer,
  kind: ExtractKind,
): Promise<string> {
  if (kind === "text") {
    return decodeTextBuffer(buffer);
  }
  if (kind === "docx") {
    try {
      const { value } = await mammoth.extractRawText({ buffer });
      return stripBom(value ?? "");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`DOCX text extraction failed: ${msg}`);
    }
  }

  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return stripBom(result.text ?? "");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`PDF text extraction failed: ${msg}`);
  } finally {
    try {
      await parser.destroy();
    } catch {
      /* ignore teardown errors after failed extract */
    }
  }
}
