import crypto from "node:crypto";

const SESSION_COOKIE_NAME = "sepia_dashboard_session";

const getClientIp = (req) => {
  return req.ip || req.socket?.remoteAddress || "unknown";
};

const parseCookieHeader = (cookieHeader) => {
  if (!cookieHeader) return {};

  return String(cookieHeader)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) return cookies;

      const key = part.slice(0, separatorIndex).trim();
      if (!key) return cookies;

      const rawValue = part.slice(separatorIndex + 1).trim();
      try {
        cookies[key] = decodeURIComponent(rawValue);
      } catch {
        cookies[key] = rawValue;
      }
      return cookies;
    }, {});
};

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

export const createDashboardAuth = ({
  enabled,
  adminPassword,
  sessionSecret,
  sessionTtlMs,
  loginRateLimitWindowMs,
  loginRateLimitMaxAttempts,
}) => {
  const dashboardSessions = new Map();
  const loginRateLimit = new Map();

  const hashSessionToken = (token) =>
    crypto.createHmac("sha256", sessionSecret).update(token).digest("hex");

  const cleanupDashboardSessions = () => {
    const now = Date.now();
    for (const [hash, session] of dashboardSessions.entries()) {
      if (session.expiresAt <= now) dashboardSessions.delete(hash);
    }
  };

  const createDashboardSession = (req) => {
    cleanupDashboardSessions();
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + sessionTtlMs;
    dashboardSessions.set(hashSessionToken(token), {
      expiresAt,
      ip: getClientIp(req),
    });
    return {
      token,
      expiresAt,
      expiresAtIso: new Date(expiresAt).toISOString(),
    };
  };

  const readBearerToken = (req) => {
    const authHeader = String(req.headers.authorization || "");
    if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
    const token = authHeader.slice(7).trim();
    return token || null;
  };

  const readSessionCookie = (req) => {
    const cookies = parseCookieHeader(req.headers.cookie);
    return cookies[SESSION_COOKIE_NAME] || null;
  };

  const readSessionToken = (req) => readBearerToken(req) || readSessionCookie(req);

  const getCookieOptions = (req, maxAgeMs = sessionTtlMs) => {
    // Detecta https directamente (incluso detras de un proxy como Render),
    // sin depender de trust proxy. Si la conexion es https, usamos
    // SameSite=None + Secure para que la cookie de sesion viaje entre el
    // frontend (Netlify) y el backend (Render), que estan en dominios distintos.
    // En local (http) se mantiene Lax para no romper el desarrollo.
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
      .split(",")[0]
      .trim()
      .toLowerCase();
    const isHttps = Boolean(req.secure) || forwardedProto === "https";

    return {
      httpOnly: true,
      sameSite: isHttps ? "none" : "lax",
      secure: isHttps,
      path: "/",
      maxAge: Math.max(Number(maxAgeMs) || 0, 0),
    };
  };

  const getDashboardSession = (token) => {
    if (!token) return null;
    cleanupDashboardSessions();
    const key = hashSessionToken(token);
    const session = dashboardSessions.get(key);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      dashboardSessions.delete(key);
      return null;
    }
    return session;
  };

  const invalidateDashboardSession = (token) => {
    if (!token) return;
    dashboardSessions.delete(hashSessionToken(token));
  };

  const cleanupRateLimitBucket = (bucket, windowMs) => {
    const minTimestamp = Date.now() - windowMs;
    return bucket.filter((entry) => entry > minTimestamp);
  };

  const consumeRateLimit = (key, limit, windowMs) => {
    const now = Date.now();
    const current = cleanupRateLimitBucket(loginRateLimit.get(key) || [], windowMs);
    if (current.length >= limit) {
      const retryAfterMs = Math.max(windowMs - (now - current[0]), 1000);
      return {
        allowed: false,
        retryAfterSec: Math.ceil(retryAfterMs / 1000),
      };
    }

    current.push(now);
    loginRateLimit.set(key, current);
    return { allowed: true, retryAfterSec: 0 };
  };

  const requireSession = (req, res, next) => {
    if (!enabled) return next();
    const token = readSessionToken(req);
    const session = getDashboardSession(token);
    if (!session) {
      return res.status(401).json({
        ok: false,
        mensaje: "Sesion requerida para usar el dashboard",
      });
    }
    req.dashboardSession = session;
    req.dashboardSessionToken = token;
    return next();
  };

  const getStatus = (req) => {
    if (!enabled) {
      return {
        ok: true,
        authEnabled: false,
        authenticated: true,
        expiresAt: null,
      };
    }

    const token = readSessionToken(req);
    const session = getDashboardSession(token);
    return {
      ok: true,
      authEnabled: true,
      authenticated: Boolean(session),
      expiresAt: session ? new Date(session.expiresAt).toISOString() : null,
    };
  };

  const login = (req, password) => {
    if (!enabled) {
      return {
        status: 200,
        body: {
          ok: true,
          authEnabled: false,
          authenticated: true,
          expiresAt: null,
        },
      };
    }

    const limiterKey = `login:${getClientIp(req)}`;
    const rateLimit = consumeRateLimit(
      limiterKey,
      loginRateLimitMaxAttempts,
      loginRateLimitWindowMs,
    );
    if (!rateLimit.allowed) {
      return {
        status: 429,
        retryAfterSec: rateLimit.retryAfterSec,
        body: {
          ok: false,
          mensaje: "Demasiados intentos de inicio de sesion",
          detalle: `Espera ${rateLimit.retryAfterSec} segundos antes de reintentar.`,
        },
      };
    }

    if (!password) {
      return {
        status: 400,
        body: {
          ok: false,
          mensaje: "Debes enviar la clave del dashboard",
        },
      };
    }

    if (!safeEqual(password, adminPassword)) {
      return {
        status: 401,
        body: {
          ok: false,
          mensaje: "Clave invalida",
        },
      };
    }

    const session = createDashboardSession(req);
    return {
      status: 200,
      sessionToken: session.token,
      sessionMaxAgeMs: sessionTtlMs,
      body: {
        ok: true,
        authEnabled: true,
        authenticated: true,
        expiresAt: session.expiresAtIso,
      },
    };
  };

  const logout = (req) => {
    invalidateDashboardSession(req.dashboardSessionToken || readSessionToken(req));
    return {
      status: 200,
      body: { ok: true, mensaje: "Sesion cerrada" },
    };
  };

  const setSessionCookie = (req, res, sessionToken, maxAgeMs = sessionTtlMs) => {
    res.cookie(SESSION_COOKIE_NAME, sessionToken, getCookieOptions(req, maxAgeMs));
  };

  const clearSessionCookie = (req, res) => {
    res.clearCookie(SESSION_COOKIE_NAME, getCookieOptions(req));
  };

  return {
    clearSessionCookie,
    requireSession,
    getStatus,
    login,
    logout,
    setSessionCookie,
  };
};
