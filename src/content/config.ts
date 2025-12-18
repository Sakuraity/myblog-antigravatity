import { defineCollection, z } from 'astro:content';

const posts = defineCollection({
    schema: z.object({
        title: z.string(),
        description: z.string(),
        pubDate: z.coerce.date(),
        tags: z.array(z.string()).optional(),
        category: z.string().optional(),
        audioUrl: z.string().url().optional(),
    }),
});

// Works: 产品/项目作品
const works = defineCollection({
    schema: ({ image }) => z.object({
        title: z.string(),
        description: z.string(),
        coverImage: image().optional(),
        date: z.coerce.date(),
        link: z.string().url().optional(),
        tags: z.array(z.string()).optional(),
        featured: z.boolean().default(false),
    }),
});

// Library: 音乐/视频/图书收藏
const library = defineCollection({
    schema: ({ image }) => z.object({
        type: z.enum(['music', 'video', 'book']),
        title: z.string(),
        // Music fields
        artist: z.string().optional(),
        spotifyUrl: z.string().url().optional(),
        // Video fields
        source: z.enum(['youtube', 'bilibili']).optional(),
        videoId: z.string().optional(),
        // Book fields
        author: z.string().optional(),
        status: z.enum(['reading', 'finished', 'wishlist']).optional(),
        rating: z.number().min(1).max(5).optional(),
        // Common fields
        coverImage: z.union([image(), z.string()]).optional(),
        link: z.string().url().optional(),
        comment: z.string().optional(),
        date: z.coerce.date(),
    }),
});

// Notes: 闪念笔记
const notes = defineCollection({
    schema: z.object({
        date: z.coerce.date(),
        tags: z.array(z.string()).optional(),
    }),
});

export const collections = { posts, works, library, notes };
