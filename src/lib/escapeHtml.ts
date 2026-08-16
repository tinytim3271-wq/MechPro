/**
 * Escapes HTML special characters so untrusted strings can be interpolated
 * into HTML documents (e.g. print popups) without executing markup.
 */
export function escapeHtml(text: string | number | undefined | null): string {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
