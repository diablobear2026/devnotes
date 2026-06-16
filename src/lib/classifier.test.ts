import { describe, it, expect } from 'vitest'
import { classify } from './classifier'

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
