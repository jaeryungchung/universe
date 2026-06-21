import fs from "fs";
import path from "path";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import Blob from "../components/Blob";
import StickyNote from "../components/StickyNote";
import MirrorMode from "../components/MirrorMode";
import universeTrack from "../src/music/universe.mp3";
import forestTrack from "../src/music/forest.mp3";
import relaxTrack from "../src/music/relax.mp3";
import mistyTrack from "../src/music/misty.mp3";
import pianoTrack from "../src/music/piano.mp3";

const NOTE_COLORS = [
  { name: "pink", fill: "#f7b7cb", fold: "#eb99b4", deep: "#bb4d7d" },
  { name: "yellow", fill: "#f5e58a", fold: "#e2cc62", deep: "#ab8123" },
  { name: "blue", fill: "#a9d7f6", fold: "#80b6db", deep: "#376d97" },
  { name: "green", fill: "#b8e3b0", fold: "#91c28b", deep: "#4e8755" },
];

const TRACKS = [
  { id: "universe", label: "Universe", src: universeTrack },
  { id: "forest", label: "Forest", src: forestTrack },
  { id: "relax", label: "Relax", src: relaxTrack },
  { id: "misty", label: "Misty", src: mistyTrack },
  { id: "piano", label: "Piano", src: pianoTrack },
];

const INPUT_WIDTH = 196;
const INPUT_HEIGHT = 138;
const ABSORB_RADIUS = 172;
const HAND_ABSORB_RADIUS = ABSORB_RADIUS + 108;
const BLOB_BASE_TINT = "#f2efe7";
const FADE_STEPS = [0, 0.45, 0.72, 1];
const SHOCK_TEXT_LENGTH = 15;
const ENCOURAGEMENT_TRIGGER = 10;
const ENCOURAGEMENT_BLOB_END_COUNT = 4;
const HAND_BLOB_DISSOLVE_TARGET = 7;
const BLOB_DECAY_MS = 60000;

function clampNotePosition(x, y, width, height) {
  if (typeof window === "undefined") {
    return { x, y };
  }

  return {
    x: Math.min(Math.max(x, 12), window.innerWidth - width - 12),
    y: Math.min(Math.max(y, 12), window.innerHeight - height - 12),
  };
}

function wrapPreviewText(value) {
  return value.replace(/\n/g, " ").trim();
}

function countMeaningfulChars(value) {
  return value.replace(/\s/g, "").length;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function mixHexWithWhite(hex, amount) {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);

  const blend = (channel) =>
    Math.round(channel + (255 - channel) * amount)
      .toString(16)
      .padStart(2, "0");

  return `#${blend(r)}${blend(g)}${blend(b)}`;
}

function getNextNoteColor(previousColorName) {
  const availableColors = NOTE_COLORS.filter(
    (color) => color.name !== previousColorName
  );
  return availableColors[Math.floor(Math.random() * availableColors.length)];
}

function createBurstParticles(color, count, minRadius, maxRadius) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (Math.PI * 2 * index) / count + Math.random() * 0.36;
    const radius = minRadius + Math.random() * (maxRadius - minRadius);
    const drift = 0.75 + Math.random() * 0.6;

    return {
      id: `${index}-${Math.random().toString(36).slice(2, 7)}`,
      color,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      scale: 0.8 + Math.random() * 1.6,
      delay: Math.random() * 0.08,
      duration: 0.55 + Math.random() * 0.28,
      drift,
    };
  });
}

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
      } else {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.src = src;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", reject, { once: true });
    document.head.appendChild(script);
  });
}

function getPalmCenter(landmarks) {
  const palmIds = [0, 5, 9, 13, 17];
  const sum = palmIds.reduce(
    (accumulator, index) => ({
      x: accumulator.x + landmarks[index].x,
      y: accumulator.y + landmarks[index].y,
      z: accumulator.z + landmarks[index].z,
    }),
    { x: 0, y: 0, z: 0 }
  );

  return {
    x: sum.x / palmIds.length,
    y: sum.y / palmIds.length,
    z: sum.z / palmIds.length,
  };
}

function countFingertipsInsideNote(points, note) {
  const tipIds = [4, 8, 12, 16, 20];

  return tipIds.reduce((count, tipId) => {
    const point = points[tipId];
    if (!point) {
      return count;
    }

    return point.x >= note.x &&
      point.x <= note.x + INPUT_WIDTH &&
      point.y >= note.y &&
      point.y <= note.y + INPUT_HEIGHT
      ? count + 1
      : count;
  }, 0);
}

function doesNoteOverlapBlob(x, y, radius) {
  if (typeof window === "undefined") {
    return false;
  }

  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const closestX = clamp(centerX, x, x + INPUT_WIDTH);
  const closestY = clamp(centerY, y, y + INPUT_HEIGHT);

  return Math.hypot(closestX - centerX, closestY - centerY) <= radius;
}

function getDistance2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isHandFingerExtended(landmarks, tipId, pipId, ratio = 1.1) {
  const wrist = landmarks[0];
  return getDistance2D(landmarks[tipId], wrist) >
    getDistance2D(landmarks[pipId], wrist) * ratio;
}

function isHandThumbExtended(landmarks) {
  const wrist = landmarks[0];
  const thumbTip = landmarks[4];
  const thumbIp = landmarks[3];
  const thumbMcp = landmarks[2];
  const indexMcp = landmarks[5];

  return (
    getDistance2D(thumbTip, indexMcp) >
      getDistance2D(thumbIp, indexMcp) * 1.02 &&
    getDistance2D(thumbTip, wrist) > getDistance2D(thumbMcp, wrist) * 1.22
  );
}

function classifyHandGesture(landmarks) {
  const extendedCount = [
    isHandThumbExtended(landmarks),
    isHandFingerExtended(landmarks, 8, 6),
    isHandFingerExtended(landmarks, 12, 10),
    isHandFingerExtended(landmarks, 16, 14),
    isHandFingerExtended(landmarks, 20, 18),
  ].filter(Boolean).length;

  if (extendedCount >= 4) {
    return "Open_Palm";
  }

  if (extendedCount <= 2) {
    return "Closed_Fist";
  }

  return "Unknown";
}

export default function Home({ encouragementLines, tutorialLines }) {
  const textareaRef = useRef(null);
  const audioRef = useRef(null);
  const playerRef = useRef(null);
  const videoRef = useRef(null);
  const handCanvasRef = useRef(null);
  const playerCloseTimeoutRef = useRef(null);
  const latestPointerRef = useRef({ x: 0, y: 0, t: 0 });
  const blobCursorPatTimeoutRef = useRef(null);
  const lastNoteColorRef = useRef(null);
  const webcamStreamRef = useRef(null);
  const handTrackerRef = useRef(null);
  const handLoopRef = useRef(null);
  const handSendingRef = useRef(false);
  const handLastVideoTimeRef = useRef(-1);
  const notesRef = useRef([]);
  const selectedHandNoteIdRef = useRef(null);
  const handTriggeredNoteIdRef = useRef(null);
  const mouseDraggingNoteIdRef = useRef(null);
  const absorbNoteRef = useRef(null);
  const handBlobGestureStageRef = useRef("idle");
  const handBlobGestureCountRef = useRef(0);
  const blobEndStateRef = useRef("idle");
  const triggerBlobEndingRef = useRef(null);
  const handleNoteDropRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const [notes, setNotes] = useState([]);
  const [absorbingNotes, setAbsorbingNotes] = useState([]);
  const [absorbingText, setAbsorbingText] = useState([]);
  const [textBursts, setTextBursts] = useState([]);
  const [blobBurst, setBlobBurst] = useState({
    key: 0,
    color: BLOB_BASE_TINT,
  });
  const [blobMotion, setBlobMotion] = useState({
    bounceKey: 0,
    quakeKey: 0,
  });
  const [cosmicShock, setCosmicShock] = useState(null);
  const [blobState, setBlobState] = useState({
    source: BLOB_BASE_TINT,
    step: 3,
    tint: BLOB_BASE_TINT,
  });
  const [blobClickStreak, setBlobClickStreak] = useState(0);
  const [encouragementCount, setEncouragementCount] = useState(0);
  const [encouragementBubble, setEncouragementBubble] = useState(null);
  const [encouragementPointer, setEncouragementPointer] = useState({
    x: 0,
    y: 0,
  });
  const [blobHoverCursor, setBlobHoverCursor] = useState(false);
  const [blobCursorPointer, setBlobCursorPointer] = useState({
    x: 0,
    y: 0,
  });
  const [blobCursorPatting, setBlobCursorPatting] = useState(false);
  const [activeTrackId, setActiveTrackId] = useState(TRACKS[0].id);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(0.45);
  const [isTrackMenuOpen, setIsTrackMenuOpen] = useState(false);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [hasStartedAudio, setHasStartedAudio] = useState(false);
  const [webcamEnabled, setWebcamEnabled] = useState(false);
  const [webcamPermission, setWebcamPermission] = useState("idle");
  const [blobEndState, setBlobEndState] = useState("idle");
  const [blobDisintegrateSignal, setBlobDisintegrateSignal] = useState(0);
  const [handScreenState, setHandScreenState] = useState(null);
  const [handPointerState, setHandPointerState] = useState({
    active: false,
    x: 0,
    y: 0,
    normalizedX: 0,
    normalizedY: 0,
    overBlob: false,
  });
  const [selectedHandNoteId, setSelectedHandNoteId] = useState(null);
  const [isMirrorModeOpen, setIsMirrorModeOpen] = useState(false);

  const activeTrack = useMemo(
    () => TRACKS.find((track) => track.id === activeTrackId) || TRACKS[0],
    [activeTrackId]
  );

  const tutorialText = tutorialLines.join(" ");

  const triggerBlobEnding = () => {
    if (blobEndState !== "idle") {
      return;
    }

    handBlobGestureStageRef.current = "idle";
    handBlobGestureCountRef.current = 0;
    handTriggeredNoteIdRef.current = null;
    setEncouragementCount(0);
    setBlobClickStreak(0);
    setBlobEndState("disintegrating");
    setEncouragementBubble(null);
    setBlobHoverCursor(false);
    setBlobDisintegrateSignal((current) => current + 1);
  };

  useEffect(() => {
    blobEndStateRef.current = blobEndState;
  }, [blobEndState]);

  triggerBlobEndingRef.current = triggerBlobEnding;

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    selectedHandNoteIdRef.current = selectedHandNoteId;
  }, [selectedHandNoteId]);

  useEffect(() => {
    if (draft && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        draft.text.length,
        draft.text.length
      );
    }
  }, [draft]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleResize = () => {
      setNotes((current) =>
        current.map((note) => ({
          ...note,
          ...clampNotePosition(note.x, note.y, note.width, note.height),
        }))
      );
      setDraft((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          ...clampNotePosition(current.x, current.y, INPUT_WIDTH, INPUT_HEIGHT),
        };
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!playerRef.current?.contains(event.target)) {
        setIsTrackMenuOpen(false);
        setIsPlayerOpen(false);
        if (playerCloseTimeoutRef.current) {
          window.clearTimeout(playerCloseTimeoutRef.current);
        }
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const now = performance.now();
      const previous = latestPointerRef.current;
      const deltaX = event.clientX - previous.x;
      const deltaY = event.clientY - previous.y;
      const deltaT = Math.max(16, now - (previous.t || now));
      const speed = Math.hypot(deltaX, deltaY) / deltaT;

      latestPointerRef.current = { x: event.clientX, y: event.clientY, t: now };

      if (blobHoverCursor) {
        setBlobCursorPointer({
          x: event.clientX,
          y: event.clientY,
        });
        if (speed > 0.55) {
          setBlobCursorPatting(true);
          if (blobCursorPatTimeoutRef.current) {
            window.clearTimeout(blobCursorPatTimeoutRef.current);
          }
          blobCursorPatTimeoutRef.current = window.setTimeout(() => {
            setBlobCursorPatting(false);
          }, 220);
        }
      }
      if (encouragementBubble) {
        setEncouragementPointer({
          x: event.clientX,
          y: event.clientY,
        });
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [blobHoverCursor, encouragementBubble]);

  useEffect(() => {
    if (!encouragementBubble) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setEncouragementBubble(null);
    }, 4200);

    return () => window.clearTimeout(timeoutId);
  }, [encouragementBubble]);

  useEffect(() => {
    attemptPlayAudio();
    return () => {
      if (playerCloseTimeoutRef.current) {
        window.clearTimeout(playerCloseTimeoutRef.current);
      }
      if (blobCursorPatTimeoutRef.current) {
        window.clearTimeout(blobCursorPatTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (blobState.tint === BLOB_BASE_TINT) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setBlobState({
        source: BLOB_BASE_TINT,
        step: 3,
        tint: BLOB_BASE_TINT,
      });
    }, BLOB_DECAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [blobState.tint]);

  const resetBlobClickStreak = () => {
    setBlobClickStreak(0);
  };

  const attemptPlayAudio = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const playPromise = audio.play();
    if (playPromise?.catch) {
      playPromise
        .then(() => {
          setHasStartedAudio(true);
        })
        .catch(() => {});
      return;
    }
    setHasStartedAudio(true);
  };

  const stopWebcamTracking = () => {
    if (handLoopRef.current) {
      window.cancelAnimationFrame(handLoopRef.current);
      handLoopRef.current = null;
    }

    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((track) => track.stop());
      webcamStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    handTrackerRef.current = null;
    handSendingRef.current = false;
    handLastVideoTimeRef.current = -1;
    handTriggeredNoteIdRef.current = null;
    handBlobGestureStageRef.current = "idle";
    handBlobGestureCountRef.current = 0;
    setHandScreenState(null);
    setHandPointerState((current) => ({ ...current, active: false, overBlob: false }));
    setSelectedHandNoteId(null);

    const canvas = handCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const drawHandOverlay = (handState) => {
    const canvas = handCanvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    context.clearRect(0, 0, width, height);

    if (!handState) {
      return;
    }

    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20],
      [0, 17],
    ];

    context.save();
    context.strokeStyle = "rgba(171, 223, 255, 0.55)";
    context.lineWidth = 1.35;
    context.shadowBlur = 16;
    context.shadowColor = "rgba(148, 208, 255, 0.35)";

    connections.forEach(([start, end]) => {
      const a = handState.points[start];
      const b = handState.points[end];
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    });

    handState.points.forEach((point, index) => {
      context.beginPath();
      context.fillStyle =
        index === 8 || index === 12
          ? "rgba(255, 246, 200, 0.95)"
          : "rgba(196, 231, 255, 0.9)";
      context.arc(point.x, point.y, index === 0 ? 5 : 3.1, 0, Math.PI * 2);
      context.fill();
    });

    context.restore();
  };

  useEffect(() => {
    if (!webcamEnabled) {
      stopWebcamTracking();
      return undefined;
    }

    let isCancelled = false;

    const runHandTracking = async () => {
      try {
        setWebcamPermission("pending");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 960, height: 540 },
          audio: false,
        });

        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        webcamStreamRef.current = stream;
        setWebcamPermission("granted");

        await loadScriptOnce("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js");

        if (isCancelled || !window.Hands || !videoRef.current) {
          return;
        }

        const hands = new window.Hands({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.55,
          selfieMode: true,
        });

        hands.onResults((results) => {
          const landmarks = results.multiHandLandmarks?.[0];

          if (!landmarks) {
            handTriggeredNoteIdRef.current = null;
            handBlobGestureStageRef.current = "idle";
            setHandScreenState(null);
            setHandPointerState((current) => ({
              ...current,
              active: false,
              overBlob: false,
            }));
            drawHandOverlay(null);
            return;
          }

          const width = window.innerWidth;
          const height = window.innerHeight;
          const points = landmarks.map((landmark) => ({
            x: landmark.x * width,
            y: landmark.y * height,
            z: landmark.z,
          }));
          const palmCenter = getPalmCenter(landmarks);
          const pointerX = palmCenter.x * width;
          const pointerY = palmCenter.y * height;
          const normalizedX = palmCenter.x * 2 - 1;
          const normalizedY = -(palmCenter.y * 2 - 1);
          const gesture = classifyHandGesture(landmarks);
          const uiBlocked =
            pointerY > height - 120 &&
            (pointerX < 220 || pointerX > width - 340);
          const distanceToBlob = Math.hypot(
            pointerX - width / 2,
            pointerY - height / 2
          );
          const overBlob = !uiBlocked && distanceToBlob <= HAND_ABSORB_RADIUS;

          const handState = {
            points,
            pointerX,
            pointerY,
            normalizedX,
            normalizedY,
            overBlob,
            gesture,
          };

          setHandScreenState(handState);
          setHandPointerState({
            active: !uiBlocked,
            x: pointerX,
            y: pointerY,
            normalizedX,
            normalizedY,
            overBlob,
          });
          drawHandOverlay(handState);

          if (mouseDraggingNoteIdRef.current) {
            return;
          }

          if (blobEndStateRef.current === "idle" && overBlob) {
            if (gesture === "Closed_Fist") {
              if (handBlobGestureStageRef.current === "open") {
                handBlobGestureStageRef.current = "fist";
              } else if (handBlobGestureStageRef.current === "idle") {
                handBlobGestureStageRef.current = "fist";
              }
            } else if (gesture === "Open_Palm") {
              if (handBlobGestureStageRef.current === "fist") {
                handBlobGestureCountRef.current += 1;
                handBlobGestureStageRef.current = "open";
                if (
                  handBlobGestureCountRef.current >= HAND_BLOB_DISSOLVE_TARGET
                ) {
                  triggerBlobEndingRef.current?.();
                }
              } else {
                handBlobGestureStageRef.current = "open";
              }
            }
          } else if (!overBlob) {
            handBlobGestureStageRef.current = "idle";
          }

          if (!uiBlocked && blobEndStateRef.current === "idle") {
            const selectedByFingertips = notesRef.current.find(
              (note) => countFingertipsInsideNote(points, note) >= 4
            );

            if (selectedByFingertips) {
              if (handTriggeredNoteIdRef.current !== selectedByFingertips.id) {
                handTriggeredNoteIdRef.current = selectedByFingertips.id;
                setSelectedHandNoteId(selectedByFingertips.id);
                absorbNoteRef.current?.(selectedByFingertips);
                window.setTimeout(() => {
                  setSelectedHandNoteId((current) =>
                    current === selectedByFingertips.id ? null : current
                  );
                }, 0);
              }
            } else {
              handTriggeredNoteIdRef.current = null;
            }
          }
        });

        handTrackerRef.current = hands;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const loop = async () => {
          if (
            !videoRef.current ||
            !handTrackerRef.current ||
            handSendingRef.current ||
            videoRef.current.readyState < 2
          ) {
            handLoopRef.current = window.requestAnimationFrame(loop);
            return;
          }

          if (handLastVideoTimeRef.current !== videoRef.current.currentTime) {
            handSendingRef.current = true;
            handLastVideoTimeRef.current = videoRef.current.currentTime;
            await handTrackerRef.current.send({ image: videoRef.current });
            handSendingRef.current = false;
          }

          handLoopRef.current = window.requestAnimationFrame(loop);
        };

        handLoopRef.current = window.requestAnimationFrame(loop);
      } catch (error) {
        setWebcamPermission("denied");
        setWebcamEnabled(false);
        stopWebcamTracking();
      }
    };

    runHandTracking();

    return () => {
      isCancelled = true;
      stopWebcamTracking();
    };
  }, [webcamEnabled]);

  const schedulePlayerClose = () => {
    if (playerCloseTimeoutRef.current) {
      window.clearTimeout(playerCloseTimeoutRef.current);
    }

    playerCloseTimeoutRef.current = window.setTimeout(() => {
      setIsPlayerOpen(false);
      setIsTrackMenuOpen(false);
    }, 3000);
  };

  const keepPlayerOpen = () => {
    if (playerCloseTimeoutRef.current) {
      window.clearTimeout(playerCloseTimeoutRef.current);
    }
    setIsPlayerOpen(true);
  };

  const completeDraft = () => {
    if (!draft) {
      return;
    }

    const text = draft.text.trim();
    if (!text) {
      setDraft(null);
      resetBlobClickStreak();
      return;
    }

    const nextColor = getNextNoteColor(lastNoteColorRef.current);
    lastNoteColorRef.current = nextColor.name;
    setNotes((current) => [
      ...current,
      {
        id: `note-${Date.now()}`,
        text,
        x: draft.x,
        y: draft.y,
        width: INPUT_WIDTH,
        height: INPUT_HEIGHT,
        color: nextColor.name,
        fill: nextColor.fill,
        fold: nextColor.fold,
        deep: nextColor.deep,
      },
    ]);
    setDraft(null);
    resetBlobClickStreak();
  };

  const startDraftAtPoint = (clientX, clientY) => {
    if (blobEndState !== "idle") {
      return;
    }

    if (selectedHandNoteIdRef.current) {
      setSelectedHandNoteId(null);
      resetBlobClickStreak();
      return;
    }

    const x = clientX - INPUT_WIDTH / 2;
    const y = clientY - INPUT_HEIGHT / 2;
    const clamped = clampNotePosition(x, y, INPUT_WIDTH, INPUT_HEIGHT);
    setDraft({
      x: clamped.x,
      y: clamped.y,
      text: "",
    });
    resetBlobClickStreak();
  };

  const handleDraftKeyDown = (event) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      completeDraft();
    }

    if (event.key === "Escape") {
      setDraft(null);
      resetBlobClickStreak();
    }
  };

  const handleDraftBlur = () => {
    completeDraft();
  };

  const absorbNote = (note) => {
    const centerX =
      typeof window === "undefined" ? 0 : Math.round(window.innerWidth / 2);
    const centerY =
      typeof window === "undefined" ? 0 : Math.round(window.innerHeight / 2);
    const originX = note.x + INPUT_WIDTH / 2;
    const originY = note.y + INPUT_HEIGHT / 2;
    const deltaX = centerX - originX;
    const deltaY = centerY - originY;
    const curveX = clamp(-deltaY * 0.18, -140, 140);
    const curveY = clamp(deltaX * 0.18, -140, 140);
    const isLongText = countMeaningfulChars(note.text) >= SHOCK_TEXT_LENGTH;

    setNotes((current) => current.filter((item) => item.id !== note.id));
    setBlobState({
      source: note.fill,
      step: 0,
      tint: note.fill,
    });
    setBlobBurst((current) => ({
      key: current.key + 1,
      color: note.fill,
    }));
    resetBlobClickStreak();

    if (isLongText) {
      setBlobMotion((current) => ({
        ...current,
        quakeKey: current.quakeKey + 1,
      }));
      const shockId = `shock-${note.id}-${Date.now()}`;
      setCosmicShock({
        id: shockId,
        color: note.fill,
        deep: note.deep,
      });
      window.setTimeout(() => {
        setCosmicShock((current) => (current?.id === shockId ? null : current));
      }, 1200);
    }

    setAbsorbingNotes((current) => [
      ...current,
      {
        id: note.id,
        text: note.text,
        color: note.color,
        x: note.x,
        y: note.y,
        fill: note.fill,
        fold: note.fold,
        deep: note.deep,
      },
    ]);

    const absorbId = `absorb-${note.id}-${Date.now()}`;
    const burstId = `burst-${note.id}-${Date.now()}`;
    setAbsorbingText((current) => [
      ...current,
      {
        id: absorbId,
        text: wrapPreviewText(note.text),
        color: note.deep,
        originX,
        originY,
        deltaX,
        deltaY,
        curveX,
        curveY,
      },
    ]);
    setTextBursts((current) => [
      ...current,
      {
        id: burstId,
        x: originX,
        y: originY,
        particles: createBurstParticles(note.deep, 34, 28, 164),
      },
    ]);

    window.setTimeout(() => {
      setAbsorbingNotes((current) =>
        current.filter((item) => item.id !== note.id)
      );
      setAbsorbingText((current) =>
        current.filter((item) => item.id !== absorbId)
      );
      setTextBursts((current) =>
        current.filter((item) => item.id !== burstId)
      );
    }, 2600);
  };

  const handleBlobClick = () => {
    if (blobEndState !== "idle") {
      return;
    }

    attemptPlayAudio();

    const nextStreak = blobClickStreak + 1;
    setBlobClickStreak(nextStreak);

    if (nextStreak >= ENCOURAGEMENT_TRIGGER && encouragementLines.length > 0) {
      if (encouragementCount + 1 >= ENCOURAGEMENT_BLOB_END_COUNT) {
        setEncouragementCount(0);
        triggerBlobEnding();
      } else {
        const randomLine =
          encouragementLines[
            Math.floor(Math.random() * encouragementLines.length)
          ];
        setEncouragementBubble({
          id: `enc-${Date.now()}`,
          text: randomLine,
        });
        setEncouragementPointer(latestPointerRef.current);
        setEncouragementCount((current) => current + 1);
      }
      setBlobClickStreak(0);
    }

    const shouldBounce = blobState.step >= 2;

    setBlobState((current) => {
      if (current.step >= 3) {
        return current;
      }

      const nextStep = current.step + 1;
      return {
        ...current,
        step: nextStep,
        tint:
          nextStep >= 3
            ? BLOB_BASE_TINT
            : mixHexWithWhite(current.source, FADE_STEPS[nextStep]),
      };
    });

    if (shouldBounce) {
      setBlobMotion((motion) => ({
        ...motion,
        bounceKey: motion.bounceKey + 1,
      }));
    }
  };

  const handleNoteDrop = ({ id, x, y, absorbRadius = ABSORB_RADIUS }) => {
    const updated = clampNotePosition(x, y, INPUT_WIDTH, INPUT_HEIGHT);
    let noteToAbsorb = null;

    setNotes((current) =>
      current.map((note) => {
        if (note.id !== id) {
          return note;
        }

        const nextNote = {
          ...note,
          x: updated.x,
          y: updated.y,
        };

        if (doesNoteOverlapBlob(updated.x, updated.y, absorbRadius)) {
          noteToAbsorb = nextNote;
        }

        return nextNote;
      })
    );

    if (noteToAbsorb) {
      absorbNote(noteToAbsorb);
    } else {
      resetBlobClickStreak();
    }
  };

  const handleTrackChange = (trackId) => {
    setActiveTrackId(trackId);
    setIsTrackMenuOpen(false);
    window.setTimeout(() => {
      attemptPlayAudio();
    }, 0);
  };

  absorbNoteRef.current = absorbNote;
  handleNoteDropRef.current = handleNoteDrop;

  return (
    <div
      className={`container${cosmicShock ? " cosmicShockActive" : ""}${
        encouragementBubble ? " heartCursor" : ""
      }${blobHoverCursor ? " blobHoverCursor" : ""}`}
    >
      <video ref={videoRef} className="handVideo" playsInline muted />
      <canvas ref={handCanvasRef} className="handOverlay" aria-hidden="true" />

      <audio
        ref={audioRef}
        src={activeTrack.src}
        loop
        preload="auto"
        muted={isMuted}
        autoPlay
        playsInline
      />

      <Canvas
        camera={{ position: [0, 0, 8] }}
        onPointerMissed={(event) => startDraftAtPoint(event.clientX, event.clientY)}
      >
        <Blob
          tint={blobState.tint}
          absorbRadius={ABSORB_RADIUS}
          onClick={handleBlobClick}
          disintegrateSignal={blobDisintegrateSignal}
          isGone={blobEndState === "gone"}
          onDisintegrateComplete={() => {
            setBlobEndState("gone");
            setEncouragementBubble(null);
            setDraft(null);
          }}
          onHoverChange={(isHovering) => {
            setBlobHoverCursor(isHovering);
            if (isHovering) {
              setBlobCursorPointer(latestPointerRef.current);
            }
          }}
          externalHover={
            handPointerState.active && handPointerState.overBlob
              ? {
                  active: true,
                  x: handPointerState.normalizedX,
                  y: handPointerState.normalizedY,
                }
              : null
          }
          burstSignal={blobBurst.key}
          burstColor={blobBurst.color}
          bounceSignal={blobMotion.bounceKey}
          quakeSignal={blobMotion.quakeKey}
        />
      </Canvas>

      <div className="sceneGlow" aria-hidden="true" />
      <div className="blobMeteorRing" aria-hidden="true" />
      <div className="blobTargetRing" aria-hidden="true" />
      {cosmicShock ? (
        <div
          className="cosmicShock"
          aria-hidden="true"
          style={{
            "--shock-color": cosmicShock.color,
            "--shock-deep": cosmicShock.deep,
          }}
        />
      ) : null}
      {blobHoverCursor && !encouragementBubble ? (
        <div
          className={`blobHoverPointer${
            blobCursorPatting ? " blobHoverPointerPatting" : ""
          }`}
          aria-hidden="true"
          style={{
            left: blobCursorPointer.x,
            top: blobCursorPointer.y,
          }}
        >
          <span className="blobHoverPointerMain">👋</span>
          <span className="blobHoverPointerGlow" />
        </div>
      ) : null}
      {encouragementBubble ? (
        <div
          className="encouragementBubble attachedBubble"
          aria-live="polite"
          style={{
            left: encouragementPointer.x,
            top: encouragementPointer.y,
          }}
        >
          {encouragementBubble.text}
        </div>
      ) : null}
      {blobEndState === "gone" ? (
        <button
          type="button"
          className="endingMessage"
          onClick={() => window.location.reload()}
        >
          당신의 하루를 응원합니다
        </button>
      ) : null}

      {draft ? (
        <textarea
          ref={textareaRef}
          className="floatingInput"
          style={{ left: draft.x, top: draft.y }}
          value={draft.text}
          onChange={(event) =>
            setDraft((current) =>
              current
                ? {
                    ...current,
                    text: event.target.value,
                  }
                : current
            )
          }
          onKeyDown={handleDraftKeyDown}
          onBlur={handleDraftBlur}
          maxLength={48}
          rows={4}
          spellCheck={false}
        />
      ) : null}

      {notes.map((note) => (
        <StickyNote
          key={note.id}
          {...note}
          isSelected={note.id === selectedHandNoteId}
          onDragStart={(id) => {
            mouseDraggingNoteIdRef.current = id;
            setSelectedHandNoteId(null);
          }}
          onDragEnd={() => {
            mouseDraggingNoteIdRef.current = null;
          }}
          onDrop={handleNoteDrop}
          onRemove={(id) => {
            setNotes((current) => current.filter((noteItem) => noteItem.id !== id));
            resetBlobClickStreak();
          }}
        />
      ))}

      {absorbingNotes.map((note) => (
        <div
          key={note.id}
          className="absorbNoteGhost"
          style={{
            left: note.x,
            top: note.y,
            color: note.deep,
            "--note-fill": note.fill,
            "--fold-color": note.fold,
          }}
        >
          <div className="absorbTearHalf absorbTearLeft">
            <div className="absorbNoteText">{note.text}</div>
          </div>
          <div className="absorbTearHalf absorbTearRight">
            <div className="absorbNoteText">{note.text}</div>
          </div>
          <div className="absorbGhostFold absorbGhostFoldLeft" />
          <div className="absorbGhostFold absorbGhostFoldRight" />
          <div className="absorbGhostShadow absorbGhostShadowLeft" />
          <div className="absorbGhostShadow absorbGhostShadowRight" />
        </div>
      ))}

      <div className="absorbLayer" aria-hidden="true">
        {textBursts.map((burst) =>
          burst.particles.map((particle) => (
            <span
              key={particle.id}
              className="textBurstParticle"
              style={{
                left: burst.x,
                top: burst.y,
                "--particle-x": `${particle.x}px`,
                "--particle-y": `${particle.y}px`,
                "--particle-scale": particle.scale,
                "--particle-color": particle.color,
                "--particle-delay": `${particle.delay}s`,
                "--particle-duration": `${particle.duration}s`,
                "--particle-drift": particle.drift,
              }}
            />
          ))
        )}
        {absorbingText.map((item) => (
          <div
            key={item.id}
            className="orbitText"
            style={{
              left: item.originX,
              top: item.originY,
              color: item.color,
              "--orbit-dx": `${item.deltaX}px`,
              "--orbit-dy": `${item.deltaY}px`,
              "--orbit-curve-x": `${item.curveX}px`,
              "--orbit-curve-y": `${item.curveY}px`,
            }}
          >
            <span>{item.text}</span>
          </div>
        ))}
      </div>

      <div className="leftDock">
        <div className="helpDock">
          <button type="button" className="helpButton" aria-label="Help">
            ?
          </button>
          <div className="helpTooltip">{tutorialText}</div>
        </div>
        <button
          type="button"
          className={`cameraButton${webcamEnabled ? " cameraButtonActive" : ""}`}
          aria-label="Toggle hand camera"
          onClick={() => {
            if (webcamEnabled) {
              setWebcamEnabled(false);
            } else {
              setWebcamEnabled(true);
            }
          }}
        >
          📷
        </button>
        <button
          type="button"
          className="talkButton"
          aria-label="Deep conversation mirror"
          onClick={() => setIsMirrorModeOpen(true)}
          title="거울과의 깊은 대화"
        >
          💭
        </button>
      </div>

      <div
        ref={playerRef}
        className={`musicDock${isPlayerOpen ? " musicDockOpen" : ""}`}
        onMouseEnter={keepPlayerOpen}
        onMouseLeave={schedulePlayerClose}
      >
        <button
          type="button"
          className={`musicDockButton${isMuted ? " musicDockButtonMuted" : ""}`}
          onMouseEnter={() => {
            keepPlayerOpen();
            attemptPlayAudio();
          }}
          onClick={() => {
            keepPlayerOpen();
            setIsMuted((current) => !current);
            attemptPlayAudio();
          }}
          aria-label={isMuted ? "Unmute music" : "Mute music"}
        >
          ♫
        </button>

        <div className="musicPlayer">
          <button
            type="button"
            className="trackSelectButton"
            onClick={() => {
              keepPlayerOpen();
              setIsTrackMenuOpen((current) => !current);
              attemptPlayAudio();
            }}
          >
            <span className="playerTrackName">{activeTrack.label}</span>
            <span className="playerChevron">{isTrackMenuOpen ? "−" : "+"}</span>
          </button>

          {isTrackMenuOpen ? (
            <div className="trackMenu">
              {TRACKS.map((track) => (
                <button
                  key={track.id}
                  type="button"
                  className={`trackOption${
                    track.id === activeTrackId ? " activeTrackOption" : ""
                  }`}
                  onClick={() => {
                    keepPlayerOpen();
                    handleTrackChange(track.id);
                  }}
                >
                  {track.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="playerControls">
            <button
              type="button"
              className="muteButton"
              onClick={() => {
                keepPlayerOpen();
                setIsMuted((current) => !current);
                attemptPlayAudio();
              }}
            >
              {isMuted ? "Unmute" : "Mute"}
            </button>
            <input
            className="volumeSlider"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
              onChange={(event) => {
                keepPlayerOpen();
                setVolume(Number(event.target.value));
                attemptPlayAudio();
              }}
              aria-label="Volume"
            />
            <span className="volumeValue">
              {hasStartedAudio ? `${Math.round(volume * 100)}%` : "Starting"}
            </span>
          </div>
        </div>
      </div>

      {isMirrorModeOpen && (
        <MirrorMode onClose={() => setIsMirrorModeOpen(false)} />
      )}
    </div>
  );
}

export async function getStaticProps() {
  const encouragementPath = path.join(process.cwd(), "src", "encouragement.md");
  const tutorialPath = path.join(process.cwd(), "src", "tutorial.md");

  const encouragementContent = fs.readFileSync(encouragementPath, "utf8");
  const tutorialContent = fs.readFileSync(tutorialPath, "utf8");

  return {
    props: {
      encouragementLines: encouragementContent
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      tutorialLines: tutorialContent
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    },
  };
}
