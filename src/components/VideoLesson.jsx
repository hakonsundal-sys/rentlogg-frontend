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
  }).catch((err) => {
    // A transient failure must not poison every later video for the rest of the page session — let
    // the next mount try loading the script again instead of replaying this same rejection forever.
    ytReady = null;
    throw err;
  });
  return ytReady;
}

export default function VideoLesson({ videoId, record, token, user, requiresSignature, requiresDrawnSignature, onSigned }) {
  const t = useT();
  const holderRef = useRef(null);
  const playerRef = useRef(null);
  const [watched, setWatched] = useState(!!record.video_completed_at);
  const [failed, setFailed] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);

  // Stamps the server-side record before unlocking the signature locally, so "the sign button is
  // enabled" and "the server will actually accept a sign" never disagree. A failure is shown with a
  // retry rather than swallowed — unlocking anyway would just move the same failure to the sign
  // button, where the 409 it comes back with is a more confusing place to discover it.
  function markWatched() {
    setSyncFailed(false);
    apiFetch(`/training/me/records/${record.id}/progress`, {
      token, method: "PATCH", body: JSON.stringify({ video_completed: true }),
    })
      .then(() => setWatched(true))
      .catch(() => setSyncFailed(true));
  }

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
              if (event.data === YT.PlayerState.ENDED) markWatched();
            },
            // A private, deleted, or region-blocked video never reaches ENDED — without this she'd
            // be stuck looking at a black box forever with no explanation and no way forward.
            onError: () => setFailed(true),
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
          <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", background: "black" }}>
            <div ref={holderRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
          </div>
        )}
      </Card>

      {syncFailed && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text-danger)", marginTop: 8 }}>
          {t("training.progressSyncFailed")}
          <button
            onClick={markWatched}
            style={{
              background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius)",
              padding: "4px 10px", fontSize: 13, color: "var(--text-primary)", cursor: "pointer",
            }}
          >
            {t("training.retry")}
          </button>
        </div>
      )}

      <SignCard
        record={record}
        token={token}
        user={user}
        requiresSignature={requiresSignature}
        requiresDrawnSignature={requiresDrawnSignature}
        onSigned={onSigned}
        disabled={!watched}
        disabledReason={t("training.watchWholeVideo")}
      />
    </div>
  );
}
