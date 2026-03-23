import styled, { keyframes } from "styled-components";

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
`;

const Overlay = styled.div`
  display: grid;
  place-items: center;
  height: ${({ full }) => (full ? "100vh" : "100%")};
  background-color: #070d07;
`;

const Spinner = styled.div`
  width: ${({ size }) => size || 32}px;
  height: ${({ size }) => size || 32}px;
  border: 2px solid #1a3a1a;
  border-top-color: #00ff41;
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

const Logo = styled.img`
  display: block;
  margin: 0 auto 16px;
  animation: ${pulse} 2s ease-in-out infinite;
`;

function Loading({ full = true, size }) {
  return (
    <Overlay full={full}>
      {full ? (
        <Logo src="/icon.svg" height={120} alt="" />
      ) : (
        <Spinner size={size} />
      )}
    </Overlay>
  );
}

export default Loading;
