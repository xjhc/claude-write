// Minimal, permissive tag extractor. The model output is not guaranteed
// to be valid XML — we just find the first <name>...</name> span.
// Extracted bodies are xmlUnescaped so they invert what we did when building
// the context (&lt; → <, &amp; → &, etc.). Without this, every round-trip
// compounds escape levels in the persisted draft.

export function extractTag(src: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = src.match(re);
  return m ? xmlUnescape(m[1]) : null;
}

export function extractAllTags(
  src: string,
  tag: string,
): { attrs: Record<string, string>; body: string }[] {
  const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, "gi");
  const out: { attrs: Record<string, string>; body: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    out.push({ attrs: parseAttrs(m[1]), body: xmlUnescape(m[2]) });
  }
  return out;
}

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}

// Escape user text so it can be safely embedded inside the XML context
// we hand to the model. We only need to neutralize tag boundaries.
export function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Inverse of xmlEscape. Order matters: &amp; last, so &amp;lt; decodes cleanly
// if an accidental double-escape slipped through.
export function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
