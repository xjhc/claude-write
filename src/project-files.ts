export const MANUSCRIPT_FILE = "manuscript.md";
export const MEMORY_FILE = "memory.md";

export const PROJECT_FILES = [MANUSCRIPT_FILE, MEMORY_FILE] as const;

export function isProjectFile(path: string): boolean {
  return PROJECT_FILES.includes(path as (typeof PROJECT_FILES)[number]);
}
