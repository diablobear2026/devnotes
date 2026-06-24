import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useStore } from './store/useStore'
import App from './App'

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

function resetStore() {
  localStorage.clear()
  useStore.setState({
    projects: [],
    tabs: [],
    notes: [],
    activeProjectId: null,
    activeTabId: null,
    searchQuery: '',
    learnedRules: {},
    activeCategoryFilter: null,
    mainView: 'notes',
  })
}

afterEach(() => {
  cleanup()
})

describe('App terminal view switching', () => {
  beforeEach(() => {
    resetStore()
    useStore.getState().createProject('测试项目')
    ;(invoke as Mock).mockReset()
    ;(invoke as Mock).mockResolvedValue('session-1')
    ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe = vi.fn()
      disconnect = vi.fn()
    }
  })

  it('disables the terminal button when the project has no bound directory', () => {
    render(<App />)
    expect(screen.getByText('终端')).toBeDisabled()
  })

  it('switches to the terminal panel and back when the project has a bound directory', () => {
    const projectId = useStore.getState().projects[0].id
    useStore.getState().setProjectLocalPath(projectId, '/Users/sam/code/demo')
    render(<App />)

    fireEvent.click(screen.getByText('终端'))
    expect(screen.queryByText('已学习的分类规则')).toBeInTheDocument()
    expect(screen.getByText('返回笔记')).toBeInTheDocument()

    fireEvent.click(screen.getByText('返回笔记'))
    expect(screen.getByText('终端')).toBeInTheDocument()
  })
})
