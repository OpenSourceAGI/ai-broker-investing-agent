/** Choose the closing marker first; a malformed ending never revives an old vote. */
export function parseFinalLine(
  text: string,
  marker: string,
  allowed: readonly string[] | ((value: string) => boolean)
): { value: string | null; reason?: string } {
  const payloads = text
    .split(/\r?\n/)
    .filter(line => line.toUpperCase().includes(marker.toUpperCase()))
    .map(line => {
      const offset = line.toUpperCase().lastIndexOf(marker.toUpperCase()) + marker.length
      return line
        .slice(offset)
        .trim()
        .replace(/[.!]+$/, '')
        .trim()
        .replace(/^[*_`\s]+|[*_`\s]+$/g, '')
        .trim()
    })
  if (!payloads.length) return { value: null, reason: 'missing final marker' }
  const normalize = (value: string) => (Array.isArray(allowed) ? value.toUpperCase() : value)
  const accepts = (value: string) =>
    typeof allowed === 'function' ? allowed(value) : (allowed as readonly string[]).includes(value)
  const last = normalize(payloads.at(-1)!)
  if (!accepts(last)) return { value: null, reason: 'invalid final payload' }
  if (new Set(payloads.map(normalize).filter(accepts)).size > 1)
    return { value: null, reason: 'contradictory marker lines' }
  return { value: last }
}
export const wholeNumberToken = (value: string): boolean =>
  /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
