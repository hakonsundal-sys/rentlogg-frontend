import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useT } from "../i18n";

// A signature drawn with a finger. Pointer events rather than separate mouse and touch handlers:
// one code path covers a phone, a tablet with a pen, and a mouse on the admin side.
//
// The canvas has a fixed internal resolution and is stretched with CSS, so nothing has to be
// redrawn when the pane or the phone's orientation changes, and every signature is stored at the
// same size whatever screen drew it.
const WIDTH = 900;
const HEIGHT = 300;

const SignaturePad = forwardRef(function SignaturePad({ onChange }, ref) {
  const t = useT();
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useImperativeHandle(ref, () => ({
    isEmpty: () => !hasInk,
    // Null when nothing is drawn, so a caller can't accidentally submit a blank white rectangle as
    // somebody's signature.
    toBlob: () =>
      new Promise((resolve) => {
        if (!hasInk) return resolve(null);
        canvasRef.current.toBlob(resolve, "image/png");
      }),
  }));

  function context() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#18181b";
    return ctx;
  }

  function pointAt(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    };
  }

  function start(event) {
    // Capture so a finger that slides off the edge mid-stroke still ends the stroke here, instead
    // of leaving the pad stuck in drawing mode.
    canvasRef.current.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = pointAt(event);
    const ctx = context();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(event) {
    if (!drawing.current) return;
    const { x, y } = pointAt(event);
    const ctx = context();
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) {
      setHasInk(true);
      onChange?.(true);
    }
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    setHasInk(false);
    onChange?.(false);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>{t("training.drawSignature")}</span>
        {hasInk && (
          <button type="button" onClick={clear} style={{ background: "none", border: "none", color: "var(--brand-dark)", fontSize: 13, cursor: "pointer", padding: 0 }}>
            {t("training.clearSignature")}
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        style={{
          width: "100%", height: 150, display: "block", background: "white",
          border: `1px solid ${hasInk ? "var(--brand)" : "var(--border)"}`,
          borderRadius: "var(--radius)",
          // Without this the first stroke scrolls the page instead of drawing anything.
          touchAction: "none", cursor: "crosshair",
        }}
      />
      {!hasInk && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{t("training.drawSignatureHint")}</div>
      )}
    </div>
  );
});

export default SignaturePad;
