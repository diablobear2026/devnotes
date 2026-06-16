import type { AppState } from '../types'

const KEY = 'devnotes_state'

const EMPTY: AppState = {
  projects: [],
  tabs: [],
  notes: [],
  activeProjectId: null,
  activeTabId: null,
  searchQuery: '',
}

export function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    return { ...EMPTY, ...JSON.parse(raw) }
  } catch {
    return EMPTY
  }
}

export function save(state: AppState): void {
  const { searchQuery: _sq, ...persisted } = state
  localStorage.setItem(KEY, JSON.stringify(persisted))
}
