# 项目内嵌终端

## 背景与问题

DevNotes 目前是一个纯逻辑容器型的笔记工具：`Project` 只有 `id`/`name`/`createdAt`，不关联任何本地文件系统路径。用户希望在"进入项目"时能直接打开一个**嵌在 DevNotes 窗口内部**的终端，并自动 `cd` 到该项目对应的本地目录——而不是拉起一个独立的系统 Terminal.app 窗口。

这要求：
1. 给项目补上"本地目录"这个缺失的概念。
2. 在前端渲染一个真正可交互的终端界面（不是简单的命令执行框）。
3. 在 Rust 侧起一个真实的 pty + shell 进程，并和前端做双向数据流转发。

## 已排除的方向

- **拉起系统 Terminal.app（AppleScript / `open -a Terminal`）**：实现简单，但终端窗口在 DevNotes 外部，不满足"嵌入"的核心要求。不采用。
- **非 pty 的伪终端（每次输入单独 `exec` 一条命令，拼接 stdout）**：无法支持交互式程序（如 `vim`、`npm run dev` 的持续输出、`Ctrl+C` 等控制信号），不是真正的终端体验。不采用。
- **通过本地 HTTP/WebSocket 服务（如内嵌 ttyd 二进制）+ iframe 渲染**：要多打包一个二进制、多起一个本地端口，链路更长、攻击面更大，对桌面 App 而言是不必要的间接层。不采用，直接用 Tauri IPC 桥接更直接。
- **同一项目支持多个终端实例（多开 tab）**：当前笔记侧本身没有真正的多 Tab 切换 UI（`TabBar.tsx` 实际是分类筛选条，`Tab` 实体每项目固定一个"默认"且无切换界面），为终端单独造一套多实例 tab 管理超出本次需求。不采用，每项目最多一个终端实例。

## 方案概述

1. **数据模型**：`Project` 增加可选字段 `localPath?: string`，创建/编辑项目时通过系统文件夹选择器绑定。
2. **视图切换**：主区域 header 新增"终端"按钮，点击后整块主区域从"笔记列表 + 编辑器"切换为"终端面板"；再点一次切回笔记视图。未绑定目录的项目该按钮置灰。
3. **终端渲染**：前端用 `xterm.js` 渲染终端 UI；Rust 侧用 `portable-pty` 起 pty + shell，`cwd` 设为 `localPath`。
4. **生命周期**：切换视图或切换项目不杀进程（继续在后台跑），只有用户在终端面板里点"关闭终端"或退出 App 时才真正结束进程。

---

## 1. 数据模型与目录绑定

`src/types/index.ts` 的 `Project` 增加：

```ts
export interface Project {
  id: string
  name: string
  createdAt: number
  localPath?: string  // 绑定的本地目录绝对路径，未绑定时为 undefined
}
```

- `Sidebar.tsx` 创建项目的输入框旁，新增一个"选择目录"按钮，调用 Tauri `dialog` 插件（`@tauri-apps/plugin-dialog` 的 `open({ directory: true })`）弹出系统文件夹选择器，选中后把路径存入 `localPath`。目录是可选的——不选也能正常创建项目，只是终端功能不可用。
- 双击项目名进入重命名态时，同一处额外提供"重新选择目录"入口，可补绑或更换路径。
- 需要在 `src-tauri/capabilities` 对应的 capability 文件里加入 `dialog:default`（或具体的 `dialog:allow-open`）权限，否则前端调用会被 Tauri 的权限系统拒绝。

## 2. 视图切换

- `App.tsx` 现有 header（`SearchBar` + "已学习的分类规则"按钮所在行）新增一个"终端"按钮：
  - 未绑定 `localPath` 的项目：按钮置灰，`title` 提示"请先在侧边栏为项目绑定本地目录"。
  - 已绑定：点击切换 `MemoryState` 里新增的 `mainView: 'notes' | 'terminal'`（不持久化,和 `activeCategoryFilter` 同级）。
- `mainView === 'terminal'` 时，原来的 `TabBar` / `NoteList` / `Editor` 整块替换为新组件 `TerminalPanel`。
- 切换项目（`setActiveProject`）时把 `mainView` 重置为 `'notes'`，避免切到一个没有终端的新项目却停留在终端视图。

## 3. 终端组件与 pty 桥

**前端（`src/components/Terminal/TerminalPanel.tsx`）**：
- 用 `@xterm/xterm` + `@xterm/addon-fit` 渲染终端 DOM，容器随窗口 resize 调用 `fitAddon.fit()`。
- 组件挂载时：若该项目已有运行中的 session（见下），直接 attach 监听；否则调用 Tauri command `pty_spawn(project_id, cwd)` 起一个新会话，拿到 `session_id`。
- 用户键盘输入 → `pty_write(session_id, data)`。
- 监听 Tauri `Channel`（spawn 时由后端返回）持续接收 pty 输出 → 写入 xterm。
- resize 时调用 `pty_resize(session_id, cols, rows)` 同步 pty 窗口大小。
- 面板内"关闭终端"按钮 → 调用 `pty_kill(session_id)`，关闭后该项目的会话状态复位，下次进入终端视图会重新 spawn。

**会话归属与常驻**：
- 前端维护一个不持久化的 map：`projectId -> sessionId | null`（放在 zustand store 的 `MemoryState`，类似 `activeCategoryFilter`）。`TerminalPanel` unmount（切回笔记视图）时**不**调用 `pty_kill`，只是停止渲染；`session_id` 仍保留在 map 里，进程在 Rust 侧继续跑。
- 再次进入该项目的终端视图时，若 map 里已有存活的 `session_id`，直接复用并请求一次"重放当前屏幕内容"（pty 侧用 `portable-pty` 自带的输出无法回放历史，因此前端额外维护一份 xterm 的 serialize 缓存——用 `@xterm/addon-serialize` 在 unmount 前序列化当前屏幕，重新挂载时 `write` 回去，保证用户切回来看到的是离开前的画面，而不是空白）。

**后端（Rust，新建 `src-tauri/src/pty.rs`，在 `lib.rs` 里注册 command）**：
- 依赖：`portable-pty`、`tauri` 的 `Channel`。
- 全局状态：`Mutex<HashMap<String, Box<dyn MasterPty + Send>>>`（session_id -> pty 句柄），作为 Tauri 的 managed state。
- `pty_spawn(project_id, cwd) -> (session_id, Channel<String>)`：起 `$SHELL`（环境变量取不到则回退 `/bin/zsh`），`cwd` 设为传入路径；起一个后台线程持续 `read` pty 输出，通过 `Channel` 推给前端。
- `pty_write(session_id, data)` / `pty_resize(session_id, cols, rows)` / `pty_kill(session_id)`：对 map 里的句柄做相应操作，找不到对应 `session_id` 时静默忽略（说明进程已经结束或从未成功 spawn）。

## 4. 生命周期与清理

- 切换视图、切换项目：进程不受影响，继续在后台运行（例如终端里在跑 `npm run dev`）。
- 显式点击"关闭终端"：杀进程 + 从 map 中移除该 session。
- App 退出：在 `lib.rs` 的 `run()` 里挂一个 `on_window_event` / `RunEvent::ExitRequested` 处理器，遍历 managed state 里所有句柄统一 kill，避免残留孤儿 shell 进程。
- 项目被删除（`deleteProject`）：如果该项目有存活的终端 session，连带 kill 掉，并从前端的 `projectId -> sessionId` map 里移除。

## 5. 错误处理

- 绑定的 `localPath` 在终端打开时已不存在（被外部删除/改名）：`pty_spawn` 失败，前端在终端面板里展示一段错误提示文案（"目录不存在，请重新绑定"），不渲染 xterm，提供一个跳转回 Sidebar 编辑态的入口。
- `pty_spawn` 因其它原因失败（如 shell 路径不可执行）：同样展示错误文案，附带原始错误信息，方便用户排查。

---

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/types/index.ts` | `Project` 增加 `localPath?: string` |
| `src/components/Sidebar/Sidebar.tsx` | 创建/编辑项目处增加"选择目录"按钮，调用 `dialog` 插件 |
| `src/store/useStore.ts` | 新增 `mainView` 内存态、`setMainView` action；`setActiveProject` 重置 `mainView`；新增 `projectId -> sessionId` 内存态 map 及读写 action；`deleteProject` 连带清理 session |
| `src/App.tsx` | header 新增"终端"按钮；按 `mainView` 切换渲染笔记区 / `TerminalPanel` |
| `src/components/Terminal/TerminalPanel.tsx`（新增） | xterm.js 渲染、pty command 调用、序列化缓存的挂载/卸载逻辑 |
| `src-tauri/src/pty.rs`（新增） | `portable-pty` 封装、`pty_spawn`/`pty_write`/`pty_resize`/`pty_kill` 四个 command、全局 session map |
| `src-tauri/src/lib.rs` | 注册 pty 相关 command、managed state；挂退出清理钩子 |
| `src-tauri/Cargo.toml` | 新增依赖 `portable-pty` |
| `src-tauri/capabilities/*` | 新增 `dialog` 插件权限 |
| `package.json` | 新增依赖 `@xterm/xterm`、`@xterm/addon-fit`、`@xterm/addon-serialize`、`@tauri-apps/plugin-dialog` |

## 范围之外（本次不做）

- 同一项目内多开终端实例 / 终端的多 Tab 切换 UI。
- 终端外观/字体/配色等自定义设置。
- Windows / Linux 适配（沿用项目当前 macOS 优先定位）。
- 笔记侧本身的多 Tab 切换能力（虽然这次发现它实际不存在，但补齐它不属于本次范围）。
