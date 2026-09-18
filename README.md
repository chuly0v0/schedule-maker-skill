# Schedule Maker Skill（日程长图生成器）

把自然语言日程整理成结构化卡片，生成 PNG 长图和可以继续修改的在线编辑链接。

## 功能

- 解析相对日期、时段和日程事项
- 合并同一天的事项为一张卡片
- 为主标题、副标题和卡片标题添加合适的 emoji
- 支持重点日程高亮
- 使用隔离的 Chrome 或 Edge 无界面会话生成 PNG
- 生成包含完整日程数据的在线编辑链接

## 环境要求

- Codex
- Node.js 22 或更高版本
- Chrome 或 Edge
- 生成图片时可以访问 `https://chuly0v0.github.io/schedule-maker/`

## 通过 Agent 安装



```text
请使用 $skill-installer 从这个 GitHub 地址安装技能：
https://github.com/chuly0v0/schedule-maker-skill/tree/main/skills/schedule-maker
```

安装完成后，可以这样使用：

```text
使用日程长图 skill 生成长图。明天上午锻炼，下午去公园，晚上和朋友吃饭。
```

## 手动安装

把 [`skills/schedule-maker`](skills/schedule-maker) 整个文件夹复制到个人技能目录：

```text
$HOME/.agents/skills/schedule-maker
```

如果技能没有立即出现，请重启 Codex。

## 仓库结构

```text
skills/schedule-maker/
├── SKILL.md
├── agents/openai.yaml
├── references/schedule-schema.md
└── scripts/
    ├── prepare_schedule.mjs
    └── render_schedule.mjs
```

## 隐私说明

生成的在线编辑链接会把日程数据编码在 URL 片段中。任何拿到完整链接的人都可以读取其中的日程内容。请勿公开包含私人安排的编辑链接。

