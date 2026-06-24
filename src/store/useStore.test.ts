import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { useStore } from './useStore'

vi.mock('@tauri-apps/api/core', () => {
  class FakeChannel {
    onmessage: ((data: string) => void) | null = null
  }
  return { invoke: vi.fn(), Channel: FakeChannel }
})

import { invoke } from '@tauri-apps/api/core'
import { ensureSession, hasSession } from '../lib/terminalSessions'

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

describe('learned rules', () => {
  beforeEach(() => {
    resetStore()
    useStore.getState().createProject('测试项目')
  })

  it('learns a signal when a note category is manually corrected, and applies it to future notes', () => {
    useStore.getState().addNote('Skills: /gen-sprite')
    const first = useStore.getState().notes[0]
    expect(first.category).toBe('config')

    useStore.getState().updateNote(first.id, first.content, 'note')
    expect(useStore.getState().learnedRules.skills).toBe('note')

    useStore.getState().addNote('Skills: /another-skill')
    const second = useStore.getState().notes[1]
    expect(second.category).toBe('note')
  })

  it('removes a learned rule via deleteLearnedRule', () => {
    useStore.getState().addNote('Skills: /gen-sprite')
    const note = useStore.getState().notes[0]
    useStore.getState().updateNote(note.id, note.content, 'note')
    expect(useStore.getState().learnedRules.skills).toBe('note')

    useStore.getState().deleteLearnedRule('skills')
    expect(useStore.getState().learnedRules.skills).toBeUndefined()
  })
})

describe('project local path', () => {
  beforeEach(() => {
    resetStore()
  })

  it('binds a local directory path to a project', () => {
    useStore.getState().createProject('测试项目')
    const project = useStore.getState().projects[0]
    expect(project.localPath).toBeUndefined()

    useStore.getState().setProjectLocalPath(project.id, '/Users/sam/code/demo')
    expect(useStore.getState().projects[0].localPath).toBe('/Users/sam/code/demo')
  })
})

describe('main view', () => {
  beforeEach(() => {
    resetStore()
  })

  it('defaults to notes view and can switch to terminal view', () => {
    useStore.getState().createProject('测试项目')
    expect(useStore.getState().mainView).toBe('notes')

    useStore.getState().setMainView('terminal')
    expect(useStore.getState().mainView).toBe('terminal')
  })

  it('resets to notes view when switching active project', () => {
    useStore.getState().createProject('项目A')
    const projectA = useStore.getState().projects[0]
    useStore.getState().createProject('项目B')
    useStore.getState().setMainView('terminal')

    useStore.getState().setActiveProject(projectA.id)
    expect(useStore.getState().mainView).toBe('notes')
  })
})

describe('project deletion cleans up terminal sessions', () => {
  beforeEach(() => {
    resetStore()
    ;(invoke as Mock).mockReset()
    ;(invoke as Mock).mockResolvedValue('session-1')
  })

  it('kills the running terminal session when its project is deleted', async () => {
    useStore.getState().createProject('测试项目')
    const project = useStore.getState().projects[0]
    await ensureSession(project.id, '/tmp')
    expect(hasSession(project.id)).toBe(true)

    useStore.getState().deleteProject(project.id)

    expect(hasSession(project.id)).toBe(false)
    expect(invoke).toHaveBeenCalledWith('pty_kill', { sessionId: 'session-1' })
  })
})
