/**
 * Batch Update Tags for Existing Posts
 * 
 * Usage: source .env && node scripts/batch_update_tags.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = path.join(__dirname, '../src/content/posts');

// AI Configuration
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
const AI_MODEL = process.env.AI_MODEL || 'gpt-3.5-turbo';

console.log(`🔧 AI Config: Key=${AI_API_KEY ? `loaded (${AI_API_KEY.length} chars)` : 'NOT SET'}`);

// AI 标签生成
async function generateAiTags(content) {
    if (!AI_API_KEY) return ["思考"];

    try {
        const prompt = `请分析以下博客文章内容，生成合适的标签。规则如下：

1. 公司标签：如果文章主要讨论特定公司（如 Google、Bytedance、NVIDIA、Netflix、Apple、Microsoft、Meta、Amazon、OpenAI、Tesla、Nokia、Intel、AMD 等），提取公司名作为标签（英文大小写保持原样）
2. 深度标签：如果文章是采访、对话记录、深度访谈或人物专访，添加"深度"标签
3. 分析标签：如果文章是分析具体问题、商业案例、策略研究，添加"分析"标签
4. 思考标签：如果以上都不适用，添加"思考"标签

注意：
- 一篇文章可以有多个标签
- 只返回 JSON 数组格式，例如 ["NVIDIA", "Nokia", "分析"]，不要其他文字

文章内容：
${content.slice(0, 3000)}`;

        const data = JSON.stringify({
            model: AI_MODEL,
            messages: [
                { role: "system", content: "你是一个博客标签分类助手。只返回 JSON 数组，不要任何其他文字。" },
                { role: "user", content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 100
        });

        const url = `${AI_BASE_URL}/chat/completions`;
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_API_KEY}`
            }
        };

        return new Promise((resolve) => {
            const req = https.request(url, options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            const result = JSON.parse(body);
                            let tagsStr = result.choices[0]?.message?.content?.trim();
                            const tags = JSON.parse(tagsStr);
                            if (Array.isArray(tags) && tags.length > 0) {
                                resolve(tags);
                            } else {
                                resolve(["思考"]);
                            }
                        } catch (e) {
                            console.warn('  ⚠️  AI Tags parse error:', e.message);
                            resolve(["思考"]);
                        }
                    } else {
                        console.warn(`  ⚠️  AI Tags API failed: ${res.statusCode}`);
                        resolve(["思考"]);
                    }
                });
            });
            req.on('error', (e) => {
                console.warn('  ⚠️  AI Tags request error:', e.message);
                resolve(["思考"]);
            });
            req.write(data);
            req.end();
        });
    } catch (e) {
        return ["思考"];
    }
}

async function updatePost(postDir) {
    const indexPath = path.join(postDir, 'index.md');

    try {
        let content = await fs.readFile(indexPath, 'utf-8');

        // 检查是否有旧标签
        if (!content.includes('tags: ["Youmind"]') && !content.includes('category: "Imported"')) {
            console.log(`  ⏭️  Skipping (no old tags)`);
            return false;
        }

        // 提取 frontmatter 和正文
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (!fmMatch) {
            console.log(`  ⚠️  No frontmatter found`);
            return false;
        }

        const [, frontmatter, body] = fmMatch;

        // 生成新标签
        process.stdout.write('  🏷️  Generating tags... ');
        const newTags = await generateAiTags(body);
        console.log(`Done: ${JSON.stringify(newTags)}`);

        // 更新 frontmatter
        let newFm = frontmatter
            .replace(/^category:.*$/m, '') // 删除 category 行
            .replace(/^tags:.*$/m, `tags: ${JSON.stringify(newTags)}`) // 替换 tags
            .replace(/\n\n+/g, '\n') // 清理多余空行
            .trim();

        const newContent = `---\n${newFm}\n---\n${body}`;
        await fs.writeFile(indexPath, newContent);

        console.log('  ✅  Updated successfully');
        return true;

    } catch (e) {
        console.error(`  ❌  Error: ${e.message}`);
        return false;
    }
}

async function main() {
    console.log('🚀 Starting batch tag update...\n');

    const dirs = await fs.readdir(POSTS_DIR);
    let updated = 0;

    for (const dir of dirs) {
        const postDir = path.join(POSTS_DIR, dir);
        const stat = await fs.stat(postDir);

        if (stat.isDirectory()) {
            console.log(`📄 ${dir}`);
            const success = await updatePost(postDir);
            if (success) updated++;
        }
    }

    console.log('\n----------------------------------------');
    console.log(`✅ Batch update completed! Updated ${updated}/${dirs.length} posts.`);
}

main().catch(console.error);
