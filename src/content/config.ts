import { defineCollection, z } from 'astro:content';

const posts = defineCollection({
    schema: z.object({
        title: z.string(),
        description: z.string(),
        pubDate: z.coerce.date(),
        // New optional fields
        tags: z.array(z.string()).optional(),
        category: z.string().optional(),
    }),
});

export const collections = { posts };
