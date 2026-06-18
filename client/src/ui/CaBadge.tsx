import { useState } from "react";

/** Official token contract address (CA). */
const CA = "EeEHYyouRhKze3GBK6G56t4JvAKia1PMkDFzPUsrpump";

/** Prominent, tap-to-copy contract address badge shown on the menu. */
export function CaBadge() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CA);
    } catch {
      // Fallback for browsers without the async clipboard API.
      const ta = document.createElement("textarea");
      ta.value = CA;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        // ignore
      }
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button className="ca-badge" onClick={copy} title="Tap to copy the contract address">
      <span className="ca-label">CA OFFICIAL:</span>
      <span className="ca-value">{CA}</span>
      <span className="ca-copy">{copied ? "Copied!" : "Tap to copy"}</span>
    </button>
  );
}
