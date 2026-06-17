import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './useStore'

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
