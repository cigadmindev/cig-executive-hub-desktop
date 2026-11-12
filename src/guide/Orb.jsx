import React, { useEffect, useRef } from 'react';

// The Hub Guide's orb (Nov 2026): a ball of tiny glowing particles, always
// centred in its circle. Waiting, it barely moves - a slow turn and a soft
// breath - with a little stir every so often so you know it's there. When it
// answers ('think', 'talk') the particles swirl and scatter, then gather
// back into the ball.
const MOODS = {
  idle: { spin: 0.18, chaos: 0, glow: 0.32, bright: 0.78 },
  listen: { spin: 0.32, chaos: 0.05, glow: 0.5, bright: 0.95 },
  think: { spin: 2.4, chaos: 1, glow: 1, bright: 1.15 },
  talk: { spin: 1.3, chaos: 0.55, glow: 0.8, bright: 1.05 },
  joke: { spin: 1.8, chaos: 0.7, glow: 0.9, bright: 1.1 },
};
const COLS = ['63,170,163', '127,214,205', '231,169,143', '180,232,226', '47,143,138'];

export default function Orb({ mood = 'idle', size = 44, stir = false }) {
  const ref = useRef(null);
  const moodRef = useRef(mood);
  moodRef.current = mood;
  const stirRef = useRef(stir);
  stirRef.current = stir;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const N = size > 40 ? 150 : 110;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const ps = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const a = golden * i;
      ps.push({ x: Math.cos(a) * r, y, z: Math.sin(a) * r, s: Math.random() * 10, c: COLS[i % COLS.length], sz: 0.6 + Math.random() * 0.9 });
    }
    const cur = { ...MOODS.idle };
    let t = Math.random() * 50, rot = 0, kick = 0, raf = 0, nextStir = performance.now() + 6000 + Math.random() * 6000, stirUntil = 0;
    const frame = (now) => {
      // Every 6-12 seconds while closed, a short stir.
      if (stirRef.current && now > nextStir) { stirUntil = now + 1300; nextStir = now + 6000 + Math.random() * 6000; }
      const m = moodRef.current === 'idle' && now < stirUntil ? 'talk' : moodRef.current;
      const tgt = MOODS[m] ?? MOODS.idle;
      for (const k in tgt) cur[k] += (tgt[k] - cur[k]) * (tgt.chaos > cur.chaos ? 0.08 : 0.035);
      kick *= 0.9;
      const slow = reduce ? 0.15 : 1;
      t += 0.016 * slow;
      rot += 0.016 * cur.spin * slow;
      const W = canvas.width, cx = W / 2, cy = W / 2;
      const R = W * 0.3 * (1 + 0.025 * Math.sin(t * 1.6) + kick * 0.06);
      ctx.clearRect(0, 0, W, W);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.5);
      g.addColorStop(0, `rgba(47,143,138,${0.28 * cur.glow})`);
      g.addColorStop(1, 'rgba(47,143,138,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, W);
      ctx.globalCompositeOperation = 'lighter';
      const ct = Math.cos(0.45), st = Math.sin(0.45);
      for (const p of ps) {
        const a = rot * (1 + cur.chaos * 0.6 * Math.sin(p.s));
        const x = p.x * Math.cos(a) - p.z * Math.sin(a);
        const z = p.x * Math.sin(a) + p.z * Math.cos(a);
        const y2 = p.y * ct - z * st, z2 = p.y * st + z * ct;
        const burst = 1 + cur.chaos * (0.42 * Math.sin(t * 3.1 + p.s * 7) + 0.28 * Math.sin(t * 5.7 + p.s * 13));
        const depth = (z2 + 1) / 2;
        const r = (W / 44) * p.sz * (0.55 + depth * 0.75);
        const al = Math.min(1, (0.25 + depth * 0.75) * cur.bright * (0.75 + 0.25 * Math.sin(t * 2 + p.s * 5)));
        ctx.fillStyle = `rgba(${p.c},${al})`;
        ctx.beginPath();
        ctx.arc(cx + x * R * burst, cy + y2 * R * burst, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onVis = () => { if (document.hidden) cancelAnimationFrame(raf); else raf = requestAnimationFrame(frame); };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); };
  }, [size]);

  return (
    <span style={{ width: size, height: size, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 50% 50%, #26343a, #141a1e)', flexShrink: 0 }}>
      <canvas ref={ref} style={{ width: size, height: size, display: 'block' }} aria-hidden="true" />
    </span>
  );
}
