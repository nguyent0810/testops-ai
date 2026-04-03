/**
 * Some models still wrap JSON in markdown fences despite instructions.
 * Strip a single ```json ... ``` (or ``` ... ```) wrapper before JSON.parse.
 */
export function stripJsonCodeFence(text: string): string {
  const t = text.trim();
  const m = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/i.exec(t);
  if (m?.[1]) {
    return m[1].trim();
  }
  if (t.startsWith("```")) {
    const firstNl = t.indexOf("\n");
    const lastFence = t.lastIndexOf("```");
    if (firstNl !== -1 && lastFence > firstNl) {
      return t.slice(firstNl + 1, lastFence).trim();
    }
  }
  return t;
}

/** Strip UTF-8 BOM if present (common in exported text files). */
export function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

/**
 * If the model adds prose before/after JSON, extract the first `{...}` block
 * by brace counting (handles nested objects).
 */
export function extractFirstJsonObjectString(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (c === "\\") {
        esc = true;
      } else if (c === '"') {
        inStr = false;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * Same idea as {@link extractFirstJsonObjectString} for a top-level `[...]` array
 * (models sometimes return a bare array despite json_object mode).
 */
export function extractFirstJsonArrayString(text: string): string | null {
  const start = text.indexOf("[");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (c === "\\") {
        esc = true;
      } else if (c === '"') {
        inStr = false;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

function tryJsonParse(fragment: string): unknown | undefined {
  try {
    return JSON.parse(fragment) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Some models return a JSON *string* whose value is another JSON payload.
 * Unwrap a few layers without looping forever.
 */
function unwrapJsonStringLayers(value: unknown, depth = 0): unknown {
  if (depth > 5 || typeof value !== "string") return value;
  const t = value.trim();
  if (t.length === 0) return value;
  const inner = tryJsonParse(t);
  if (inner === undefined) return value;
  return unwrapJsonStringLayers(inner, depth + 1);
}

function parseTrimmedModelString(s: string): unknown | undefined {
  let v = tryJsonParse(s);
  if (v !== undefined) return unwrapJsonStringLayers(v);

  const obj = extractFirstJsonObjectString(s);
  if (obj && obj !== s) {
    v = tryJsonParse(obj);
    if (v !== undefined) return unwrapJsonStringLayers(v);
  }

  const arr = extractFirstJsonArrayString(s);
  if (arr) {
    v = tryJsonParse(arr);
    if (v !== undefined) return unwrapJsonStringLayers(v);
  }

  return undefined;
}

/**
 * Some models wrap the real payload in `data`, `result`, etc. Peel one layer
 * when those objects contain the expected alpha keys.
 */
export function unwrapKnownModelEnvelope(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const o = value as Record<string, unknown>;
  for (const key of ["data", "result", "output", "response"] as const) {
    const inner = o[key];
    if (inner !== null && typeof inner === "object" && !Array.isArray(inner)) {
      const innerObj = inner as Record<string, unknown>;
      if (
        "requirements" in innerObj ||
        "test_cases" in innerObj ||
        Array.isArray(innerObj.requirements) ||
        Array.isArray(innerObj.test_cases)
      ) {
        return inner;
      }
    }
  }
  return value;
}

/**
 * Parse model output into a JSON value: fence strip → trim/BOM → parse →
 * optional `{...}` / `[...]` extraction when surrounded by junk.
 */
export function parseModelJsonValue(raw: string): unknown {
  const s = stripBom(stripJsonCodeFence(raw)).trim();
  if (!s) {
    throw new Error("Model output is empty");
  }

  const v = parseTrimmedModelString(s);
  if (v !== undefined) return v;

  throw new Error("Model output is not valid JSON");
}
