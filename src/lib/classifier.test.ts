import { describe, it, expect } from 'vitest'
import { classify, extractSignal } from './classifier'

describe('classify', () => {
  it('identifies shell commands', () => {
    expect(classify('$ git push origin main')).toBe('cmd')
    expect(classify('sudo apt-get install vim')).toBe('cmd')
    expect(classify('docker run -d nginx')).toBe('cmd')
    expect(classify('npm install react')).toBe('cmd')
  })

  it('identifies URLs', () => {
    expect(classify('https://api.example.com/v1')).toBe('url')
    expect(classify('http://localhost:3000')).toBe('url')
    expect(classify('192.168.1.1:8080')).toBe('url')
  })

  it('identifies secrets', () => {
    expect(classify('sk-proj-abcdefghijklmnopqrstuvwxyz123456')).toBe('secret')
    expect(classify('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345')).toBe('secret')
    expect(classify('Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig')).toBe('secret')
    // 中文凭证前缀
    expect(classify('账号user231')).toBe('secret')
    expect(classify('密码U927DpE0aT')).toBe('secret')
    expect(classify('用户：Root')).toBe('secret')
    // 单行内联用户名+密码
    expect(classify('用户：Root 密码：0aebcbfe')).toBe('secret')
    expect(classify('用户名：admin 密码：123456')).toBe('secret')
  })

  it('identifies config', () => {
    expect(classify('DATABASE_URL=postgres://localhost/mydb')).toBe('config')
    expect(classify('PORT: 3000')).toBe('config')
  })

  it('falls back to note', () => {
    expect(classify('这是一条普通备注')).toBe('note')
    expect(classify('Hello world')).toBe('note')
    expect(classify('')).toBe('note')
  })
})

describe('cmd flag detection', () => {
  it('identifies unknown CLI tools by their flag pattern', () => {
    expect(classify('claude --resume 4338966a-ba3f-4dfd-9aca-9ac59d08d736')).toBe('cmd')
    expect(classify('vercel --prod')).toBe('cmd')
    expect(classify('gh pr create --title "fix bug"')).toBe('cmd')
  })
})

describe('extractSignal', () => {
  it('extracts the leading word for bare command-like lines', () => {
    expect(extractSignal('claude --resume xxx')).toBe('claude')
  })

  it('extracts the key for label-style lines', () => {
    expect(extractSignal('Skills: /gen-sprite')).toBe('skills')
    expect(extractSignal('PORT=3000')).toBe('port')
  })

  it('returns null for CJK or empty content', () => {
    expect(extractSignal('这是一条普通备注')).toBeNull()
    expect(extractSignal('')).toBeNull()
  })
})

describe('learnedRules override', () => {
  it('lets a learned rule override the default classification', () => {
    expect(classify('claude --resume xxx', { claude: 'note' })).toBe('note')
    expect(classify('Skills: /gen-sprite', { skills: 'cmd' })).toBe('cmd')
  })

  it('falls back to normal rules when there is no matching learned rule', () => {
    expect(classify('Skills: /gen-sprite', { other: 'cmd' })).toBe('config')
  })
})
