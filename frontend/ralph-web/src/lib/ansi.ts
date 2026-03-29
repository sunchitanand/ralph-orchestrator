/**
 * ANSI color code utilities for log rendering.
 *
 * Uses ansi_up to convert ANSI escape sequences to HTML,
 * and provides a strip function for plain-text clipboard copy.
 */

import { AnsiUp } from "ansi_up";

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

/** Convert ANSI escape codes to HTML spans with inline color styles. */
export function ansiToHtml(text: string): string {
  const au = new AnsiUp();
  au.escape_html = true;
  return au.ansi_to_html(text);
}

/** Strip ANSI escape codes, returning plain text. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "");
}
