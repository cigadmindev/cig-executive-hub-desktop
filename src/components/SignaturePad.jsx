import React, { useRef, useState, useEffect } from 'react';

// Draw-to-sign pad. Captures whatever's drawn as a PNG data URL when the
// parent calls onChange. This is a first pass — it records a drawn
// signature and stores it, but doesn't yet place that signature onto the
// actual document or generate a downloadable signed file. That's the
// heavier piece for later (needs real document handling, not just canvas
// drawing).
export default function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#1A1A1A';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e) => {
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasSignature) setHasSignature(true);
  };

  const stopDraw = () => {
    setIsDrawing(false);
    if (hasSignature) {
      onChange(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onChange(null);
  };

  return (
    <div>
      <div style={styles.canvasWrap}>
        {!hasSignature ? <span style={styles.placeholder}>Sign here</span> : null}
        <canvas
          ref={canvasRef}
          width={360}
          height={130}
          style={styles.canvas}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={() => isDrawing && stopDraw()}
        />
      </div>
      <button type="button" style={styles.clearButton} onClick={clear}>
        Clear
      </button>
    </div>
  );
}

const styles = {
  canvasWrap: { position: 'relative', width: 360, height: 130, marginBottom: 8 },
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
    width: 360,
    height: 130,
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-strong)',
    background: '#FFFFFF',
    cursor: 'crosshair',
  },
  clearButton: { fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 },
};
