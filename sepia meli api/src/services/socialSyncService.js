// Único servicio que escribe en las tablas social_posts / competidores_social /
// social_benchmark (decisión 2B: metaSocialService.js es solo cliente de Meta,
// este es el que persiste). Se inyecta metaSocialService y dbPool para poder
// testear la orquestación con fakes, sin pegarle a la API real de Meta.
export const createSocialSyncService = ({ metaSocialService, dbPool }) => {
  const syncPosts = async () => {
    const resultado = await metaSocialService.fetchPostsForSync();
    if (!resultado.configured) {
      return { ok: false, motivo: resultado.mensaje || "Meta no configurado", posts_sincronizados: 0 };
    }
    if (resultado.error) {
      return { ok: false, motivo: resultado.error, posts_sincronizados: 0 };
    }

    const posts = resultado.posts || [];
    for (const post of posts) {
      await dbPool.query(
        `INSERT INTO social_posts (
           plataforma, account_id, post_id, fecha_publicacion, permalink,
           miniatura_url, media_type, media_product_type, caption,
           likes, comentarios, reach, saves, shares, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
         ON CONFLICT (plataforma, account_id, post_id) DO UPDATE SET
           fecha_publicacion = EXCLUDED.fecha_publicacion,
           permalink = EXCLUDED.permalink,
           miniatura_url = EXCLUDED.miniatura_url,
           media_type = EXCLUDED.media_type,
           media_product_type = EXCLUDED.media_product_type,
           caption = EXCLUDED.caption,
           likes = EXCLUDED.likes,
           comentarios = EXCLUDED.comentarios,
           reach = EXCLUDED.reach,
           saves = EXCLUDED.saves,
           shares = EXCLUDED.shares,
           updated_at = now()`,
        [
          post.plataforma,
          post.account_id,
          post.post_id,
          post.fecha_publicacion,
          post.permalink,
          post.miniatura_url,
          post.media_type,
          post.media_product_type,
          post.caption,
          post.likes,
          post.comentarios,
          post.reach,
          post.saves,
          post.shares,
        ],
      );
    }

    return { ok: true, posts_sincronizados: posts.length };
  };

  // Cada competidor se sincroniza de forma aislada (decisión 3A): un handle
  // roto o cuenta privada guarda su propio last_error y no afecta a los demás
  // ni a la sincronización de posts propios.
  const syncCompetidores = async () => {
    const [competidores] = await dbPool.query(
      `SELECT id, plataforma, handle FROM competidores_social WHERE activo = true`,
    );

    let ok = 0;
    let conError = 0;

    for (const competidor of competidores) {
      try {
        const benchmark = await metaSocialService.fetchCompetitorBenchmark({
          plataforma: competidor.plataforma,
          handle: competidor.handle,
        });

        await dbPool.query(
          `INSERT INTO social_benchmark (competidor_id, seguidores, posts_count, engagement_aprox, cadencia_semanal)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            competidor.id,
            benchmark.seguidores,
            benchmark.posts_count,
            benchmark.engagement_aprox,
            benchmark.cadencia_semanal,
          ],
        );
        await dbPool.query(
          `UPDATE competidores_social SET last_error = NULL, last_synced_at = now(), foto_url = $2 WHERE id = $1`,
          [competidor.id, benchmark.foto_url ?? null],
        );
        ok += 1;
      } catch (error) {
        conError += 1;
        await dbPool.query(
          `UPDATE competidores_social SET last_error = $2, last_synced_at = now() WHERE id = $1`,
          [competidor.id, error.message || "Error desconocido sincronizando este competidor."],
        );
      }
    }

    return { ok, con_error: conError, total: competidores.length };
  };

  const correrSync = async () => {
    const posts = await syncPosts();
    const competidores = await syncCompetidores();
    return { posts, competidores };
  };

  return { correrSync };
};
