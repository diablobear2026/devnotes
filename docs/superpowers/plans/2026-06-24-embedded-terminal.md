# 项目内嵌终端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 DevNotes 主区域内嵌一个真正可交互的终端，自动 `cd` 到项目绑定的本地目录，体验上等价于 VSCode 的集成终端而非外部 Terminal.app 窗口。

**Architecture:** 前端用 `@xterm/xterm` 渲染终端 UI，通过 Tauri `invoke` + `Channel` 与 Rust 侧通信；Rust 侧用 `portable-pty` 起真实的 pty + shell 进程。每个项目最多一个终端实例，切换视图/项目不杀进程，只有显式"关闭终端"或 App 退出才清理。

**Tech Stack:** React + TypeScript + Zustand（前端）、Rust + Tauri 2 + `portable-pty`（后端）、`@xterm/xterm`、`@tauri-apps/plugin-dialog`、vitest + Testing Library（测试）。

## Global Constraints

- 仅支持 macOS（沿用项目当前定位），shell 取 `$SHELL` 环境变量，取不到回退 `/bin/zsh`。
- 每个项目最多一个终端实例，不支持同项目多开。
- 终端会话状态（是否存活、缓冲区）只存在于内存，不写入 `storage.ts` 的本地持久化文件。
- UI 文案全部中文，视觉风格沿用现有半透明玻璃公式（`bg-*-500/10~20`、`text-*-300`、`border-*-500/30`）。
- 新增的非分类强调色按钮要避开已被占用的五个分类色（`cmd`=emerald、`url`=blue、`secret`=red、`config`=amber、`note`=purple）以及已用于"已学习的分类规则"的 indigo；本计划为"终端"按钮选用 **cyan**。
- 设计已批准的 spec：`docs/superpowers/specs/2026-06-24-embedded-terminal-design.md`。本计划中 Task 7 用"运行时常驻会话 + 内存缓冲回放"取代 spec 里提到的 `@xterm/addon-serialize` 快照方案——效果等价（切回终端视图时画面正确）且实现更简单（不需要额外的序列化/反序列化生命周期管理，也能正确重放"离开终端视图期间产生的输出"，而单纯的屏幕快照做不到这一点），属于计划阶段发现的合理简化。

---

### Task 1: 数据模型与视图状态

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/store/useStore.ts`
- Test: `src/store/useStore.test.ts`

**Interfaces:**
- Produces: `Project.localPath?: string`；`setProjectLocalPath(id: string, path: string): void`；`mainView: 'notes' | 'terminal'`（内存态，不持久化）；`setMainView(view: 'notes' | 'terminal'): void`
- Consumes: 无（最底层任务）

- [ ] **Step 1: 写失败测试 —— 绑定目录路径**

在 `src/store/useStore.test.ts` 末尾新增：

```ts
describe('project local path', () => {
  beforeEach(() => {
    resetStore()
  })

  it('binds a local directory path to a project', () => {
    useStore.getState().createProject('测试项目')
    const project = useStore.getState().projects[0]
    expect(project.localPath).toBeUndefined()

    useStore.getState().setProjectLocalPath(project.id, '/Users/sam/code/demo')
    expect(useStore.getState().projects[0].localPath).toBe('/Users/sam/code/demo')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/store/useStore.test.ts -t "binds a local directory path"`
Expected: FAIL，报错 `setProjectLocalPath is not a function`

- [ ] **Step 3: 实现 —— `Project.localPath` 字段与 action**

`src/types/index.ts`，修改 `Project` 接口：

```ts
export interface Project {
  id: string
  name: string
  createdAt: number
  localPath?: string
}
```

`src/store/useStore.ts`，在 `Actions` 接口里 `setActiveProject` 之后加一行：

```ts
  setProjectLocalPath: (id: string, path: string) => void
```

在 `renameProject` 实现之后加入：

```ts
    setProjectLocalPath(id, path) {
      set(s => persist({ ...s, projects: s.projects.map(p => p.id === id ? { ...p, localPath: path } : p) }))
    },
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/store/useStore.test.ts -t "binds a local directory path"`
Expected: PASS

- [ ] **Step 5: 写失败测试 —— mainView 状态**

在同一文件继续新增：

```ts
describe('main view', () => {
  beforeEach(() => {
    resetStore()
  })

  it('defaults to notes view and can switch to terminal view', () => {
    useStore.getState().createProject('测试项目')
    expect(useStore.getState().mainView).toBe('notes')

    useStore.getState().setMainView('terminal')
    expect(useStore.getState().mainView).toBe('terminal')
  })

  it('resets to notes view when switching active project', () => {
    useStore.getState().createProject('项目A')
    const projectA = useStore.getState().projects[0]
    useStore.getState().createProject('项目B')
    useStore.getState().setMainView('terminal')

    useStore.getState().setActiveProject(projectA.id)
    expect(useStore.getState().mainView).toBe('notes')
  })
})
```

同时把文件顶部的 `resetStore()` helper 补上 `mainView: 'notes'`，避免同文件内测试间状态串台：

```ts
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
    mainView: 'notes',
  })
}
```

- [ ] **Step 6: 运行测试确认失败**

Run: `npx vitest run src/store/useStore.test.ts -t "main view"`
Expected: FAIL，`mainView`/`setMainView` 不存在

- [ ] **Step 7: 实现 —— `mainView` 状态与 action**

`src/store/useStore.ts`，`MemoryState` 接口改为：

```ts
interface MemoryState {
  activeCategoryFilter: NoteCategory | null
  mainView: 'notes' | 'terminal'
}
```

`Actions` 接口里 `setCategoryFilter` 之后加一行：

```ts
  setMainView: (view: 'notes' | 'terminal') => void
```

`create<Store>` 工厂返回对象里，`activeCategoryFilter: null,` 之后加：

```ts
    mainView: 'notes',
```

`setActiveProject` 实现改为同时重置 `mainView`：

```ts
    setActiveProject(id) {
      const s = get()
      const tab = s.tabs.find(t => t.projectId === id) ?? null
      set(persist({ ...s, activeProjectId: id, activeTabId: tab?.id ?? null, activeCategoryFilter: null, mainView: 'notes' }))
    },
```

`setCategoryFilter` 实现之后加入：

```ts
    setMainView(view) {
      set(s => ({ ...s, mainView: view }))
    },
```

- [ ] **Step 8: 运行测试确认通过**

Run: `npx vitest run src/store/useStore.test.ts`
Expected: PASS（全部用例，包括既有的 learned rules 用例不受影响）

- [ ] **Step 9: Commit**

```bash
git add src/types/index.ts src/store/useStore.ts src/store/useStore.test.ts
git commit -m "feat: add project localPath binding and mainView state"
```

---

### Task 2: Sidebar 目录绑定 UI

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src/components/Sidebar/Sidebar.tsx`
- Test: `src/components/Sidebar/Sidebar.test.tsx`（新建）

**Interfaces:**
- Consumes: `setProjectLocalPath` from Task 1
- Produces: Sidebar 项目行的"目录"按钮（`title` 为已绑定路径或提示文案 `'绑定本地目录'`）

- [ ] **Step 1: 安装依赖**

```bash
npm install @tauri-apps/plugin-dialog
```

确认 `package.json` 的 `dependencies` 里出现 `"@tauri-apps/plugin-dialog"`（版本形如 `^2.x.x`）。

- [ ] **Step 2: 注册 Rust 侧插件**

`src-tauri/Cargo.toml`，`[dependencies]` 下新增一行：

```toml
tauri-plugin-dialog = "2"
```

`src-tauri/src/lib.rs`，在 `tauri::Builder::default()` 后链式加入插件注册：

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
```

`src-tauri/capabilities/default.json`，`permissions` 数组里加入一项：

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "enables the default permissions",
  "windows": [
    "main"
  ],
  "permissions": [
    "core:default",
    "dialog:default"
  ]
}
```

- [ ] **Step 3: 运行 cargo build 确认插件接通**

Run: `cd src-tauri && cargo build && cd ..`
Expected: 编译成功（首次会下载 `tauri-plugin-dialog` 依赖，耗时略长）

- [ ] **Step 4: 写失败测试 —— Sidebar 绑定目录交互**

新建 `src/components/Sidebar/Sidebar.test.tsx`：

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { useStore } from '../../store/useStore'
import { Sidebar } from './Sidebar'

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}))

import { open } from '@tauri-apps/plugin-dialog'

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
    mainView: 'notes',
  })
}

afterEach(() => {
  cleanup()
})

describe('Sidebar directory binding', () => {
  beforeEach(() => {
    resetStore()
    ;(open as Mock).mockReset()
  })

  it('binds a directory to a project when one is selected', async () => {
    ;(open as Mock).mockResolvedValue('/Users/sam/code/demo')
    useStore.getState().createProject('测试项目')
    render(<Sidebar />)

    fireEvent.click(screen.getByTitle('绑定本地目录'))

    await waitFor(() => {
      expect(useStore.getState().projects[0].localPath).toBe('/Users/sam/code/demo')
    })
  })

  it('does nothing when the directory picker is cancelled', async () => {
    ;(open as Mock).mockResolvedValue(null)
    useStore.getState().createProject('测试项目')
    render(<Sidebar />)

    fireEvent.click(screen.getByTitle('绑定本地目录'))

    await waitFor(() => expect(open).toHaveBeenCalled())
    expect(useStore.getState().projects[0].localPath).toBeUndefined()
  })
})
```

- [ ] **Step 5: 运行测试确认失败**

Run: `npx vitest run src/components/Sidebar/Sidebar.test.tsx`
Expected: FAIL，找不到 `title="绑定本地目录"` 的元素

- [ ] **Step 6: 实现 —— Sidebar 目录按钮**

`src/components/Sidebar/Sidebar.tsx`，顶部 import 区加入：

```tsx
import { open } from '@tauri-apps/plugin-dialog'
```

在组件内部、`deleteProject` 取值之后加入：

```tsx
  const setProjectLocalPath = useStore(s => s.setProjectLocalPath)

  async function pickDirectory(projectId: string) {
    const selected = await open({ directory: true, multiple: false })
    if (typeof selected === 'string') {
      setProjectLocalPath(projectId, selected)
    }
  }
```

在项目行 JSX 里，`{editingId === project.id ? (...) : (...)}` 块和删除按钮之间插入：

```tsx
            <button
              onClick={e => { e.stopPropagation(); pickDirectory(project.id) }}
              title={project.localPath ?? '绑定本地目录'}
              className="opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:text-gray-200 text-xs transition-opacity shrink-0 mr-1"
            >
              目录
            </button>
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npx vitest run src/components/Sidebar/Sidebar.test.tsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json src/components/Sidebar/Sidebar.tsx src/components/Sidebar/Sidebar.test.tsx
git commit -m "feat: bind a local directory to a project via Sidebar"
```

---

### Task 3: App.tsx 终端按钮门控 + TerminalPanel 占位组件

**Files:**
- Create: `src/components/Terminal/TerminalPanel.tsx`
- Test: `src/components/Terminal/TerminalPanel.test.tsx`
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`（新建）

**Interfaces:**
- Consumes: `mainView`/`setMainView` from Task 1，`Project.localPath` from Task 1
- Produces: `<TerminalPanel projectId: string, localPath: string>` 组件（本任务为占位实现，Task 6/7 会替换内部逻辑，props 签名保持不变）

- [ ] **Step 1: 写失败测试 —— TerminalPanel 占位渲染**

新建 `src/components/Terminal/TerminalPanel.test.tsx`：

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TerminalPanel } from './TerminalPanel'

describe('TerminalPanel placeholder', () => {
  it('renders the bound directory path', () => {
    render(<TerminalPanel projectId="p1" localPath="/Users/sam/code/demo" />)
    expect(screen.getByText(/终端面板/)).toBeInTheDocument()
    expect(screen.getByText(/\/Users\/sam\/code\/demo/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/components/Terminal/TerminalPanel.test.tsx`
Expected: FAIL，找不到模块 `./TerminalPanel`

- [ ] **Step 3: 实现 —— TerminalPanel 占位组件**

新建 `src/components/Terminal/TerminalPanel.tsx`：

```tsx
interface Props {
  projectId: string
  localPath: string
}

export function TerminalPanel({ projectId, localPath }: Props) {
  return (
    <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
      终端面板（项目 {projectId}，目录 {localPath}）
    </div>
  )
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/components/Terminal/TerminalPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: 写失败测试 —— App.tsx 视图切换**

新建 `src/App.test.tsx`：

```tsx
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useStore } from './store/useStore'
import App from './App'

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
    mainView: 'notes',
  })
}

afterEach(() => {
  cleanup()
})

describe('App terminal view switching', () => {
  beforeEach(() => {
    resetStore()
    useStore.getState().createProject('测试项目')
  })

  it('disables the terminal button when the project has no bound directory', () => {
    render(<App />)
    expect(screen.getByText('终端')).toBeDisabled()
  })

  it('switches to the terminal panel and back when the project has a bound directory', () => {
    const projectId = useStore.getState().projects[0].id
    useStore.getState().setProjectLocalPath(projectId, '/Users/sam/code/demo')
    render(<App />)

    fireEvent.click(screen.getByText('终端'))
    expect(screen.getByText(/终端面板/)).toBeInTheDocument()
    expect(screen.queryByText('已学习的分类规则')).toBeInTheDocument()

    fireEvent.click(screen.getByText('返回笔记'))
    expect(screen.queryByText(/终端面板/)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 6: 运行测试确认失败**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL，找不到文案"终端"按钮

- [ ] **Step 7: 实现 —— App.tsx 接入终端按钮与视图切换**

`src/App.tsx` 整体替换为：

```tsx
import { useState } from 'react'
import { useStore } from './store/useStore'
import { Sidebar } from './components/Sidebar/Sidebar'
import { TabBar } from './components/TabBar/TabBar'
import { Editor } from './components/Editor/Editor'
import { NoteList } from './components/NoteList/NoteList'
import { SearchBar } from './components/SearchBar/SearchBar'
import { LearnedRulesPanel } from './components/LearnedRules/LearnedRulesPanel'
import { TerminalPanel } from './components/Terminal/TerminalPanel'
import type { Note } from './types'

function matchesSearch(note: Note, q: string): boolean {
  if (!q) return true
  return note.content.toLowerCase().includes(q.toLowerCase())
}

export default function App() {
  const notes = useStore(s => s.notes)
  const projects = useStore(s => s.projects)
  const activeProjectId = useStore(s => s.activeProjectId)
  const activeCategoryFilter = useStore(s => s.activeCategoryFilter)
  const searchQuery = useStore(s => s.searchQuery)
  const mainView = useStore(s => s.mainView)
  const setMainView = useStore(s => s.setMainView)
  const [showLearnedRules, setShowLearnedRules] = useState(false)

  const activeProject = projects.find(p => p.id === activeProjectId) ?? null
  const projectNotes = notes.filter(n => n.projectId === activeProjectId)

  const visibleNotes = searchQuery
    ? notes.filter(n => matchesSearch(n, searchQuery))
    : activeCategoryFilter
      ? projectNotes.filter(n => n.category === activeCategoryFilter)
      : projectNotes

  return (
    <div className="h-full flex dark">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-3 px-4 py-2 border-b border-glass-border">
          <div className="flex-1">
            <SearchBar />
          </div>
          <button
            onClick={() => setMainView(mainView === 'terminal' ? 'notes' : 'terminal')}
            disabled={!activeProject?.localPath}
            title={activeProject?.localPath ? undefined : '请先在侧边栏为项目绑定本地目录'}
            className="shrink-0 text-xs text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {mainView === 'terminal' ? '返回笔记' : '终端'}
          </button>
          <button
            onClick={() => setShowLearnedRules(true)}
            className="shrink-0 text-xs text-indigo-300 hover:text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap"
          >
            已学习的分类规则
          </button>
        </header>
        {mainView === 'terminal' && activeProject?.localPath ? (
          <TerminalPanel projectId={activeProject.id} localPath={activeProject.localPath} />
        ) : (
          <>
            <TabBar />
            <div className="flex-1 overflow-y-auto">
              <NoteList notes={visibleNotes} />
            </div>
            {!activeCategoryFilter && <Editor />}
          </>
        )}
      </div>

      {showLearnedRules && (
        <LearnedRulesPanel onClose={() => setShowLearnedRules(false)} />
      )}
    </div>
  )
}
```

- [ ] **Step 8: 运行测试确认通过**

Run: `npx vitest run src/App.test.tsx src/components/Terminal/TerminalPanel.test.tsx`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/components/Terminal/TerminalPanel.tsx src/components/Terminal/TerminalPanel.test.tsx
git commit -m "feat: gate a terminal view switch behind project localPath binding"
```

---

### Task 4: Rust pty 核心逻辑

**Files:**
- Create: `src-tauri/src/pty.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: 无
- Produces: `pty::spawn_session(cwd: &str) -> Result<pty::PtySession, String>`，`PtySession { master, writer, reader, child }` 四个 `pub` 字段，供 Task 5 包装成 Tauri 命令

- [ ] **Step 1: 添加依赖**

`src-tauri/Cargo.toml`，`[dependencies]` 下新增：

```toml
portable-pty = "0.8"
```

- [ ] **Step 2: 写失败测试 —— 真实起一个 shell 并验证回显**

新建 `src-tauri/src/pty.rs`，先写测试模块（先放测试，实现留空以确认失败）：

```rust
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, Child, PtySize};
use std::io::{Read, Write};

pub struct PtySession {
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
    pub reader: Box<dyn Read + Send>,
    pub child: Box<dyn Child + Send + Sync>,
}

pub fn spawn_session(_cwd: &str) -> Result<PtySession, String> {
    Err("not implemented".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn spawns_a_shell_and_echoes_input() {
        let cwd = std::env::temp_dir();
        let mut session = spawn_session(cwd.to_str().unwrap()).expect("failed to spawn pty session");

        session.writer.write_all(b"echo hello-pty-test\n").expect("write failed");

        let (tx, rx) = std::sync::mpsc::channel::<String>();
        let mut reader = session.reader;
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]).into_owned();
                        if tx.send(chunk).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        let mut collected = String::new();
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            match rx.recv_timeout(Duration::from_millis(200)) {
                Ok(chunk) => {
                    collected.push_str(&chunk);
                    if collected.contains("hello-pty-test") {
                        break;
                    }
                }
                Err(_) => continue,
            }
        }

        assert!(
            collected.contains("hello-pty-test"),
            "pty output did not contain expected echo, got: {collected}"
        );
        let _ = session.child.kill();
    }
}
```

`src-tauri/src/lib.rs`，文件顶部加入：

```rust
mod pty;
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd src-tauri && cargo test pty:: && cd ..`
Expected: FAIL，断言 `pty output did not contain expected echo`（因为 `spawn_session` 返回 `Err`）

- [ ] **Step 4: 实现 —— `spawn_session`**

把 `src-tauri/src/pty.rs` 里的 `spawn_session` 函数体替换为：

```rust
pub fn spawn_session(cwd: &str) -> Result<PtySession, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut cmd = CommandBuilder::new(shell);
    cmd.cwd(cwd);

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    Ok(PtySession { master: pair.master, writer, reader, child })
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd src-tauri && cargo test pty:: && cd ..`
Expected: PASS（首次运行会编译 `portable-pty`，耗时略长；测试本身起一个真实 zsh 进程，正常应在 1 秒内完成）

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/pty.rs src-tauri/src/lib.rs
git commit -m "feat: spawn a real pty-backed shell session in Rust"
```

---

### Task 5: Rust Tauri 命令层

**Files:**
- Modify: `src-tauri/src/pty.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `pty::spawn_session` from Task 4
- Produces: Tauri 命令 `pty_spawn(cwd: String, on_data: Channel<String>) -> Result<String, String>`、`pty_write(session_id: String, data: String) -> Result<(), String>`、`pty_resize(session_id: String, cols: u16, rows: u16) -> Result<(), String>`、`pty_kill(session_id: String) -> Result<(), String>`；managed state `pty::PtyState`；清理函数 `pty::PtyState::kill_all(&self)`

- [ ] **Step 1: 添加依赖**

`src-tauri/Cargo.toml`，`[dependencies]` 下新增：

```toml
uuid = { version = "1", features = ["v4"] }
```

- [ ] **Step 2: 写失败测试 —— `PtyState` 核心方法（不经过 Tauri 宏）**

在 `src-tauri/src/pty.rs` 末尾的 `#[cfg(test)] mod tests` 之后，新增第二个测试模块：

```rust
#[cfg(test)]
mod state_tests {
    use super::*;
    use std::sync::{Arc, Mutex as StdMutex};
    use std::time::{Duration, Instant};

    #[test]
    fn spawn_write_and_receive_output() {
        let state = PtyState::default();
        let received: Arc<StdMutex<String>> = Arc::new(StdMutex::new(String::new()));
        let received_clone = received.clone();

        let cwd = std::env::temp_dir();
        let session_id = state
            .spawn(cwd.to_str().unwrap(), move |chunk| {
                received_clone.lock().unwrap().push_str(&chunk);
            })
            .expect("spawn failed");

        state.write(&session_id, "echo hello-handle-test\n").expect("write failed");

        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if received.lock().unwrap().contains("hello-handle-test") {
                break;
            }
            if Instant::now() > deadline {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }

        assert!(received.lock().unwrap().contains("hello-handle-test"));
        state.kill(&session_id).expect("kill failed");
    }

    #[test]
    fn kill_all_removes_every_session() {
        let state = PtyState::default();
        let cwd = std::env::temp_dir();
        state.spawn(cwd.to_str().unwrap(), |_| {}).unwrap();
        state.spawn(cwd.to_str().unwrap(), |_| {}).unwrap();
        assert_eq!(state.sessions.lock().unwrap().len(), 2);

        state.kill_all();
        assert_eq!(state.sessions.lock().unwrap().len(), 0);
    }
}
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd src-tauri && cargo test pty::state_tests && cd ..`
Expected: FAIL，编译错误（`PtyState` 不存在）

- [ ] **Step 4: 实现 —— `PtyState` 与四个 Tauri 命令**

在 `src-tauri/src/pty.rs` 顶部 `use` 区域替换为：

```rust
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, Child, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::ipc::Channel;
use tauri::State;
use uuid::Uuid;
```

在 `PtySession` 结构体和 `spawn_session` 函数之后（两个 `#[cfg(test)]` 模块之前），插入：

```rust
struct PtyHandle {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyState {
    sessions: Mutex<HashMap<String, PtyHandle>>,
}

impl PtyState {
    pub fn spawn(
        &self,
        cwd: &str,
        mut on_data: impl FnMut(String) + Send + 'static,
    ) -> Result<String, String> {
        let session = spawn_session(cwd)?;
        let PtySession { master, writer, mut reader, child } = session;

        let session_id = Uuid::new_v4().to_string();

        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => on_data(String::from_utf8_lossy(&buf[..n]).into_owned()),
                    Err(_) => break,
                }
            }
        });

        self.sessions
            .lock()
            .map_err(|e| e.to_string())?
            .insert(session_id.clone(), PtyHandle { master, writer, child });

        Ok(session_id)
    }

    pub fn write(&self, session_id: &str, data: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(handle) = sessions.get_mut(session_id) {
            handle.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(handle) = sessions.get(session_id) {
            handle
                .master
                .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn kill(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(mut handle) = sessions.remove(session_id) {
            handle.child.kill().map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn kill_all(&self) {
        if let Ok(mut sessions) = self.sessions.lock() {
            for (_, mut handle) in sessions.drain() {
                let _ = handle.child.kill();
            }
        }
    }
}

#[tauri::command]
pub fn pty_spawn(state: State<PtyState>, cwd: String, on_data: Channel<String>) -> Result<String, String> {
    state.spawn(&cwd, move |chunk| {
        let _ = on_data.send(chunk);
    })
}

#[tauri::command]
pub fn pty_write(state: State<PtyState>, session_id: String, data: String) -> Result<(), String> {
    state.write(&session_id, &data)
}

#[tauri::command]
pub fn pty_resize(state: State<PtyState>, session_id: String, cols: u16, rows: u16) -> Result<(), String> {
    state.resize(&session_id, cols, rows)
}

#[tauri::command]
pub fn pty_kill(state: State<PtyState>, session_id: String) -> Result<(), String> {
    state.kill(&session_id)
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd src-tauri && cargo test pty:: && cd ..`
Expected: PASS（Task 4 的两个测试 + Task 5 的两个新测试都通过）

- [ ] **Step 6: 注册命令、managed state 与退出清理钩子**

`src-tauri/src/lib.rs` 整体替换为：

```rust
mod pty;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(pty::PtyState::default())
    .invoke_handler(tauri::generate_handler![
      pty::pty_spawn,
      pty::pty_write,
      pty::pty_resize,
      pty::pty_kill,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      if let tauri::RunEvent::ExitRequested { .. } = event {
        let state = app_handle.state::<pty::PtyState>();
        state.kill_all();
      }
    });
}
```

- [ ] **Step 7: 运行 cargo build 确认整体编译通过**

Run: `cd src-tauri && cargo build && cd ..`
Expected: 编译成功，没有警告未使用的 `mut` 等（如有，按编译器提示微调，不影响本任务的行为契约）

- [ ] **Step 8: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/pty.rs src-tauri/src/lib.rs
git commit -m "feat: expose pty session management as Tauri commands"
```

---

### Task 6: 前端真实终端渲染

**Files:**
- Modify: `package.json`
- Modify: `src/components/Terminal/TerminalPanel.tsx`
- Test: `src/components/Terminal/TerminalPanel.test.tsx`

**Interfaces:**
- Consumes: Tauri 命令 `pty_spawn`/`pty_write`/`pty_resize`/`pty_kill` from Task 5
- Produces: `TerminalPanel` 真实渲染终端（本任务为中间态：切换视图/卸载组件会调用 `pty_kill` 杀进程——这是刻意简化的过渡实现，Task 7 会替换为"切换视图不杀进程"的常驻会话逻辑，组件外部 props 不变）

- [ ] **Step 1: 安装依赖并调整 `@tauri-apps/api` 归属**

```bash
npm install @xterm/xterm @xterm/addon-fit
```

`package.json` 里把 `"@tauri-apps/api": "^2.11.0"` 从 `devDependencies` 移到 `dependencies`（因为现在运行时代码会真正 `import` 它，不再只是构建期依赖）。

- [ ] **Step 2: 写失败测试 —— spawn/write/kill 的调用契约**

整体替换 `src/components/Terminal/TerminalPanel.test.tsx`：

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

vi.mock('@xterm/xterm', () => {
  class FakeTerminal {
    cols = 80
    rows = 24
    loadAddon = vi.fn()
    open = vi.fn()
    write = vi.fn()
    dispose = vi.fn()
    onData = vi.fn(() => ({ dispose: vi.fn() }))
  }
  return { Terminal: FakeTerminal }
})

vi.mock('@xterm/addon-fit', () => {
  class FakeFitAddon {
    fit = vi.fn()
  }
  return { FitAddon: FakeFitAddon }
})

vi.mock('@tauri-apps/api/core', () => {
  class FakeChannel {
    onmessage: ((data: string) => void) | null = null
  }
  return { invoke: vi.fn(), Channel: FakeChannel }
})

import { invoke } from '@tauri-apps/api/core'
import { TerminalPanel } from './TerminalPanel'

class FakeResizeObserver {
  observe = vi.fn()
  disconnect = vi.fn()
}

beforeEach(() => {
  ;(invoke as Mock).mockReset()
  ;(invoke as Mock).mockResolvedValue('session-1')
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver
})

afterEach(() => {
  cleanup()
})

describe('TerminalPanel', () => {
  it('spawns a pty session for the bound directory on mount', async () => {
    render(<TerminalPanel projectId="p1" localPath="/Users/sam/code/demo" />)
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('pty_spawn', expect.objectContaining({ cwd: '/Users/sam/code/demo' }))
    })
  })

  it('kills the session on unmount', async () => {
    const { unmount } = render(<TerminalPanel projectId="p1" localPath="/Users/sam/code/demo" />)
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('pty_spawn', expect.anything()))
    unmount()
    expect(invoke).toHaveBeenCalledWith('pty_kill', { sessionId: 'session-1' })
  })
})
```

注意：这会替换掉 Task 3 写的占位测试（断言"终端面板"文案的用例），因为组件行为已经变了。

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run src/components/Terminal/TerminalPanel.test.tsx`
Expected: FAIL（占位实现不会调用 `invoke`）

- [ ] **Step 4: 实现 —— TerminalPanel 接入 xterm.js 与 Tauri IPC**

整体替换 `src/components/Terminal/TerminalPanel.tsx`：

```tsx
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { invoke, Channel } from '@tauri-apps/api/core'
import '@xterm/xterm/css/xterm.css'

interface Props {
  projectId: string
  localPath: string
}

export function TerminalPanel({ localPath }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({ convertEol: true, fontSize: 13 })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    const channel = new Channel<string>()
    channel.onmessage = chunk => term.write(chunk)

    let disposed = false
    invoke<string>('pty_spawn', { cwd: localPath, onData: channel }).then(sessionId => {
      if (disposed) return
      sessionIdRef.current = sessionId
    })

    const dataListener = term.onData(data => {
      if (sessionIdRef.current) {
        invoke('pty_write', { sessionId: sessionIdRef.current, data })
      }
    })

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      if (sessionIdRef.current) {
        invoke('pty_resize', { sessionId: sessionIdRef.current, cols: term.cols, rows: term.rows })
      }
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      disposed = true
      resizeObserver.disconnect()
      dataListener.dispose()
      term.dispose()
      if (sessionIdRef.current) {
        invoke('pty_kill', { sessionId: sessionIdRef.current })
      }
    }
  }, [localPath])

  return <div ref={containerRef} className="flex-1 min-h-0" />
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/components/Terminal/TerminalPanel.test.tsx`
Expected: PASS

- [ ] **Step 6: 同步修正 App.test.tsx（占位文案断言已失效）**

`src/App.test.tsx` 里 `'switches to the terminal panel and back...'` 用例断言文案 `/终端面板/` 已经不成立。把该用例改为只断言视图切换本身（不深入终端内部渲染细节，内部细节已由 Task 6 的 `TerminalPanel.test.tsx` 覆盖）：

```tsx
  it('switches to the terminal panel and back when the project has a bound directory', () => {
    const projectId = useStore.getState().projects[0].id
    useStore.getState().setProjectLocalPath(projectId, '/Users/sam/code/demo')
    render(<App />)

    fireEvent.click(screen.getByText('终端'))
    expect(screen.queryByText('已学习的分类规则')).toBeInTheDocument()
    expect(screen.getByText('返回笔记')).toBeInTheDocument()

    fireEvent.click(screen.getByText('返回笔记'))
    expect(screen.getByText('终端')).toBeInTheDocument()
  })
```

该用例会真实挂载 `TerminalPanel`，因此需要在同一文件里加上和 Task 6 一样的 `@xterm/xterm`、`@xterm/addon-fit`、`@tauri-apps/api/core`、`ResizeObserver` mock（复制 Task 6 Step 2 中对应的 `vi.mock` 块和 `beforeEach` 设置到 `src/App.test.tsx` 顶部）。

- [ ] **Step 7: 运行全部前端测试确认通过**

Run: `npx vitest run`
Expected: PASS（全部测试套件）

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/components/Terminal/TerminalPanel.tsx src/components/Terminal/TerminalPanel.test.tsx src/App.test.tsx
git commit -m "feat: render a real xterm.js terminal backed by the pty commands"
```

---

### Task 7: 终端会话常驻模块

**Files:**
- Create: `src/lib/terminalSessions.ts`
- Test: `src/lib/terminalSessions.test.ts`
- Modify: `src/components/Terminal/TerminalPanel.tsx`
- Test: `src/components/Terminal/TerminalPanel.test.tsx`
- Modify: `src/store/useStore.ts`
- Test: `src/store/useStore.test.ts`

**Interfaces:**
- Consumes: Tauri 命令 `pty_spawn`/`pty_write`/`pty_resize`/`pty_kill` from Task 5
- Produces: `ensureSession(projectId, cwd): Promise<Session>`、`attach(projectId, listener)`、`detach(projectId)`、`writeToSession(projectId, data)`、`resizeSession(projectId, cols, rows)`、`killSession(projectId)`、`hasSession(projectId): boolean`

- [ ] **Step 1: 写失败测试 —— 会话常驻、缓冲与回放**

新建 `src/lib/terminalSessions.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

vi.mock('@tauri-apps/api/core', () => {
  class FakeChannel {
    onmessage: ((data: string) => void) | null = null
  }
  return { invoke: vi.fn(), Channel: FakeChannel }
})

import { invoke } from '@tauri-apps/api/core'
import { ensureSession, attach, detach, killSession, hasSession } from './terminalSessions'

beforeEach(() => {
  ;(invoke as Mock).mockReset()
})

describe('terminalSessions', () => {
  it('reuses an existing session for the same project instead of spawning twice', async () => {
    ;(invoke as Mock).mockResolvedValue('session-1')
    const first = await ensureSession('p1', '/tmp')
    const second = await ensureSession('p1', '/tmp')
    expect(first).toBe(second)
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('buffers output received while detached and flushes it on attach', async () => {
    ;(invoke as Mock).mockResolvedValue('session-1')
    const session = await ensureSession('p2', '/tmp')
    session.channel.onmessage?.('hello ')
    session.channel.onmessage?.('world')

    const received: string[] = []
    attach('p2', chunk => received.push(chunk))
    expect(received).toEqual(['hello world'])
  })

  it('delivers output live to the attached listener', async () => {
    ;(invoke as Mock).mockResolvedValue('session-1')
    const session = await ensureSession('p3', '/tmp')
    const received: string[] = []
    attach('p3', chunk => received.push(chunk))

    session.channel.onmessage?.('live-chunk')
    expect(received).toEqual(['live-chunk'])
  })

  it('removes the session and kills the pty process', async () => {
    ;(invoke as Mock).mockResolvedValue('session-1')
    await ensureSession('p4', '/tmp')
    expect(hasSession('p4')).toBe(true)

    killSession('p4')
    expect(hasSession('p4')).toBe(false)
    expect(invoke).toHaveBeenCalledWith('pty_kill', { sessionId: 'session-1' })
  })

  it('detach stops delivering output to the previous listener', async () => {
    ;(invoke as Mock).mockResolvedValue('session-1')
    const session = await ensureSession('p5', '/tmp')
    const received: string[] = []
    attach('p5', chunk => received.push(chunk))
    detach('p5')

    session.channel.onmessage?.('after-detach')
    expect(received).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/terminalSessions.test.ts`
Expected: FAIL，找不到模块 `./terminalSessions`

- [ ] **Step 3: 实现 —— `terminalSessions.ts`**

新建 `src/lib/terminalSessions.ts`：

```ts
import { Channel, invoke } from '@tauri-apps/api/core'

const MAX_BUFFER_CHARS = 200_000

interface TerminalSession {
  sessionId: string
  channel: Channel<string>
  buffer: string[]
  listener: ((chunk: string) => void) | null
}

const sessions = new Map<string, TerminalSession>()

function pushBuffered(session: TerminalSession, chunk: string) {
  session.buffer.push(chunk)
  let total = session.buffer.reduce((n, c) => n + c.length, 0)
  while (total > MAX_BUFFER_CHARS && session.buffer.length > 1) {
    total -= session.buffer[0].length
    session.buffer.shift()
  }
}

export async function ensureSession(projectId: string, cwd: string): Promise<TerminalSession> {
  const existing = sessions.get(projectId)
  if (existing) return existing

  const channel = new Channel<string>()
  const session: TerminalSession = { sessionId: '', channel, buffer: [], listener: null }
  channel.onmessage = chunk => {
    if (session.listener) session.listener(chunk)
    else pushBuffered(session, chunk)
  }

  sessions.set(projectId, session)
  const sessionId = await invoke<string>('pty_spawn', { cwd, onData: channel })
  session.sessionId = sessionId
  return session
}

export function attach(projectId: string, listener: (chunk: string) => void): void {
  const session = sessions.get(projectId)
  if (!session) return
  if (session.buffer.length) {
    listener(session.buffer.join(''))
    session.buffer = []
  }
  session.listener = listener
}

export function detach(projectId: string): void {
  const session = sessions.get(projectId)
  if (session) session.listener = null
}

export function hasSession(projectId: string): boolean {
  return sessions.has(projectId)
}

export function writeToSession(projectId: string, data: string): void {
  const session = sessions.get(projectId)
  if (session?.sessionId) {
    invoke('pty_write', { sessionId: session.sessionId, data })
  }
}

export function resizeSession(projectId: string, cols: number, rows: number): void {
  const session = sessions.get(projectId)
  if (session?.sessionId) {
    invoke('pty_resize', { sessionId: session.sessionId, cols, rows })
  }
}

export function killSession(projectId: string): void {
  const session = sessions.get(projectId)
  if (!session) return
  sessions.delete(projectId)
  if (session.sessionId) {
    invoke('pty_kill', { sessionId: session.sessionId })
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/terminalSessions.test.ts`
Expected: PASS

- [ ] **Step 5: 改写 TerminalPanel 使用常驻会话，加"关闭终端"按钮**

整体替换 `src/components/Terminal/TerminalPanel.tsx`：

```tsx
import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { ensureSession, attach, detach, writeToSession, resizeSession, killSession } from '../../lib/terminalSessions'
import '@xterm/xterm/css/xterm.css'

interface Props {
  projectId: string
  localPath: string
}

export function TerminalPanel({ projectId, localPath }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    setError(null)

    const term = new Terminal({ convertEol: true, fontSize: 13 })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    let disposed = false
    ensureSession(projectId, localPath)
      .then(() => {
        if (disposed) return
        attach(projectId, chunk => term.write(chunk))
      })
      .catch((err: unknown) => {
        if (disposed) return
        setError(err instanceof Error ? err.message : String(err))
      })

    const dataListener = term.onData(data => writeToSession(projectId, data))

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      resizeSession(projectId, term.cols, term.rows)
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      disposed = true
      resizeObserver.disconnect()
      dataListener.dispose()
      detach(projectId)
      term.dispose()
    }
  }, [projectId, localPath])

  function handleClose() {
    killSession(projectId)
    setError(null)
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-red-300 p-4 text-center">
        <span>终端启动失败：{error}</span>
        <span className="text-gray-500 text-xs">请检查项目绑定的目录是否仍然存在</span>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex justify-end px-3 py-1 border-b border-glass-border">
        <button
          onClick={handleClose}
          className="text-xs text-gray-500 hover:text-red-400 transition-colors"
        >
          关闭终端
        </button>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  )
}
```

- [ ] **Step 6: 更新 TerminalPanel.test.tsx 以验证常驻而非杀进程**

整体替换 `src/components/Terminal/TerminalPanel.test.tsx`：

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

vi.mock('@xterm/xterm', () => {
  class FakeTerminal {
    cols = 80
    rows = 24
    loadAddon = vi.fn()
    open = vi.fn()
    write = vi.fn()
    dispose = vi.fn()
    onData = vi.fn(() => ({ dispose: vi.fn() }))
  }
  return { Terminal: FakeTerminal }
})

vi.mock('@xterm/addon-fit', () => {
  class FakeFitAddon {
    fit = vi.fn()
  }
  return { FitAddon: FakeFitAddon }
})

vi.mock('../../lib/terminalSessions', () => ({
  ensureSession: vi.fn(),
  attach: vi.fn(),
  detach: vi.fn(),
  writeToSession: vi.fn(),
  resizeSession: vi.fn(),
  killSession: vi.fn(),
}))

import { ensureSession, killSession } from '../../lib/terminalSessions'
import { TerminalPanel } from './TerminalPanel'

class FakeResizeObserver {
  observe = vi.fn()
  disconnect = vi.fn()
}

beforeEach(() => {
  ;(ensureSession as Mock).mockReset()
  ;(ensureSession as Mock).mockResolvedValue({ sessionId: 'session-1' })
  ;(killSession as Mock).mockReset()
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver
})

afterEach(() => {
  cleanup()
})

describe('TerminalPanel', () => {
  it('requests a session for the project and bound directory on mount', async () => {
    render(<TerminalPanel projectId="p1" localPath="/Users/sam/code/demo" />)
    await waitFor(() => {
      expect(ensureSession).toHaveBeenCalledWith('p1', '/Users/sam/code/demo')
    })
  })

  it('does not kill the session on unmount', async () => {
    const { unmount } = render(<TerminalPanel projectId="p1" localPath="/Users/sam/code/demo" />)
    await waitFor(() => expect(ensureSession).toHaveBeenCalled())
    unmount()
    expect(killSession).not.toHaveBeenCalled()
  })

  it('kills the session when the close button is clicked', async () => {
    render(<TerminalPanel projectId="p1" localPath="/Users/sam/code/demo" />)
    await waitFor(() => expect(ensureSession).toHaveBeenCalled())

    fireEvent.click(screen.getByText('关闭终端'))
    expect(killSession).toHaveBeenCalledWith('p1')
  })
})
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npx vitest run src/components/Terminal/TerminalPanel.test.tsx`
Expected: PASS

- [ ] **Step 8: 项目删除时联动清理会话**

`src/store/useStore.ts`，顶部 import 区加入：

```ts
import { killSession } from '../lib/terminalSessions'
```

`deleteProject` 实现的第一行加入清理调用：

```ts
    deleteProject(id) {
      killSession(id)
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
```

- [ ] **Step 9: 写失败测试 —— 删除项目杀死其终端会话**

`src/store/useStore.test.ts` 顶部 import 区改为：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { useStore } from './useStore'

vi.mock('@tauri-apps/api/core', () => {
  class FakeChannel {
    onmessage: ((data: string) => void) | null = null
  }
  return { invoke: vi.fn(), Channel: FakeChannel }
})

import { invoke } from '@tauri-apps/api/core'
import { ensureSession, hasSession } from '../lib/terminalSessions'
```

在文件末尾新增：

```ts
describe('project deletion cleans up terminal sessions', () => {
  beforeEach(() => {
    resetStore()
    ;(invoke as Mock).mockReset()
    ;(invoke as Mock).mockResolvedValue('session-1')
  })

  it('kills the running terminal session when its project is deleted', async () => {
    useStore.getState().createProject('测试项目')
    const project = useStore.getState().projects[0]
    await ensureSession(project.id, '/tmp')
    expect(hasSession(project.id)).toBe(true)

    useStore.getState().deleteProject(project.id)

    expect(hasSession(project.id)).toBe(false)
    expect(invoke).toHaveBeenCalledWith('pty_kill', { sessionId: 'session-1' })
  })
})
```

- [ ] **Step 10: 运行测试确认通过**

Run: `npx vitest run src/store/useStore.test.ts`
Expected: PASS（包括既有的 learned rules、main view 用例）

- [ ] **Step 11: 运行全部前端测试确认无回归**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add src/lib/terminalSessions.ts src/lib/terminalSessions.test.ts src/components/Terminal/TerminalPanel.tsx src/components/Terminal/TerminalPanel.test.tsx src/store/useStore.ts src/store/useStore.test.ts
git commit -m "feat: keep terminal sessions alive across view switches and clean up on project deletion"
```

---

### Task 8: 错误处理 —— 目录缺失 / spawn 失败

**Files:**
- Modify: `src/components/Terminal/TerminalPanel.tsx`
- Test: `src/components/Terminal/TerminalPanel.test.tsx`

**Interfaces:**
- Consumes: `ensureSession` 的 rejected Promise from Task 7；`useStore.getState().setMainView` from Task 1
- Produces: 无新增导出，只是 `TerminalPanel` 错误态新增一个"返回笔记，重新绑定目录"按钮

- [ ] **Step 1: 写失败测试 —— 错误态展示与返回笔记**

`src/components/Terminal/TerminalPanel.test.tsx`，在 `import { TerminalPanel } from './TerminalPanel'` 之后追加：

```tsx
import { useStore } from '../../store/useStore'
```

在 `describe('TerminalPanel', ...)` 块内追加两个用例：

```tsx
  it('shows an error message when the session fails to start', async () => {
    ;(ensureSession as Mock).mockRejectedValue(new Error('cwd 不存在'))
    render(<TerminalPanel projectId="p1" localPath="/deleted/path" />)

    expect(await screen.findByText(/终端启动失败/)).toBeInTheDocument()
    expect(screen.getByText(/cwd 不存在/)).toBeInTheDocument()
  })

  it('returns to the notes view from the error state', async () => {
    ;(ensureSession as Mock).mockRejectedValue(new Error('cwd 不存在'))
    useStore.setState({ mainView: 'terminal' })
    render(<TerminalPanel projectId="p1" localPath="/deleted/path" />)

    fireEvent.click(await screen.findByText('返回笔记，重新绑定目录'))
    expect(useStore.getState().mainView).toBe('notes')
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/components/Terminal/TerminalPanel.test.tsx`
Expected: FAIL（第一个新用例可能已经因 Task 7 的实现部分通过，第二个用例找不到"返回笔记，重新绑定目录"按钮）

- [ ] **Step 3: 实现 —— 错误态加入返回笔记按钮**

`src/components/Terminal/TerminalPanel.tsx`，顶部 import 区加入：

```tsx
import { useStore } from '../../store/useStore'
```

把错误态渲染块替换为：

```tsx
  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-red-300 p-4 text-center">
        <span>终端启动失败：{error}</span>
        <span className="text-gray-500 text-xs">请检查项目绑定的目录是否仍然存在</span>
        <button
          onClick={() => useStore.getState().setMainView('notes')}
          className="text-xs text-gray-400 hover:text-gray-200 underline mt-1"
        >
          返回笔记，重新绑定目录
        </button>
      </div>
    )
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/components/Terminal/TerminalPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: 运行全部前端测试 + 全部 Rust 测试确认无回归**

Run: `npx vitest run && cd src-tauri && cargo test && cd ..`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/Terminal/TerminalPanel.tsx src/components/Terminal/TerminalPanel.test.tsx
git commit -m "feat: show a recoverable error state when a terminal session fails to start"
```

---

## 手动验证（自动化测试覆盖不到的部分）

以上任务的自动化测试覆盖了所有纯逻辑（store、会话缓冲、pty 核心读写）。以下行为依赖真实的 macOS pty + Tauri runtime + 真实渲染的 xterm 画面，必须跑起真实应用手动确认：

```bash
npm run tauri:dev
```

1. 新建一个项目，给它绑定一个真实存在的本地目录（如 `~/devnotes`），点击"终端"——应看到一个可输入的终端，提示符显示绑定目录。
2. 在终端里跑 `pwd`，确认输出路径与绑定目录一致。
3. 跑一个持续输出的命令（如 `ping localhost`），切回"笔记"视图等几秒，再切回"终端"——应看到期间产生的输出被正确回放，且命令仍在继续跑。
4. 点击"关闭终端"，再次点击"终端"按钮——应重新起一个全新会话（之前的 `ping` 不应再继续输出）。
5. 把绑定目录在 Finder 里删除或改名，点击"终端"——应看到"终端启动失败"提示，点击"返回笔记，重新绑定目录"能正常回到笔记视图。
6. 完全退出 App（`Cmd+Q`），用 `ps aux | grep zsh` 确认没有残留的孤儿 shell 进程。
