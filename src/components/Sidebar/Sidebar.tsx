import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { useStore } from '../../store/useStore'

export function Sidebar() {
  const projects = useStore(s => s.projects)
  const activeProjectId = useStore(s => s.activeProjectId)
  const createProject = useStore(s => s.createProject)
  const deleteProject = useStore(s => s.deleteProject)
  const setProjectLocalPath = useStore(s => s.setProjectLocalPath)
  const renameProject = useStore(s => s.renameProject)
  const setActiveProject = useStore(s => s.setActiveProject)
  const exportData = useStore(s => s.exportData)
  const importData = useStore(s => s.importData)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  function startRename(id: string, current: string) {
    setEditingId(id)
    setEditName(current)
  }

  function commitRename(id: string) {
    const name = editName.trim()
    if (name) renameProject(id, name)
    setEditingId(null)
  }

  function handleCreate() {
    const name = newName.trim()
    if (name) {
      createProject(name)
      setNewName('')
    }
    setCreating(false)
  }

  async function pickDirectory(projectId: string) {
    const selected = await open({ directory: true, multiple: false })
    if (typeof selected === 'string') {
      setProjectLocalPath(projectId, selected)
    }
  }

  return (
    <aside className="w-52 shrink-0 flex flex-col border-r border-glass-border glass-panel">
      <div className="px-4 py-3 border-b border-glass-border">
        <span className="text-sm font-bold text-white tracking-wide">DevNotes</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {projects.map(project => (
          <div
            key={project.id}
            onClick={() => setActiveProject(project.id)}
            className={`group flex items-center justify-between px-4 py-2 cursor-pointer text-sm transition-colors ${
              project.id === activeProjectId
                ? 'bg-white/10 text-white'
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
            }`}
          >
            {editingId === project.id ? (
              <input
                autoFocus
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={() => commitRename(project.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename(project.id)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                onClick={e => e.stopPropagation()}
                className="flex-1 bg-transparent border-b border-white/30 outline-none text-white text-sm"
              />
            ) : (
              <span
                className="truncate flex-1"
                onDoubleClick={e => { e.stopPropagation(); startRename(project.id, project.name) }}
              >
                {project.name}
              </span>
            )}
            <button
              onClick={e => { e.stopPropagation(); pickDirectory(project.id) }}
              title={project.localPath ?? '绑定本地目录'}
              className="opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:text-gray-200 text-xs transition-opacity shrink-0 mr-1"
            >
              目录
            </button>
            <button
              onClick={e => { e.stopPropagation(); deleteProject(project.id) }}
              className="opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:text-red-400 text-xs transition-opacity shrink-0"
            >
              ×
            </button>
          </div>
        ))}

        {creating ? (
          <div className="px-3 py-1">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onBlur={handleCreate}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') { setCreating(false); setNewName('') }
              }}
              placeholder="项目名称"
              className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-sm text-white placeholder-gray-500 outline-none"
            />
          </div>
        ) : null}
      </nav>

      <div className="p-3 border-t border-glass-border flex flex-col gap-2">
        <button
          onClick={() => setCreating(true)}
          className="w-full py-1.5 text-sm rounded-lg border border-glass-border hover:bg-white/5 text-gray-400 hover:text-gray-200 transition-colors"
        >
          + 新建项目
        </button>
        <div className="flex gap-2">
          <button
            onClick={exportData}
            className="flex-1 py-1.5 text-xs rounded-lg border border-glass-border hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-colors"
            title="导出全部数据为 JSON"
          >
            导出
          </button>
          <label
            className="flex-1 py-1.5 text-xs rounded-lg border border-glass-border hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-colors text-center cursor-pointer"
            title="从 JSON 文件导入"
          >
            导入
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = ev => importData(ev.target?.result as string)
                reader.readAsText(file)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      </div>
    </aside>
  )
}
