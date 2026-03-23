import styled from "styled-components";

export default function ScanlinesOverlay() {
  return <Overlay />;
}

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9997;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.045) 2px,
    rgba(0, 0, 0, 0.045) 4px
  );
`;
