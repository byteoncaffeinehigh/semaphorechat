import { useState, useEffect } from "react";
import styles from "./ConnectionStats.module.css";

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600).toString().padStart(2, "0");
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

interface ConnectionStatsProps {
  msgCount?: number;
  txCount?: number;
  mode: string;
}

export default function ConnectionStats({ msgCount, txCount, mode }: ConnectionStatsProps) {
  const [startTime] = useState(() => Date.now());
  const [uptime, setUptime] = useState("00:00:00");

  useEffect(() => {
    const id = setInterval(() => setUptime(formatUptime(Date.now() - startTime)), 1000);
    return () => clearInterval(id);
  }, [startTime]);

  const modeClass = `${styles.modeIndicator} ${mode === "insert" ? styles.modeInsert : styles.modeNormal}`;

  return (
    <div className={styles.bar}>
      <span className={modeClass}>
        {mode === "insert" ? "-- INSERT --" : "-- NORMAL --"}
      </span>
      <span className={styles.divider}>|</span>
      <span className={styles.seg}>◈ UP: {uptime}</span>
      <span className={styles.divider}>|</span>
      <span className={styles.seg}>MSG: {msgCount ?? 0}</span>
      <span className={styles.divider}>|</span>
      <span className={styles.seg}>TX: {txCount ?? 0}</span>
      <span className={styles.divider}>|</span>
      <span className={styles.seg}>
        <span className={styles.netDot} />
        NOMINAL
      </span>
    </div>
  );
}
