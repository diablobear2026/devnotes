import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useStore } from '../../store/useStore'
import { Editor } from './Editor'

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

afterEach(() => {
  cleanup()
})

describe('Editor', () => {
  beforeEach(() => {
    resetStore()
    useStore.getState().createProject('测试项目')
  })

  it('applies a learned rule when submitting a single-line note', () => {
    useStore.setState({ learnedRules: { skills: 'note' } })
    render(<Editor />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Skills: /another-skill' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    const notes = useStore.getState().notes
    expect(notes).toHaveLength(1)
    expect(notes[0].category).toBe('note')
  })

  it('falls back to plain regex classification when there is no learned rule', () => {
    render(<Editor />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Skills: /gen-sprite' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    const notes = useStore.getState().notes
    expect(notes).toHaveLength(1)
    expect(notes[0].category).toBe('config')
  })
})
