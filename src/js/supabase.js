const SUPABASE_URL = 'https://wkxwiwnzpdvzdatrupdu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_LwMpxO--FDd58rznViqlDA_f3a_R86B';

export const supabaseClient = (typeof supabase !== 'undefined')
  ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;
