import { Avatar } from "@mui/material";
import styled from "styled-components";
import getRecipientEmail from "../utils/getRecipientEmail";
import { useAuth } from "../utils/AuthContext";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { apiGet } from "../utils/api";
import { useWSListener } from "../utils/WSContext";

function Chat({ id, users, unreadCount = 0 }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const recipientEmail = user ? getRecipientEmail(users, user) : null;
  const [recipient, setRecipient] = useState(null);

  useEffect(() => {
    if (!recipientEmail) return;
    apiGet(`/api/users?email=${encodeURIComponent(recipientEmail)}`)
      .then(setRecipient)
      .catch(() => {});
  }, [recipientEmail]);

  // live presence updates
  useWSListener("presence", (data) => {
    if (data.userEmail === recipientEmail) {
      setRecipient((r) => r ? { ...r, isOnline: data.isOnline, lastSeen: data.lastSeen } : r);
    }
  }, [recipientEmail]);

  const displayName = recipient?.displayName || recipientEmail?.split("@")[0];

  return (
    <Container onClick={() => navigate(`/chat/${id}`)}>
      <AvatarWrapper>
        <UserAvatar src={recipient?.photoURL}>{recipientEmail?.[0]?.toUpperCase()}</UserAvatar>
        {recipient?.isOnline && <OnlineDot />}
      </AvatarWrapper>

      <ChatInfo>
        <p>{displayName}</p>
        {unreadCount > 0 && <UnreadBadge>{unreadCount > 99 ? "99+" : unreadCount}</UnreadBadge>}
      </ChatInfo>
    </Container>
  );
}

export default Chat;

const Container = styled.div`
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 15px;
  word-break: break-word;
  color: #00ff41;
  border-bottom: 1px solid #0f2a0f;

  :hover {
    background-color: #0a1f0a;
  }
`;

const AvatarWrapper = styled.div`
  position: relative;
  margin: 5px;
  margin-right: 10px;
  flex-shrink: 0;
`;

const UserAvatar = styled(Avatar)``;

const ChatInfo = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  min-width: 0;

  > p {
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const UnreadBadge = styled.span`
  background-color: #00ff41;
  color: #070d07;
  border-radius: 10px;
  font-size: 0.7em;
  font-weight: 700;
  padding: 2px 7px;
  min-width: 20px;
  text-align: center;
  flex-shrink: 0;
  margin-left: 8px;
`;

const OnlineDot = styled.div`
  position: absolute;
  bottom: 1px;
  right: 1px;
  width: 10px;
  height: 10px;
  background-color: #00ff41;
  border-radius: 50%;
  border: 2px solid #0d150d;
`;
