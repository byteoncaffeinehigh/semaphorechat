import { useEffect, useRef, useState, useCallback } from "react";
import styles from "./MatrixRain.module.css";

const IDLE_TIMEOUT = 60 * 1000;

const CHARS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+-=[]{}|;:<>?/\\~`";

interface MatrixRainProps {
  forceVisible?: boolean;
  onForceHide?: () => void;
}

export default function MatrixRain({ forceVisible = false, onForceHide }: MatrixRainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef = useRef<number>(0);
  const columnsRef = useRef<number[]>([]);
  const isForcedRef = useRef(false);

  const hide = useCallback(() => {
    setFading(true);
    setTimeout(() => {
      setVisible(false);
      setFading(false);
    }, 800);
  }, []);

  const resetTimer = useCallback(() => {
    if (isForcedRef.current) onForceHide?.();
    if (visible) hide();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, IDLE_TIMEOUT);
  }, [visible, hide, onForceHide]);

  useEffect(() => {
    isForcedRef.current = forceVisible;
    if (forceVisible) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setFading(false);
      setVisible(true);
    } else if (!forceVisible && visible) {
      hide();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceVisible]);

  useEffect(() => {
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, resetTimer));
    timerRef.current = setTimeout(() => setVisible(true), IDLE_TIMEOUT);
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  useEffect(() => {
    if (!visible) {
      cancelAnimationFrame(animRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const cols = Math.floor(canvas.width / 16);
      columnsRef.current = Array.from({ length: cols }, () =>
        Math.floor(Math.random() * canvas.height / 20)
      );
    };
    resize();
    window.addEventListener("resize", resize);

    let lastTime = 0;
    const fps = 20;
    const interval = 1000 / fps;

    const draw = (timestamp: number) => {
      if (timestamp - lastTime < interval) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }
      lastTime = timestamp;

      ctx.fillStyle = "rgba(7, 13, 7, 0.05)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cols = columnsRef.current;
      for (let i = 0; i < cols.length; i++) {
        const char = CHARS[Math.floor(Math.random() * CHARS.length)];
        const x = i * 16;
        const y = cols[i] * 20;

        ctx.fillStyle = "#aaffaa";
        ctx.shadowColor = "#00ff41";
        ctx.shadowBlur = 8;
        ctx.font = "bold 14px monospace";
        ctx.fillText(char, x, y);

        ctx.fillStyle = "#00ff41";
        ctx.shadowBlur = 4;
        ctx.font = "14px monospace";
        const trailChar = CHARS[Math.floor(Math.random() * CHARS.length)];
        if (y > 20) ctx.fillText(trailChar, x, y - 20);

        ctx.shadowBlur = 0;

        if (y > canvas.height && Math.random() > 0.975) {
          cols[i] = 0;
        } else {
          cols[i]++;
        }
      }

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      ctx.font = "bold 18px monospace";
      ctx.fillStyle = "rgba(7,13,7,0.7)";
      ctx.fillRect(centerX - 180, centerY - 36, 360, 56);
      ctx.strokeStyle = "#00ff41";
      ctx.lineWidth = 1;
      ctx.strokeRect(centerX - 180, centerY - 36, 360, 56);
      ctx.fillStyle = "#00ff41";
      ctx.shadowColor = "#00ff41";
      ctx.shadowBlur = 12;
      ctx.textAlign = "center";
      ctx.fillText(
        isForcedRef.current ? "[ MATRIX PROTOCOL ACTIVE ]" : "[ SYSTEM IDLE — MOVE TO RESUME ]",
        centerX,
        centerY
      );
      ctx.shadowBlur = 0;
      ctx.textAlign = "left";

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [visible]);

  if (!visible && !fading) return null;

  const overlayClass = `${styles.overlay} ${fading ? styles.overlayFading : styles.overlayVisible}`;

  return (
    <div className={overlayClass}>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
