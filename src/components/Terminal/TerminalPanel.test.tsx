import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

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

vi.mock('../../lib/terminalSessions', () => ({
  ensureSession: vi.fn(),
  attach: vi.fn(),
  detach: vi.fn(),
  writeToSession: vi.fn(),
  resizeSession: vi.fn(),
  killSession: vi.fn(),
}))

import { ensureSession, killSession } from '../../lib/terminalSessions'
import { TerminalPanel } from './TerminalPanel'
import { useStore } from '../../store/useStore'

class FakeResizeObserver {
  observe = vi.fn()
  disconnect = vi.fn()
}

beforeEach(() => {
  ;(ensureSession as Mock).mockReset()
  ;(ensureSession as Mock).mockResolvedValue({ sessionId: 'session-1' })
  ;(killSession as Mock).mockReset()
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver
})

afterEach(() => {
  cleanup()
})

describe('TerminalPanel', () => {
  it('requests a session for the project and bound directory on mount', async () => {
    render(<TerminalPanel projectId="p1" localPath="/Users/sam/code/demo" />)
    await waitFor(() => {
      expect(ensureSession).toHaveBeenCalledWith('p1', '/Users/sam/code/demo')
    })
  })

  it('does not kill the session on unmount', async () => {
    const { unmount } = render(<TerminalPanel projectId="p1" localPath="/Users/sam/code/demo" />)
    await waitFor(() => expect(ensureSession).toHaveBeenCalled())
    unmount()
    expect(killSession).not.toHaveBeenCalled()
  })

  it('kills the session when the close button is clicked', async () => {
    render(<TerminalPanel projectId="p1" localPath="/Users/sam/code/demo" />)
    await waitFor(() => expect(ensureSession).toHaveBeenCalled())

    fireEvent.click(screen.getByText('关闭终端'))
    expect(killSession).toHaveBeenCalledWith('p1')
  })

  it('shows an error message when the session fails to start', async () => {
    ;(ensureSession as Mock).mockRejectedValue(new Error('cwd 不存在'))
    render(<TerminalPanel projectId="p1" localPath="/deleted/path" />)

    expect(await screen.findByText(/终端启动失败/)).toBeInTheDocument()
    expect(screen.getByText(/cwd 不存在/)).toBeInTheDocument()
  })

  it('returns to the notes view from the error state', async () => {
    ;(ensureSession as Mock).mockRejectedValue(new Error('cwd 不存在'))
    useStore.setState({ mainView: 'terminal' })
    render(<TerminalPanel projectId="p1" localPath="/deleted/path" />)

    fireEvent.click(await screen.findByText('返回笔记，重新绑定目录'))
    expect(useStore.getState().mainView).toBe('notes')
  })
})
