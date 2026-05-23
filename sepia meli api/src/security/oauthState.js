import crypto from "node:crypto";

export const createOAuthStateStore = ({ ttlMs }) => {
  const pendingAuthStates = new Map();

  const cleanup = () => {
    const now = Date.now();
    for (const [state, expiresAt] of pendingAuthStates.entries()) {
      if (expiresAt <= now) pendingAuthStates.delete(state);
    }
  };

  const register = (state, metadata = {}) => {
    const resolvedState = String(state || "").trim() || crypto.randomUUID();
    cleanup();
    pendingAuthStates.set(resolvedState, {
      expiresAt: Date.now() + ttlMs,
      metadata: { ...metadata },
    });
    return resolvedState;
  };

  const consume = (state) => {
    if (!state) return null;
    cleanup();
    const entry = pendingAuthStates.get(state);
    if (!entry) return null;
    pendingAuthStates.delete(state);
    if (entry.expiresAt <= Date.now()) return null;
    return entry.metadata;
  };

  return {
    register,
    consume,
  };
};
