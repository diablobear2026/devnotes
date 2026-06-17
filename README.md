# DevNotes

> 面向开发者的本地知识管理工具 · A local knowledge manager built for developers

<video src="https://github.com/diablobear2026/devnotes/raw/main/demo/devnotes-demo.mp4" autoplay loop muted playsinline controls></video>

---

## 简介 · About

DevNotes 是一款运行在本地的桌面应用，帮助开发者按**项目维度**整理日常积累的命令、URL、密钥、配置项和备注。粘贴即自动分类，无需手动打标签。

A local-first desktop app that helps developers organize commands, URLs, secrets, configs, and notes — by project. Paste anything; it auto-categorizes for you.

---

## 功能特性 · Features

| 功能 | Feature |
|------|---------|
| 多项目管理，数据完全隔离 | Multi-project workspace, fully isolated data |
| 每个项目支持多标签页，可自由命名 | Multi-tab per project, tabs can be renamed |
| 智能分类：自动识别内容类型 | Smart categorization: auto-detects content type |
| 语法高亮（bash、JSON、YAML、.env） | Syntax highlighting (bash, JSON, YAML, .env) |
| 跨项目 / Tab 全文检索 | Full-text search across projects and tabs |
| 深色毛玻璃 UI | Dark glassmorphism UI |
| 完全本地，无需联网，无账号 | 100% local — no network, no account required |

### 智能分类规则 · Auto-classification Rules

| 类型 | 识别规则 |
|------|----------|
| `cmd` | `$`/`#` 开头，或 bash 关键字 |
| `url` | HTTP/HTTPS 地址、IP:Port |
| `secret` | API Key、Token、密码、邮箱、手机号 |
| `config` | 键值对、环境变量（`KEY=value`） |
| `note` | 其余普通文本 |

手动修改分类后将**永久锁定**，不再自动重分类。

> After manually changing a category, it is **permanently locked** and will not be re-classified automatically.

---

## 技术栈 · Tech Stack

- **桌面框架**：[Tauri 2](https://tauri.app)
- **前端**：React 18 + TypeScript + Vite
- **样式**：Tailwind CSS
- **状态管理**：Zustand
- **编辑器 / 高亮**：CodeMirror 6
- **存储**：本地文件（JSON）via Tauri fs API

---

## 开发 · Development

**前置要求 Prerequisites**

- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org) ≥ 18
- macOS（当前仅支持 macOS / macOS only for now）

```bash
# 安装依赖 Install dependencies
npm install

# 开发模式 Dev mode
npm run tauri:dev

# 类型检查 Type check
npm run typecheck

# 单元测试 Unit tests
npm test

# 打包构建 Production build
npm run tauri:build
```

构建产物：
- `.app` → `src-tauri/target/release/bundle/macos/DevNotes.app`
- `.dmg` → `src-tauri/target/release/bundle/dmg/DevNotes_0.1.0_aarch64.dmg`

---

## License

MIT
