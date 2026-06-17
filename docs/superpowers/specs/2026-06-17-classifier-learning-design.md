# 分类引擎升级：规则增强 + 学习机制

## 背景与问题

DevNotes 的核心价值是"粘贴即自动分类"。当前 `src/lib/classifier.ts` 用一套静态正则规则判断 cmd/url/secret/config/note，已有"手动改分类后永久锁定"机制（`manualCategory`），但默认分类本身存在两类典型问题：

1. **cmd 漏判**：`claude --resume 4338966a-...` 被分到 `note`。根因是 cmd 识别依赖硬编码命令白名单（`sudo|git|npm|...|make`），新出现的 CLI 工具（claude、gh、pnpm dlx、terraform 等）不在列表里就会漏判，这是个无底洞——每出现新工具都要改代码。
2. **config 误判**：`Skills: /gen-sprite` 被分到 `config`。根因是 `CONFIG_PATTERN` 对"`词: 值`"形式的判断过于宽松，把自然语言的"标签: 内容"也当成了配置项。这类判断本质上是歧义的（`Host: 192.168.1.1` 该算 config，`Skills: /gen-sprite` 不该算），单靠正则精细化无法两全，还容易引入新的回归。

## 已排除的方向

- **引入 LLM（如 DeepSeek）做分类**：与产品"完全本地、无需联网"的定位冲突；DevNotes 存的恰恰是 secret/token，把内容发到第三方 API 有隐私顾虑；网络请求也违背"粘贴即分类"的即时体验。不采用，现阶段完全不碰。
- **图片/附件支持**：图片是"文件"不是"可分类文本"，硬塞进现有分类体系会破坏简单高效的定位，且用户自己对这个需求也不强烈。不在本次范围内。
- **继续在 `CONFIG_PATTERN` 上打补丁**：`Skills:` 和 `Host:` 这类歧义无法靠正则精细化彻底解决，容易"修一个、坏一个"。改用学习机制兜底，不再继续在这条正则上做文章。

## 方案概述

两条腿走路：

1. **规则增强**：把 cmd 识别从"白名单匹配"换成"命令行特征识别"（检测 `--flag`/`-x` 模式），覆盖大部分新工具场景，无需持续维护白名单。
2. **学习机制**：用户手动纠正某条笔记的分类时，系统从内容中提取一个"信号"，记住"信号 → 纠正后的分类"，之后新笔记命中同样信号就直接套用，不再依赖正则猜测。学习规则全局生效、可在 UI 里查看和删除。

两者职责分工明确：规则增强解决**信号明确、可泛化**的问题（命令行 flag 是强信号）；学习机制解决**本质歧义、长尾**的问题（自然语言标签 vs 配置键无法靠语法区分）。

---

## 1. 规则增强：cmd 的命令行特征识别

新增一条判断逻辑，独立于现有白名单：

- 内容首行以英文/数字/路径样式的词开头（不含 `:`/`=`，即不是 `key: value` 或 `key=value` 形式）
- 该词后面（最多间隔 1~2 个同类型的裸词，如 `git commit -m` 中的 `commit`）跟着一个 flag 模式：`--word` 或 `-x`（单/双横线 + 字母开头）

满足以上条件即判定为 `cmd`。

**示例：**
- `claude --resume 4338966a-...` → 匹配（claude 后直接跟 `--resume`）
- `vercel --prod` → 匹配
- `gh pr create --title "x"` → 匹配（gh、pr、create 三个裸词后跟 `--title`）
- `git commit -m "fix"` → 已被现有白名单覆盖，新规则也能匹配，不冲突

**优先级**：这条规则放在现有规则链的**末尾**（在 `CONFIG_PATTERN` 判断之后，`looksLikeSecret` 判断之前）。这样：
- 已有的 url/secret/config 高置信度规则优先于这条较"模糊"的启发式规则
- 现有测试（如 `PORT: 3000` → config）不受影响，不会被新规则抢先匹配

**已知局限**：纯英文叙述句里偶然出现 `-word` 也可能被误判为 cmd（例如"建议用 -prod 这个参数"）。这是启发式规则的固有代价，预期在真实使用场景中少见；万一发生，由第 2 节的学习机制兜底——用户纠正一次即可，不需要规则做到 100% 精确。

`CONFIG_PATTERN` 本身**不做改动**，避免引入新的歧义判断和回归风险。

---

## 2. 学习机制

### 2.1 触发时机

用户手动修改一条笔记的分类时（即现有"手工锁定"发生的那一刻，`updateNote` 传入 `manualCategory` 的分支），额外执行一次"学习"动作。

### 2.2 信号提取规则

只看笔记内容的**第一行**：

1. 若匹配 `^([\w.-]+)\s*[:=]` （形如 `词: 值` 或 `词=值`）→ 取分隔符前的词作为信号（如 `Skills`、`PORT`）
2. 否则若匹配 `^([A-Za-z][\w.-]*)` （以英文/数字单词开头）→ 取第一个词作为信号（如 `claude`）
3. 否则（纯中文开头，或不符合以上任何形式）→ **不学习**。这条笔记仍受现有"手工锁定"保护，只是这次纠正不会泛化到其他笔记。

信号统一转小写存储和匹配，避免大小写不一致导致学习规则失效。

### 2.3 存储

`AppState` 新增字段：

```ts
learnedRules: Record<string, NoteCategory>  // key: 归一化后的信号；value: 分类
```

- 全局一份，不分项目（"claude"、"Skills:" 这类是用户个人工具习惯，与具体项目无关）
- 和其它数据一样持久化到本地文件（`storage.ts` 的 `EMPTY` 默认值加上 `learnedRules: {}`，旧数据加载时自动补齐）
- 同一信号被再次纠正为不同分类时，直接覆盖旧映射（"学错了，再纠正一次就覆盖"）

### 2.4 生效优先级

`classify()` 签名调整为 `classify(content: string, learnedRules: Record<string, NoteCategory> = {})`。

执行时**最先**用 2.2 节同样的逻辑提取信号，命中 `learnedRules` 就直接返回对应分类，跳过所有正则规则。未命中才继续走原有规则链。

调用方（`useStore.ts` 的 `addNote` 自动分类、`updateNote` 内容变更后的自动重分类分支）都需要把 `get().learnedRules` 传进去。

注意：这只影响**默认/自动**分类路径。已经被手工锁定（`manualCategory: true`）的笔记完全不受学习规则影响——锁定优先级最高，这是现有行为，本次不改变。

### 2.5 管理 UI

- 入口：侧边栏标题 "DevNotes" 文字右侧加一个小图标按钮（`Sidebar.tsx` 现有标题行）
- 点击后弹出一个简单弹层，列出所有 `信号 → 分类` 条目，每条带删除按钮
- 没有学习记录时显示空状态文案
- 删除某条规则后，该信号不再被自动匹配；已经生成的笔记分类不受影响（分类发生在创建/编辑那一刻，不是实时绑定）
- 不支持编辑——要改规则就删掉，下次手动纠正会重新学习，保持机制简单

---

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/lib/classifier.ts` | 新增 cmd flag 特征正则；新增信号提取函数；`classify()` 增加 `learnedRules` 参数并最先检查 |
| `src/lib/classifier.test.ts` | 新增 flag 特征 cmd 用例；新增学习规则覆盖分类的用例 |
| `src/types/index.ts` | `AppState` 新增 `learnedRules: Record<string, NoteCategory>` |
| `src/storage/storage.ts` | `EMPTY` 默认值补充 `learnedRules: {}` |
| `src/store/useStore.ts` | `updateNote` 手动分类分支里更新 `learnedRules`；`addNote`/自动重分类调用 `classify` 时传入 `learnedRules`；新增删除学习规则的 action |
| `src/components/Sidebar/Sidebar.tsx` | 标题旁加入口图标 |
| 新增组件（如 `src/components/LearnedRules/LearnedRulesPanel.tsx`） | 学习规则列表弹层 |

## 范围之外（本次不做）

- LLM/网络分类
- 图片/附件支持
- `CONFIG_PATTERN` 本身的精细化改造
- 学习规则按项目隔离
- 学习规则的编辑功能（只能删除）
