export const createMeliTokenStore = ({ dbPool }) => {
  const load = async () => {
    try {
      const [rows] = await dbPool.query(
        "SELECT access_token, refresh_token, expires_at, updated_at FROM meli_tokens WHERE id = 1"
      );
      const row = rows[0];
      if (!row?.access_token && !row?.refresh_token) return null;
      return {
        access_token: row.access_token,
        refresh_token: row.refresh_token,
        expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : null,
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      };
    } catch (err) {
      console.warn("[meliTokenStore] No se pudo leer tokens de DB:", err.message);
      return null;
    }
  };

  const save = async (tokens) => {
    if (!tokens?.access_token && !tokens?.refresh_token) return;
    try {
      await dbPool.query(
        `INSERT INTO meli_tokens (id, access_token, refresh_token, expires_at, updated_at)
         VALUES (1, $1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET
           access_token  = EXCLUDED.access_token,
           refresh_token = EXCLUDED.refresh_token,
           expires_at    = EXCLUDED.expires_at,
           updated_at    = EXCLUDED.updated_at`,
        [
          tokens.access_token || null,
          tokens.refresh_token || null,
          tokens.expires_at || null,
          tokens.updated_at || new Date().toISOString(),
        ]
      );
    } catch (err) {
      console.error("[meliTokenStore] No se pudo guardar tokens en DB:", err.message);
    }
  };

  return { load, save };
};
