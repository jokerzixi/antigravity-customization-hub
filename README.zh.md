# Antigravity Skill & MCP Studio (扩展中心)

> 专为 **Google Antigravity 2.0** 设计的侧边栏可视化扩展中心。在 GUI 界面内直接配置、探针测试与管理 **MCP (Model Context Protocol) 服务** 与 **智能体技能 (Skills)**，彻底告别在终端手动执行命令和手写 JSON 配置文件！

---

## 🌟 核心特性

- 🔌 **MCP 服务可视化管理**：
  - 摆脱手写 `mcp_config.json`，在表单中直接填写名称、启动命令、参数与环境变量。
  - **实时探针握手测试（Ping & Tool Discovery）**：后台自动执行 JSON-RPC 握手，探测服务可用性并在界面上高亮展示返回的工具列表。
- ⚡ **智能体技能 (Skills) 编排**：
  - 支持查看全局技能与当前工作区专属技能。
  - 在线 Markdown 编辑器直接编写 `SKILL.md`，自动维护 YAML Frontmatter 元数据。
- 🏪 **一键装机模版库 (Templates Store)**：
  - 内置热门 MCP 服务（SQLite、Filesystem、GitHub、PostgreSQL、Fetch、Puppeteer、Brave Search、Memory）。
  - 内置实用技能（代码全量审查、单元测试生成器、智能 Git Commit 提炼等）。
- 🚀 **免终端输入 & 即时热重载**：
  - 修改后自动同步至 Antigravity 规范路径，大模型在下一轮对话中即可立即感知并调用。

---

## 📦 项目结构

```
antigravity-customization-hub/
├── sidecar.json       # Antigravity Sidecar UI 插件规范配置
├── server.js          # 本地轻量 REST API 服务 (Node.js 原生零依赖)
├── public/            # 可视化 SPA 前端 (自适应侧边栏与暗色主题)
│   ├── index.html     # 主视图骨架
│   ├── style.css      # 现代 Antigravity 风格暗色 CSS
│   └── app.js         # 前端交互与 API 控制器
├── install.py         # 一键安装脚本 (自动挂载至 ~/.gemini/config/sidecars/)
├── README.zh.md       # 中文文档
└── README.md          # 英文文档
```

---

## 🚀 快速安装与使用

### 1. 安装挂载到 Antigravity
确保本地已安装 Node.js，在项目根目录下执行：

```bash
python install.py
```

该脚本会自动将插件挂载至 `~/.gemini/config/sidecars/customization-hub`。

### 2. 启动与呼出面板
* **重启 Antigravity 2.0**：客户端在启动时会自动识别并挂载该 Sidecar。
* **在聊天中直接打开**：在任意对话中点击专用链接：
  👉 `[🧩 打开扩展中心](sidecar://customization-hub/)`
  Antigravity 会立即在右侧辅助面板（Aux Pane）中滑出该工作台。
* **独立浏览器访问**：也可在任意浏览器中直接打开 `http://127.0.0.1:38292` 全屏使用。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。
