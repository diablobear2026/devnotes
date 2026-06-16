import { useRef, useState } from 'react'
import type { Note, NoteCategory } from '../../types'
import { useStore } from '../../store/useStore'

const CATEGORY_STYLES: Record<NoteCategory, { label: string; cls: string }> = {
  cmd:    { label: 'CMD',    cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  url:    { label: 'URL',    cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  secret: { label: '凭证',   cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
  config: { label: 'CONFIG', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  note:   { label: 'NOTE',   cls: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
}

const ALL_CATEGORIES: NoteCategory[] = ['cmd', 'url', 'secret', 'config', 'note']

interface Props {
  note: Note
}

export function NoteCard({ note }: Props) {
  const deleteNote = useStore(s => s.deleteNote)
  const updateNote = useStore(s => s.updateNote)
  const searchQuery = useStore(s => s.searchQuery)
  const projects = useStore(s => s.projects)

  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(note.content)
  const [editCategory, setEditCategory] = useState<NoteCategory>(note.category)
  // 编辑过程中是否手工改过类别
  const categoryChangedRef = useRef(false)

  const style = CATEGORY_STYLES[note.category]

  const projectName = searchQuery
    ? projects.find(p => p.id === note.projectId)?.name
    : undefined

  function handleCopy() {
    navigator.clipboard.writeText(note.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function handleEditOpen() {
    setEditContent(note.content)
    setEditCategory(note.category)
    categoryChangedRef.current = false
    setEditing(true)
  }

  function handleEditCancel() {
    setEditing(false)
  }

  function handleEditSave() {
    if (categoryChangedRef.current) {
      // 手工改了类别 → 锁定
      updateNote(note.id, editContent, editCategory)
    } else {
      // 只改了内容 → 自动重分类（若已手工锁定则保持）
      updateNote(note.id, editContent)
    }
    setEditing(false)
  }

  function handleCategoryChange(cat: NoteCategory) {
    setEditCategory(cat)
    categoryChangedRef.current = true
  }

  if (editing) {
    return (
      <div className="glass-card p-3 rounded-lg border border-white/20">
        {/* 类别选择器 */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] text-gray-400">分类：</span>
          <div className="flex gap-1 flex-wrap">
            {ALL_CATEGORIES.map(cat => {
              const s = CATEGORY_STYLES[cat]
              const active = editCategory === cat
              return (
                <button
                  key={cat}
                  onClick={() => handleCategoryChange(cat)}
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-all ${s.cls} ${
                    active ? 'ring-1 ring-white/40 scale-105' : 'opacity-50 hover:opacity-80'
                  }`}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
          {(note.manualCategory || categoryChangedRef.current) && (
            <span className="text-[10px] text-gray-500 ml-auto">手动</span>
          )}
        </div>

        {/* 内容编辑框 */}
        <textarea
          className="w-full min-h-[80px] bg-black/30 border border-white/10 rounded px-2 py-1.5 text-sm text-gray-200 font-mono resize-y focus:outline-none focus:border-white/30"
          value={editContent}
          onChange={e => setEditContent(e.target.value)}
          autoFocus
        />

        {/* 操作按钮 */}
        <div className="flex justify-end gap-1 mt-2">
          <button
            onClick={handleEditCancel}
            className="text-xs px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-gray-300 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleEditSave}
            disabled={editContent.trim() === ''}
            className="text-xs px-2 py-0.5 rounded bg-blue-500/40 hover:bg-blue-500/60 text-blue-200 disabled:opacity-40 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group relative glass-card p-3 rounded-lg border border-glass-border hover:border-white/15 transition-colors">
      <div className="flex items-start gap-2">
        <div className="flex items-center gap-1 shrink-0">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${style.cls}`}>
            {style.label}
          </span>
          {note.manualCategory && (
            <span className="text-[10px] text-gray-600" title="手动分类">🔒</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {projectName && (
            <span className="inline-block text-[10px] text-gray-500 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 mb-1.5">
              {projectName}
            </span>
          )}
          <pre className="text-sm text-gray-200 whitespace-pre-wrap break-all font-mono leading-relaxed">
            {note.content}
          </pre>
        </div>
      </div>
      <div className="absolute top-2 right-2 flex gap-1">
        <button
          onClick={handleCopy}
          className="text-xs px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-gray-300 transition-colors"
        >
          {copied ? '已复制' : '复制'}
        </button>
        <button
          onClick={handleEditOpen}
          className="text-xs px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-gray-300 transition-colors"
        >
          编辑
        </button>
        <button
          onClick={() => deleteNote(note.id)}
          className="text-xs px-2 py-0.5 rounded bg-white/10 hover:bg-red-500/40 text-gray-300 hover:text-red-300 transition-colors"
        >
          删除
        </button>
      </div>
    </div>
  )
}
