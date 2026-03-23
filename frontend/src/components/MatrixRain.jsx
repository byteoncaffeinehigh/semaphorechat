import { useEffect, useRef, useState, useCallback } from "react";
import styled, { keyframes, css } from "styled-components";

const IDLE_TIMEOUT = 60 * 1000;

const CHARS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+-=[]{}|;:<>?/\\~`";

export default function MatrixRain({ forceVisible = false, onForceHide }) {
  const canvasRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const timerRef = useRef(null);
  const animRef = useRef(null);
  const columnsRef = useRef([]);
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
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, IDLE_TIMEOUT);
  }, [visible, hide, onForceHide]);

  // Handle forceVisible prop
  useEffect(() => {
    isForcedRef.current = forceVisible;
    if (forceVisible) {
      clearTimeout(timerRef.current);
      setFading(false);
      setVisible(true);
    } else if (!forceVisible && visible) {
      hide();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceVisible]);

  // Start idle timer
  useEffect(() => {
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach(e => window.addEventListener(e, resetTimer));
    timerRef.current = setTimeout(() => setVisible(true), IDLE_TIMEOUT);
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  // Matrix rain animation
  useEffect(() => {
    if (!visible) {
      cancelAnimationFrame(animRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

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

    const draw = (timestamp) => {
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

        // Brightest char at the front
        ctx.fillStyle = "#aaffaa";
        ctx.shadowColor = "#00ff41";
        ctx.shadowBlur = 8;
        ctx.font = "bold 14px monospace";
        ctx.fillText(char, x, y);

        // Trail chars
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

      // Center overlay text
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

  return (
    <Overlay fading={fading}>
      <Canvas ref={canvasRef} />
    </Overlay>
  );
}

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const fadeOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9999;
  cursor: none;
  animation: ${({ fading }) =>
    fading
      ? css`${fadeOut} 0.8s ease forwards`
      : css`${fadeIn} 0.8s ease forwards`};
`;

const Canvas = styled.canvas`
  display: block;
  width: 100%;
  height: 100%;
`;
