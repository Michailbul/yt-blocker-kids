import { action } from './_generated/server';
import { v } from 'convex/values';

export const resolveFromVideoUrl = action({
  args: { videoUrl: v.string() },
  handler: async (_ctx, { videoUrl }) => {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
    const resp = await fetch(oembedUrl);
    if (!resp.ok) throw new Error('Video not found');

    const data = await resp.json();
    const authorUrl: string = data.author_url || '';
    const handleMatch = authorUrl.match(/@([^/?\s]+)/);

    return {
      name: data.author_name || '',
      url: authorUrl,
      handle: handleMatch ? '@' + handleMatch[1] : '',
    };
  },
});
