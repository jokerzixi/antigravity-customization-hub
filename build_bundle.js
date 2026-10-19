const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'public', 'style.css');
const jsPath = path.join(__dirname, 'public', 'app.js');
const indexPath = path.join(__dirname, 'public', 'index.html');

const css = fs.readFileSync(cssPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

// Extract body from existing index.html
const origHtml = fs.readFileSync(indexPath, 'utf8');
const bodyMatch = origHtml.match(/<\/style>\s*<\/head>([\s\S]*?)<script>/);
if (!bodyMatch) {
    console.error('Failed to locate body section in index.html');
    process.exit(1);
}
let bodyHtml = bodyMatch[1].trim();

const webviewShim = `
// Antigravity Webview & Standalone Origin / Token Adapter
(function() {
    const urlParams = new URLSearchParams(window.location.search);
    const sidecarToken = urlParams.get('token') || '';
    const studioOrigin = (window.location.protocol.startsWith('http') && window.location.host)
        ? window.location.origin
        : (window.__STUDIO_ORIGIN__ || 'http://127.0.0.1:38292');

    const origFetch = window.fetch;
    window.fetch = function(input, init) {
        if (typeof input === 'string') {
            let url = input;
            if (url.startsWith('/api/')) {
                if (!window.location.protocol.startsWith('http') || !window.location.host) {
                    url = studioOrigin + url;
                }
                if (sidecarToken && !url.includes('token=')) {
                    url += (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(sidecarToken);
                }
            }
            return origFetch.call(this, url, init);
        }
        return origFetch.call(this, input, init);
    };
})();
`;

const fullJs = webviewShim + '\n' + js;

// Validate JavaScript syntax using new Function
try {
    new Function(fullJs);
    console.log('[+] JavaScript syntax is 100% VALID!');
} catch (e) {
    console.error('[-] JavaScript syntax error:', e.message);
    process.exit(1);
}

const finalHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Antigravity 扩展中心 - Skill & MCP Studio</title>
    <style>
${css}
    </style>
</head>
${bodyHtml}
    <script>
${fullJs}
    </script>
</body>
</html>
`;

fs.writeFileSync(indexPath, finalHtml, 'utf8');
console.log(`[+] Successfully bundled ${indexPath} (${finalHtml.length} bytes)`);
