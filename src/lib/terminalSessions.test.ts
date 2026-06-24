import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

vi.mock('@tauri-apps/api/core', () => {
  class FakeChannel {
    onmessage: ((data: string) => void) | null = null
  }
  return { invoke: vi.fn(), Channel: FakeChannel }
})

import { invoke } from '@tauri-apps/api/core'
import { ensureSession, attach, detach, killSession, hasSession } from './terminalSessions'

beforeEach(() => {
  ;(invoke as Mock).mockReset()
})

describe('terminalSessions', () => {
  it('reuses an existing session for the same project instead of spawning twice', async () => {
    ;(invoke as Mock).mockResolvedValue('session-1')
    const first = await ensureSession('p1', '/tmp')
    const second = await ensureSession('p1', '/tmp')
    expect(first).toBe(second)
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('buffers output received while detached and flushes it on attach', async () => {
    ;(invoke as Mock).mockResolvedValue('session-1')
    const session = await ensureSession('p2', '/tmp')
    session.channel.onmessage?.('hello ')
    session.channel.onmessage?.('world')

    const received: string[] = []
    attach('p2', chunk => received.push(chunk))
    expect(received).toEqual(['hello world'])
  })

  it('delivers output live to the attached listener', async () => {
    ;(invoke as Mock).mockResolvedValue('session-1')
    const session = await ensureSession('p3', '/tmp')
    const received: string[] = []
    attach('p3', chunk => received.push(chunk))

    session.channel.onmessage?.('live-chunk')
    expect(received).toEqual(['live-chunk'])
  })

  it('removes the session and kills the pty process', async () => {
    ;(invoke as Mock).mockResolvedValue('session-1')
    await ensureSession('p4', '/tmp')
    expect(hasSession('p4')).toBe(true)

    killSession('p4')
    expect(hasSession('p4')).toBe(false)
    expect(invoke).toHaveBeenCalledWith('pty_kill', { sessionId: 'session-1' })
  })

  it('detach stops delivering output to the previous listener', async () => {
    ;(invoke as Mock).mockResolvedValue('session-1')
    const session = await ensureSession('p5', '/tmp')
    const received: string[] = []
    attach('p5', chunk => received.push(chunk))
    detach('p5')

    session.channel.onmessage?.('after-detach')
    expect(received).toEqual([])
  })
})
