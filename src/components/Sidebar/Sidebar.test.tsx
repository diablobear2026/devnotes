import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { useStore } from '../../store/useStore'
import { Sidebar } from './Sidebar'

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}))

import { open } from '@tauri-apps/plugin-dialog'

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

describe('Sidebar directory binding', () => {
  beforeEach(() => {
    resetStore()
    ;(open as Mock).mockReset()
  })

  it('binds a directory to a project when one is selected', async () => {
    ;(open as Mock).mockResolvedValue('/Users/sam/code/demo')
    useStore.getState().createProject('测试项目')
    render(<Sidebar />)

    fireEvent.click(screen.getByTitle('绑定本地目录'))

    await waitFor(() => {
      expect(useStore.getState().projects[0].localPath).toBe('/Users/sam/code/demo')
    })
  })

  it('does nothing when the directory picker is cancelled', async () => {
    ;(open as Mock).mockResolvedValue(null)
    useStore.getState().createProject('测试项目')
    render(<Sidebar />)

    fireEvent.click(screen.getByTitle('绑定本地目录'))

    await waitFor(() => expect(open).toHaveBeenCalled())
    expect(useStore.getState().projects[0].localPath).toBeUndefined()
  })
})
