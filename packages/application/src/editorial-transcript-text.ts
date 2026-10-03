/** Canonical transcript rendering shared by projection and offline evidence validation. */
export function renderTokenText(tokens: readonly string[]): string {
  let output = "";
  for (const token of tokens) {
    const normalized = normalizeStandaloneText(token);
    if (normalized.length === 0) continue;
    output += `${tokenSeparator(output.length > 0, normalized)}${normalized}`;
  }
  return output;
}

export function tokenSeparator(hasText: boolean, normalizedToken: string): "" | " " {
  return !hasText || /^[,.;:!?%\])}]/u.test(normalizedToken) ? "" : " ";
}

export function normalizeStandaloneText(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}
