import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import Blob from "../components/Blob";
import StickyNote from "../components/StickyNote";

const NOTE_COLORS = [
  { name: "pink", fill: "#f7b7cb", fold: "#eb99b4", deep: "#bb4d7d" },
  { name: "yellow", fill: "#f5e58a", fold: "#e2cc62", deep: "#ab8123" },
  { name: "blue", fill: "#a9d7f6", fold: "#80b6db", deep: "#376d97" },
  { name: "green", fill: "#b8e3b0", fold: "#91c28b", deep: "#4e8755" },
];

const INPUT_WIDTH = 196;
const INPUT_HEIGHT = 138;
const ABSORB_RADIUS = 172;
const BLOB_BASE_TINT = "#f2efe7";
const FADE_STEPS = [0, 0.45, 0.72, 1];

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

export default function Home() {
  const textareaRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const [notes, setNotes] = useState([]);
  const [absorbingNotes, setAbsorbingNotes] = useState([]);
  const [absorbingText, setAbsorbingText] = useState([]);
  const [blobState, setBlobState] = useState({
    source: BLOB_BASE_TINT,
    step: 3,
    tint: BLOB_BASE_TINT,
  });

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

  const completeDraft = () => {
    if (!draft) {
      return;
    }

    const text = draft.text.trim();
    if (!text) {
      setDraft(null);
      return;
    }

    const nextColor = NOTE_COLORS[notes.length % NOTE_COLORS.length];
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
  };

  const handleDraftKeyDown = (event) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      completeDraft();
    }

    if (event.key === "Escape") {
      setDraft(null);
    }
  };

  const handleDraftBlur = () => {
    completeDraft();
  };

  const absorbNote = (note) => {
    setNotes((current) => current.filter((item) => item.id !== note.id));
    setBlobState({
      source: note.fill,
      step: 0,
      tint: note.fill,
    });

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
    setAbsorbingText((current) => [
      ...current,
      {
        id: absorbId,
        text: wrapPreviewText(note.text),
        color: note.deep,
      },
    ]);

    window.setTimeout(() => {
      setAbsorbingNotes((current) =>
        current.filter((item) => item.id !== note.id)
      );
      setAbsorbingText((current) =>
        current.filter((item) => item.id !== absorbId)
      );
    }, 2600);
  };

  const handleBlobClick = () => {
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
    }
  };

  return (
    <div className="container">
      <Canvas
        camera={{ position: [0, 0, 8] }}
        onPointerMissed={(event) => startDraftAtPoint(event.clientX, event.clientY)}
      >
        <Blob
          tint={blobState.tint}
          absorbRadius={ABSORB_RADIUS}
          onClick={handleBlobClick}
        />
      </Canvas>

      <div className="sceneGlow" aria-hidden="true" />
      <div className="blobTargetRing" aria-hidden="true" />

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
          onRemove={(id) =>
            setNotes((current) => current.filter((noteItem) => noteItem.id !== id))
          }
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
        {absorbingText.map((item) => (
          <div key={item.id} className="orbitText" style={{ color: item.color }}>
            <span>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
