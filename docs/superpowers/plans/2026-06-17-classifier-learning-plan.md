# 分类引擎升级（规则增强 + 学习机制）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 DevNotes 的自动分类既能识别未知 CLI 工具（如 `claude --resume xxx`），又能从用户的手动纠正中学习，避免对 `Skills: /gen-sprite` 这类自然语言标签的误判，并提供一个可查看/删除已学规则的小面板。

**Architecture:** `classifier.ts` 新增一条基于命令行 flag 特征的通用 cmd 识别规则，并在分类管线最前面插入一层"已学规则"短路检查。`useStore.ts` 在用户手动改分类时把"信号 → 分类"写入全局 `learnedRules` 状态并随其它数据持久化。新增一个独立的 `LearnedRulesPanel` 组件，挂在侧边栏标题旁的图标入口下，用于查看和删除已学规则。

**Tech Stack:** React 18 + TypeScript + Zustand + Vitest + @testing-library/react（已是项目现有依赖，本计划不引入新依赖）

## Global Constraints

- 不引入 LLM 或任何网络请求参与分类
- 不支持图片/附件
- 不修改 `CONFIG_PATTERN` 现有正则本身——`Skills:` 类歧义完全交给学习机制解决
- `learnedRules` 全局生效，不按项目隔离
- 已学规则只支持删除，不支持编辑
- 信号提取统一转小写存储和匹配

---

### Task 1: classifier.ts — cmd flag 识别 + 信号提取 + 学习规则短路

**Files:**
- Modify: `src/lib/classifier.ts`
- Test: `src/lib/classifier.test.ts`

**Interfaces:**
- Consumes: `NoteCategory` type from `../types`（已存在，无需改动）
- Produces:
  - `export function extractSignal(text: string): string | null`
  - `export function classify(text: string, learnedRules: Record<string, NoteCategory> = {}): NoteCategory`（在原有基础上新增第二个可选参数）

- [ ] **Step 1: 在 `classifier.test.ts` 末尾追加失败的测试**

在 `src/lib/classifier.test.ts` 文件末尾（`describe('classify', ...)` 闭合的 `})` 之后）追加：

```ts
describe('cmd flag detection', () => {
  it('identifies unknown CLI tools by their flag pattern', () => {
    expect(classify('claude --resume 4338966a-ba3f-4dfd-9aca-9ac59d08d736')).toBe('cmd')
    expect(classify('vercel --prod')).toBe('cmd')
    expect(classify('gh pr create --title "fix bug"')).toBe('cmd')
  })
})

describe('extractSignal', () => {
  it('extracts the leading word for bare command-like lines', () => {
    expect(extractSignal('claude --resume xxx')).toBe('claude')
  })

  it('extracts the key for label-style lines', () => {
    expect(extractSignal('Skills: /gen-sprite')).toBe('skills')
    expect(extractSignal('PORT=3000')).toBe('port')
  })

  it('returns null for CJK or empty content', () => {
    expect(extractSignal('这是一条普通备注')).toBeNull()
    expect(extractSignal('')).toBeNull()
  })
})

describe('learnedRules override', () => {
  it('lets a learned rule override the default classification', () => {
    expect(classify('claude --resume xxx', { claude: 'note' })).toBe('note')
    expect(classify('Skills: /gen-sprite', { skills: 'cmd' })).toBe('cmd')
  })

  it('falls back to normal rules when there is no matching learned rule', () => {
    expect(classify('Skills: /gen-sprite', { other: 'cmd' })).toBe('config')
  })
})
```

同时把文件顶部的导入改为：

```ts
import { describe, it, expect } from 'vitest'
import { classify, extractSignal } from './classifier'
```

- [ ] **Step 2: 运行测试，确认新增用例失败**

Run: `npx vitest run src/lib/classifier.test.ts`
Expected: FAIL —— `extractSignal` 未导出（`is not a function` 或类似错误），`claude --resume ...` 被分到 `note` 而不是 `cmd`

- [ ] **Step 3: 修改 `classifier.ts` 实现**

在文件顶部常量区（`CONFIG_PATTERN` 定义之后，约第 28 行）追加：

```ts
const CMD_FLAG_PATTERN = /^[\w./-]+(?:\s+[\w./-]+){0,2}\s+--?[A-Za-z][\w-]*/

const LABEL_SIGNAL = /^([\w.-]+)\s*[:=]/
const WORD_SIGNAL = /^([A-Za-z][\w.-]*)/

export function extractSignal(text: string): string | null {
  const firstLine = text.trim().split('\n')[0] ?? ''
  if (!firstLine) return null
  const labelMatch = LABEL_SIGNAL.exec(firstLine)
  if (labelMatch) return labelMatch[1].toLowerCase()
  const wordMatch = WORD_SIGNAL.exec(firstLine)
  if (wordMatch) return wordMatch[1].toLowerCase()
  return null
}
```

把现有的 `classify` 函数（文件末尾）替换为：

```ts
export function classify(text: string, learnedRules: Record<string, NoteCategory> = {}): NoteCategory {
  const trimmed = text.trim()
  if (!trimmed) return 'note'

  const signal = extractSignal(trimmed)
  if (signal && learnedRules[signal]) return learnedRules[signal]

  if (CMD_PREFIXES.test(trimmed)) return 'cmd'
  if (URL_PATTERN.test(trimmed)) return 'url'
  if (CREDENTIAL_PREFIXES.test(trimmed)) return 'secret'
  if (INLINE_CREDENTIAL.test(trimmed)) return 'secret'
  if (isAccountLine(trimmed)) return 'secret'
  // High-confidence prefix patterns take priority over config
  if (SECRET_PREFIXES.test(trimmed)) return 'secret'
  if (CONFIG_PATTERN.test(trimmed)) return 'config'
  if (CMD_FLAG_PATTERN.test(trimmed)) return 'cmd'
  // Entropy-based fallback for opaque tokens (after config to avoid false positives)
  if (looksLikeSecret(trimmed)) return 'secret'
  return 'note'
}
```

- [ ] **Step 4: 运行测试，确认全部通过**

Run: `npx vitest run src/lib/classifier.test.ts`
Expected: PASS —— 全部 test cases（包括原有 5 个和新增 4 个 describe block）通过

- [ ] **Step 5: Commit**

```bash
git add src/lib/classifier.ts src/lib/classifier.test.ts
git commit -m "feat: generalize cmd detection via flag pattern, add learned-rule override"
```

---

### Task 2: 全局学习规则状态（types / storage / useStore）

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/storage/storage.ts`
- Modify: `src/store/useStore.ts`
- Test: `src/store/useStore.test.ts`（新建）

**Interfaces:**
- Consumes: `extractSignal`, `classify` from `../lib/classifier`（Task 1）
- Produces:
  - `AppState.learnedRules: Record<string, NoteCategory>`
  - store action `deleteLearnedRule(key: string): void`
  - `useStore(s => s.learnedRules)` 可读取当前已学规则

- [ ] **Step 1: 修改 `types/index.ts`，新增字段**

把 `AppState` 接口（第 26~33 行）：

```ts
export interface AppState {
  projects: Project[]
  tabs: Tab[]
  notes: Note[]
  activeProjectId: string | null
  activeTabId: string | null
  searchQuery: string
}
```

改为：

```ts
export interface AppState {
  projects: Project[]
  tabs: Tab[]
  notes: Note[]
  activeProjectId: string | null
  activeTabId: string | null
  searchQuery: string
  learnedRules: Record<string, NoteCategory>
}
```

- [ ] **Step 2: 修改 `storage.ts`，补充默认值**

把 `EMPTY` 常量（第 5~12 行）：

```ts
const EMPTY: AppState = {
  projects: [],
  tabs: [],
  notes: [],
  activeProjectId: null,
  activeTabId: null,
  searchQuery: '',
}
```

改为：

```ts
const EMPTY: AppState = {
  projects: [],
  tabs: [],
  notes: [],
  activeProjectId: null,
  activeTabId: null,
  searchQuery: '',
  learnedRules: {},
}
```

（`load()` 里已有 `{ ...EMPTY, ...JSON.parse(raw) }` 的合并逻辑，旧数据文件没有 `learnedRules` 字段时会自动补上 `{}`，无需额外迁移代码。）

- [ ] **Step 3: 写失败的 store 测试**

新建 `src/store/useStore.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './useStore'

function resetStore() {
  localStorage.clear()
  useStore.setState({
    projects: [],
    tabs: [],
    notes: [],
    activeProjectId: null,
    activeTabId: null,
    searchQuery: '',
    learnedRules: {},
    activeCategoryFilter: null,
  })
}

describe('learned rules', () => {
  beforeEach(() => {
    resetStore()
    useStore.getState().createProject('测试项目')
  })

  it('learns a signal when a note category is manually corrected, and applies it to future notes', () => {
    useStore.getState().addNote('Skills: /gen-sprite')
    const first = useStore.getState().notes[0]
    expect(first.category).toBe('config')

    useStore.getState().updateNote(first.id, first.content, 'note')
    expect(useStore.getState().learnedRules.skills).toBe('note')

    useStore.getState().addNote('Skills: /another-skill')
    const second = useStore.getState().notes[1]
    expect(second.category).toBe('note')
  })

  it('removes a learned rule via deleteLearnedRule', () => {
    useStore.getState().addNote('Skills: /gen-sprite')
    const note = useStore.getState().notes[0]
    useStore.getState().updateNote(note.id, note.content, 'note')
    expect(useStore.getState().learnedRules.skills).toBe('note')

    useStore.getState().deleteLearnedRule('skills')
    expect(useStore.getState().learnedRules.skills).toBeUndefined()
  })
})
```

- [ ] **Step 4: 运行测试，确认失败**

Run: `npx vitest run src/store/useStore.test.ts`
Expected: FAIL —— `learnedRules` 字段不存在 / `deleteLearnedRule` 不是函数 / 第一条断言 `first.category` 不是 `'config'`（因为 `addNote` 还没传 `learnedRules` 给 `classify`，但此用例不依赖这点，主要会在 `deleteLearnedRule` 调用处报错）

- [ ] **Step 5: 修改 `useStore.ts` 实现**

把第 5 行的导入：

```ts
import { classify } from '../lib/classifier'
```

改为：

```ts
import { classify, extractSignal } from '../lib/classifier'
```

把 `Actions` 接口（第 7~23 行）里的 `deleteNote: (id: string) => void` 这一行后面加上一行：

```ts
  deleteNote: (id: string) => void
  deleteLearnedRule: (key: string) => void
```

把 `addNote` 实现（第 95~107 行）：

```ts
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
```

改为：

```ts
    addNote(content, category) {
      const { activeProjectId, activeTabId, learnedRules } = get()
      if (!activeProjectId || !activeTabId) return
      const note: Note = {
        id: uuid(),
        content,
        category: category ?? classify(content, learnedRules),
        createdAt: Date.now(),
        tabId: activeTabId,
        projectId: activeProjectId,
      }
      set(s => persist({ ...s, notes: [...s.notes, note] }))
    },
```

把 `updateNote` 实现（第 109~123 行）：

```ts
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
```

改为：

```ts
    updateNote(id, content, manualCategory) {
      set(s => {
        let learnedRules = s.learnedRules
        if (manualCategory !== undefined) {
          const signal = extractSignal(content)
          if (signal) {
            learnedRules = { ...learnedRules, [signal]: manualCategory }
          }
        }
        return persist({
          ...s,
          learnedRules,
          notes: s.notes.map(n => {
            if (n.id !== id) return n
            // 手工分类：锁定类别，不再自动分类
            if (manualCategory !== undefined) {
              return { ...n, content, category: manualCategory, manualCategory: true }
            }
            // 内容变更：若已手工分类则保持类别，否则自动重分类
            const category = n.manualCategory ? n.category : classify(content, learnedRules)
            return { ...n, content, category }
          }),
        })
      })
    },
```

把 `deleteNote` 实现（第 125~127 行）：

```ts
    deleteNote(id) {
      set(s => persist({ ...s, notes: s.notes.filter(n => n.id !== id) }))
    },
```

改为（新增 `deleteLearnedRule`，紧跟在 `deleteNote` 后面）：

```ts
    deleteNote(id) {
      set(s => persist({ ...s, notes: s.notes.filter(n => n.id !== id) }))
    },

    deleteLearnedRule(key) {
      set(s => {
        const rest = { ...s.learnedRules }
        delete rest[key]
        return persist({ ...s, learnedRules: rest })
      })
    },
```

最后，修正 `exportData`/`importData`（第 133~163 行），让 `learnedRules` 也参与导出/导入，避免备份-恢复后学习记录被清空：

```ts
    exportData() {
      const s = get()
      const data = { projects: s.projects, tabs: s.tabs, notes: s.notes, learnedRules: s.learnedRules }
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
          learnedRules: data.learnedRules ?? {},
        }
        set(persist({ ...next, activeCategoryFilter: null } as AppState))
      } catch {
        // 静默忽略格式错误
      }
    },
```

- [ ] **Step 6: 运行测试，确认通过**

Run: `npx vitest run src/store/useStore.test.ts src/lib/classifier.test.ts`
Expected: PASS —— 两个文件的全部测试通过

- [ ] **Step 7: 运行类型检查**

Run: `npm run typecheck`
Expected: 无报错（确认 `AppState` 新字段在所有赋值处都已补齐，没有遗漏的字面量）

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/storage/storage.ts src/store/useStore.ts src/store/useStore.test.ts
git commit -m "feat: persist learned classification rules and learn from manual corrections"
```

---

### Task 3: LearnedRulesPanel 组件（查看 / 删除已学规则）

**Files:**
- Create: `src/components/LearnedRules/LearnedRulesPanel.tsx`
- Test: `src/components/LearnedRules/LearnedRulesPanel.test.tsx`

**Interfaces:**
- Consumes: `useStore(s => s.learnedRules)`、`useStore(s => s.deleteLearnedRule)`（Task 2）；`NoteCategory` type from `../../types`
- Produces: `export function LearnedRulesPanel(props: { onClose: () => void })`

- [ ] **Step 1: 写失败的组件测试**

新建 `src/components/LearnedRules/LearnedRulesPanel.test.tsx`：

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useStore } from '../../store/useStore'
import { LearnedRulesPanel } from './LearnedRulesPanel'

afterEach(() => {
  cleanup()
})

describe('LearnedRulesPanel', () => {
  beforeEach(() => {
    useStore.setState({ learnedRules: {} })
  })

  it('shows an empty state when there are no learned rules', () => {
    render(<LearnedRulesPanel onClose={() => {}} />)
    expect(
      screen.getByText('还没有学习到规则。手动修改一条笔记的分类后，这里会记录下来。')
    ).toBeInTheDocument()
  })

  it('lists learned rules and deletes one on click', () => {
    useStore.setState({ learnedRules: { claude: 'cmd', skills: 'note' } })
    render(<LearnedRulesPanel onClose={() => {}} />)

    expect(screen.getByText('claude')).toBeInTheDocument()
    expect(screen.getByText('skills')).toBeInTheDocument()

    fireEvent.click(screen.getAllByText('删除')[0])
    expect(useStore.getState().learnedRules.claude).toBeUndefined()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<LearnedRulesPanel onClose={onClose} />)
    fireEvent.click(screen.getByText('×'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run src/components/LearnedRules/LearnedRulesPanel.test.tsx`
Expected: FAIL —— 找不到模块 `./LearnedRulesPanel`

- [ ] **Step 3: 实现组件**

新建 `src/components/LearnedRules/LearnedRulesPanel.tsx`：

```tsx
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
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run src/components/LearnedRules/LearnedRulesPanel.test.tsx`
Expected: PASS —— 三个用例全部通过

- [ ] **Step 5: Commit**

```bash
git add src/components/LearnedRules/LearnedRulesPanel.tsx src/components/LearnedRules/LearnedRulesPanel.test.tsx
git commit -m "feat: add LearnedRulesPanel to view and delete learned classification rules"
```

---

### Task 4: 侧边栏入口接入

**Files:**
- Modify: `src/components/Sidebar/Sidebar.tsx`

**Interfaces:**
- Consumes: `LearnedRulesPanel` from `../LearnedRules/LearnedRulesPanel`（Task 3）
- Produces: 无新导出，仅 UI 接入

- [ ] **Step 1: 修改 `Sidebar.tsx`**

在文件顶部导入区（第 1~2 行）：

```ts
import { useState } from 'react'
import { useStore } from '../../store/useStore'
```

改为：

```ts
import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { LearnedRulesPanel } from '../LearnedRules/LearnedRulesPanel'
```

在 `Sidebar` 函数内现有的 state 声明（第 13~16 行）后面加一行：

```ts
  const [editName, setEditName] = useState('')
  const [showLearnedRules, setShowLearnedRules] = useState(false)
```

把标题区块（第 40~42 行）：

```tsx
      <div className="px-4 py-3 border-b border-glass-border">
        <span className="text-sm font-bold text-white tracking-wide">DevNotes</span>
      </div>
```

改为：

```tsx
      <div className="px-4 py-3 border-b border-glass-border flex items-center justify-between">
        <span className="text-sm font-bold text-white tracking-wide">DevNotes</span>
        <button
          onClick={() => setShowLearnedRules(true)}
          className="text-gray-500 hover:text-gray-300 transition-colors"
          title="已学习的分类规则"
        >
          ⚙
        </button>
      </div>

      {showLearnedRules && (
        <LearnedRulesPanel onClose={() => setShowLearnedRules(false)} />
      )}
```

- [ ] **Step 2: 运行类型检查**

Run: `npm run typecheck`
Expected: 无报错

- [ ] **Step 3: 运行完整测试套件**

Run: `npm test -- run`
Expected: PASS —— 全部测试文件（`classifier.test.ts`、`useStore.test.ts`、`LearnedRulesPanel.test.tsx`）通过，无回归

- [ ] **Step 4: 手动验证**

Run: `npm run dev`，在浏览器打开开发服务器地址：
1. 侧边栏标题 "DevNotes" 右侧应看到一个 ⚙ 图标
2. 点击图标，应弹出"已学习的分类规则"面板，空状态显示提示文案
3. 创建一条笔记 `Skills: /gen-sprite`（应显示 CONFIG），手动把它改成 NOTE
4. 再次点击 ⚙ 图标，面板里应出现 `skills → NOTE` 一条记录，且有"删除"按钮
5. 新建一条笔记 `Skills: /another-skill`，应自动显示为 NOTE（而不是 CONFIG）

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar/Sidebar.tsx
git commit -m "feat: wire LearnedRulesPanel into sidebar header"
```

---

## Self-Review Notes

- **Spec coverage**：第 1 节（cmd flag 识别）→ Task 1；第 2 节（学习机制：触发时机/信号提取/存储/优先级）→ Task 1 + Task 2；第 2.5 节（管理 UI，含用户指定的"标题旁图标"位置）→ Task 3 + Task 4。"不引入 LLM"、"不做图片"、"不动 CONFIG_PATTERN"、"不分项目"、"只能删不能改" 均已写入 Global Constraints 并在对应任务中体现。
- **占位符检查**：未发现 TBD/TODO 或描述性占位步骤，每个 Step 都含完整代码或精确命令。
- **类型一致性**：`extractSignal(text: string): string | null` 与 `classify(text: string, learnedRules?: Record<string, NoteCategory>): NoteCategory` 在 Task 1 定义后，Task 2/3 中的所有调用（`classify(content, learnedRules)`、`extractSignal(content)`、`deleteLearnedRule(key: string)`、`learnedRules: Record<string, NoteCategory>`）均保持签名一致。
