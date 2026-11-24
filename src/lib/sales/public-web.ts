import { lookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP } from 'node:net'

const restricted = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['192.88.99.0', 24], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
] as const) restricted.addSubnet(address, prefix, 'ipv4')
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]] as const) {
  restricted.addSubnet(address, prefix, 'ipv6')
}
const globalV6 = new BlockList()
globalV6.addSubnet('2000::', 3, 'ipv6')

export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return !restricted.check(address, 'ipv4')
  return family === 6 && globalV6.check(address, 'ipv6') && !restricted.check(address, 'ipv6')
}

export const PUBLIC_WEB_TIMEOUT_MS = 8000
const MAX_BYTES = 1_500_000
const MAX_REDIRECTS = 4
type Reply = { location: string } | { text: string } | null

/** Resolve and pin each hop. The original hostname remains available for TLS. */
export async function readPublicWeb(input: string, accept: string, userAgent: string): Promise<string | null> {
  try {
    const signal = AbortSignal.timeout(PUBLIC_WEB_TIMEOUT_MS)
    let url = new URL(input)
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      signal.throwIfAborted()
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null
      const host = url.hostname.replace(/^\[|\]$/g, '')
      const answers = await lookup(host, { all: true })
      signal.throwIfAborted()
      const address = answers.find((answer) => isPublicAddress(answer.address))
      if (!address) return null

      const reply: Reply = await new Promise<Reply>((resolve, reject) => {
        const request = url.protocol === 'https:' ? httpsRequest : httpRequest
        const outgoing = request(url, {
          agent: false, family: address.family, signal,
          lookup: (_host, _options, callback) => callback(null, address.address, address.family),
          headers: { 'User-Agent': userAgent, Accept: accept, 'Accept-Encoding': 'identity' },
        }, (response) => {
          response.on('error', reject)
          const status = response.statusCode ?? 0
          if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
            resolve({ location: response.headers.location })
            response.destroy()
            return
          }

          const type = response.headers['content-type'] ?? ''
          if (status < 200 || status >= 300 || !type.includes(accept) ||
              Number(response.headers['content-length'] ?? 0) > MAX_BYTES) {
            resolve(null)
            response.destroy()
            return
          }

          const chunks: Buffer[] = []
          let size = 0
          response.on('data', (chunk: Buffer) => {
            size += chunk.length
            if (size > MAX_BYTES) {
              resolve(null)
              response.destroy()
            } else chunks.push(chunk)
          })
          response.on('end', () => resolve({ text: Buffer.concat(chunks).toString('utf8') }))
        })
        outgoing.on('error', reject)
        outgoing.end()
      })
      if (!reply) return null
      if ('text' in reply) return reply.text
      url = new URL(reply.location, url)
    }
    return null
  } catch {
    return null
  }
}
