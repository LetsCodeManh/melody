import { inject } from '@vercel/analytics';

// Vercel Web Analytics: cookieless page views, counted once Analytics is enabled on the Vercel project.
// inject(), not @vercel/analytics/sveltekit: that entry reads $app/stores, which throws in SvelteKit 3.
// The script tracks page views itself; inject() does nothing on the server.
inject({ mode: import.meta.env.DEV ? 'development' : 'production', framework: 'sveltekit' });
