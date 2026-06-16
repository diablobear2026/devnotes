import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { groupLines, classify } from '../../lib/classifier'

export function Editor() {
  const addNote = useStore(s => s.addNote)
  const activeTabId = useStore(s => s.activeTabId)
  const [value, setValue] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeTabId) return
    const lines = groupLines(value.split('\n').map(l => l.trim()).filter(Boolean))
    if (!lines.length) return
    const categories = lines.map(l => classify(l))
    const allSame = categories.every(c => c === categories[0])
    if (allSame) {
      addNote(value.trim(), categories[0])
    } else {
      lines.forEach(line => addNote(line))
    }
    setValue('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 border-t border-glass-border">
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={!activeTabId}
        placeholder={activeTabId ? '输入命令、URL、密钥、配置或备注… (Enter 保存，Shift+Enter 换行)' : '请先创建项目'}
        rows={3}
        className="w-full resize-none bg-white/5 border border-glass-border focus:border-white/20 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 font-mono focus:outline-none focus:ring-1 focus:ring-white/10 transition-colors disabled:opacity-40"
      />
      <div className="flex justify-end mt-2">
        <button
          type="submit"
          disabled={!activeTabId || !value.trim()}
          className="px-4 py-1.5 text-sm rounded-lg bg-white/10 hover:bg-white/15 text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          保存
        </button>
      </div>
    </form>
  )
}
