const formatInternalError = (error) => {
  if (!error) return "error desconocido";

  const parts = [];
  if (error?.response?.status) parts.push(`upstream_status=${error.response.status}`);
  if (error?.code) parts.push(`code=${error.code}`);
  if (error?.message) parts.push(`message=${error.message}`);

  if (!parts.length) return String(error);
  return parts.join(" ");
};

export const sendInternalError = (res, scope, publicMessage, error) => {
  console.error(`${scope}: ${formatInternalError(error)}`);
  return res.status(500).json({
    ok: false,
    mensaje: publicMessage,
  });
};
