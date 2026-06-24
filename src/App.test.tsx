import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useStore } from './store/useStore'
import App from './App'

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
    expect(screen.getByText(/终端面板/)).toBeInTheDocument()
    expect(screen.queryByText('已学习的分类规则')).toBeInTheDocument()

    fireEvent.click(screen.getByText('返回笔记'))
    expect(screen.queryByText(/终端面板/)).not.toBeInTheDocument()
  })
})
