import { createContext, useContext, Dispatch, SetStateAction } from "react";

export interface Chat {
  id: string;
  users: string[];
  unreadCounts?: Record<string, number>;
  lastRead?: Record<string, string>;
}

interface ChatsContextType {
  chats: Chat[];
  setChats: Dispatch<SetStateAction<Chat[]>>;
  signOut: () => void;
  matrixForced: boolean;
  toggleMatrix: () => void;
}

export const ChatsContext = createContext<ChatsContextType>({
  chats: [],
  setChats: () => {},
  signOut: () => {},
  matrixForced: false,
  toggleMatrix: () => {},
});

export const useChats        = (): Chat[]                           => useContext(ChatsContext).chats;
export const useSignOut      = (): (() => void)                     => useContext(ChatsContext).signOut;
export const useMatrixToggle = (): (() => void)                     => useContext(ChatsContext).toggleMatrix;
export const useMatrixForced = (): boolean                          => useContext(ChatsContext).matrixForced;
