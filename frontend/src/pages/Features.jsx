import { useNavigate } from "react-router-dom";
import styled, { keyframes } from "styled-components";

const SECTIONS = [
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
    desc: "CSS-only effects applied as fixed overlays or styled-components animations. No JS overhead.",
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
    <Page>
      <Terminal>
        <TitleBar>
          <BackBtn onClick={() => navigate(-1)}>← back</BackBtn>
          <TitleText>SEMAPHORE — SYSTEM MANUAL</TitleText>
          <Version>v1.0</Version>
        </TitleBar>

        <Intro>
          <Line>$ man semaphore</Line>
          <Line>&nbsp;</Line>
          <Line><Dim>NAME</Dim></Line>
          <Line>&nbsp;&nbsp;&nbsp;&nbsp;semaphore — web-based one-on-one chat</Line>
          <Line>&nbsp;</Line>
          <Line><Dim>SYNOPSIS</Dim></Line>
          <Line>&nbsp;&nbsp;&nbsp;&nbsp;semaphore [--vim-mode] [--sounds] [--slash-commands]</Line>
          <Line>&nbsp;</Line>
          <Line><Dim>DESCRIPTION</Dim></Line>
          <Line>&nbsp;&nbsp;&nbsp;&nbsp;Real-time messaging app built on React and Go.</Line>
          <Line>&nbsp;&nbsp;&nbsp;&nbsp;Supports vim-style navigation, slash commands, and push notifications.</Line>
          <Line>&nbsp;</Line>
        </Intro>

        {SECTIONS.map((section) => (
          <Section key={section.id}>
            <SectionTitle>
              <Dim>──</Dim> {section.id.toUpperCase()} <Dim>{"─".repeat(Math.max(2, 48 - section.id.length))}</Dim>
            </SectionTitle>
            <SectionDesc>{section.desc}</SectionDesc>
            <Table>
              <tbody>
                {section.rows.map((row, i) => (
                  <tr key={i}>
                    <KeyCell>
                      {row.keys.map((k, j) => (
                        <Key key={j}>{k}</Key>
                      ))}
                    </KeyCell>
                    <DescCell>{row.desc}</DescCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>
        ))}

        <Footer>
          <Line>&nbsp;</Line>
          <Line><Dim>SEE ALSO</Dim></Line>
          <Line>&nbsp;&nbsp;&nbsp;&nbsp;vim(1), react(1), go(1)</Line>
          <Line>&nbsp;</Line>
          <Line><Dim>STACK</Dim></Line>
          <Line>&nbsp;&nbsp;&nbsp;&nbsp;React 18, Vite, Go backend, PostgreSQL, styled-components</Line>
          <Line>&nbsp;</Line>
          <Cursor>█</Cursor>
        </Footer>
      </Terminal>
    </Page>
  );
}

// ─── animations ─────────────────────────────────────────────────────────────

const blink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
`;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

// ─── styles ─────────────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  background-color: #070d07;
  display: flex;
  justify-content: center;
  padding: 40px 20px 80px;
  font-family: 'Share Tech Mono', 'Courier New', monospace;
`;

const Terminal = styled.div`
  width: 100%;
  max-width: 860px;
  animation: ${fadeIn} 0.4s ease;
`;

const TitleBar = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 0 20px;
  border-bottom: 1px solid #1a3a1a;
  margin-bottom: 24px;
`;

const BackBtn = styled.button`
  background: none;
  border: 1px solid #1a4a1a;
  color: #1a9a1a;
  font-family: inherit;
  font-size: 13px;
  padding: 4px 12px;
  cursor: pointer;
  border-radius: 2px;
  transition: color 0.15s, border-color 0.15s;

  &:hover {
    color: #00ff41;
    border-color: #00ff41;
  }
`;

const TitleText = styled.h1`
  flex: 1;
  margin: 0;
  font-size: 16px;
  color: #00ff41;
  text-shadow: 0 0 12px rgba(0, 255, 65, 0.5);
  letter-spacing: 2px;
`;

const Version = styled.span`
  font-size: 12px;
  color: #1a5a1a;
`;

const Intro = styled.div`
  margin-bottom: 32px;
`;

const Line = styled.div`
  color: #1a7a1a;
  font-size: 13px;
  line-height: 1.7;
`;

const Dim = styled.span`
  color: #1a5a1a;
`;

const Section = styled.div`
  margin-bottom: 36px;
`;

const SectionTitle = styled.div`
  font-size: 12px;
  color: #1a5a1a;
  letter-spacing: 1px;
  margin-bottom: 6px;
`;

const SectionDesc = styled.div`
  font-size: 13px;
  color: #1a6a1a;
  margin-bottom: 12px;
  padding-left: 4px;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const KeyCell = styled.td`
  width: 220px;
  padding: 4px 16px 4px 4px;
  vertical-align: top;
  white-space: nowrap;
`;

const Key = styled.span`
  display: inline-block;
  background: #0a1f0a;
  border: 1px solid #1a4a1a;
  color: #00ff41;
  font-size: 12px;
  padding: 1px 7px;
  border-radius: 3px;
  margin-right: 4px;
  text-shadow: 0 0 6px rgba(0, 255, 65, 0.4);
`;

const DescCell = styled.td`
  font-size: 13px;
  color: #2a8a2a;
  padding: 4px 0;
  line-height: 1.5;
`;

const Footer = styled.div`
  border-top: 1px solid #1a3a1a;
  padding-top: 16px;
`;

const Cursor = styled.span`
  color: #00ff41;
  font-size: 16px;
  animation: ${blink} 1s step-end infinite;
`;
