/**
 * Turn a human name/label into a kebab-case id slug.
 *
 * `"King of the Field Mice"` → `"king-of-the-field-mice"` (all words kept).
 * Diacritics are folded (`"São Paulo"` → `"sao-paulo"`) so ids stay ASCII.
 * Returns `""` for input with no usable characters — callers should fall back
 * to a stable default (e.g. the current id) in that case.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD") // split accented letters into base + combining mark
    .replace(/[̀-ͯ]/g, "") // drop the combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // any run of non-alphanumerics → one hyphen
    .replace(/^-+|-+$/g, ""); // trim leading / trailing hyphens
}
