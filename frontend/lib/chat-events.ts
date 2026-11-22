/** Sent on `window` to ask the open chat screen to start a fresh chat. The rail's + button and the
 *  history drawer use it, because the chat screen updates its address without a navigation. */
export const NEW_CHAT_EVENT = "edurag:new-chat";
