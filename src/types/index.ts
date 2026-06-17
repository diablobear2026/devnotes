export type NoteCategory = 'cmd' | 'url' | 'secret' | 'config' | 'note'

export interface Note {
  id: string
  content: string
  category: NoteCategory
  manualCategory?: boolean  // true 时禁止自动重分类
  createdAt: number
  tabId: string
  projectId: string
}

export interface Tab {
  id: string
  name: string
  projectId: string
  createdAt: number
}

export interface Project {
  id: string
  name: string
  createdAt: number
}

export interface AppState {
  projects: Project[]
  tabs: Tab[]
  notes: Note[]
  activeProjectId: string | null
  activeTabId: string | null
  searchQuery: string
  learnedRules: Record<string, NoteCategory>
}
