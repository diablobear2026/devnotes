import { useStore } from '../../store/useStore'
import type { NoteCategory } from '../../types'

const CATEGORY_LABELS: Record<NoteCategory, string> = {
  cmd:    'CMD',
  url:    'URL',
  secret: '凭证',
  config: '配置',
  note:   '备注',
}

const CATEGORY_ORDER: NoteCategory[] = ['cmd', 'url', 'secret', 'config', 'note']

export function TabBar() {
  const notes = useStore(s => s.notes)
  const activeProjectId = useStore(s => s.activeProjectId)
  const activeCategoryFilter = useStore(s => s.activeCategoryFilter)
  const setCategoryFilter = useStore(s => s.setCategoryFilter)

  const projectNotes = notes.filter(n => n.projectId === activeProjectId)

  // 只显示当前项目中有内容的分类
  const visibleCategories = CATEGORY_ORDER.filter(cat =>
    projectNotes.some(n => n.category === cat)
  )

  const tabCls = (active: boolean) =>
    `px-3 py-1 rounded-md text-sm shrink-0 transition-colors cursor-pointer ${
      active
        ? 'bg-white/10 text-white'
        : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
    }`

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-glass-border overflow-x-auto scrollbar-none">
      <button
        onClick={() => setCategoryFilter(null)}
        className={tabCls(activeCategoryFilter === null)}
      >
        默认
      </button>
      {visibleCategories.map(cat => (
        <button
          key={cat}
          onClick={() => setCategoryFilter(cat)}
          className={tabCls(activeCategoryFilter === cat)}
        >
          {CATEGORY_LABELS[cat]}
          <span className="ml-1 text-[10px] opacity-50">
            {projectNotes.filter(n => n.category === cat).length}
          </span>
        </button>
      ))}
    </div>
  )
}
