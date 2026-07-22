import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CRM_SECTIONS } from "../crmSections.js";

const DEFAULT_CRM_ORIGIN = "https://crm.sepiamodaymas.com";
export const CRM_URL = import.meta.env.VITE_CRM_URL || DEFAULT_CRM_ORIGIN;
export const CRM_LOAD_TIMEOUT_MS = 15000;

export default function Crm() {
  const { section } = useParams();
  const current = CRM_SECTIONS.find((s) => s.slug === section) || CRM_SECTIONS[0];
  const iframeSrc = `${CRM_URL}${current.crmPath}`;

  const [status, setStatus] = useState("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const timeoutRef = useRef(null);

  useEffect(() => {
    setStatus("loading");
    timeoutRef.current = setTimeout(() => {
      setStatus((prev) => (prev === "loading" ? "timeout" : prev));
    }, CRM_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeoutRef.current);
  }, [reloadKey, iframeSrc]);

  const handleLoad = () => {
    clearTimeout(timeoutRef.current);
    setStatus("ready");
  };

  const handleRetry = () => setReloadKey((k) => k + 1);

  return (
    <section className="panel crm-panel">
      {status !== "ready" && (
        <div className="crm-overlay">
          {status === "loading" && (
            <div className="crm-status">
              <span className="crm-spinner" aria-hidden="true" />
              <p>Cargando CRM...</p>
            </div>
          )}
          {status === "timeout" && (
            <div className="crm-status">
              <p>El CRM no responde.</p>
              <button type="button" className="btn btn-primary" onClick={handleRetry}>
                Reintentar
              </button>
            </div>
          )}
        </div>
      )}
      <iframe
        key={`${reloadKey}-${iframeSrc}`}
        src={iframeSrc}
        title={`CRM Sepia - ${current.label}`}
        className="crm-iframe"
        onLoad={handleLoad}
      />
      <a href={iframeSrc} target="_blank" rel="noopener noreferrer" className="crm-escape-link">
        Abrir CRM en pestaña nueva ↗
      </a>
    </section>
  );
}
