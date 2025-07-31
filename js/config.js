// Conexión a Supabase con tus claves
const SUPABASE_URL = 'https://eflaynhqmzxchqhkcnzp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmbGF5bmhxbXp4Y2hxaGtjbnpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MDQxODQsImV4cCI6MjA2ODk4MDE4NH0.7t0LNLiv5zNB36SIt7sFhv3GftQ2XqD6L_eKK2rr3NI';

// Se exporta el cliente para que esté disponible en otros archivos
export const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);