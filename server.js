/**
 * Antigravity Skill & MCP Studio - Backend Server
 * 
 * Standalone Node.js HTTP server providing REST APIs for:
 * - MCP Server management (CRUD, test connection, tool discovery)
 * - Skill management (CRUD, frontmatter parsing, script attachment)
 * - Popular templates (1-click installation)
 * - Hot-reload triggering
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const url = require('url');

const HOME_DIR = os.homedir();
const GEMINI_CONFIG_DIR = path.join(HOME_DIR, '.gemini', 'config');
const GLOBAL_MCP_FILE = path.join(GEMINI_CONFIG_DIR, 'mcp_config.json');
const GLOBAL_SKILLS_DIR = path.join(GEMINI_CONFIG_DIR, 'skills');
const BUILTIN_SKILLS_DIR = path.join(HOME_DIR, '.gemini', 'antigravity', 'builtin', 'skills');

const PORT = parseInt(process.env.ANTIGRAVITY_SIDECAR_WEB_PORT || process.env.PORT || '38292', 10);
const LOG_FILE = path.join(__dirname, 'server.log');

function log(...args) {
    const msg = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
    try {
        fs.appendFileSync(LOG_FILE, msg);
    } catch (e) {}
    console.log(...args);
}

// 确保基础目录存在
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}
ensureDir(GEMINI_CONFIG_DIR);
ensureDir(GLOBAL_SKILLS_DIR);

// 读取 JSON 配置
function readJsonSafe(filePath, defaultVal = {}) {
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(raw);
        }
    } catch (e) {
        log(`Error reading JSON ${filePath}:`, e.message);
    }
    return defaultVal;
}

// 写入 JSON 配置
function writeJsonSafe(filePath, data) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// 解析 SKILL.md 的 YAML Frontmatter
function parseSkillFile(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const lines = raw.split(/\r?\n/);
        let inFrontmatter = false;
        let name = '';
        let description = '';
        let bodyLines = [];
        let frontmatterCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim() === '---') {
                frontmatterCount++;
                if (frontmatterCount === 1) {
                    inFrontmatter = true;
                    continue;
                } else if (frontmatterCount === 2) {
                    inFrontmatter = false;
                    continue;
                }
            }

            if (inFrontmatter) {
                if (line.startsWith('name:')) {
                    name = line.replace('name:', '').trim().replace(/^['"]|['"]$/g, '');
                } else if (line.startsWith('description:')) {
                    description = line.replace('description:', '').trim().replace(/^['"]|['"]$/g, '');
                }
            } else if (frontmatterCount >= 2) {
                bodyLines.push(line);
            }
        }

        return {
            name: name || path.basename(path.dirname(filePath)),
            description: description || '无描述',
            content: bodyLines.join('\n').trim(),
            raw: raw
        };
    } catch (e) {
        return null;
    }
}

// 获取当前或最近工作区列表
function getWorkspaces() {
    const workspaces = [];
    const projectsDir = path.join(GEMINI_CONFIG_DIR, 'projects');
    if (fs.existsSync(projectsDir)) {
        try {
            const files = fs.readdirSync(projectsDir);
            for (const f of files) {
                if (!f.endsWith('.json')) continue;
                const p = readJsonSafe(path.join(projectsDir, f));
                if (p && p.projectResources && p.projectResources.resources) {
                    for (const r of p.projectResources.resources) {
                        if (r.folderUri) {
                            let cleanPath = decodeURIComponent(r.folderUri.replace('file:///', ''));
                            if (cleanPath.startsWith('/') && cleanPath[2] === ':') {
                                cleanPath = cleanPath.slice(1); // 兼容 Windows 盘符
                            }
                            if (fs.existsSync(cleanPath) && !workspaces.includes(cleanPath)) {
                                workspaces.push(cleanPath);
                            }
                        }
                    }
                }
            }
        } catch (e) {}
    }
    return workspaces;
}

// 预设模版库
const PRESET_TEMPLATES = {
    mcp: [
        {
            id: 'sqlite',
            name: 'SQLite Explorer',
            description: '轻量级 SQLite 本地数据库查询与数据表管理',
            category: 'Database',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', 'E:/my-database.db'],
            env: {},
            fields: [
                { key: 'db_path', label: 'SQLite 数据库文件绝对路径', default: 'E:/database.db', argIndex: 3 }
            ]
        },
        {
            id: 'filesystem',
            name: 'Filesystem Access',
            description: '授权 AI 安全读取、搜索和操作指定本地目录下的文件',
            category: 'Utility',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', 'E:/my-folder'],
            env: {},
            fields: [
                { key: 'allowed_dir', label: '授权访问的本地根目录', default: 'E:/projects', argIndex: 2 }
            ]
        },
        {
            id: 'github',
            name: 'GitHub Integration',
            description: '自动化操作 GitHub 仓库、创建 Issue、提 PR 与审查代码',
            category: 'DevOps',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: {
                'GITHUB_PERSONAL_ACCESS_TOKEN': ''
            },
            fields: [
                { key: 'token', label: 'GitHub Personal Access Token (PAT)', envKey: 'GITHUB_PERSONAL_ACCESS_TOKEN', secret: true }
            ]
        },
        {
            id: 'postgres',
            name: 'PostgreSQL Database',
            description: '连接远程或本地 PostgreSQL 数据库，查看 Schema 并执行安全查询',
            category: 'Database',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://user:password@localhost:5432/mydb'],
            env: {},
            fields: [
                { key: 'conn_str', label: '数据库连接字符串 (Connection URI)', default: 'postgresql://postgres:postgres@localhost:5432/mydb', argIndex: 2 }
            ]
        },
        {
            id: 'fetch',
            name: 'Fetch & Web Markdown',
            description: '快速抓取网页静态内容并转换为干净的 Markdown 格式供 AI 研读',
            category: 'Web',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-fetch'],
            env: {}
        },
        {
            id: 'puppeteer',
            name: 'Puppeteer Browser',
            description: '浏览器自动化：网页截屏、执行脚本、捕获控制台日志与动态渲染页面',
            category: 'Web',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-puppeteer'],
            env: {}
        },
        {
            id: 'brave-search',
            name: 'Brave Web Search',
            description: '基于 Brave Search API 的互联网实时搜索引擎',
            category: 'Search',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-brave-search'],
            env: {
                'BRAVE_API_KEY': ''
            },
            fields: [
                { key: 'api_key', label: 'Brave Search API Key', envKey: 'BRAVE_API_KEY', secret: true }
            ]
        },
        {
            id: 'memory',
            name: 'Knowledge Graph Memory',
            description: '持久化知识图谱记忆库，跨会话记忆项目架构决策与偏好',
            category: 'Utility',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-memory'],
            env: {}
        }
    ],
    skills: [
        {
            id: 'code-review',
            name: 'code-review-pro',
            description: '深度代码审查助手：自动检查坏味道、性能瓶颈、安全隐患与类型规范，并提供修改 Diff',
            content: `# Code Review Pro\n\nWhen conducting a code review:\n1. Check for algorithmic efficiency and memory leaks.\n2. Verify error handling and edge cases.\n3. Ensure adhereance to project coding standards.\n4. Output clear, actionable feedback with code snippets.\n`
        },
        {
            id: 'unit-test-gen',
            name: 'unit-test-generator',
            description: '测试用例生成器：针对指定的函数或类自动编写全面的高覆盖率单元测试并进行自测验证',
            content: `# Unit Test Generator\n\nWhen writing tests for code:\n1. Identify all public methods and critical paths.\n2. Generate happy path, boundary cases, and error cases.\n3. Use mocking for external network or database calls.\n4. Ensure 80%+ branch coverage.\n`
        },
        {
            id: 'smart-git-commit',
            name: 'smart-git-commit',
            description: '智能提交助手：自动对比 git diff，提炼出符合 Conventional Commits 规范的精准提交信息',
            content: `# Smart Git Commit\n\nGenerate commit messages following:\n- Format: <type>(<scope>): <short summary>\n- Types: feat, fix, docs, style, refactor, perf, test, chore\n- Keep message body informative but concise.\n`
        }
    ]
};

// 探测与测试 MCP 服务 (JSON-RPC stdio handshake)
function testMcpServer(command, args, envVars, timeoutMs = 7000) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const mergedEnv = Object.assign({}, process.env, envVars);
        let resolved = false;

        let child;
        try {
            child = spawn(command, args, {
                env: mergedEnv,
                shell: true,
                stdio: ['pipe', 'pipe', 'pipe']
            });
        } catch (err) {
            return resolve({ success: false, error: `启动失败: ${err.message}` });
        }

        let stdoutData = '';
        let stderrData = '';
        const toolsFound = [];

        const timer = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                try { child.kill(); } catch (e) {}
                resolve({
                    success: false,
                    error: `连接超时 (${timeoutMs}ms)。可能原因：依赖包首次下载缓慢或命令未退出。STDERR: ${stderrData.slice(0, 300)}`
                });
            }
        }, timeoutMs);

        child.stderr.on('data', (d) => {
            stderrData += d.toString();
        });

        child.stdout.on('data', (d) => {
            stdoutData += d.toString();
            const lines = stdoutData.split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const parsed = JSON.parse(line.trim());
                    if (parsed.id === 1 && parsed.result) {
                        // Handshake 成功，发送 initialized 通知与 tools/list
                        const initNotif = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n';
                        const listToolsReq = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n';
                        child.stdin.write(initNotif);
                        child.stdin.write(listToolsReq);
                    } else if (parsed.id === 2 && parsed.result && Array.isArray(parsed.result.tools)) {
                        // 获取到了工具列表
                        parsed.result.tools.forEach(t => toolsFound.push({ name: t.name, description: t.description }));
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timer);
                            const latency = Date.now() - startTime;
                            try { child.kill(); } catch (e) {}
                            resolve({
                                success: true,
                                latencyMs: latency,
                                tools: toolsFound,
                                serverInfo: parsed.result.serverInfo || {}
                            });
                        }
                    }
                } catch (e) {}
            }
        });

        child.on('error', (err) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                resolve({ success: false, error: `子进程异常: ${err.message}` });
            }
        });

        child.on('close', (code) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                if (toolsFound.length > 0) {
                    resolve({ success: true, tools: toolsFound, latencyMs: Date.now() - startTime });
                } else {
                    resolve({
                        success: false,
                        error: `进程已退出 (代码 ${code})。STDERR: ${stderrData || '无'}`
                    });
                }
            }
        });

        // 发送 initialize
        const initReq = JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'antigravity-studio', version: '1.0.0' }
            }
        }) + '\n';

        try {
            child.stdin.write(initReq);
        } catch (e) {
            if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                resolve({ success: false, error: `写入管道失败: ${e.message}` });
            }
        }
    });
}

// HTTP 请求分发
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        return res.end();
    }

    // JSON 响应辅助函数
    const sendJson = (data, code = 200) => {
        res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
    };

    // 读取 POST Body
    const readBody = () => new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                resolve({});
            }
        });
    });

    // --- API 路由 ---

    // 1. 系统概览与环境
    if (pathname === '/api/info' && req.method === 'GET') {
        return sendJson({
            app: 'Antigravity Skill & MCP Studio',
            version: '1.0.0',
            port: PORT,
            homedir: HOME_DIR,
            mcpConfigPath: GLOBAL_MCP_FILE,
            skillsPath: GLOBAL_SKILLS_DIR,
            workspaces: getWorkspaces()
        });
    }

    // 2. 获取所有 MCP 服务
    if (pathname === '/api/mcp' && req.method === 'GET') {
        const config = readJsonSafe(GLOBAL_MCP_FILE, { mcpServers: {} });
        const list = [];
        const servers = config.mcpServers || {};
        for (const [key, val] of Object.entries(servers)) {
            list.push({
                name: key,
                command: val.command || '',
                args: val.args || [],
                env: val.env || {},
                disabled: !!val.disabled,
                scope: 'global'
            });
        }
        return sendJson({ success: true, servers: list });
    }

    // 3. 保存或更新 MCP 服务
    if (pathname === '/api/mcp/save' && req.method === 'POST') {
        const body = await readBody();
        const { name, command, args, env, disabled } = body;
        if (!name || !command) {
            return sendJson({ success: false, error: '服务名称 (name) 和命令 (command) 不能为空' }, 400);
        }

        const config = readJsonSafe(GLOBAL_MCP_FILE, { mcpServers: {} });
        if (!config.mcpServers) config.mcpServers = {};

        config.mcpServers[name] = {
            command: command.trim(),
            args: Array.isArray(args) ? args : (args ? args.toString().split(' ').filter(Boolean) : []),
            env: env || {}
        };
        if (disabled !== undefined) {
            config.mcpServers[name].disabled = !!disabled;
        }

        writeJsonSafe(GLOBAL_MCP_FILE, config);
        log(`Saved MCP server: ${name}`);
        return sendJson({ success: true, server: config.mcpServers[name] });
    }

    // 4. 删除 MCP 服务
    if (pathname === '/api/mcp/delete' && req.method === 'POST') {
        const body = await readBody();
        const { name } = body;
        if (!name) return sendJson({ success: false, error: '缺少服务名称' }, 400);

        const config = readJsonSafe(GLOBAL_MCP_FILE, { mcpServers: {} });
        if (config.mcpServers && config.mcpServers[name]) {
            delete config.mcpServers[name];
            writeJsonSafe(GLOBAL_MCP_FILE, config);
            log(`Deleted MCP server: ${name}`);
            return sendJson({ success: true });
        }
        return sendJson({ success: false, error: '服务未找到' }, 404);
    }

    // 5. 测试 MCP 服务握手与工具探测
    if (pathname === '/api/mcp/test' && req.method === 'POST') {
        const body = await readBody();
        const { command, args, env } = body;
        if (!command) return sendJson({ success: false, error: '命令不能为空' }, 400);

        const result = await testMcpServer(command, args || [], env || {});
        return sendJson(result);
    }

    // 6. 获取所有技能列表 (全局 + 内置 + 当前工作区)
    if (pathname === '/api/skills' && req.method === 'GET') {
        const list = [];

        // 全局技能
        if (fs.existsSync(GLOBAL_SKILLS_DIR)) {
            try {
                const subdirs = fs.readdirSync(GLOBAL_SKILLS_DIR);
                for (const d of subdirs) {
                    const skillFile = path.join(GLOBAL_SKILLS_DIR, d, 'SKILL.md');
                    if (fs.existsSync(skillFile)) {
                        const parsed = parseSkillFile(skillFile);
                        if (parsed) {
                            list.push(Object.assign({}, parsed, {
                                id: d,
                                scope: 'global',
                                path: path.join(GLOBAL_SKILLS_DIR, d),
                                isBuiltin: false
                            }));
                        }
                    }
                }
            } catch (e) {}
        }

        // 内置技能
        if (fs.existsSync(BUILTIN_SKILLS_DIR)) {
            try {
                const subdirs = fs.readdirSync(BUILTIN_SKILLS_DIR);
                for (const d of subdirs) {
                    const skillFile = path.join(BUILTIN_SKILLS_DIR, d, 'SKILL.md');
                    if (fs.existsSync(skillFile)) {
                        const parsed = parseSkillFile(skillFile);
                        if (parsed) {
                            list.push(Object.assign({}, parsed, {
                                id: d,
                                scope: 'builtin',
                                path: path.join(BUILTIN_SKILLS_DIR, d),
                                isBuiltin: true
                            }));
                        }
                    }
                }
            } catch (e) {}
        }

        // 工作区技能 (若指定 workspace 参数)
        const targetWs = parsedUrl.query.workspace;
        if (targetWs && fs.existsSync(targetWs)) {
            const wsSkillsDir = path.join(targetWs, '.agents', 'skills');
            if (fs.existsSync(wsSkillsDir)) {
                try {
                    const subdirs = fs.readdirSync(wsSkillsDir);
                    for (const d of subdirs) {
                        const skillFile = path.join(wsSkillsDir, d, 'SKILL.md');
                        if (fs.existsSync(skillFile)) {
                            const parsed = parseSkillFile(skillFile);
                            if (parsed) {
                                list.push(Object.assign({}, parsed, {
                                    id: d,
                                    scope: 'workspace',
                                    path: path.join(wsSkillsDir, d),
                                    isBuiltin: false
                                }));
                            }
                        }
                    }
                } catch (e) {}
            }
        }

        return sendJson({ success: true, skills: list });
    }

    // 7. 保存或新建技能
    if (pathname === '/api/skills/save' && req.method === 'POST') {
        const body = await readBody();
        const { name, description, content, scope, workspacePath } = body;
        if (!name) return sendJson({ success: false, error: '技能名称 (name) 不能为空' }, 400);

        const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
        let targetBase = GLOBAL_SKILLS_DIR;
        if (scope === 'workspace' && workspacePath && fs.existsSync(workspacePath)) {
            targetBase = path.join(workspacePath, '.agents', 'skills');
        }

        const skillDir = path.join(targetBase, cleanName);
        ensureDir(skillDir);

        const fileContent = `---
name: ${cleanName}
description: ${description || cleanName}
---

${content || ''}
`;
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), fileContent, 'utf-8');
        log(`Saved Skill: ${cleanName} at ${skillDir}`);
        return sendJson({ success: true, id: cleanName, path: skillDir });
    }

    // 8. 删除技能
    if (pathname === '/api/skills/delete' && req.method === 'POST') {
        const body = await readBody();
        const { id, scope, workspacePath } = body;
        if (!id) return sendJson({ success: false, error: '缺少技能 ID' }, 400);

        let targetBase = GLOBAL_SKILLS_DIR;
        if (scope === 'workspace' && workspacePath) {
            targetBase = path.join(workspacePath, '.agents', 'skills');
        }
        const skillDir = path.join(targetBase, id);
        if (fs.existsSync(skillDir)) {
            fs.rmSync(skillDir, { recursive: true, force: true });
            log(`Deleted Skill: ${id}`);
            return sendJson({ success: true });
        }
        return sendJson({ success: false, error: '技能目录不存在' }, 404);
    }

    // 9. 获取预设模版列表
    if (pathname === '/api/templates' && req.method === 'GET') {
        return sendJson({ success: true, templates: PRESET_TEMPLATES });
    }

    // 10. 一键安装模版
    if (pathname === '/api/templates/install' && req.method === 'POST') {
        const body = await readBody();
        const { type, templateId, customValues } = body;

        if (type === 'mcp') {
            const tmpl = PRESET_TEMPLATES.mcp.find(t => t.id === templateId);
            if (!tmpl) return sendJson({ success: false, error: '未找到该 MCP 模版' }, 404);

            const config = readJsonSafe(GLOBAL_MCP_FILE, { mcpServers: {} });
            if (!config.mcpServers) config.mcpServers = {};

            const args = [...tmpl.args];
            const env = Object.assign({}, tmpl.env);

            // 替换用户自定义填入的字段
            if (customValues) {
                if (tmpl.fields) {
                    for (const f of tmpl.fields) {
                        if (customValues[f.key] !== undefined) {
                            if (f.argIndex !== undefined) {
                                args[f.argIndex] = customValues[f.key];
                            } else if (f.envKey) {
                                env[f.envKey] = customValues[f.key];
                            }
                        }
                    }
                }
            }

            config.mcpServers[tmpl.id] = {
                command: tmpl.command,
                args: args,
                env: env
            };

            writeJsonSafe(GLOBAL_MCP_FILE, config);
            log(`Installed MCP template: ${tmpl.id}`);
            return sendJson({ success: true, server: config.mcpServers[tmpl.id] });
        }

        if (type === 'skill') {
            const tmpl = PRESET_TEMPLATES.skills.find(t => t.id === templateId);
            if (!tmpl) return sendJson({ success: false, error: '未找到该 Skill 模版' }, 404);

            const skillDir = path.join(GLOBAL_SKILLS_DIR, tmpl.name);
            ensureDir(skillDir);
            const fileContent = `---
name: ${tmpl.name}
description: ${tmpl.description}
---

${tmpl.content}
`;
            fs.writeFileSync(path.join(skillDir, 'SKILL.md'), fileContent, 'utf-8');
            log(`Installed Skill template: ${tmpl.name}`);
            return sendJson({ success: true, id: tmpl.name });
        }

        return sendJson({ success: false, error: '无效类型' }, 400);
    }

    // --- 静态文件托管 ---
    let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname.slice(1));
    if (!fs.existsSync(filePath)) {
        filePath = path.join(__dirname, 'public', 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.svg': 'image/svg+xml'
    };

    try {
        const content = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
        res.end(content);
    } catch (e) {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, '127.0.0.1', () => {
    log(`Antigravity Studio server listening on 127.0.0.1:${PORT}`);
    console.log(`[+] Studio Server is running at http://127.0.0.1:${PORT}`);
});
