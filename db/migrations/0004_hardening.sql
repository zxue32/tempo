-- Pin the trigger function's search path (Supabase security advisor: function_search_path_mutable).
alter function app.touch_updated_at() set search_path = '';
