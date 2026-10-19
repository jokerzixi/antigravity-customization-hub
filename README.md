# Antigravity Skill & MCP Studio

> A dedicated sidebar GUI panel for **Google Antigravity 2.0**. Configure, test, and manage **MCP (Model Context Protocol) servers** and **Agent Skills** directly inside the IDE without running terminal commands or hand-editing JSON files.

---

## 🌟 Highlights

- 🔌 **Visual MCP Server Manager**:
  - No more manual JSON editing. Visual form to configure command, arguments, and environment variables.
  - **Live Probe Handshake (Ping & Tools Discovery)**: Background handshake execution displaying available tools and latency directly in UI.
- ⚡ **Agent Skills Studio**:
  - Browse workspace-specific and global skills.
  - Built-in Markdown editor with auto-managed YAML frontmatter.
- 🏪 **1-Click Template Store**:
  - Curated popular MCP servers: SQLite, Filesystem, GitHub, PostgreSQL, Fetch, Puppeteer, Brave Search, Memory.
  - Curated Skills: Code Reviewer Pro, Unit Test Generator, Smart Git Commit.
- 🚀 **Zero Terminal & Hot Reload**:
  - Instant changes saved directly into Antigravity configuration paths.

---

## 🚀 Quick Start

### 1. Install as Antigravity Sidecar
```bash
python install.py
```

### 2. Open the Studio
* **Restart Antigravity 2.0** to mount the Sidecar.
* Click the link inside Antigravity: `[🧩 Open Studio](sidecar://customization-hub/)` to slide open the auxiliary pane.
* Or open in any browser at: `http://127.0.0.1:38292`.

---

## 📄 License

MIT License.
