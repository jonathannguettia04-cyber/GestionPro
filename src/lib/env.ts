// Tolère les erreurs de collage fréquentes dans Vercel/Railway : espaces, retour à la ligne, guillemets, « / » final.
const clean = (v?: string) => (v ?? "").trim().replace(/^["']|["']$/g, "").trim();

export function getSupabaseEnv() {
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
  const anonKey = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !anonKey) {
    throw new Error("Configuration Supabase manquante : définir NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY (voir .env.example), puis redéployer.");
  }
  if (!/^https?:\/\//.test(url)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL invalide : elle doit commencer par https:// (ex. https://xxxx.supabase.co).");
  }
  return { url, anonKey };
}
