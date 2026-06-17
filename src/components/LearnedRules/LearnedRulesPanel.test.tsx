import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useStore } from '../../store/useStore'
import { LearnedRulesPanel } from './LearnedRulesPanel'

afterEach(() => {
  cleanup()
})

describe('LearnedRulesPanel', () => {
  beforeEach(() => {
    useStore.setState({ learnedRules: {} })
  })

  it('shows an empty state when there are no learned rules', () => {
    render(<LearnedRulesPanel onClose={() => {}} />)
    expect(
      screen.getByText('还没有学习到规则。手动修改一条笔记的分类后，这里会记录下来。')
    ).toBeInTheDocument()
  })

  it('lists learned rules and deletes one on click', () => {
    useStore.setState({ learnedRules: { claude: 'cmd', skills: 'note' } })
    render(<LearnedRulesPanel onClose={() => {}} />)

    expect(screen.getByText('claude')).toBeInTheDocument()
    expect(screen.getByText('skills')).toBeInTheDocument()

    fireEvent.click(screen.getAllByText('删除')[0])
    expect(useStore.getState().learnedRules.claude).toBeUndefined()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<LearnedRulesPanel onClose={onClose} />)
    fireEvent.click(screen.getByText('×'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
