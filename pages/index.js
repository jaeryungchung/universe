import fs from "fs";
import path from "path";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import Blob from "../components/Blob";
import StickyNote from "../components/StickyNote";
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
const BLOB_BASE_TINT = "#f2efe7";
const FADE_STEPS = [0, 0.45, 0.72, 1];
const SHOCK_TEXT_LENGTH = 15;
const ENCOURAGEMENT_TRIGGER = 10;
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

export default function Home({ encouragementLines, tutorialLines }) {
  const textareaRef = useRef(null);
  const audioRef = useRef(null);
  const playerRef = useRef(null);
  const playerCloseTimeoutRef = useRef(null);
  const latestPointerRef = useRef({ x: 0, y: 0 });
  const lastNoteColorRef = useRef(null);
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
  const [encouragementBubble, setEncouragementBubble] = useState(null);
  const [encouragementPointer, setEncouragementPointer] = useState({
    x: 0,
    y: 0,
  });
  const [activeTrackId, setActiveTrackId] = useState(TRACKS[0].id);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(0.45);
  const [isTrackMenuOpen, setIsTrackMenuOpen] = useState(false);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [hasStartedAudio, setHasStartedAudio] = useState(false);

  const activeTrack = useMemo(
    () => TRACKS.find((track) => track.id === activeTrackId) || TRACKS[0],
    [activeTrackId]
  );

  const tutorialText = tutorialLines.join(" ");

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
      latestPointerRef.current = { x: event.clientX, y: event.clientY };
      if (encouragementBubble) {
        setEncouragementPointer({
          x: event.clientX,
          y: event.clientY,
        });
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [encouragementBubble]);

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
    attemptPlayAudio();

    const nextStreak = blobClickStreak + 1;
    setBlobClickStreak(nextStreak);

    if (nextStreak >= ENCOURAGEMENT_TRIGGER && encouragementLines.length > 0) {
      const randomLine =
        encouragementLines[
          Math.floor(Math.random() * encouragementLines.length)
        ];
      setEncouragementBubble({
        id: `enc-${Date.now()}`,
        text: randomLine,
      });
      setEncouragementPointer(latestPointerRef.current);
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

  const handleNoteDrop = ({ id, x, y }) => {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    const updated = clampNotePosition(x, y, INPUT_WIDTH, INPUT_HEIGHT);
    const noteCenterX = updated.x + INPUT_WIDTH / 2;
    const noteCenterY = updated.y + INPUT_HEIGHT / 2;
    const distance = Math.hypot(noteCenterX - centerX, noteCenterY - centerY);

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

        if (distance <= ABSORB_RADIUS) {
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

  return (
    <div
      className={`container${cosmicShock ? " cosmicShockActive" : ""}${
        encouragementBubble ? " heartCursor" : ""
      }`}
    >
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

      <div className="helpDock">
        <button type="button" className="helpButton" aria-label="Help">
          ?
        </button>
        <div className="helpTooltip">{tutorialText}</div>
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
            <span className="playerCaption">Now playing</span>
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
              step="0.01"
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
