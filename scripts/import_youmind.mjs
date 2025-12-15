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

// Generate simple frontmatter
function createFrontmatter(title, dateStr) {
    const today = new Date().toISOString().split('T')[0];
    const pubDate = dateStr || today;

    // Attempt to extract tags from title if like "[Tag] Title"
    let tags = ["Youmind"];
    let cleanTitle = title;

    return `---
title: "${cleanTitle.replace(/"/g, '\\"')}"
description: "${cleanTitle.slice(0, 100).replace(/"/g, '\\"')}"
pubDate: "${pubDate}"
category: "Imported"
tags: ${JSON.stringify(tags)}
---

`;
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

        // --- Image Handling ---
        const imageRegex = /!\[(.*?)\]\((.*?)(?:\s+"(.*?)")?\)/g;
        let matchIter;
        const replacements = [];

        while ((matchIter = imageRegex.exec(content)) !== null) {
            const [fullMatch, alt, imgPath, title] = matchIter;
            let targetImgName = '';

            try {
                if (imgPath.startsWith('http')) {
                    // Remote Image - Download it
                    const url = new URL(imgPath);
                    const ext = path.extname(url.pathname) || '.jpg';
                    // Generate a hash or simple name for the image
                    const imgHash = Math.random().toString(36).substring(7);
                    targetImgName = `img-${imgHash}${ext}`;
                    const targetImgPath = path.join(postDir, targetImgName);

                    console.log(`      ⬇️  Downloading image: ${imgPath.slice(0, 40)}...`);
                    await downloadFile(imgPath, targetImgPath);

                } else if (sourceDir) {
                    // Local Image (relative)
                    const decodedImgPath = decodeURIComponent(imgPath);
                    const sourceImgPath = path.resolve(sourceDir, decodedImgPath);
                    targetImgName = path.basename(sourceImgPath);
                    const targetImgPath = path.join(postDir, targetImgName);

                    await fs.copyFile(sourceImgPath, targetImgPath);
                }

                if (targetImgName) {
                    replacements.push({
                        original: fullMatch,
                        new: `![${alt}](./${targetImgName}${title ? ` "${title}"` : ''})`
                    });
                }
            } catch (e) {
                console.warn(`      ⚠️  Image issue: ${e.message}`);
            }
        }

        // Apply replacements
        for (const rep of replacements) {
            content = content.replace(rep.original, rep.new);
        }

        // --- Frontmatter ---
        if (!content.trim().startsWith('---')) {
            const title = extractTitleFromContent(content);
            const frontmatter = createFrontmatter(title);
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
