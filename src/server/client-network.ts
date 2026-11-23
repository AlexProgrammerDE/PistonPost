const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/u
const HEXTET_PATTERN = /^[\da-f]{1,4}$/u

function parseIpv4(address: string) {
  if (!IPV4_PATTERN.test(address)) return null
  const octets = address.split(".").map(Number)
  return octets.every((octet) => octet <= 255) ? octets : null
}

function splitHextets(part: string) {
  return part === "" ? [] : part.split(":")
}

function expandIpv6(address: string) {
  const [head = "", tail, ...rest] = address.toLowerCase().split("::")
  if (rest.length > 0) return null
  const headParts = splitHextets(head)
  const tailParts = tail === undefined ? [] : splitHextets(tail)
  const parts = [...headParts, ...tailParts]

  const last = parts.at(-1)
  const embeddedIpv4 = last?.includes(".") ? parseIpv4(last) : null
  if (last?.includes(".") && !embeddedIpv4) return null
  const hextets = embeddedIpv4 ? parts.slice(0, -1) : parts
  if (!hextets.every((part) => HEXTET_PATTERN.test(part))) return null

  const values = hextets.map((part) => Number.parseInt(part, 16))
  if (embeddedIpv4) {
    const [a = 0, b = 0, c = 0, d = 0] = embeddedIpv4
    values.push(a * 256 + b, c * 256 + d)
  }
  if (tail === undefined) return values.length === 8 ? values : null
  const missing = 8 - values.length
  if (missing < 1) return null
  const headCount = headParts.length
  return [
    ...values.slice(0, headCount),
    ...Array.from({ length: missing }, () => 0),
    ...values.slice(headCount),
  ]
}

/**
 * One subscriber usually controls a whole IPv6 /64, so per-address limits would let a client
 * rotate addresses to get a fresh budget each time. IPv4 keeps the full address, and
 * IPv4-mapped IPv6 collapses to the IPv4 address it carries. Unparseable input is returned as is.
 */
export function clientNetworkKey(address: string) {
  if (parseIpv4(address)) return address
  const hextets = address.includes(":") ? expandIpv6(address.split("%", 1)[0] ?? "") : null
  if (!hextets) return address

  const isIpv4Mapped = hextets.slice(0, 5).every((value) => value === 0) && hextets[5] === 0xff_ff
  if (isIpv4Mapped) {
    const [high = 0, low = 0] = hextets.slice(6)
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".")
  }

  return `${hextets
    .slice(0, 4)
    .map((value) => value.toString(16))
    .join(":")}::/64`
}
