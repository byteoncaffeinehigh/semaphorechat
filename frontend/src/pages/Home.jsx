import styled from "styled-components";
import Sidebar from "../components/Sidebar";

export default function Home() {
  return (
    <Container>
      <Sidebar />
      <ChatContainer>
        <h1>Here will be your chat</h1>
      </ChatContainer>
    </Container>
  );
}

const Container = styled.div`
  display: grid;
  grid-template-columns: 2.5fr 9.5fr;

  @media (max-width: 1240px) {
    grid-template-columns: 0;
  }
`;

const ChatContainer = styled.div`
  display: grid;
  place-items: center;
  height: 100vh;
  background-color: #070d07;
  color: #1a5a1a;

  @media (max-width: 1240px) {
    display: none;
  }
`;
