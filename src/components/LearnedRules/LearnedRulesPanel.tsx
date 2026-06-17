import type { NoteCategory } from '../../types'
import { useStore } from '../../store/useStore'

const CATEGORY_LABELS: Record<NoteCategory, string> = {
  cmd: 'CMD',
  url: 'URL',
  secret: '凭证',
  config: 'CONFIG',
  note: 'NOTE',
}

interface Props {
  onClose: () => void
}

export function LearnedRulesPanel({ onClose }: Props) {
  const learnedRules = useStore(s => s.learnedRules)
  const deleteLearnedRule = useStore(s => s.deleteLearnedRule)
  const entries = Object.entries(learnedRules)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="glass-card w-72 max-h-96 overflow-y-auto rounded-lg border border-glass-border p-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-white">已学习的分类规则</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-sm">
            ×
          </button>
        </div>
        {entries.length === 0 ? (
          <p className="text-xs text-gray-500">
            还没有学习到规则。手动修改一条笔记的分类后，这里会记录下来。
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {entries.map(([signal, category]) => (
              <li
                key={signal}
                className="flex items-center justify-between text-xs bg-white/5 border border-white/10 rounded px-2 py-1.5"
              >
                <span className="text-gray-300 font-mono truncate">{signal}</span>
                <span className="text-gray-500">→ {CATEGORY_LABELS[category]}</span>
                <button
                  onClick={() => deleteLearnedRule(signal)}
                  className="text-gray-500 hover:text-red-400 ml-2 shrink-0"
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
