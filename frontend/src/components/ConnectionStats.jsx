import { useState, useEffect } from "react";
import styled from "styled-components";

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600).toString().padStart(2, "0");
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

export default function ConnectionStats({ msgCount, txCount, mode }) {
  const [startTime] = useState(() => Date.now());
  const [uptime, setUptime] = useState("00:00:00");

  useEffect(() => {
    const id = setInterval(() => setUptime(formatUptime(Date.now() - startTime)), 1000);
    return () => clearInterval(id);
  }, [startTime]);

  return (
    <Bar>
      <ModeIndicator $mode={mode}>
        {mode === "insert" ? "-- INSERT --" : "-- NORMAL --"}
      </ModeIndicator>
      <Divider>|</Divider>
      <Seg>◈ UP: {uptime}</Seg>
      <Divider>|</Divider>
      <Seg>MSG: {msgCount ?? 0}</Seg>
      <Divider>|</Divider>
      <Seg>TX: {txCount ?? 0}</Seg>
      <Divider>|</Divider>
      <Seg><NetDot />NOMINAL</Seg>
    </Bar>
  );
}

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: #050d05;
  border-top: 1px solid #0f2a0f;
  font-family: 'Share Tech Mono', 'Courier New', monospace;
  font-size: 10px;
  color: #1a6a1a;
  user-select: none;
  flex-shrink: 0;
`;

const ModeIndicator = styled.span`
  font-size: 11px;
  font-weight: bold;
  color: ${({ $mode }) => $mode === "insert" ? "#00ff41" : "#ffaa00"};
  text-shadow: ${({ $mode }) =>
    $mode === "insert"
      ? "0 0 8px rgba(0,255,65,0.6)"
      : "0 0 8px rgba(255,170,0,0.6)"};
  transition: color 0.2s, text-shadow 0.2s;
`;

const Seg = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
`;

const Divider = styled.span`
  color: #0f2a0f;
`;

const NetDot = styled.span`
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #00ff41;
  box-shadow: 0 0 4px #00ff41;
  animation: blink 2s ease-in-out infinite;

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
`;
