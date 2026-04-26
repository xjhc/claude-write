import path from "node:path";

import type { Project } from "../state/project.js";
import {
  describeMarkdownFile,
  walkProjectFiles,
} from "./tools.js";
import { xmlEscape } from "../util/xml.js";

// Build the user message injected at the start of each pass.
// First pass includes <task>; every pass includes the current filesystem map.
export function buildPerPassMessage(
  project: Project,
  isFirstPass: boolean,
): string {
  const parts: string[] = [];

  if (isFirstPass) {
    parts.push(`<task>\n${xmlEscape(project.meta.task)}\n</task>`);
  }

  const filesBlock = buildFilesystemBlock(project.root);
  parts.push(filesBlock);

  return parts.join("\n\n");
}

function buildFilesystemBlock(projectRoot: string): string {
  const rawFiles = walkProjectFiles(projectRoot);
  const entries = rawFiles.map((f) => {
    if (!f.path.toLowerCase().endsWith(".md")) {
      return renderFileEntry({ path: f.path, bytes: f.bytes });
    }
    const abs = path.join(projectRoot, f.path);
    return renderFileEntry({ path: f.path, bytes: f.bytes, markdown: describeMarkdownFile(abs) });
  });
  const body = entries.length ? entries.join("\n") : "  <!-- project is empty -->";
  return `<filesystem>\n${body}\n</filesystem>`;
}

interface FileEntry {
  path: string;
  bytes: number;
  markdown?: ReturnType<typeof describeMarkdownFile>;
}

function renderFileEntry(f: FileEntry): string {
  const pathAttr = `path="${xmlEscape(f.path)}"`;
  if (!f.markdown) {
    return `  <file ${pathAttr} bytes="${f.bytes}" />`;
  }
  const { words, lines, headings, headingsTotal } = f.markdown;
  const omitted = headingsTotal - headings.length;
  let attrs = `${pathAttr} bytes="${f.bytes}" words="${words}" lines="${lines}" headings="${headingsTotal}"`;
  if (omitted > 0) {
    attrs += ` headings_shown="${headings.length}" headings_omitted="${omitted}"`;
  }
  if (headings.length === 0) {
    return `  <file ${attrs} />`;
  }
  const headingLines = headings
    .map((h) => `    <heading line="${h.line}" level="${h.level}">${xmlEscape(h.text)}</heading>`)
    .join("\n");
  return `  <file ${attrs}>\n${headingLines}\n  </file>`;
}
