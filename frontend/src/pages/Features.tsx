import { useNavigate } from "react-router-dom";
import styles from "./Features.module.css";

interface SectionRow {
  keys: string[];
  desc: string;
}

interface Section {
  id: string;
  title: string;
  desc: string;
  rows: SectionRow[];
}

const SECTIONS: Section[] = [
  {
    id: "vim",
    title: "VIM MODE",
    desc: "Two modes: NORMAL and INSERT. App starts in NORMAL. Navigation only works in NORMAL mode.",
    rows: [
      { keys: ["i", "a"], desc: "Enter INSERT mode — activate input field" },
      { keys: ["Esc"], desc: "Return to NORMAL mode — deactivate input" },
      { keys: ["j"], desc: "Select next message (scroll down)" },
      { keys: ["k"], desc: "Select previous message (scroll up)" },
      { keys: ["G"], desc: "Jump to last message" },
      { keys: ["g", "g"], desc: "Jump to first message (press g twice within 500ms)" },
      { keys: ["Ctrl+d"], desc: "Jump 5 messages down" },
      { keys: ["Ctrl+u"], desc: "Jump 5 messages up" },
      { keys: ["y"], desc: "Yank (copy) selected message to clipboard" },
    ],
  },
  {
    id: "slash",
    title: "SLASH COMMANDS",
    desc: "Type a command starting with / and press Enter. Output is posted as a system message visible to both users.",
    rows: [
      { keys: ["/roll"], desc: "Roll a d6 dice — result posted to chat" },
      { keys: ["/flip"], desc: "Flip a coin — HEADS or TAILS" },
      { keys: ["/ping"], desc: "Send a ping — ACK with simulated latency and TTL" },
      { keys: ["/time <city>"], desc: "Show current time in a city (tokyo, moscow, london, nyc, dubai…)" },
      { keys: ["/encode <text>"], desc: "Encrypt text with ROT13 — recipient sees cipher text with [DECRYPT] button" },
      { keys: ["/calc <expr>"], desc: "Evaluate a math expression (supports + - * / ^ %)" },
    ],
  },
  {
    id: "matrix",
    title: "MATRIX SCREENSAVER",
    desc: "Canvas-based screensaver. Activates after 60 seconds with no mouse, keyboard, scroll, or touch input.",
    rows: [
      { keys: ["idle 60s"], desc: "Trigger matrix rain screensaver automatically" },
      { keys: ["any input"], desc: "Mouse move, click, keypress or scroll dismisses it" },
      { keys: ["—"], desc: "Characters: Japanese katakana + ASCII symbols + special chars" },
    ],
  },
  {
    id: "sounds",
    title: "KEYBOARD SOUNDS",
    desc: "Audio generated via Web Audio API. No external files. AudioContext is reused across events.",
    rows: [
      { keys: ["keystroke"], desc: "White noise click on every character typed in the input" },
      { keys: ["new message"], desc: "Two-tone beep (880Hz → 1320Hz) on incoming messages" },
    ],
  },
  {
    id: "visual",
    title: "VISUAL EFFECTS",
    desc: "CSS-only effects applied as fixed overlays or CSS animations. No JS overhead.",
    rows: [
      { keys: ["scanlines"], desc: "Subtle CRT scanline overlay on the entire screen (pointer-events: none)" },
      { keys: ["glitch"], desc: "New messages materialize with a brightness flicker and horizontal glitch animation" },
      { keys: ["selection"], desc: "NORMAL mode message cursor highlighted with amber glow (box-shadow)" },
      { keys: ["block cursor"], desc: "Input caret rendered as a solid block (caret-shape: block)" },
    ],
  },
  {
    id: "typing",
    title: "TYPING INDICATOR",
    desc: "Shown in the chat header when the other user is typing. WPM synced via WebSocket, rate-limited to one write per 1.2s.",
    rows: [
      { keys: ["▶ TRANSMITTING"], desc: "Shown in chat header when the other person is typing" },
      { keys: ["[N WPM]"], desc: "Words per minute, calculated from keystrokes in the last 10 seconds" },
      { keys: ["auto-clear"], desc: "Indicator disappears 2.5s after the last keystroke" },
    ],
  },
  {
    id: "stats",
    title: "CONNECTION STATS",
    desc: "Fixed bar between the message list and input. Uptime and TX count are local state; MSG count comes from the server.",
    rows: [
      { keys: ["-- NORMAL --"], desc: "Amber — current mode is NORMAL (vim navigation)" },
      { keys: ["-- INSERT --"], desc: "Green — current mode is INSERT (typing active)" },
      { keys: ["UP: HH:MM:SS"], desc: "Session uptime since the chat page was opened" },
      { keys: ["MSG: N"], desc: "Total messages in this chat thread" },
      { keys: ["TX: N"], desc: "Messages sent by you during this session" },
      { keys: ["● NOMINAL"], desc: "WebSocket connection alive (blinking dot)" },
    ],
  },
];

export default function Features() {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <div className={styles.terminal}>
        <div className={styles.titleBar}>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>← back</button>
          <h1 className={styles.titleText}>SEMAPHORE — SYSTEM MANUAL</h1>
          <span className={styles.version}>v1.0</span>
        </div>

        <div className={styles.intro}>
          <div className={styles.line}>$ man semaphore</div>
          <div className={styles.line}>&nbsp;</div>
          <div className={styles.line}><span className={styles.dim}>NAME</span></div>
          <div className={styles.line}>&nbsp;&nbsp;&nbsp;&nbsp;semaphore — web-based one-on-one chat</div>
          <div className={styles.line}>&nbsp;</div>
          <div className={styles.line}><span className={styles.dim}>SYNOPSIS</span></div>
          <div className={styles.line}>&nbsp;&nbsp;&nbsp;&nbsp;semaphore [--vim-mode] [--sounds] [--slash-commands]</div>
          <div className={styles.line}>&nbsp;</div>
          <div className={styles.line}><span className={styles.dim}>DESCRIPTION</span></div>
          <div className={styles.line}>&nbsp;&nbsp;&nbsp;&nbsp;Real-time messaging app built on React and Go.</div>
          <div className={styles.line}>&nbsp;&nbsp;&nbsp;&nbsp;Supports vim-style navigation, slash commands, and push notifications.</div>
          <div className={styles.line}>&nbsp;</div>
        </div>

        {SECTIONS.map((section) => (
          <div key={section.id} className={styles.section}>
            <div className={styles.sectionTitle}>
              <span className={styles.dim}>──</span> {section.id.toUpperCase()} <span className={styles.dim}>{"─".repeat(Math.max(2, 48 - section.id.length))}</span>
            </div>
            <div className={styles.sectionDesc}>{section.desc}</div>
            <table className={styles.table}>
              <tbody>
                {section.rows.map((row, i) => (
                  <tr key={i}>
                    <td className={styles.keyCell}>
                      {row.keys.map((k, j) => (
                        <span key={j} className={styles.key}>{k}</span>
                      ))}
                    </td>
                    <td className={styles.descCell}>{row.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <div className={styles.footer}>
          <div className={styles.line}>&nbsp;</div>
          <div className={styles.line}><span className={styles.dim}>SEE ALSO</span></div>
          <div className={styles.line}>&nbsp;&nbsp;&nbsp;&nbsp;vim(1), react(1), go(1)</div>
          <div className={styles.line}>&nbsp;</div>
          <div className={styles.line}><span className={styles.dim}>STACK</span></div>
          <div className={styles.line}>&nbsp;&nbsp;&nbsp;&nbsp;React 18, Vite, Go backend, PostgreSQL, CSS Modules</div>
          <div className={styles.line}>&nbsp;</div>
          <span className={styles.cursor}>█</span>
        </div>
      </div>
    </div>
  );
}
