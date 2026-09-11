export function esc(str) {
  if (str === null || str === undefined) return '';
  const stringified = String(str);
  if (typeof DOMPurify !== 'undefined') {
    return DOMPurify.sanitize(stringified);
  }
  return stringified.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
