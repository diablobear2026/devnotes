import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

vi.mock('@xterm/xterm', () => {
  class FakeTerminal {
    cols = 80
    rows = 24
    loadAddon = vi.fn()
    open = vi.fn()
    write = vi.fn()
    dispose = vi.fn()
    onData = vi.fn(() => ({ dispose: vi.fn() }))
  }
  return { Terminal: FakeTerminal }
})

vi.mock('@xterm/addon-fit', () => {
  class FakeFitAddon {
    fit = vi.fn()
  }
  return { FitAddon: FakeFitAddon }
})

vi.mock('@tauri-apps/api/core', () => {
  class FakeChannel {
    onmessage: ((data: string) => void) | null = null
  }
  return { invoke: vi.fn(), Channel: FakeChannel }
})

import { invoke } from '@tauri-apps/api/core'
import { TerminalPanel } from './TerminalPanel'

class FakeResizeObserver {
  observe = vi.fn()
  disconnect = vi.fn()
}

beforeEach(() => {
  ;(invoke as Mock).mockReset()
  ;(invoke as Mock).mockResolvedValue('session-1')
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver
})

afterEach(() => {
  cleanup()
})

describe('TerminalPanel', () => {
  it('spawns a pty session for the bound directory on mount', async () => {
    render(<TerminalPanel projectId="p1" localPath="/Users/sam/code/demo" />)
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('pty_spawn', expect.objectContaining({ cwd: '/Users/sam/code/demo' }))
    })
  })

  it('kills the session on unmount', async () => {
    const { unmount } = render(<TerminalPanel projectId="p1" localPath="/Users/sam/code/demo" />)
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('pty_spawn', expect.anything()))
    unmount()
    expect(invoke).toHaveBeenCalledWith('pty_kill', { sessionId: 'session-1' })
  })
})
