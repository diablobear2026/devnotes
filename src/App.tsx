import { useStore } from './store/useStore'
import { Sidebar } from './components/Sidebar/Sidebar'
import { TabBar } from './components/TabBar/TabBar'
import { Editor } from './components/Editor/Editor'
import { NoteList } from './components/NoteList/NoteList'
import { SearchBar } from './components/SearchBar/SearchBar'
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
        </header>
        <TabBar />
        <div className="flex-1 overflow-y-auto">
          <NoteList notes={visibleNotes} />
        </div>
        {!activeCategoryFilter && <Editor />}
      </div>
    </div>
  )
}
