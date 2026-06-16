import type { Note, NoteCategory } from '../../types'
import { NoteCard } from '../NoteCard/NoteCard'

const CATEGORY_ORDER: NoteCategory[] = ['cmd', 'url', 'secret', 'config', 'note']
const CATEGORY_TITLES: Record<NoteCategory, string> = {
  cmd:    '命令',
  url:    '地址 / URL',
  secret: '密钥 / Token',
  config: '配置项',
  note:   '备注',
}

interface Props {
  notes: Note[]
}

export function NoteList({ notes }: Props) {
  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 select-none">
        <p className="text-4xl mb-3">📋</p>
        <p className="text-sm">在下方输入内容，自动归类保存</p>
      </div>
    )
  }

  const grouped = CATEGORY_ORDER.reduce<Record<NoteCategory, Note[]>>(
    (acc, cat) => {
      acc[cat] = notes.filter(n => n.category === cat)
      return acc
    },
    { cmd: [], url: [], secret: [], config: [], note: [] }
  )

  return (
    <div className="flex flex-col gap-5 p-4">
      {CATEGORY_ORDER.filter(cat => grouped[cat].length > 0).map(cat => (
        <section key={cat}>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">
            {CATEGORY_TITLES[cat]}
            <span className="ml-1.5 text-gray-600">({grouped[cat].length})</span>
          </h3>
          <div className="flex flex-col gap-2">
            {grouped[cat].map(note => <NoteCard key={note.id} note={note} />)}
          </div>
        </section>
      ))}
    </div>
  )
}
