// Ephemeral typing presence. Message content is never sent or stored here.
module.exports = function registerChatTyping(socket, io, canChat) {
  const senderId = String(socket.user._id);
  let activeRecipient = null, pendingRecipient = null, revision = 0;
  let timer = null, lastStart = 0;
  const publish = (recipientId, typing) => io.to(recipientId).emit("typing:state", {
    senderId, typing, sessionId: socket.id
  });
  function clear() {
    revision++;
    pendingRecipient = null;
    clearTimeout(timer);
    timer = null;
    if (activeRecipient) publish(activeRecipient, false);
    activeRecipient = null;
  }
  socket.on("typing:update", async payload => {
    const recipientId = payload?.recipientId;
    const typing = payload?.typing;
    if (typeof recipientId !== "string" || !/^[a-f0-9]{24}$/i.test(recipientId) ||
        recipientId === senderId || typeof typing !== "boolean") return;
    if (!typing) {
      if (activeRecipient === recipientId || pendingRecipient === recipientId) clear();
      return;
    }
    if (!socket.connected || Date.now() - lastStart < 750) return;
    lastStart = Date.now();
    if (activeRecipient && activeRecipient !== recipientId) clear();
    const current = ++revision;
    pendingRecipient = recipientId;
    try {
      const allowed = await canChat(senderId, recipientId);
      if (current !== revision || !socket.connected) return;
      pendingRecipient = null;
      if (!allowed) { clear(); return; }
      activeRecipient = recipientId;
      clearTimeout(timer);
      publish(recipientId, true);
      timer = setTimeout(clear, 5000);
      timer.unref?.();
    } catch {
      if (current === revision) clear();
    }
  });
  socket.on("disconnect", clear);
};
