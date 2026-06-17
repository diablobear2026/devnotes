import type { NoteCategory } from '../types'

const CMD_PREFIXES = /^[$#]\s|^(sudo|git|npm|pnpm|yarn|cd|ls|mkdir|rm|cp|mv|curl|wget|docker|kubectl|ssh|chmod|chown|cat|grep|awk|sed|find|tar|python|node|go|cargo|make)\b/i

const URL_PATTERN = /^https?:\/\/|^\d{1,3}(\.\d{1,3}){3}[:\s]\d+/

const SECRET_PREFIXES = /^(sk-|ghp_|gho_|ghs_|glpat-|xoxb-|xoxp-|Bearer\s|API_KEY\s*=\s*|TOKEN\s*=\s*|PASSWORD\s*=\s*)/i

const ACCOUNT_PREFIXES = /^(账号|账户|用户|用户名|用户账号|系统用户账号|系统账号|登录账号|登录用户)/
const PASSWORD_PREFIXES = /^(密码|系统密码|口令|登录密码)/
const CREDENTIAL_PREFIXES = /^(账号|账户|用户|用户名|用户账号|系统用户账号|系统账号|密码|系统密码|口令|登录密码|登录账号|登录用户)/

// 邮箱或手机号作为账号值（裸值或 "账号: xxx" 后的值）
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+/
const PHONE_PATTERN = /^(\+?\d[\d\s\-()]{6,}\d)/

// 单行内联凭证：同一行内同时包含用户/账号 + 密码关键字
const INLINE_CREDENTIAL = /(用户|账号|账户|用户名)[^]*[:：][^]*(密码|口令|password)[^]*[:：]/i

// 连接上下文描述行：中文 key 描述设备/连接信息，或裸 IP:Port
const CONNECTION_DESCRIPTOR = /^(设备|主机|服务器|登录方式|连接方式|访问方式|节点|地址|协议|端口)/
const IP_PORT_LINE = /^\d{1,3}(\.\d{1,3}){3}[:\s]\d+/

function isConnectionLine(line: string): boolean {
  return CONNECTION_DESCRIPTOR.test(line) || IP_PORT_LINE.test(line)
}

const CONFIG_PATTERN = /^[A-Z_][A-Z0-9_]*\s*=\s*\S|^\w[\w.-]*\s*:\s*\S|^"\w[\w.-]*"\s*:\s*/

const CMD_FLAG_PATTERN = /^[\w./-]+(?:\s+[\w./-]+){0,2}\s+--?[A-Za-z][\w-]*/

const LABEL_SIGNAL = /^([\w.-]+)\s*[:=]/
const WORD_SIGNAL = /^([A-Za-z][\w.-]*)/

export function extractSignal(text: string): string | null {
  const firstLine = text.trim().split('\n')[0] ?? ''
  if (!firstLine) return null
  const labelMatch = LABEL_SIGNAL.exec(firstLine)
  if (labelMatch) return labelMatch[1].toLowerCase()
  const wordMatch = WORD_SIGNAL.exec(firstLine)
  if (wordMatch) return wordMatch[1].toLowerCase()
  return null
}

function shannonEntropy(s: string): number {
  const freq: Record<string, number> = {}
  for (const c of s) freq[c] = (freq[c] ?? 0) + 1
  const len = s.length
  return -Object.values(freq).reduce((sum, f) => {
    const p = f / len
    return sum + p * Math.log2(p)
  }, 0)
}

function looksLikeSecret(text: string): boolean {
  const trimmed = text.trim()
  // CJK text has naturally high entropy — not a token
  if (/[一-鿿]/.test(trimmed)) return false
  // High-entropy ASCII strings with no spaces/slashes/equals/colons (likely bare tokens)
  if (trimmed.length >= 20 && trimmed.length <= 100 && !/[\s/=:：]/.test(trimmed)) {
    return shannonEntropy(trimmed) > 4.5
  }
  return false
}

function isAccountLine(line: string): boolean {
  return ACCOUNT_PREFIXES.test(line) || EMAIL_PATTERN.test(line) || PHONE_PATTERN.test(line)
}

// 将多行内容智能分组：账号+密码配对；连续连接描述行合并
export function groupLines(lines: string[]): string[] {
  const result: string[] = []
  let i = 0
  while (i < lines.length) {
    // 账号行紧跟密码行 → 合并为一条凭证
    if (
      isAccountLine(lines[i]) &&
      i + 1 < lines.length &&
      PASSWORD_PREFIXES.test(lines[i + 1])
    ) {
      result.push(lines[i] + '\n' + lines[i + 1])
      i += 2
      continue
    }
    // 连续连接描述行（设备ip/登录方式/IP:Port 等）→ 合并为一条
    if (isConnectionLine(lines[i])) {
      const block = [lines[i]]
      while (i + 1 < lines.length && isConnectionLine(lines[i + 1])) {
        i++
        block.push(lines[i])
      }
      result.push(block.join('\n'))
      i++
      continue
    }
    result.push(lines[i])
    i++
  }
  return result
}

/** @deprecated use groupLines */
export const pairCredentials = groupLines

export function classify(text: string, learnedRules: Record<string, NoteCategory> = {}): NoteCategory {
  const trimmed = text.trim()
  if (!trimmed) return 'note'

  const signal = extractSignal(trimmed)
  if (signal && learnedRules[signal]) return learnedRules[signal]

  if (CMD_PREFIXES.test(trimmed)) return 'cmd'
  if (URL_PATTERN.test(trimmed)) return 'url'
  if (CREDENTIAL_PREFIXES.test(trimmed)) return 'secret'
  if (INLINE_CREDENTIAL.test(trimmed)) return 'secret'
  if (isAccountLine(trimmed)) return 'secret'
  // High-confidence prefix patterns take priority over config
  if (SECRET_PREFIXES.test(trimmed)) return 'secret'
  if (CONFIG_PATTERN.test(trimmed)) return 'config'
  if (CMD_FLAG_PATTERN.test(trimmed)) return 'cmd'
  // Entropy-based fallback for opaque tokens (after config to avoid false positives)
  if (looksLikeSecret(trimmed)) return 'secret'
  return 'note'
}
