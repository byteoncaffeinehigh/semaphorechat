import styled from "styled-components";
import Sidebar from "../components/Sidebar";
import ChatScreen from "../components/ChatScreen";
import { useNavigate, useParams } from "react-router-dom";
import getRecipientEmail from "../utils/getRecipientEmail";
import { useChats } from "../utils/ChatsContext";
import { useAuth } from "../utils/AuthContext";
import { useEffect } from "react";

function ChatPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const chats = useChats();
  const navigate = useNavigate();

  const chat = chats.find((c) => c.id === id);

  useEffect(() => {
    if (chat) {
      document.title = `Chat with ${getRecipientEmail(chat.users, user)}`;
    }
    return () => { document.title = "Semaphore"; };
  }, [chat, user]);

  if (!chat) {
    return (
      <Container>
        <SidebarWrapper>
          <Sidebar />
        </SidebarWrapper>
        <AccessDenied>
          <h2>Access Denied</h2>
          <p>You don&apos;t have access to this chat.</p>
          <BackLink onClick={() => navigate("/")}>← Go back</BackLink>
        </AccessDenied>
      </Container>
    );
  }

  return (
    <Container>
      <SidebarWrapper>
        <Sidebar />
      </SidebarWrapper>

      <ChatContainer>
        <ChatScreen chat={chat} />
      </ChatContainer>
    </Container>
  );
}

export default ChatPage;

const Container = styled.div`
  display: grid;
  grid-template-columns: 2.5fr 9.5fr;

  @media (max-width: 1240px) {
    display: grid;
    grid-template-columns: 12fr;
  }
`;

const SidebarWrapper = styled.div`
  @media (max-width: 1240px) {
    display: none;
  }
`;

const ChatContainer = styled.div``;

const AccessDenied = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background-color: #070d07;
  color: #00ff41;
  gap: 12px;

  > h2 {
    margin: 0;
    text-shadow: 0 0 10px rgba(255, 65, 65, 0.5);
    color: #ff4141;
  }

  > p {
    margin: 0;
    color: #1a7a1a;
  }
`;

const BackLink = styled.span`
  color: #1a7a1a;
  cursor: pointer;
  font-size: 0.9em;

  :hover {
    color: #00ff41;
  }
`;
