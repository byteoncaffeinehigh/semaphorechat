import { createContext, useContext } from "react";

export const ChatsContext = createContext({
  chats: [],
  setChats: () => {},
  signOut: () => {},
  matrixForced: false,
  toggleMatrix: () => {},
});

export const useChats       = () => useContext(ChatsContext).chats;
export const useSignOut     = () => useContext(ChatsContext).signOut;
export const useMatrixToggle = () => useContext(ChatsContext).toggleMatrix;
export const useMatrixForced = () => useContext(ChatsContext).matrixForced;
