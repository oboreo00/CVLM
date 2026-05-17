import { createClient } from '@supabase/supabase-js';

// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be in .env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key-here';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
