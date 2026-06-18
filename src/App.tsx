import { useState } from 'react'
import { useStore } from './store/useStore'
import { Sidebar } from './components/Sidebar/Sidebar'
import { TabBar } from './components/TabBar/TabBar'
import { Editor } from './components/Editor/Editor'
import { NoteList } from './components/NoteList/NoteList'
import { SearchBar } from './components/SearchBar/SearchBar'
import { LearnedRulesPanel } from './components/LearnedRules/LearnedRulesPanel'
import type { Note } from './types'

function matchesSearch(note: Note, q: string): boolean {
  if (!q) return true
  return note.content.toLowerCase().includes(q.toLowerCase())
}

export default function App() {
  const notes = useStore(s => s.notes)
  const activeProjectId = useStore(s => s.activeProjectId)
  const activeCategoryFilter = useStore(s => s.activeCategoryFilter)
  const searchQuery = useStore(s => s.searchQuery)
  const [showLearnedRules, setShowLearnedRules] = useState(false)

  const projectNotes = notes.filter(n => n.projectId === activeProjectId)

  const visibleNotes = searchQuery
    ? notes.filter(n => matchesSearch(n, searchQuery))
    : activeCategoryFilter
      ? projectNotes.filter(n => n.category === activeCategoryFilter)
      : projectNotes

  return (
    <div className="h-full flex dark">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-3 px-4 py-2 border-b border-glass-border">
          <div className="flex-1">
            <SearchBar />
          </div>
          <button
            onClick={() => setShowLearnedRules(true)}
            className="shrink-0 text-xs text-indigo-300 hover:text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap"
          >
            已学习的分类规则
          </button>
        </header>
        <TabBar />
        <div className="flex-1 overflow-y-auto">
          <NoteList notes={visibleNotes} />
        </div>
        {!activeCategoryFilter && <Editor />}
      </div>

      {showLearnedRules && (
        <LearnedRulesPanel onClose={() => setShowLearnedRules(false)} />
      )}
    </div>
  )
}
