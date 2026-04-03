export type SectionChunk = {
  heading: string | null;
  content: string;
};

/**
 * Split plain text into sections. Markdown ATX headings (# .. ######) start a new section.
 * If there are no headings, the whole document is one section.
 */
export function chunkIntoSections(text: string): SectionChunk[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const trimmed = normalized.trim();
  if (!trimmed) {
    return [{ heading: null, content: "" }];
  }

  const lines = normalized.split("\n");
  const sections: SectionChunk[] = [];
  let currentHeading: string | null = null;
  const currentLines: string[] = [];

  const flush = () => {
    const content = currentLines.join("\n").trimEnd();
    if (currentHeading !== null || content.length > 0) {
      sections.push({ heading: currentHeading, content });
    }
    currentLines.length = 0;
  };

  for (const line of lines) {
    const m = /^(#{1,6})\s+(.+)$/.exec(line);
    if (m) {
      flush();
      currentHeading = m[2]!.trim();
    } else {
      currentLines.push(line);
    }
  }
  flush();

  if (sections.length === 0) {
    return [{ heading: null, content: trimmed }];
  }
  return sections;
}
