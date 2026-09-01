import React, { useRef, useState, useEffect, useCallback } from 'react';

// Draw-to-sign pad. Captures whatever's drawn as a PNG data URL when the
// parent calls onChange. This records and stores a drawn signature but doesn't
// yet place it onto the document or generate a downloadable signed file —
// that's the heavier piece, and it needs real document handling rather than
// canvas drawing.
//
// Pointer events, not mouse events. onPointerDown/Move/Up fire for a mouse, a
// finger and a stylus through one path, so this works on a phone, a tablet and
// a desktop without three sets of handlers. The web app is reachable on a
// phone, so a mouse-only pad meant someone could open a signing screen they
// physically could not use.
//
// Two things that are easy to get wrong here:
//
//   1. touchAction: 'none' is required. Without it the browser treats a drag
//      as a scroll and the stroke never reaches the canvas.
//   2. A canvas has two sizes — its CSS size and its drawing-surface size. If
//      they differ, strokes land offset from the finger by exactly that ratio.
//      This measures the container and keeps them equal, which means handling
//      resize: setting canvas.width clears the bitmap, so the drawing has to be
//      saved and restored around it.
export default function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const drawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Applied after every resize as well as on mount, because changing the
  // drawing-surface size resets the whole context.
  const applyStrokeStyle = (ctx) => {
    ctx.strokeStyle = '#1A1A1A';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const width = Math.round(wrap.clientWidth);
    const height = Math.round(wrap.clientHeight);
    // Device pixel ratio, so the line isn't soft on a retina screen. The
    // context is scaled by the same factor, so all drawing code below can keep
    // working in CSS pixels.
    const ratio = window.devicePixelRatio || 1;

    if (canvas.width === width * ratio && canvas.height === height * ratio) return;

    // Setting width or height clears the canvas, so anything already drawn has
    // to be carried across.
    const previous = canvas.width > 0 ? canvas.toDataURL('image/png') : null;

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    applyStrokeStyle(ctx);

    if (previous) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, width, height);
      img.src = previous;
    }
  }, []);

  useEffect(() => {
    resize();
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [resize]);

  // Position in CSS pixels relative to the canvas. Works for mouse and touch
  // alike because pointer events carry clientX/clientY either way.
  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e) => {
    // Capture means a stroke that leaves the canvas mid-drag still ends
    // properly rather than hanging in a drawing state.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawingRef.current = true;
  };

  const draw = (e) => {
    if (!drawingRef.current) return;
    // Prevents the page scrolling under a finger on iOS, which touchAction
    // alone doesn't always stop once a gesture has begun.
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasSignature) setHasSignature(true);
  };

  const stopDraw = (e) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    e?.currentTarget?.releasePointerCapture?.(e.pointerId);
    if (hasSignature) {
      onChange(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    // In CSS pixels, since the context is already scaled by the pixel ratio.
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onChange(null);
  };

  return (
    <div>
      <div ref={wrapRef} style={styles.canvasWrap}>
        {!hasSignature ? <span style={styles.placeholder}>Sign here</span> : null}
        <canvas
          ref={canvasRef}
          style={styles.canvas}
          onPointerDown={startDraw}
          onPointerMove={draw}
          onPointerUp={stopDraw}
          onPointerCancel={stopDraw}
          onPointerLeave={stopDraw}
        />
      </div>
      <button style={styles.clearButton} onClick={clear} type="button">
        Clear
      </button>
    </div>
  );
}

const styles = {
  // Width follows the container so this fits a narrow screen; the fixed
  // height keeps the signing area a consistent shape. Everything else matches
  // the original - this change is about touch support, not restyling.
  canvasWrap: { position: 'relative', width: '100%', maxWidth: 360, height: 130, marginBottom: 8 },
  placeholder: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#B0B0B0',
    fontSize: 13,
    fontStyle: 'italic',
    pointerEvents: 'none',
  },
  canvas: {
    width: '100%',
    height: 130,
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-strong)',
    background: '#FFFFFF',
    cursor: 'crosshair',
    display: 'block',
    // Without this the browser reads a drag as a scroll and nothing is drawn.
    touchAction: 'none',
  },
  clearButton: { fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 },
};
