import { useStore } from '../../store/useStore'

export function SearchBar() {
  const searchQuery = useStore(s => s.searchQuery)
  const setSearchQuery = useStore(s => s.setSearchQuery)

  return (
    <div className="relative">
      <input
        type="search"
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        placeholder="搜索全部笔记…"
        className="w-full bg-white/5 border border-glass-border focus:border-white/20 rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-white/10 transition-colors"
      />
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs pointer-events-none">
        🔍
      </span>
    </div>
  )
}
