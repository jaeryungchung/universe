import React, { useEffect, useRef, useState } from "react";
import styles from "./StickyNote.module.css";

const StickyNote = ({
  id,
  x,
  y,
  text,
  color,
  isSelected,
  onDrop,
  onRemove,
  onDragStart,
  onDragEnd,
}) => {
  const noteRef = useRef(null);
  const dragState = useRef({ pointerId: null, offsetX: 0, offsetY: 0 });
  const [position, setPosition] = useState({ x, y });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setPosition({ x, y });
  }, [x, y]);

  const handlePointerDown = (event) => {
    if (event.target.closest(`.${styles.closeBtn}`)) {
      return;
    }

    const rect = noteRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    dragState.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };

    noteRef.current?.setPointerCapture(event.pointerId);
    setIsDragging(true);
    onDragStart?.(id);
  };

  const handlePointerMove = (event) => {
    if (!isDragging || event.pointerId !== dragState.current.pointerId) {
      return;
    }

    setPosition({
      x: event.clientX - dragState.current.offsetX,
      y: event.clientY - dragState.current.offsetY,
    });
  };

  const handlePointerUp = (event) => {
    if (event.pointerId !== dragState.current.pointerId) {
      return;
    }

    const nextPosition = {
      x: event.clientX - dragState.current.offsetX,
      y: event.clientY - dragState.current.offsetY,
    };

    noteRef.current?.releasePointerCapture(event.pointerId);
    setIsDragging(false);
    setPosition(nextPosition);
    onDragEnd?.(id);
    onDrop?.({
      id,
      x: nextPosition.x,
      y: nextPosition.y,
    });
  };

  return (
    <div
      ref={noteRef}
      className={`${styles.stickyNote} ${styles[color] || styles.pink} ${
        isDragging ? styles.dragging : ""
      } ${isSelected ? styles.selected : ""}`}
      style={{
        left: position.x,
        top: position.y,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <button
        type="button"
        className={styles.closeBtn}
        onClick={() => onRemove?.(id)}
        aria-label="Delete sticky note"
      >
        ×
      </button>

      <div className={styles.textContent}>{text}</div>
      <div className={styles.fold} />
      <div className={styles.shadow} />
    </div>
  );
};

export default StickyNote;
