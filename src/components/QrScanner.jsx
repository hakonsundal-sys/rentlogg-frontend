import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { X } from "lucide-react";

// Decodes camera frames client-side via jsQR — no round-trip to the server needed to read
// the code. onScan receives the raw decoded text (a full check-in URL in normal use).
export default function QrScanner({ onScan, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [error, setError] = useState("");

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Denne nettleseren støtter ikke kameratilgang.");
      return;
    }

    let cancelled = false;
    let stopped = false;

    function tick() {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) {
          stopped = true;
          onScanRef.current(code.data);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        tick();
      } catch {
        if (!cancelled) setError("Fikk ikke tilgang til kamera. Sjekk tillatelser i nettleseren.");
      }
    })();

    return () => {
      cancelled = true;
      stopped = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div style={{ position: "relative", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "#000", aspectRatio: "3/4" }}>
      <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        <div style={{ width: "65%", aspectRatio: "1", border: "3px solid var(--accent-orange)", borderRadius: "var(--radius)" }} />
      </div>
      <button onClick={onCancel} style={{
        position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.55)", border: "none",
        borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
        color: "white", cursor: "pointer",
      }}>
        <X size={18} />
      </button>
      {error && (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, background: "var(--bg-danger)",
          color: "var(--text-danger)", padding: "10px 14px", fontSize: 13, textAlign: "center",
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
