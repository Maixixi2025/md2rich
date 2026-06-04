// md2rich — Markdown to Rich Text converter
// 100% client-side. Zero server. Zero tracking.

import { marked } from 'https://cdn.jsdelivr.net/npm/marked@11.1.1/+esm';

// Platform tag whitelists (X Articles spec — adjust based on real-world testing)
const PLATFORMS = {
  'x-articles': {
    name: 'X Articles',
    allowedTags: ['h2', 'h3', 'h4', 'p', 'strong', 'b', 'em', 'i', 's', 'del',
                  'a', 'blockquote', 'ul', 'ol', 'li', 'br', 'pre', 'code', 'hr',
                  'figure', 'figcaption'],
    stripTags: ['h1', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th'],
    imagePolicy: 'placeholder',  // X Articles doesn't support direct image embed via paste
    note: 'Images will be replaced with [Image] placeholder. Upload separately in X Articles composer.'
  },
  'linkedin': {
    name: 'LinkedIn',
    mode: 'markdown-hint',  // LinkedIn doesn't support rich paste reliably
    note: 'LinkedIn does not support rich text paste. Output as Markdown-hint text — use a LinkedIn formatting tool to convert.'
  },
  'medium': {
    name: 'Medium',
    allowedTags: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'strong', 'b', 'em', 'i',
                  'a', 'blockquote', 'ul', 'ol', 'li', 'br', 'pre', 'code', 'hr',
                  'figure', 'figcaption', 'img', 'iframe'],
    stripTags: ['table', 'thead', 'tbody', 'tr', 'td', 'th'],
    imagePolicy: 'passthrough',  // Medium supports <img> via paste
    note: 'Paste into Medium editor (Cmd+V). Images will be uploaded by Medium.'
  },
  'html': {
    name: 'HTML (any)',
    allowedTags: ['*'],  // No restriction
    imagePolicy: 'passthrough',
    note: 'Pure HTML — works anywhere that accepts rich text.'
  },
  'markdown': {
    name: 'Raw Markdown',
    mode: 'passthrough',
    note: 'Returns your markdown as plain text (no conversion).'
  }
};

// Initialize EasyMDE
const easyMDE = new EasyMDE({
  element: document.getElementById('editor'),
  autofocus: false,
  spellChecker: false,
  status: false,
  toolbar: ["bold", "italic", "heading", "|", "quote", "unordered-list", "ordered-list", "|", "link", "image", "code", "table", "|", "preview", "side-by-side", "fullscreen", "|", "guide"],
  minHeight: '400px',
  placeholder: 'Type or paste your markdown here...'
});

// Configure marked
marked.setOptions({
  gfm: true,
  breaks: true,
  headerIds: false,
  mangle: false
});

const previewEl = document.getElementById('preview');
const charCountEl = document.getElementById('char-count');
const platformEl = document.getElementById('platform');
const copyBtn = document.getElementById('copy-rich');
const downloadBtn = document.getElementById('download-html');
const clearBtn = document.getElementById('clear');
const statusEl = document.getElementById('status');

function getMarkdown() {
  return easyMDE.value();
}

function setStatus(msg, type = 'info') {
  statusEl.textContent = msg;
  statusEl.className = 'mt-3 text-sm ' +
    (type === 'success' ? 'text-emerald-600' :
     type === 'error' ? 'text-red-600' :
     'text-gray-600');
}

function updatePreview() {
  const md = getMarkdown();
  charCountEl.textContent = `${md.length} chars`;
  try {
    const html = marked.parse(md);
    const clean = DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel'] });
    previewEl.innerHTML = clean;
  } catch (e) {
    previewEl.textContent = 'Preview error: ' + e.message;
  }
}

// Apply platform-specific filtering
function applyPlatform(html, platformKey) {
  const p = PLATFORMS[platformKey];
  if (!p || p.mode === 'passthrough') return html;

  // Strip disallowed tags (keep text content)
  let filtered = html;
  if (p.allowedTags && !p.allowedTags.includes('*')) {
    const allowed = p.allowedTags.join(',');
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
    const toRemove = [];
    let node;
    while (node = walker.nextNode()) {
      if (!allowed.includes(node.tagName.toLowerCase())) {
        toRemove.push(node);
      }
    }
    toRemove.forEach(n => {
      // Keep text content, unwrap
      const parent = n.parentNode;
      while (n.firstChild) parent.insertBefore(n.firstChild, n);
      parent.removeChild(n);
    });
    filtered = doc.body.innerHTML;
  }

  // Image policy
  if (p.imagePolicy === 'placeholder') {
    filtered = filtered.replace(/<img[^>]*>/gi, '[Image]');
    filtered = filtered.replace(/\[!\[([^\]]*)\]\([^\)]*\)\]\(([^\)]*)\)/g, '[$1]($2)');
  }

  return filtered;
}

// Convert MD to platform-specific HTML
function convertForPlatform(md, platformKey) {
  const p = PLATFORMS[platformKey];

  if (p.mode === 'markdown-hint') {
    // Return MD as plain text with hint header
    return {
      type: 'text',
      content: `【Tip: This is Markdown format. Use a browser extension like "Markdown Here" to render in LinkedIn.】

${md}`,
      note: p.note
    };
  }

  if (p.mode === 'passthrough' && platformKey === 'markdown') {
    return { type: 'text', content: md, note: p.note };
  }

  // Default: MD → HTML
  const raw = marked.parse(md);
  const filtered = applyPlatform(raw, platformKey);
  const clean = DOMPurify.sanitize(filtered);
  return { type: 'html', content: clean, note: p.note };
}

// Copy rich text to clipboard
async function copyAsRichText() {
  const md = getMarkdown();
  if (!md.trim()) {
    setStatus('Nothing to copy — editor is empty.', 'error');
    return;
  }
  const platform = platformEl.value;
  const result = convertForPlatform(md, platform);

  try {
    if (result.type === 'text') {
      await navigator.clipboard.writeText(result.content);
      setStatus(`✅ Copied as plain text (${PLATFORMS[platform].name}). ${result.note}`, 'success');
    } else {
      const htmlBlob = new Blob([result.content], { type: 'text/html' });
      const textBlob = new Blob([md], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob
        })
      ]);
      setStatus(`✅ Copied as rich text (${PLATFORMS[platform].name}). ${result.note}`, 'success');
    }
  } catch (e) {
    setStatus(`❌ Copy failed: ${e.message}. Try Cmd+C manually after selecting.`, 'error');
  }
}

// Download HTML
function downloadHTML() {
  const md = getMarkdown();
  if (!md.trim()) {
    setStatus('Nothing to download — editor is empty.', 'error');
    return;
  }
  const platform = platformEl.value;
  const result = convertForPlatform(md, platform);

  const fullHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>md2rich export</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }
h1, h2, h3 { line-height: 1.3; }
code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
pre { background: #f4f4f4; padding: 1rem; border-radius: 6px; overflow-x: auto; }
blockquote { border-left: 4px solid #ddd; padding-left: 1rem; color: #555; margin-left: 0; }
img { max-width: 100%; }
</style>
</head>
<body>
${result.type === 'html' ? result.content : `<pre>${result.content.replace(/</g, '&lt;')}</pre>`}
<hr>
<p><small>Generated by <a href="https://md2rich.com">md2rich.com</a></small></p>
</body>
</html>`;

  const blob = new Blob([fullHTML], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `md2rich-${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus(`✅ Downloaded HTML file.`, 'success');
}

// Clear
function clearAll() {
  if (!confirm('Clear editor content?')) return;
  easyMDE.value('');
  updatePreview();
  setStatus('Editor cleared.', 'info');
}

// Wire up events
easyMDE.codemirror.on('change', updatePreview);
copyBtn.addEventListener('click', copyAsRichText);
downloadBtn.addEventListener('click', downloadHTML);
clearBtn.addEventListener('click', clearAll);

// Initial render
updatePreview();
setStatus('Ready. Type or paste Markdown → pick platform → Copy as Rich Text.', 'info');
