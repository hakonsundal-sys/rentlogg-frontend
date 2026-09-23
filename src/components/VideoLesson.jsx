import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../api";
import { Card } from "./shared";
import { useT } from "../i18n";
import { SignCard } from "./LessonPlayer";

// A course whose content is a YouTube video rather than slides. Costs nothing on Render's disk,
// which is the whole reason it is worth having alongside slides — but it is one language per video
// and it needs real signal, so it is the exception rather than the default. See schema.sql.
//
// The signature unlocks when YouTube's own player reports the video ended. That is weaker than the
// slide count a lesson keeps: the scrubber can be dragged. It is, though, the strongest thing a
// player can honestly report, and the server holds the same line (see routes/training.js).

const YT_API = "https://www.youtube.com/iframe_api";

// Loaded once per page and shared. YouTube's script calls a single global when it is ready, so a
// second <script> tag would not fire it again — every player after the first has to wait on the
// same promise instead.
let ytReady = null;
function loadYouTubeApi() {
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = YT_API;
    // A blocked or unreachable YouTube (offline, or a network that filters it) must surface as a
    // message rather than a spinner that never resolves.
    script.onerror = () => reject(new Error("youtube_unavailable"));
    document.head.appendChild(script);
  });
  return ytReady;
}

export default function VideoLesson({ videoId, record, token, user, requiresDrawnSignature, onSigned }) {
  const t = useT();
  const holderRef = useRef(null);
  const playerRef = useRef(null);
  const [watched, setWatched] = useState(!!record.video_completed_at);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !holderRef.current) return;
        playerRef.current = new YT.Player(holderRef.current, {
          videoId,
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
          events: {
            onStateChange: (event) => {
              if (event.data !== YT.PlayerState.ENDED) return;
              setWatched(true);
              // Recorded server-side too — the button unlocking is cosmetic, the stamp is what the
              // signature is allowed to rest on. Swallowed on failure: she is on whatever signal
              // the building has, and she can press play again.
              apiFetch(`/training/me/records/${record.id}/progress`, {
                token, method: "PATCH", body: JSON.stringify({ video_completed: true }),
              }).catch(() => {});
            },
          },
        });
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      try { playerRef.current?.destroy(); } catch { /* player already gone with the DOM node */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, record.id]);

  return (
    <div>
      <Card style={{ marginTop: 10, padding: 0, overflow: "hidden" }}>
        {failed ? (
          <div style={{ padding: 20, fontSize: 14, color: "var(--text-secondary)" }}>{t("training.videoUnavailable")}</div>
        ) : (
          // 16:9 box: the iframe YouTube swaps in fills it, so the page does not jump as it loads.
          <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", background: "black" }}>
            <div ref={holderRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
          </div>
        )}
      </Card>

      <SignCard
        record={record}
        token={token}
        user={user}
        requiresSignature
        requiresDrawnSignature={requiresDrawnSignature}
        onSigned={onSigned}
        disabled={!watched}
        disabledReason={t("training.watchWholeVideo")}
      />
    </div>
  );
}
