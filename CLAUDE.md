# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**DevNotes** — 面向开发者的多项目知识管理工具。支持多标签页浏览，内置 bash/代码语法高亮，自动将输入内容按类别归档（命令、URL/地址、密钥/Token、配置项等），以项目为维度隔离数据。

UI 风格：深色毛玻璃（glassmorphism），全中文界面。

## 技术栈（待定）

项目尚未初始化，技术选型阶段。预计方向：
- **前端**：React + TypeScript
- **编辑器/高亮**：CodeMirror 6 或 Monaco Editor
- **存储**：本地 SQLite（via better-sqlite3）或 JSON 文件
- **桌面封装**（可选）：Tauri 或 Electron

## 核心功能模块

1. **项目管理**：创建/切换/删除项目，每个项目数据完全隔离
2. **多标签页**：每个项目内可开多个 Tab，Tab 可命名
3. **智能分类**：解析输入内容，自动识别并归入对应类别
   - `cmd` — shell 命令（`$`/`#` 开头，或 bash 关键字）
   - `url` — HTTP/HTTPS 地址、IP:Port
   - `secret` — API Key、Token、密码（正则匹配熵值高字符串）
   - `config` — 键值对配置、环境变量
   - `note` — 普通文本备注
4. **语法高亮**：bash/shell、JSON、YAML、.env 格式
5. **搜索**：跨项目/Tab 全文检索

## 开发命令（初始化后更新）

```bash
# 开发服务器
npm run dev

# 构建
npm run build

# 类型检查
npm run typecheck

# 测试
npm test
```
