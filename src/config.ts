// Public values only, injected by the deploy workflow (see .github/workflows/deploy.yml).
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) || 'http://localhost:54321';
export const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_KEY as string) || 'dev';
