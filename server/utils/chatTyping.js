// Ephemeral typing presence. Message content is never sent or stored here.
module.exports = function registerChatTyping(socket, io, canChat) {
  const senderId = String(socket.user._id);
  let activeRecipient = null, pendingRecipient = null, revision = 0;
  let timer = null, retryTimer = null, lastStart = 0;
  const publish = (recipientId, typing) => io.to(recipientId).emit("typing:state", {
    senderId, typing, sessionId: socket.id
  });
  function clear() {
    revision++;
    pendingRecipient = null;
    clearTimeout(timer);
    clearTimeout(retryTimer);
    timer = null;
    retryTimer = null;
    if (activeRecipient) publish(activeRecipient, false);
    activeRecipient = null;
  }
  async function start(recipientId) {
    if (!socket.connected) return;
    // Trailing edge prevents a quick stop/start from being silently dropped.
    const delay = 750 - (Date.now() - lastStart);
    if (delay > 0) {
      if (activeRecipient && activeRecipient !== recipientId) clear();
      pendingRecipient = recipientId;
      const current = ++revision;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        if (current === revision) void start(recipientId);
      }, delay + 5);
      retryTimer.unref?.();
      return;
    }
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
      timer = setTimeout(clear, 6500);
      timer.unref?.();
    } catch {
      if (current === revision) clear();
    }
  }
  socket.on("typing:update", async (payload, acknowledge) => {
    const recipientId = payload?.recipientId;
    const typing = payload?.typing;
    if (typeof recipientId !== "string" || !/^[a-f0-9]{24}$/i.test(recipientId) ||
        recipientId === senderId || typeof typing !== "boolean") return;
    if (typeof acknowledge === "function") acknowledge({ok:true});
    if (!typing) {
      if (activeRecipient === recipientId || pendingRecipient === recipientId) clear();
      return;
    }
    await start(recipientId);
  });
  socket.on("disconnect", clear);
};
