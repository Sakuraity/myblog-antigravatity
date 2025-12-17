/**
 * Youmind to Astro Content Import Script
 * 
 * Usage: 
 *   Batch: node scripts/import_youmind.mjs --source=/path/to/youmind/export
 *   Single: node scripts/import_youmind.mjs --file=/path/to/file.md
 */

import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

// --- Configuration ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_POSTS_DIR = path.join(__dirname, '../src/content/posts');

// AI Configuration (Env vars or placeholders)
const AI_API_KEY = process.env.AI_API_KEY || ''; // e.g. sk-...
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
const AI_MODEL = process.env.AI_MODEL || 'gpt-3.5-turbo';

// Debug: Print AI config status
console.log(`🔧 AI Config: Key=${AI_API_KEY ? `loaded (${AI_API_KEY.length} chars)` : 'NOT SET'}, URL=${AI_BASE_URL}, Model=${AI_MODEL}`);

// --- Helpers ---

// Sanitize filename to be a valid URL slug
function toSlug(filename) {
    return filename
        .toLowerCase()
        .replace(/\.md$/, '')
        .replace(/^[0-9]{4}-[0-9]{2}-[0-9]{2}-/, '') // Remove date prefix if any
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-') // Support Chinese characters
        .replace(/^-+|-+$/g, '');
}

async function ensureDir(dir) {
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
    }
}

// Call AI to generate summary
async function generateAiSummary(content) {
    if (!AI_API_KEY) return null;

    try {
        const prompt = `Please summarize the following markdown content into a single short sentence (10-20 Chinese characters) to be used as a blog post description. Do not use quotes. content:\n\n${content.slice(0, 2000)}`;

        const data = JSON.stringify({
            model: AI_MODEL,
            messages: [
                { role: "system", content: "You are a helpful assistant that summarizes blog posts." },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 60
        });

        const url = `${AI_BASE_URL}/chat/completions`;
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_API_KEY}`
            }
        };

        return new Promise((resolve, reject) => {
            const req = https.request(url, options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            const result = JSON.parse(body);
                            const summary = result.choices[0]?.message?.content?.trim();
                            resolve(summary);
                        } catch (e) {
                            console.warn('      ⚠️  AI Response parse error:', e.message);
                            resolve(null);
                        }
                    } else {
                        console.warn(`      ⚠️  AI API request failed: ${res.statusCode} ${body}`);
                        resolve(null);
                    }
                });
            });
            req.on('error', (e) => {
                console.warn('      ⚠️  AI API request error:', e.message);
                resolve(null);
            });
            req.write(data);
            req.end();
        });
    } catch (e) {
        return null;
    }
}

// Download remote file
async function downloadFile(url, destPath) {
    const protocol = url.startsWith('https') ? https : http;

    return new Promise((resolve, reject) => {
        const file = createWriteStream(destPath);
        protocol.get(url, response => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
                return;
            }
            pipeline(response, file)
                .then(() => resolve())
                .catch(reject);
        }).on('error', reject);
    });
}

// Generate simple frontmatter
async function createFrontmatter(title, content, dateStr) {
    const today = new Date().toISOString().split('T')[0];
    const pubDate = dateStr || today;

    // Attempt to extract tags from title if like "[Tag] Title"
    let tags = ["Youmind"];
    let cleanTitle = title;

    let summary = '';

    // 1. Try AI Generation
    if (AI_API_KEY) {
        process.stdout.write('      🤖 Generating AI summary... ');
        const aiSummary = await generateAiSummary(content);
        if (aiSummary) {
            summary = aiSummary;
            console.log('Done.');
        } else {
            console.log('Failed (Fallback to local).');
        }
    }

    // 2. Fallback to Local Extraction
    if (!summary && content) {
        summary = extractSummaryFromContent(content);
    }

    // 3. Fallback to Title
    if (!summary) summary = cleanTitle;

    // User requested 10-20 chars. 
    // If AI generated it, we trust it fits (mostly). If local, we truncate.
    if (!AI_API_KEY && summary.length > 20) {
        summary = summary.substring(0, 20) + "...";
    }

    return `---
title: "${cleanTitle.replace(/"/g, '\\"')}"
description: "${summary.replace(/"/g, '\\"')}"
pubDate: "${pubDate}"
category: "Imported"
tags: ${JSON.stringify(tags)}
---

`;
}

function extractSummaryFromContent(content) {
    // 1. Remove Title (H1)
    let text = content.replace(/^#\s+(.*$)/m, '');

    // 2. Remove Images
    text = text.replace(/!\[.*?\]\(.*?\)/g, '');

    // 3. Remove HTML/Scripts
    text = text.replace(/<[^>]*>/g, '');

    // 4. Remove Markdown formatting (**bold**, etc)
    text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
    text = text.replace(/(\*|_)(.*?)\1/g, '$2');

    // 5. Remove blockquotes
    text = text.replace(/^>\s+/gm, '');

    // 6. Remove URL links but keep text [text](url) -> text
    text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

    // 7. Split into paragraphs
    // We want a "substantial" paragraph, not just a short byline.
    const paragraphs = text.split(/\n\s*\n/);

    for (const p of paragraphs) {
        const cleanP = p.trim();
        // Assume a good summary paragraph has at least 10 chars and doesn't start with special chars
        if (cleanP.length > 10 && !cleanP.startsWith('---')) {
            return cleanP.replace(/\n/g, ' ');
        }
    }

    return "";
}

function extractTitleFromContent(content) {
    // 1. Try to find first H1
    const h1Match = content.match(/^#\s+(.*$)/m);
    if (h1Match) return h1Match[1].trim();

    // 2. Fallback to first non-empty line
    const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('!'));
    if (lines.length > 0) return lines[0].slice(0, 50);

    return "Untitled Post";
}

// --- Main Logic ---

async function processFile(filePath, sourceDir = null) {
    console.log(`   Processing: ${filePath}`);
    try {
        let content = await fs.readFile(filePath, 'utf-8');

        // Determine Slug/Title
        let filename = path.basename(filePath);
        let slug = toSlug(filename);

        // If filename is generic "draft.md", try to generate slug from content title
        if (slug === 'draft' || slug === 'temp' || slug === 'input' || slug === 'temp-clipboard-import') {
            const title = extractTitleFromContent(content);
            slug = toSlug(title);
        }

        const postDir = path.join(TARGET_POSTS_DIR, slug);
        await ensureDir(postDir);

        // --- Image Handling (Parallel Downloads) ---
        const imageRegex = /!\[(.*?)\]\((.*?)(?:\s+"(.*?)")?\)/g;
        let matchIter;
        const downloadTasks = [];
        const replacementMap = new Map(); // fullMatch -> { targetImgName, title }

        // First pass: collect all images and start downloads in parallel
        while ((matchIter = imageRegex.exec(content)) !== null) {
            const [fullMatch, alt, imgPath, title] = matchIter;

            if (imgPath.startsWith('http')) {
                // Remote Image - prepare download task
                const url = new URL(imgPath);
                const ext = path.extname(url.pathname) || '.jpg';
                const imgHash = Math.random().toString(36).substring(7);
                const targetImgName = `img-${imgHash}${ext}`;
                const targetImgPath = path.join(postDir, targetImgName);

                console.log(`      ⬇️  Downloading image: ${imgPath.slice(0, 40)}...`);

                // Store replacement info
                replacementMap.set(fullMatch, { targetImgName, alt, title });

                // Add download task (don't await yet)
                downloadTasks.push(
                    downloadFile(imgPath, targetImgPath)
                        .then(() => ({ success: true, fullMatch }))
                        .catch(e => {
                            console.warn(`      ⚠️  Image issue: ${e.message}`);
                            replacementMap.delete(fullMatch); // Remove failed downloads
                            return { success: false, fullMatch };
                        })
                );
            } else if (sourceDir) {
                // Local Image (still synchronous as it's fast)
                try {
                    const decodedImgPath = decodeURIComponent(imgPath);
                    const sourceImgPath = path.resolve(sourceDir, decodedImgPath);
                    const targetImgName = path.basename(sourceImgPath);
                    const targetImgPath = path.join(postDir, targetImgName);
                    await fs.copyFile(sourceImgPath, targetImgPath);
                    replacementMap.set(fullMatch, { targetImgName, alt, title });
                } catch (e) {
                    console.warn(`      ⚠️  Image issue: ${e.message}`);
                }
            }
        }

        // Wait for all downloads to complete in parallel
        if (downloadTasks.length > 0) {
            console.log(`      ⏳ Waiting for ${downloadTasks.length} images to download...`);
            await Promise.all(downloadTasks);
            console.log(`      ✅ Images downloaded.`);
        }

        // Apply replacements
        for (const [fullMatch, info] of replacementMap) {
            const newMarkdown = `![${info.alt}](./${info.targetImgName}${info.title ? ` "${info.title}"` : ''})`;
            content = content.replace(fullMatch, newMarkdown);
        }

        // --- Frontmatter ---
        if (!content.trim().startsWith('---')) {
            const title = extractTitleFromContent(content);
            const frontmatter = await createFrontmatter(title, content);
            content = frontmatter + content;
        }

        // Write file
        await fs.writeFile(path.join(postDir, 'index.md'), content);
        console.log(`      ✅  Saved to: content/posts/${slug}/index.md`);

    } catch (e) {
        console.error(`      ❌ Failed to process ${filePath}:`, e.message);
    }
}

import { execSync } from 'child_process';

// Get content from clipboard (macOS only)
function getClipboardContent() {
    try {
        return execSync('pbpaste').toString();
    } catch (e) {
        console.error('❌ Could not read clipboard (pbpaste failed).');
        return '';
    }
}

async function main() {
    const args = process.argv.slice(2);
    const sourceArg = args.find(arg => arg.startsWith('--source='));
    const fileArg = args.find(arg => arg.startsWith('--file='));
    const pasteArg = args.includes('--paste');

    const sourceDir = sourceArg ? sourceArg.split('=')[1] : null;
    const singleFile = fileArg ? fileArg.split('=')[1] : null;

    if (!sourceDir && !singleFile && !pasteArg) {
        console.error('❌ Error: Please use one of the following:');
        console.error('  --paste          (Import from clipboard)');
        console.error('  --file=path.md   (Import single file)');
        console.error('  --source=dir     (Import directory)');
        process.exit(1);
    }

    console.log(`🚀 Starting import...`);
    await ensureDir(TARGET_POSTS_DIR);

    if (pasteArg) {
        console.log('📋 Reading from clipboard...');
        const content = getClipboardContent();
        if (!content.trim()) {
            console.error('❌ Clipboard is empty!');
            process.exit(1);
        }
        // Write to a temporary file locally to reuse processFile logic
        const tempPath = path.join(__dirname, 'temp_clipboard_import.md');
        await fs.writeFile(tempPath, content);

        try {
            await processFile(tempPath, null);
        } finally {
            // Cleanup
            try { await fs.unlink(tempPath); } catch { }
        }

    } else if (singleFile) {
        await processFile(singleFile, path.dirname(singleFile));
    } else if (sourceDir) {
        let files;
        try {
            files = await fs.readdir(sourceDir);
        } catch (e) {
            console.error(`❌ Could not read directory: ${sourceDir}`);
            process.exit(1);
        }
        const mdFiles = files.filter(f => f.endsWith('.md'));
        console.log(`📂 Found ${mdFiles.length} markdown files.`);
        for (const file of mdFiles) {
            await processFile(path.join(sourceDir, file), sourceDir);
        }
    }

    console.log('----------------------------------------');
    console.log('✅ Import completed!');
}

main().catch(console.error);
