import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { AppState, Note, NoteCategory, Project, Tab } from '../types'
import { load, save } from '../storage/storage'
import { classify } from '../lib/classifier'

interface Actions {
  createProject: (name: string) => void
  deleteProject: (id: string) => void
  renameProject: (id: string, name: string) => void
  setActiveProject: (id: string) => void

  setActiveTab: (id: string) => void
  setCategoryFilter: (cat: NoteCategory | null) => void

  addNote: (content: string, category?: NoteCategory) => void
  updateNote: (id: string, content: string, manualCategory?: NoteCategory) => void
  deleteNote: (id: string) => void

  setSearchQuery: (q: string) => void
  exportData: () => void
  importData: (json: string) => void
}

// activeCategoryFilter 是纯内存状态，不持久化
interface MemoryState {
  activeCategoryFilter: NoteCategory | null
}

type Store = AppState & MemoryState & Actions

function persist(state: AppState & Partial<MemoryState>) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { activeCategoryFilter: _acf, ...appState } = state as Store
  save(appState as AppState)
  return state
}

export const useStore = create<Store>((set, get) => {
  const initial = load()

  return {
    ...initial,
    activeCategoryFilter: null,

    createProject(name) {
      const project: Project = { id: uuid(), name, createdAt: Date.now() }
      const tab: Tab = { id: uuid(), name: '默认', projectId: project.id, createdAt: Date.now() }
      set(s => persist({
        ...s,
        projects: [...s.projects, project],
        tabs: [...s.tabs, tab],
        activeProjectId: project.id,
        activeTabId: tab.id,
      }))
    },

    renameProject(id, name) {
      set(s => persist({ ...s, projects: s.projects.map(p => p.id === id ? { ...p, name } : p) }))
    },

    deleteProject(id) {
      const s = get()
      const remaining = s.projects.filter(p => p.id !== id)
      const nextProject = remaining[remaining.length - 1] ?? null
      const remainingTabs = s.tabs.filter(t => t.projectId !== id)
      const nextTab = nextProject
        ? (remainingTabs.find(t => t.projectId === nextProject.id) ?? null)
        : null
      set(persist({
        ...s,
        projects: remaining,
        tabs: remainingTabs,
        notes: s.notes.filter(n => n.projectId !== id),
        activeProjectId: nextProject?.id ?? null,
        activeTabId: nextTab?.id ?? null,
        activeCategoryFilter: null,
      }))
    },

    setActiveProject(id) {
      const s = get()
      const tab = s.tabs.find(t => t.projectId === id) ?? null
      set(persist({ ...s, activeProjectId: id, activeTabId: tab?.id ?? null, activeCategoryFilter: null }))
    },

    setActiveTab(id) {
      set(s => persist({ ...s, activeTabId: id }))
    },

    setCategoryFilter(cat) {
      set(s => ({ ...s, activeCategoryFilter: cat }))
    },

    addNote(content, category) {
      const { activeProjectId, activeTabId } = get()
      if (!activeProjectId || !activeTabId) return
      const note: Note = {
        id: uuid(),
        content,
        category: category ?? classify(content),
        createdAt: Date.now(),
        tabId: activeTabId,
        projectId: activeProjectId,
      }
      set(s => persist({ ...s, notes: [...s.notes, note] }))
    },

    updateNote(id, content, manualCategory) {
      set(s => persist({
        ...s,
        notes: s.notes.map(n => {
          if (n.id !== id) return n
          // 手工分类：锁定类别，不再自动分类
          if (manualCategory !== undefined) {
            return { ...n, content, category: manualCategory, manualCategory: true }
          }
          // 内容变更：若已手工分类则保持类别，否则自动重分类
          const category = n.manualCategory ? n.category : classify(content)
          return { ...n, content, category }
        }),
      }))
    },

    deleteNote(id) {
      set(s => persist({ ...s, notes: s.notes.filter(n => n.id !== id) }))
    },

    setSearchQuery(q) {
      set(s => ({ ...s, searchQuery: q }))
    },

    exportData() {
      const s = get()
      const data = { projects: s.projects, tabs: s.tabs, notes: s.notes }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `devnotes-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    },

    importData(json) {
      try {
        const data = JSON.parse(json)
        if (!Array.isArray(data.projects) || !Array.isArray(data.notes)) return
        const firstProject = data.projects[0] ?? null
        const firstTab = data.tabs?.find((t: Tab) => t.projectId === firstProject?.id) ?? null
        const next: AppState = {
          projects: data.projects,
          tabs: data.tabs ?? [],
          notes: data.notes,
          activeProjectId: firstProject?.id ?? null,
          activeTabId: firstTab?.id ?? null,
          searchQuery: '',
        }
        set(persist({ ...next, activeCategoryFilter: null } as AppState))
      } catch {
        // 静默忽略格式错误
      }
    },
  }
})
