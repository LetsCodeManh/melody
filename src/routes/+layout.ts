import { injectAnalytics } from '@vercel/analytics/sveltekit';

// Vercel Web Analytics: cookieless page views, counted once Analytics is enabled on the Vercel project
injectAnalytics({ mode: import.meta.env.DEV ? 'development' : 'production' });
