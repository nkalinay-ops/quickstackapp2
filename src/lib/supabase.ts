import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    detectSessionInUrl: true,
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
  },
});

export type Comic = {
  id: string;
  user_id: string;
  title: string;
  issue_number: string;
  publisher: string;
  year: number | null;
  condition: string;
  notes: string;
  freeform_text: string;
  color_image_url: string | null;
  bw_image_url: string | null;
  copy_count: number;
  created_at: string;
  updated_at: string;
};

export type WishlistItem = {
  id: string;
  user_id: string;
  title: string;
  issue_number: string;
  publisher: string;
  priority: string;
  notes: string;
  created_at: string;
};
