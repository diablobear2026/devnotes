import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TerminalPanel } from './TerminalPanel'

describe('TerminalPanel placeholder', () => {
  it('renders the bound directory path', () => {
    render(<TerminalPanel projectId="p1" localPath="/Users/sam/code/demo" />)
    expect(screen.getByText(/终端面板/)).toBeInTheDocument()
    expect(screen.getByText(/\/Users\/sam\/code\/demo/)).toBeInTheDocument()
  })
})
