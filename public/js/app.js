const API = "/api";
const state = { token: localStorage.getItem("linkupToken"), user: JSON.parse(localStorage.getItem("linkupUser") || "null"), mode: "register", socket: null, users: [], activeConversation: null, call: null, voiceRecorder: null, voiceStream: null };
const $ = s => document.querySelector(s);


const $$ = s => [...document.querySelectorAll(s)];
// ========================================
// REALPEOPLEKONECT CONNECTION NOTIFICATIONS
// ========================================


// function setConnectionRequestBadge(count) {
//   const total = Math.max(0, Number(count) || 0);

//   // Find the Connections navigation item on the current page
//   const buttons = document.querySelectorAll(
//     '[data-page="connections"], [data-nav="connections"]'
//   );

//   buttons.forEach(button => {
//     let badge = button.querySelector(".notification-badge");

//     if (!badge) {
//       badge = document.createElement("span");
//       badge.className = "notification-badge hidden";
//       badge.setAttribute("aria-live", "polite");
//       button.appendChild(badge);
//     }

//     badge.textContent = total > 99 ? "99+" : total;

//     badge.classList.toggle("hidden", total === 0);

//     button.setAttribute(
//       "aria-label",
//       `Connections${total > 0 ? `, ${total} pending requests` : ""}`
//     );
//   });
// }


/* ==========================================
   REALPEOPLEKONECT GLOBAL CONNECTION BADGE
========================================== */

function setConnectionRequestBadge(count) {
  const total = Math.max(0, Number(count) || 0);

  const connectionButtons = document.querySelectorAll(
    '#mainNav [data-page="connections"]'
  );

  connectionButtons.forEach(button => {
    let badge = button.querySelector(".notification-badge");

    if (!badge) {
      badge = document.createElement("span");
      badge.className = "notification-badge";
      button.appendChild(badge);
    }

    badge.textContent = total > 99 ? "99+" : total;

    badge.classList.toggle("hidden", total === 0);

    button.setAttribute(
      "aria-label",
      total
        ? `Connections, ${total} pending requests`
        : "Connections"
    );
  });
}

async function loadConnectionRequestCount() {
  if (!state.token) {
    setConnectionRequestBadge(0);
    return;
  }

  try {
    const response = await api(
      "/users/connections/requests/count"
    );

    if (response.success) {
      setConnectionRequestBadge(response.count);
    }
  } catch (error) {
    console.error(
      "Connection notification failed:",
      error.message
    );
  }
}



// Fetch pending connection requests from MongoDB

// async function loadConnectionRequestCount() {
//   if (!state.token) {
//     setConnectionRequestBadge(0);
//     return;
//   }

//   try {
//     const data = await api("/users/connections/requests/count");

//     setConnectionRequestBadge(data.count || 0);

//   } catch (error) {
//     console.error(
//       "Connection notification error:",
//       error.message
//     );
//   }
// }


// Preserve the original authentication modal.
const AUTH_CARD_TEMPLATE =
    document.querySelector("#authModal .modal-card")?.innerHTML || "";
const authHeaders = () => state.token ? { Authorization: `Bearer ${state.token}` } : {};
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));


function toast(message) {
    let el = $("#toast");

    // Create the notification element if it does not exist.
    if (!el) {
        el = document.createElement("div");
        el.id = "toast";
        el.className = "toast";
        document.body.appendChild(el);
    }

    el.textContent = message;
    el.classList.add("show");

    clearTimeout(window.linkupToastTimer);

    window.linkupToastTimer = setTimeout(() => {
        el.classList.remove("show");
    }, 3200);
}



async function api(path, options={}) {
  const headers = { ...authHeaders(), ...(options.headers || {}) };
  if (!(options.body instanceof FormData) && options.body) headers["Content-Type"]="application/json";
  const response = await fetch(API+path,{...options,headers});
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.message || "Something went wrong.");
  return data;
}
// ============================================
// LINKUP: SHOW / HIDE PASSWORD FOR ALL FIELDS
// ============================================

function enhancePasswordFields(root = document) {
  root.querySelectorAll(
    'input[type="password"]:not([data-password-toggle-ready])'
  ).forEach(input => {

    input.setAttribute("data-password-toggle-ready", "true");

    // Create password wrapper
    const wrapper = document.createElement("span");
    wrapper.className = "password-input-wrap";

    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    // Create eye button
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "password-toggle";

    toggle.setAttribute("aria-label", "Show password");
    toggle.setAttribute("aria-pressed", "false");
    toggle.setAttribute("title", "Show password");

    // Eye icon
    toggle.innerHTML = `
      <svg viewBox="0 0 24 24"
           aria-hidden="true"
           focusable="false">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;

    wrapper.appendChild(toggle);
  });
}

// Handle eye button clicks
document.addEventListener("click", function(event) {

  const toggle = event.target.closest(".password-toggle");

  if (!toggle) return;

  const wrapper = toggle.parentElement;

  const input = wrapper.querySelector(
    'input[data-password-toggle-ready]'
  );

  if (!input) return;

  // Toggle password visibility
  const reveal = input.type === "password";

  input.type = reveal ? "text" : "password";

  // Update accessibility labels
  toggle.setAttribute(
    "aria-label",
    reveal ? "Hide password" : "Show password"
  );

  toggle.setAttribute(
    "title",
    reveal ? "Hide password" : "Show password"
  );

  toggle.setAttribute("aria-pressed", String(reveal));

  // Change eye icon
  toggle.innerHTML = reveal
    ? `
      <svg viewBox="0 0 24 24"
           aria-hidden="true"
           focusable="false">
        <path d="M3 3l18 18M10.6 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1.4 0 2.7-.3 3.8-.8"></path>
        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path>
      </svg>
    `
    : `
      <svg viewBox="0 0 24 24"
           aria-hidden="true"
           focusable="false">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;
});

// Apply to existing password fields
enhancePasswordFields();

// Automatically apply to dynamically created password fields
const passwordFieldObserver = new MutationObserver(() => {
  enhancePasswordFields();
});

passwordFieldObserver.observe(document.body, {
  childList: true,
  subtree: true
});


function openAuth(mode = "register") {

    const card = $("#authModal .modal-card");

    if (!card) {
        console.error("LINKUP authentication modal not found.");
        return;
    }

    // Restore the original login and registration form
    // if a recovery screen previously replaced it.
    if (!card.querySelector("#authForm") && AUTH_CARD_TEMPLATE) {
        card.innerHTML = AUTH_CARD_TEMPLATE;
    }

    state.mode = mode;

    $("#authModal").classList.remove("hidden");

    const reg = mode === "register";

    $("#resendVerification")?.classList.add("hidden");

    $("#authTitle").textContent =
        reg ? "Create your account." : "Welcome back.";

    $("#authSubtitle").textContent =
        reg
            ? "Your next chapter starts with a hello."
            : "Pick up where your connections left off.";

    $("#nameField").classList.toggle("hidden", !reg);
    $("#ageField").classList.toggle("hidden", !reg);

    $("#authForm").elements.name.required = reg;
    $("#authForm").elements.age.required = reg;

    $("#authSubmit").textContent =
        reg ? "Create account" : "Log in";

    $("#authSwitch").innerHTML = reg
        ? 'Already a member? <button type="button" id="switchMode">Log in</button>'
        : 'New to LINKUP? <button type="button" id="switchMode">Create an account</button><br><button type="button" id="forgotPasswordLink" class="forgot-password-link">Forgot password?</button>';

    $("#switchMode").onclick = () => {
        openAuth(reg ? "login" : "register");
    };
}
function showForgotPassword() {
    const card = document.querySelector("#authModal .modal-card");
    card.innerHTML = `
        <button class="modal-close"
                type="button"
                data-close
                aria-label="Close">×</button>

        <span class="eyebrow">ACCOUNT RECOVERY</span>

        <h2>Forgot your password?</h2>

        <p>
            Enter the email address connected to your LINKUP account.
            We will send you a password recovery link.
        </p>

        <form id="forgotPasswordForm">

            <label>
                Email address

                <input
                    type="email"
                    name="email"
                    placeholder="Enter your email"
                    autocomplete="email"
                    required
                >
            </label>

            <button
                type="submit"
                class="btn btn-primary btn-large full">
                Send Reset Link
            </button>

        </form>

        <p class="switch-auth">
            <button type="button" id="backToLogin">
                Back to Login
            </button>
        </p>
    `;
}
function showResetPassword(token) {
    const modal = document.querySelector("#authModal");
    const card = modal.querySelector(".modal-card");
    modal.classList.remove("hidden");
    card.innerHTML = `
        <button class="modal-close"
                type="button"
                data-close
                aria-label="Close">×</button>

        <span class="eyebrow">SECURE YOUR ACCOUNT</span>

        <h2>Choose a new password.</h2>

        <p>
            Your new password must contain at least 8 characters.
        </p>

        <form id="resetPasswordForm"
              data-token="${escapeHTML(token)}">

            <label>
                New password

                <input
                    type="password"
                    name="password"
                    minlength="8"
                    autocomplete="new-password"
                    required
                >
            </label>

            <label>
                Confirm new password

                <input
                    type="password"
                    name="confirmPassword"
                    minlength="8"
                    autocomplete="new-password"
                    required
                >
            </label>

            <button
                type="submit"
                class="btn btn-primary btn-large full">
                Reset Password
            </button>

        </form>
    `;

    // Add your existing show/hide password eye icons.
    if (typeof enhancePasswordFields === "function") {
        enhancePasswordFields(card);
    }
}


function closeAuth(){ $("#authModal").classList.add("hidden"); $("#authForm").reset(); }
function updateAuthUI(){
  const logged=!!state.token;
  $("#loginOpen").classList.toggle("hidden",logged); $("#registerOpen").classList.toggle("hidden",logged);
  $("#profileButton").classList.toggle("hidden",!logged);
  $("#logoutButton").classList.toggle("hidden",!logged);
  if(logged){
    $("#profileButton").textContent="My profile";
    const composerAvatar=$("#composerAvatar");
    if(composerAvatar){
      composerAvatar.src=state.user?.photo || "https://placehold.co/96x96/191919/ff8129?text=L";
      composerAvatar.alt=`${state.user?.name || "Your"} profile picture`;
    }
  }
  if(state.user?.role==="admin") {
    const nav=$("#mainNav"); if(!$("#adminNav")){const b=document.createElement("button");b.id="adminNav";b.className="nav-link";b.dataset.page="admin";b.textContent="Admin";nav.append(b);b.onclick=()=>showPage("admin");}
  } else $("#adminNav")?.remove();
}
const PAGE_FILES = {
  home: "/index.html",
  discover: "/discover.html",
  feed: "/community.html",
  messages: "/messages.html",
  connections: "/connections.html",
  profile: "/profile.html",
  admin: "/admin.html",
  premium: "/premium.html"
};
function showPage(name){
  if(["discover","feed","connections","messages","profile","admin"].includes(name)&&!state.token){
    toast("Please log in to access this page.");
    openAuth("login");
    return;
  }
  if(name==="admin"&&state.user?.role!=="admin"){
    toast("Administrator access required.");
    return;
  }
  const currentPage=document.body.dataset.currentPage||"home";
  if(PAGE_FILES[name] && name!==currentPage){
    window.location.href=PAGE_FILES[name];
    return;
  }
  $$(".page").forEach(p=>p.classList.remove("active"));
  $(`#page-${name}`)?.classList.add("active");
  $$(".nav-link").forEach(b=>b.classList.toggle("active",b.dataset.page===name));
  window.scrollTo({top:0,behavior:"smooth"});
  if(name==="discover")loadDiscover();
  if(name==="feed")loadFeed();
  if(name==="connections")loadRequests();
  if(name==="messages")loadMessages();
  if(name==="profile")loadProfile();
  if(name==="admin")loadAdmin();
  if(name==="premium")loadPremium();
}
function connectSocket(){
  if(!state.token)return;
  if(state.socket)state.socket.disconnect();
  state.socket=io({auth:{token:state.token}});
  state.socket.on("admin:activity",item=>{if($("#page-admin").classList.contains("active"))prependActivity(item);});
  state.socket.on("presence:update",item=>{const card=document.querySelector(`[data-user-id="${item.userId}"] .online-dot`);if(card)card.style.display=item.isOnline?"block":"none";});

  
// Receive new messages immediately.
state.socket.on("message:new", async message => {
  if (!message || !message._id) return;

  const activeId = state.activeConversation?.id;
  const currentPage = document.body.dataset.currentPage;

  const isActiveConversation =
    activeId &&
    currentPage === "messages" &&
    (
      String(message.sender) === String(activeId) ||
      String(message.recipient) === String(activeId)
    );

  if (isActiveConversation) {
    // Prevent duplicate messages.
    const alreadyDisplayed = document.querySelector(
      `.chat-message[data-message-id="${message._id}"]`
    );

    if (!alreadyDisplayed) {
      appendMessage(message);
    }

    // Mark incoming messages as read immediately.
    if (String(message.sender) !== String(state.user?._id)) {
      try {
        await api(`/messages/${encodeURIComponent(activeId)}`);
      } catch (error) {
        console.error("Could not update read status:", error);
      }
    }

    await loadConversations();

  } else {
    await loadConversations();
    toast("You received a new message.");
  }
});

// Update double ticks immediately when a message is read.
state.socket.on("message:read", data => {
  if (!data || !Array.isArray(data.messageIds)) return;

  const readAt = data.readAt
    ? new Date(data.readAt)
    : new Date();

  data.messageIds.forEach(id => {
    const row = document.querySelector(
      `.chat-message.mine[data-message-id="${id}"]`
    );

    if (!row) return;

    const ticks = row.querySelector(".message-read-ticks");

    if (!ticks) return;

    ticks.textContent = "✓✓";
    ticks.classList.add("is-read");
    ticks.title = `Read at ${readAt.toLocaleString()}`;
    ticks.setAttribute("aria-label", "Read");
  });
});

  state.socket.on("connection:new", async item => {
  toast(`${item.name} sent you a connection request.`);

  // Update navbar notification immediately
  await loadConnectionRequestCount();

  // Refresh requests if the user is viewing Connections
  if (document.body.dataset.currentPage === "connections") {
    loadRequests();
  }
});

  state.socket.on("connection:accepted",item=>{toast(`${item.name} accepted your connection request. You can now message each other.`);});
  if (typeof setupCallSocketEvents === "function") setupCallSocketEvents();
}



function personCard(user){
  const photo=user.photo||"https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=700&q=80";
  const action = user.isConnected
    ? `<button class="btn btn-primary full message-user-btn" data-id="${user._id}" data-name="${escapeHTML(user.name)}" data-photo="${escapeHTML(photo)}">Message</button>`
    : `<button class="btn btn-primary full connect-btn" data-id="${user._id}">＋ Connect</button>`;


  
const callActions = `<div class="profile-call-actions">
  <button type="button" class="call-action-btn"
    data-call-user="${user._id}"
    data-call-name="${escapeHTML(user.name)}"
    data-call-photo="${escapeHTML(photo)}"
    data-call-type="audio">
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none"
      stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2
      19.79 19.79 0 0 1-8.63-3.07
      19.5 19.5 0 0 1-6-6
      19.79 19.79 0 0 1-3.07-8.67
      A2 2 0 0 1 4.11 2h3
      a2 2 0 0 1 2 1.72
      c.12.96.36 1.9.72 2.79
      a2 2 0 0 1-.45 2.11L8.11 9.89
      a16 16 0 0 0 6 6l1.27-1.27
      a2 2 0 0 1 2.11-.45
      c.89.36 1.83.6 2.79.72
      A2 2 0 0 1 22 16.92z"/>
    </svg>
    <span>Audio call</span>
  </button>

  <button type="button" class="call-action-btn video-call-btn"
    data-call-user="${user._id}"
    data-call-name="${escapeHTML(user.name)}"
    data-call-photo="${escapeHTML(photo)}"
    data-call-type="video">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
      stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">
      <rect x="3" y="6" width="13" height="12" rx="2"/>
      <path d="m16 10 5-3v10l-5-3"/>
    </svg>
    <span>Video call</span>
  </button>
</div>`;
  return `<article class="person-card" data-user-id="${user._id}"><div class="person-photo profile-open" data-profile-id="${user._id}" role="button" tabindex="0"><img src="${escapeHTML(photo)}" alt="${escapeHTML(user.name)}"><i class="online-dot" style="display:${user.isOnline?"block":"none"}"></i></div><div class="person-info"><h3 class="profile-open" data-profile-id="${user._id}" role="button" tabindex="0">${escapeHTML(user.name)}${user.isPremium?' <span class="premium-badge" title="Premium member">♛</span>':""}${user.age?`, ${user.age}`:""}</h3><p>${escapeHTML(user.bio||"Ready to meet new people and make meaningful connections.")}</p>${(user.interests||[]).slice(0,3).map(x=>`<span class="tag">${escapeHTML(x)}</span>`).join("")}${action}${callActions}</div></article>`;
}
async function loadDiscover(query=""){
  try{const {users}=await api("/users/discover"+(query?"?q="+encodeURIComponent(query):""));state.users=users;$("#discoverGrid").innerHTML=users.map(personCard).join("")||"<p>No profiles to show yet. Check back soon.</p>";$("#homePeople").innerHTML=users.slice(0,3).map(personCard).join("");}
  catch(e){toast(e.message);}
}
async function loadFeed() {
  try {
    const { posts } = await api("/posts");

    $("#feedPosts").innerHTML =
      posts.map(postCard).join("") ||
      '<div class="card">No posts yet. Be the first to share a moment.</div>';
     setupFeedVideos();
    setupPostVideoControls();

  } catch (e) {
    toast(e.message);
  }
}
function postCard(p){
  const authorId = p.author?._id;
  const authorName = escapeHTML(p.author?.name || "LINKUP member");
  const authorLink = authorId
    ? `<a class="profile-name-link profile-open" href="#member-${encodeURIComponent(authorId)}" data-profile-id="${escapeHTML(authorId)}">${authorName}</a>`
    : `<span>${authorName}</span>`;
  const isOwner = !!state.user?._id && String(state.user._id) === String(authorId);
  const comments = (p.comments || []).slice(-5).map(c => {
    const commenterId = c.user?._id;
    const commenterName = escapeHTML(c.user?.name || "Member");
    const commenterPhoto = escapeHTML(c.user?.photo || "https://placehold.co/72x72/191919/ff8129?text=L");
    const commenterLink = commenterId
      ? `<a class="profile-name-link profile-open" href="#member-${encodeURIComponent(commenterId)}" data-profile-id="${escapeHTML(commenterId)}">${commenterName}</a>`
      : `<span>${commenterName}</span>`;
    return `<div class="comment-row"><img class="comment-avatar" src="${commenterPhoto}" alt="${commenterName} profile picture" loading="lazy" onerror="this.onerror=null;this.src='https://placehold.co/72x72/191919/ff8129?text=L'"><p><strong>${commenterLink}:</strong> ${escapeHTML(c.text)}</p></div>`;
  }).join("");
  return `<article class="feed-post card" data-post-id="${p._id}">
    <div class="post-head"><img class="avatar post-author-avatar" src="${escapeHTML(p.author?.photo || "https://placehold.co/96x96/191919/ff8129?text=L")}" alt="${authorName} profile picture" loading="lazy" onerror="this.onerror=null;this.src='https://placehold.co/96x96/191919/ff8129?text=L'"><div class="post-author-details"><strong>${authorLink}</strong><small>${new Date(p.createdAt).toLocaleString()}</small></div>
      ${isOwner ? `<div class="post-owner-actions"><button type="button" class="post-edit-toggle" data-id="${p._id}">Edit post</button><button type="button" class="post-delete-btn" data-id="${p._id}">Delete</button></div>` : ""}
    </div>



${p.mediaType === "video" ? `
  <div class="post-video-wrap">
    <video
      class="post-image community-post-video"
      data-video-src="${escapeHTML(p.mediaUrl || p.image)}"
      poster="${escapeHTML(p.mediaPoster || "")}"
      playsinline
      preload="none">
    </video>

    <button
      type="button"
      class="post-video-play"
      aria-label="Play video">
      <span>▶</span>
    </button>
  </div>
` : `
  <img
    class="post-image"
    src="${escapeHTML(p.mediaUrl || p.image)}"
    alt="Community post"
    loading="lazy">
`}<div class="post-caption">${escapeHTML(p.caption)}</div>
    ${isOwner ? `<form class="post-edit-form hidden" data-id="${p._id}"><label>Edit caption<textarea name="caption" maxlength="1000">${escapeHTML(p.caption||"")}</textarea></label><label class="edit-image-label">Replace photo or video (optional)<input type="file" name="image" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"></label><div class="post-edit-actions"><button type="button" class="btn btn-ghost post-edit-cancel">Cancel</button><button type="submit" class="btn btn-primary">Save changes</button></div></form>` : ""}
    <div class="post-actions"><button class="like-btn" data-id="${p._id}">♡ ${p.likes?.length||0} likes</button><span>💬 ${p.comments?.length||0} comments</span></div>
    <div class="comment-list">${comments}</div>
    <form class="comment-form" data-id="${p._id}"><input name="text" maxlength="500" placeholder="Write a kind comment..." required><button>Post</button></form>
  </article>`;
}
async function loadRequests(){
  try{
const [{requests},{connections}] = await Promise.all([
  api("/users/connections/requests"),
  api("/users/connections")
]);

// Keep navbar badge synchronized with pending requests
setConnectionRequestBadge(requests.length);
const requestHTML = requests.map(r=>`<div class="request-row"><div class="connection-person"><img src="${escapeHTML(r.from.photo||"https://placehold.co/80x80/191919/ff8129?text=L")}" alt=""><div><strong>${escapeHTML(r.from.name)}</strong><div class="muted">${escapeHTML(r.from.bio||"Would like to connect with you.")}</div></div></div><div><button class="btn btn-primary respond-btn" data-id="${r._id}" data-accept="true">Accept</button> <button class="btn btn-ghost respond-btn" data-id="${r._id}" data-accept="false">Decline</button></div></div>`).join("");
    $("#requestsList").innerHTML = requestHTML || "No pending connection requests.";
    $("#connectionsList").innerHTML = connections.length ? connections.map(user=>`<div class="connection-row"><div class="connection-person"><img src="${escapeHTML(user.photo||"https://placehold.co/80x80/191919/ff8129?text=L")}" alt=""><div><strong>${escapeHTML(user.name)}</strong><small>${user.isOnline?"Online":"Connected on LINKUP"}</small></div><i class="online-dot" style="display:${user.isOnline?"block":"none"}"></i></div><button class="btn btn-primary message-user-btn" data-id="${user._id}" data-name="${escapeHTML(user.name)}" data-photo="${escapeHTML(user.photo||"")}">Message</button></div>`).join("") : '<p class="muted">You have no connections yet. Visit Discover to meet people.</p>';
  } catch(e){toast(e.message);}
}

function messageTime(value){return value?new Date(value).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}):"";}
function renderConversationItem(item){
  const user=item.user; const last=item.lastMessage;
  return `<button type="button" class="conversation-item ${state.activeConversation?.id===String(user._id)?"active":""}" data-conversation-id="${user._id}" data-name="${escapeHTML(user.name)}" data-photo="${escapeHTML(user.photo||"")}"><img src="${escapeHTML(user.photo||"https://placehold.co/90x90/191919/ff8129?text=L")}" alt=""><span class="conversation-copy"><strong>${escapeHTML(user.name)}</strong><small>${escapeHTML
    (
   last?.mediaType === "image" ? "📷 Image" :
   last?.mediaType === "audio" ? "🎤 Voice message" :
   last?.mediaType === "video" ? "▣ Video" :
   (last?.text || "Start a conversation")
    
  
  )}</small></span><span class="conversation-meta">${last?messageTime(last.createdAt):""}${item.unreadCount?`<b>${item.unreadCount}</b>`:""}</span></button>`;
}
async function loadConversations(){
  const list=$("#conversationList"); if(!list)return;
  try{const {conversations}=await api("/messages/conversations");list.innerHTML=conversations.map(renderConversationItem).join("")||'<div class="conversation-empty">You have no connections to message yet. Accept a connection request or discover someone new.</div>';}
  catch(e){list.innerHTML=`<p class="muted">${escapeHTML(e.message)}</p>`;}
}



function appendMessage(message) {
  const container = $("#chatMessages");
  if (!container) return;

  const mine =
    String(message.sender) === String(state.user?._id);

  const row = document.createElement("div");
  row.className = `chat-message ${mine ? "mine" : "theirs"}`;

  if (message._id) {
    row.dataset.messageId = String(message._id);
  }

  // Image attachment
  if (message.mediaType === "image" && message.mediaUrl) {
    const imageButton = document.createElement("button");
    imageButton.type = "button";
    imageButton.className = "chat-image-open";
    imageButton.setAttribute("aria-label", "View shared image");

    const image = document.createElement("img");
    image.className = "chat-shared-image";
    image.src = message.mediaUrl;
    image.alt = "Image shared in conversation";
    image.loading = "lazy";

    imageButton.append(image);
    row.append(imageButton);
  }

  // Audio attachment
  else if (message.mediaType === "audio" && message.mediaUrl) {
    const player = document.createElement("audio");
    player.controls = true;
    player.preload = "metadata";
    player.src = message.mediaUrl;
    row.append(player);
  }

  // Video attachment
  else if (message.mediaType === "video" && message.mediaUrl) {
    const player = document.createElement("video");
    player.controls = true;
    player.preload = "metadata";
    player.playsInline = true;
    player.src = message.mediaUrl;
    player.className = "chat-shared-video";
    row.append(player);
  }

  // Text message
  if (message.text) {
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.textContent = message.text;
    row.append(bubble);
  }

  // Message time and read receipt
  const meta = document.createElement("small");
  meta.className = "chat-message-meta";

  const time = document.createElement("span");
  time.textContent = messageTime(message.createdAt);
  meta.append(time);

  if (mine) {
    const ticks = document.createElement("span");
    ticks.className = "message-read-ticks";
    ticks.textContent = message.readAt ? "✓✓" : "✓";

    if (message.readAt) {
      ticks.classList.add("is-read");
      ticks.title =
        `Read at ${new Date(message.readAt).toLocaleString()}`;
    } else {
      ticks.title = "Sent";
    }
    meta.append(ticks);
  }
  row.append(meta);
  container.append(row);
  container.scrollTop = container.scrollHeight;
}


async function openConversation(userId,name,photo){
  state.activeConversation={id:String(userId),name:name||"LINKUP member",photo:photo||""};
  $("#chatEmpty")?.classList.add("hidden");$("#activeChat")?.classList.remove("hidden");
  $("#chatUserName").textContent=state.activeConversation.name;
  $("#chatUserPhoto").src=state.activeConversation.photo||"https://placehold.co/90x90/191919/ff8129?text=L";
  $("#chatUserStatus").textContent="Connected on LINKUP";
  $("#chatMessages").innerHTML='<div class="chat-loading">Loading conversation…</div>';
  await loadConversations();
  try{const {messages,user}=await api(`/messages/${encodeURIComponent(userId)}`);if(user){$("#chatUserName").textContent=user.name;$("#chatUserStatus").textContent=user.isOnline?"Online":"Offline";}
    $("#chatMessages").innerHTML="";messages.forEach(appendMessage);if(!messages.length)$("#chatMessages").innerHTML='<div class="chat-first-message">Say hello and start the conversation.</div>';await loadConversations();$("#chatInput").focus();
  }catch(e){toast(e.message);$("#chatMessages").innerHTML=`<div class="chat-first-message">${escapeHTML(e.message)}</div>`;}
}

async function loadMessages(){
  await loadConversations();
  const requestedUser=new URLSearchParams(location.search).get("user");
  if(requestedUser){
    try{const {user}=await api(`/users/${encodeURIComponent(requestedUser)}`);await openConversation(user._id,user.name,user.photo);}
    catch(e){toast("Open a conversation from your accepted connections.");}
  }
}
async function loadProfile(){try{const {user}=await api("/auth/me");state.user=user;localStorage.setItem("linkupUser",JSON.stringify(user));const f=$("#profileForm");["name","age","gender","lookingFor","bio"].forEach(k=>f.elements[k].value=user[k]||"");f.elements.interests.value=(user.interests||[]).join(", ");$("#myProfilePhoto").src=user.photo||"https://placehold.co/240x240/191919/ff8129?text=LINKUP";$("#profileDisplayName").innerHTML=escapeHTML(user.name||"Your name")+(user.subscription?.plan==="premium"&&user.subscription?.status==="active"?' <span class="premium-badge">♛ PREMIUM</span>':"");$("#profileDisplayBio").textContent=user.bio||"Add a profile photo and tell people a little about yourself.";await loadGallery(user._id,true);}catch(e){toast(e.message);}}
async function loadGallery(userId,own=false){try{const {photos}=await api(`/users/${userId}/gallery`);if(own){$("#galleryCount").textContent=`${photos.length} photo${photos.length===1?"":"s"}`;$("#myGallery").innerHTML=photos.map(p=>galleryTile(p,true)).join("")||'<p class="muted">Your gallery is empty. Upload your first photos above.</p>';}return photos;}catch(e){if(own)toast(e.message);return [];}}




function galleryTile(photo, own = false) {
    const likes = photo.likes?.length || 0;const comments = (photo.comments || []).slice(-3)
        .map(c => `
            <p>
                <strong>${escapeHTML(c.user?.name || "Member")}:</strong>
                ${escapeHTML(c.text)}
            </p>
        `).join("");

    const ownerId = photo.owner?._id || photo.owner;

    return `
        <article class="gallery-tile">

            <img
                src="${escapeHTML(photo.image)}"
                alt="Profile gallery photo"
                class="gallery-image"
                loading="lazy"
                role="button"
                tabindex="0"
                aria-label="Open gallery photo"
            >

            <div class="gallery-tile-body">
                <p>${escapeHTML(photo.caption || "")}</p>

                <div class="gallery-tile-actions">
                    <button class="gallery-like-btn"
                        data-id="${photo._id}">
                        ♡ ${likes} likes
                    </button>

                    <button class="share-btn"
                        data-share-url="${location.origin}/share/profile/${ownerId}">
                        ↗ Share
                    </button>

                    ${own ? `
                        <button class="gallery-delete"
                            data-id="${photo._id}">
                            Delete
                        </button>
                    ` : ""}
                </div>
            </div>

            ${own ? "" : `
                <div class="gallery-comments">
                    ${comments}

                    <form class="gallery-comment-form"
                        data-id="${photo._id}">
                        <input name="text"
                            maxlength="500"
                            placeholder="Add a comment..."
                            required>
                        <button>Send</button>
                    </form>
                </div>
            `}

        </article>
    `;
}
async function openPublicProfile(userId){try{const [{user},{photos}]=await Promise.all([api(`/users/${userId}`),api(`/users/${userId}/gallery`)]);const image=user.photo||"https://placehold.co/240x240/191919/ff8129?text=LINKUP";$("#publicProfileContent").innerHTML=`<div class="public-profile-hero"><img src="${escapeHTML(image)}" alt="${escapeHTML(user.name)} profile photo"><div><span class="eyebrow">LINKUP MEMBER ${user.isOnline?"· ONLINE":""}</span><h2>${escapeHTML(user.name)}${user.isPremium?' <span class="premium-badge" title="Premium member">♛</span>':""}${user.age?`, ${user.age}`:""}</h2><p>${escapeHTML(user.bio||"Getting to know new people on LINKUP.")}</p><button class="btn btn-primary connect-btn" data-id="${user._id}">＋ Connect</button> <button class="btn btn-outline profile-like-btn" data-id="${user._id}">♡ Like profile</button></div></div><div class="public-gallery-heading"><div><span class="eyebrow">LIFE IN PICTURES</span><h2>Photo gallery</h2></div><span class="gallery-count">${photos.length} photos</span></div><div class="public-gallery-grid">${photos.map(p=>galleryTile(p,false)).join("")||'<p class="muted">This member has not added photos yet.</p>'}</div>`;showPage("public-profile");}catch(e){toast(e.message);}}

function prependActivity(item){
  const el=$("#activityList");if(!el)return;const row=document.createElement("div");row.className="activity-item";row.innerHTML=`<span>${escapeHTML(item.detail||item.type)}</span><small>${new Date(item.createdAt||Date.now()).toLocaleTimeString()}</small>`;el.prepend(row);while(el.children.length>40)el.lastChild.remove();
}
async function loadAdmin(){
  if(state.user?.role!=="admin"){toast("Administrator access required.");return;}
  try{
    const data=await api("/admin/overview");
    $("#statUsers").textContent=data.totalUsers;$("#statOnline").textContent=data.onlineUsers;$("#statOffline").textContent=data.offlineUsers;$("#statNew").textContent=data.newToday;$("#statPosts").textContent=data.totalPosts;
    $("#activityList").innerHTML=data.recentActivity.map(a=>`<div class="activity-item"><span><strong>${escapeHTML(a.user?.name||"System")}</strong> · ${escapeHTML(a.detail||a.type)}</span><small>${new Date(a.createdAt).toLocaleString()}</small></div>`).join("")||"No activity yet.";
    const {users}=await api("/admin/users");$("#adminUsers").innerHTML=users.map(u=>`<div class="admin-user-row"><span><strong>${escapeHTML(u.name)}</strong><br><small>${escapeHTML(u.email)} · ${u.isOnline?"Online":"Offline"}</small></span><button class="btn btn-ghost status-btn" data-id="${u._id}" data-status="${u.status==="active"?"suspended":"active"}">${u.status==="active"?"Suspend":"Reactivate"}</button></div>`).join("");
    const premium=await api("/admin/premium");
    if($("#premiumAdminActive")){$("#premiumAdminActive").textContent=premium.activeMembers;$("#premiumAdminExpired").textContent=premium.expiredMembers;$("#premiumAdminPayments").textContent=premium.payments;$("#premiumAdminRevenue").textContent="₦"+Number(premium.revenue).toLocaleString("en-NG");$("#premiumAdminMembers").innerHTML=premium.members.map(m=>`<div class="admin-user-row"><span><strong>${escapeHTML(m.name)}</strong><br><small>${escapeHTML(m.email)} · ${escapeHTML(m.subscription?.interval||"premium")} · ${m.subscription?.expiryDate?new Date(m.subscription.expiryDate).toLocaleDateString():"No expiry recorded"}</small></span><span class="premium-badge">${escapeHTML(m.subscription?.status||"inactive")}</span></div>`).join("")||"<p class='muted'>No Premium members yet.</p>";}
  }catch(e){toast(e.message);}
}
$("#authForm").addEventListener("submit",async e=>{
  e.preventDefault();const f=e.currentTarget;const body={email:f.elements.email.value,password:f.elements.password.value};
  if(state.mode==="register"){body.name=f.elements.name.value;body.age=Number(f.elements.age.value);}
  try{
    const submittedMode=state.mode;
    const data=await api(`/auth/${submittedMode}`,{method:"POST",body:JSON.stringify(body)});
    if(submittedMode==="register"){
      window.linkupPendingVerificationEmail=data.email || body.email;
      $("#authTitle").textContent="Check your email";
      $("#authSubtitle").textContent="We sent a confirmation link to "+window.linkupPendingVerificationEmail+". Open the email and confirm your address before logging in.";
      $("#authForm").reset();
      $("#resendVerification")?.classList.remove("hidden");
      toast("Confirmation email sent. Please check your inbox.");
      return;
    }
    state.token=data.token;state.user=data.user;localStorage.setItem("linkupToken",state.token);localStorage.setItem("linkupUser",JSON.stringify(state.user));closeAuth();updateAuthUI();

    connectSocket();toast("Welcome back!");showPage("discover");
  } catch(err){toast(err.message);}

});

$("#resendVerification")?.addEventListener("click",async()=>{
  const email=window.linkupPendingVerificationEmail || $("#authForm").elements.email.value;
  if(!email){toast("Enter the email address you used to register.");return;}
  try{const result=await api("/auth/resend-verification",{method:"POST",body:JSON.stringify({email})});toast(result.message);}
  catch(err){toast(err.message);}
});

$("#postForm").addEventListener("submit",async e=>{
  e.preventDefault();if(!state.token){openAuth("login");return;}
  const file=$("#postImage").files[0];if(!file){toast("Please choose a photo or video for your post.");return;}
  const form=new FormData();form.append("image",file);form.append("caption",$("#postCaption").value);
  try{await api("/posts",{method:"POST",body:form});$("#postForm").reset();$("#fileName").textContent="Photos or videos · max 100MB";toast("Your moment has been shared.");loadFeed();}
  catch(err){toast(err.message);}
});
$("#profileForm").addEventListener("submit",async e=>{
  e.preventDefault();const f=e.currentTarget;const body={};["name","age","gender","lookingFor","bio"].forEach(k=>body[k]=f.elements[k].value);body.age=Number(body.age)||undefined;body.interests=f.elements.interests.value.split(",").map(s=>s.trim()).filter(Boolean);
  try{const {user}=await api("/users/profile/me",{method:"PATCH",body:JSON.stringify(body)});state.user=user;localStorage.setItem("linkupUser",JSON.stringify(user));updateAuthUI();$("#profileDisplayName").textContent=user.name;$("#profileDisplayBio").textContent=user.bio||"Add a profile photo and tell people a little about yourself.";toast("Profile updated.");}catch(err){toast(err.message);}
});
$("#profilePhotoInput").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;const form=new FormData();form.append("photo",file);try{
  const d=await api("/users/profile/photo",{method:"POST",body:form});
  state.user=d.user;
  localStorage.setItem("linkupUser",JSON.stringify(state.user));
  $("#myProfilePhoto").src=d.photo;
  updateAuthUI(); loadConnectionRequestCount();
  // Reload the community feed so this user's posts and comments use the saved photo.
  if($("#page-feed")?.classList.contains("active")) await loadFeed();
  toast("Profile photo updated. Your picture is now shown across LINKUP.");
}catch(err){toast(err.message);}finally{e.target.value="";}});
$("#galleryFiles").addEventListener("change",e=>{$("#gallerySelection").textContent=e.target.files.length?`${e.target.files.length} photo(s) selected`:"No photos selected";});
$("#galleryUploadForm").addEventListener("submit", async e => {
    e.preventDefault();

    const files = [...$("#galleryFiles").files];

    if (!files.length) {
        toast("Choose one or more photos first.");
        return;
    }

    if (files.length > 10) {
        toast("Upload a maximum of 10 photos at a time.");
        return;
    }

    const form = new FormData();
    files.forEach(file => form.append("photos", file));

    const progressBox = $("#galleryUploadProgress");
    const progressBar = $("#galleryProgressBar");
    const progressPercent = $("#galleryUploadPercent");
    const progressStatus = $("#galleryUploadStatus");
    const progressMessage = $("#galleryUploadMessage");
    const uploadButton = $("#galleryUploadForm").querySelector(
        'button[type="submit"]'
    );

    const originalButtonText = uploadButton.textContent;

    // Show upload indicator
    progressBox.classList.remove("hidden");
    progressBar.style.width = "0%";
    progressPercent.textContent = "0%";
    progressStatus.textContent = "Uploading photos...";
    progressMessage.textContent = `Preparing ${files.length} photo(s) for upload.`;

    uploadButton.disabled = true;
    uploadButton.textContent = "Uploading...";
    uploadButton.style.opacity = "0.6";
    uploadButton.style.cursor = "not-allowed";

    try {
        const xhr = new XMLHttpRequest();

        const headers = authHeaders();

        // Upload progress
        xhr.upload.addEventListener("progress", event => {
            if (event.lengthComputable) {
                const percent = Math.round(
                    (event.loaded / event.total) * 100
                );

                progressBar.style.width = `${percent}%`;
                progressPercent.textContent = `${percent}%`;

                progressMessage.textContent =
                    `Uploading ${files.length} photo(s)...`;
            }
        });

        const uploadPromise = new Promise((resolve, reject) => {
            xhr.addEventListener("load", () => {
                let data = {};

                try {
                    data = JSON.parse(xhr.responseText || "{}");
                } catch (error) {
                    return reject(new Error("Invalid server response."));
                }

                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(data);
                } else {
                    reject(new Error(
                        data.message || "Gallery upload failed."
                    ));
                }
            });

            xhr.addEventListener("error", () => {
                reject(new Error("Network error. Could not upload photos."));
            });

            xhr.addEventListener("abort", () => {
                reject(new Error("Photo upload was cancelled."));
            });

            xhr.addEventListener("timeout", () => {
                reject(new Error("Upload timed out. Please try again."));
            });

            xhr.open("POST", API + "/users/profile/gallery");

            Object.entries(headers).forEach(([key, value]) => {
                xhr.setRequestHeader(key, value);
            });

            xhr.timeout = 180000;

            xhr.send(form);
        });

        await uploadPromise;

        // Upload completed
        progressBar.style.width = "100%";
        progressPercent.textContent = "100%";
        progressStatus.textContent = "Upload complete!";
        progressMessage.textContent =
            "Your photos have been uploaded successfully.";

        toast("Photos added to your profile gallery.");

        $("#galleryUploadForm").reset();
        $("#gallerySelection").textContent = "No photos selected";

        await loadGallery(state.user._id, true);

        // Hide indicator after successful gallery refresh
        setTimeout(() => {
            progressBox.classList.add("hidden");
        }, 2500);

    } catch (err) {
        progressStatus.textContent = "Upload failed";
        progressMessage.textContent = err.message;
        progressBar.style.background = "#dc3545";

        toast(err.message);

    } finally {
        uploadButton.disabled = false;
        uploadButton.textContent = originalButtonText;
        uploadButton.style.opacity = "";
        uploadButton.style.cursor = "";

        // Restore progress bar color
        setTimeout(() => {
            progressBar.style.background =
                "linear-gradient(90deg, #ff8129, #ffad63)";
        }, 3000);
    }
});

document.addEventListener("click",async e=>{
  const page=e.target.closest("[data-page]");if(page){e.preventDefault();showPage(page.dataset.page);}
  if(e.target.matches("[data-close]"))closeAuth();
  if(e.target.closest("#loginOpen"))openAuth("login");
 if (e.target.closest("#forgotPasswordLink")) {
    showForgotPassword();
    return;
}

if (e.target.closest("#backToLogin")) {
    openAuth("login");
    return;
}
  if(e.target.closest("#registerOpen,#heroJoin"))openAuth("register");
  const profileLike = e.target.closest(".profile-like-btn");
  if (profileLike) {
    if (!state.token) { openAuth("login"); return; }
    try { const result = await api(`/premium/profile-like/${profileLike.dataset.id}`, { method: "POST", body: "{}" }); profileLike.textContent = result.liked ? "♥ Liked" : "♡ Like profile"; }
    catch (err) { toast(err.message); }
  }
  if(e.target.closest("#profileButton"))showPage("profile");
  const profileLink=e.target.closest("a.profile-open");if(profileLink){e.preventDefault();openPublicProfile(profileLink.dataset.profileId);}
  const editToggle=e.target.closest(".post-edit-toggle");
  if(editToggle){const card=editToggle.closest(".feed-post");const form=card?.querySelector(".post-edit-form");if(form){form.classList.toggle("hidden");editToggle.textContent=form.classList.contains("hidden")?"Edit post":"Close editor";}}
  const editCancel=e.target.closest(".post-edit-cancel");
  if(editCancel){const form=editCancel.closest(".post-edit-form");form?.classList.add("hidden");const toggle=form?.closest(".feed-post")?.querySelector(".post-edit-toggle");if(toggle)toggle.textContent="Edit post";}
  const deletePost=e.target.closest(".post-delete-btn");
  if(deletePost&&confirm("Are you sure you want to permanently delete this post?")){try{await api(`/posts/${deletePost.dataset.id}`,{method:"DELETE"});toast("Your post has been deleted.");await loadFeed();}catch(err){toast(err.message);}}
  const galleryLike=e.target.closest(".gallery-like-btn");if(galleryLike){try{const d=await api(`/users/gallery/${galleryLike.dataset.id}/like`,{method:"POST"});galleryLike.textContent=`${d.liked?"♥":"♡"} ${d.likes} likes`;}catch(err){toast(err.message);}}
  const galleryDelete=e.target.closest(".gallery-delete");if(galleryDelete&&confirm("Remove this photo from your profile gallery?")){try{await api(`/users/gallery/${galleryDelete.dataset.id}`,{method:"DELETE"});await loadGallery(state.user._id,true);toast("Photo deleted.");}catch(err){toast(err.message);}}
  const share=e.target.closest(".share-btn");if(share){const url=share.dataset.shareUrl;try{if(navigator.share)await navigator.share({title:"LINKUP profile",text:"Take a look at this LINKUP profile",url});else{await navigator.clipboard.writeText(url);toast("Profile link copied. You can paste it on your social platforms.");}}catch(err){if(err.name!=="AbortError")toast("Could not share this link.");}}
  if(e.target.closest("#logoutButton")) {
    try { await api("/auth/logout",{method:"POST"}); } catch (_) {}
    if(state.socket) state.socket.disconnect();
    state.socket=null; state.token=null; state.user=null;setConnectionRequestBadge(0);
    localStorage.removeItem("linkupToken"); localStorage.removeItem("linkupUser");
    updateAuthUI(); window.location.href="/index.html"; toast("You have been logged out safely.");
  }
  const connect=e.target.closest(".connect-btn");if(connect){try{await api(`/users/${connect.dataset.id}/connect`,{method:"POST"});connect.textContent="Request sent";connect.disabled=true;toast("Connection request sent.");}catch(err){toast(err.message);}}
  const messageUser=e.target.closest(".message-user-btn");if(messageUser){window.location.href=`/messages.html?user=${encodeURIComponent(messageUser.dataset.id)}`;return;}
  const conversation=e.target.closest(".conversation-item");if(conversation){await openConversation(conversation.dataset.conversationId,conversation.dataset.name,conversation.dataset.photo);return;}
  const like=e.target.closest(".like-btn");if(like){try{const d=await api(`/posts/${like.dataset.id}/like`,{method:"POST"});like.textContent=`${d.liked?"♥":"♡"} ${d.likes} likes`;}catch(err){toast(err.message);}}


const respond = e.target.closest(".respond-btn");if (respond) {try {
    await api(
      `/users/connections/${respond.dataset.id}/respond`,
      {
        method: "POST",
        body: JSON.stringify({
          accept: respond.dataset.accept === "true"
        })
      }
    );

    toast(
      respond.dataset.accept === "true"
        ? "Connection request accepted."
        : "Connection request declined."
    );

    // Refresh notification count immediately
    await loadConnectionRequestCount();

    // Refresh the connection requests list
    await loadRequests();

  } catch (err) {
    toast(err.message);
  }
}const status=e.target.closest(".status-btn");if(status){try{await api(`/admin/users/${status.dataset.id}/status`,{method:"PATCH",body:JSON.stringify({status:status.dataset.status})});toast("Member status updated.");loadAdmin();}catch(err){toast(err.message);}}
});
document.addEventListener("submit",async e=>{
  if(e.target.matches("#advancedSearchForm")){e.preventDefault();const q=e.target.elements.q.value.trim();try{await loadDiscover(q);}catch(err){toast(err.message);}}
  if(e.target.matches("#chatForm")){
    e.preventDefault();
    if(!state.activeConversation)return;
    const input=$("#chatInput");const text=input.value.trim();if(!text)return;
    const sendButton=e.target.querySelector("button[type=submit]");sendButton.disabled=true;
    try{const {message}=await api("/messages",{method:"POST",body:JSON.stringify({recipientId:state.activeConversation.id,text})});appendMessage(message);input.value="";await loadConversations();}
    catch(err){toast(err.message);}
    finally{sendButton.disabled=false;input.focus();}
  }
  if(e.target.matches(".post-edit-form")){
    e.preventDefault();
    const form=e.target;const payload=new FormData();
    payload.append("caption",form.elements.caption.value);
    const image=form.elements.image.files[0];if(image)payload.append("image",image);
    const saveButton=form.querySelector('button[type="submit"]');saveButton.disabled=true;saveButton.textContent="Saving...";
    try{await api(`/posts/${form.dataset.id}`,{method:"PATCH",body:payload});toast("Your post has been updated.");await loadFeed();}
    catch(err){toast(err.message);saveButton.disabled=false;saveButton.textContent="Save changes";}
  }
// ========================================
// HANDLE FORGOT PASSWORD FORM
// ========================================


if (e.target.matches("#forgotPasswordForm")) {
    e.preventDefault();

    const form = e.target;
    const button = form.querySelector('button[type="submit"]');

    if (!button) {
        console.error("Forgot password submit button not found.");
        return;
    }

    const originalText = button.textContent;

    button.disabled = true;
    button.textContent = "Sending reset link...";

    try {
        const response = await api("/auth/forgot-password", {
            method: "POST",
            body: JSON.stringify({
                email: form.elements.email.value.trim()
            })
        });

        toast(response.message || "Check your email for a password reset link.");

        button.textContent = "Reset link sent";

    } catch (error) {
        console.error("Forgot password error:", error);

        toast(error.message || "Could not send password reset email.");

        button.disabled = false;
        button.textContent = originalText;
    }
}



// ========================================
// HANDLE RESET PASSWORD FORM
// ========================================

if (e.target.matches("#resetPasswordForm")) {
    e.preventDefault();

    const form = e.target;

    const password = form.elements.password.value;
    const confirmPassword = form.elements.confirmPassword.value;

    if (password !== confirmPassword) {
        toast("Your passwords do not match.");
        return;
    }

    const button = form.querySelector('button[type="submit"]');

    button.disabled = true;
    button.textContent = "Resetting...";

    try {
        const result = await api("/auth/reset-password", {
            method: "POST",
            body: JSON.stringify({
                token: form.dataset.token,
                password: password
            })
        });

        // Remove reset token from the browser URL.
        const url = new URL(window.location.href);

        url.searchParams.delete("resetPassword");

        history.replaceState(
            {},
            "",
            url.pathname + url.search + url.hash
        );

        openAuth("login");

        toast(result.message);

    } catch (error) {
        toast(error.message);

        button.disabled = false;
        button.textContent = "Reset Password";
    }
}

  if(e.target.matches(".gallery-comment-form")){e.preventDefault();const input=e.target.elements.text;try{await api(`/users/gallery/${e.target.dataset.id}/comments`,{method:"POST",body:JSON.stringify({text:input.value})});const id=$("#publicProfileContent .connect-btn")?.dataset.id;if(id)await openPublicProfile(id);}catch(err){toast(err.message);}}
  if(e.target.matches(".comment-form")){e.preventDefault();const input=e.target.elements.text;try{await api(`/posts/${e.target.dataset.id}/comments`,{method:"POST",body:JSON.stringify({text:input.value})});loadFeed();}catch(err){toast(err.message);}}
});
$("#postImage").addEventListener("change",e=>$("#fileName").textContent=e.target.files[0]?.name||"Photos or videos · max 100MB");
$("#switchMode")?.addEventListener("click",()=>openAuth("login"));
$("#year").textContent=new Date().getFullYear();



updateAuthUI();

const initialPage =
  document.body.dataset.currentPage || "home";

showPage(initialPage);

// Fetch connection count independently of the current page
if (state.token) {
  loadConnectionRequestCount();
}

// Keep notification count updated across all pages
if (!window.connectionNotificationTimer) {
  window.connectionNotificationTimer = setInterval(() => {
    if (state.token) {
      loadConnectionRequestCount();
    }
  }, 15000);
}
// updateAuthUI();
// // Load connection notification on every page
// if (state.token) {
//   loadConnectionRequestCount();
// }const initialPage = document.body.dataset.currentPage || "home";
// showPage(initialPage);




if(state.token){connectSocket();api("/auth/me").then(d=>{state.user=d.user;localStorage.setItem("linkupUser",JSON.stringify(state.user));updateAuthUI();}).catch(()=>{state.token=null;state.user=null;localStorage.removeItem("linkupToken");localStorage.removeItem("linkupUser");updateAuthUI();if(["discover","feed","connections","messages","profile","admin"].includes(initialPage))window.location.href="/index.html";});}

// Refresh connection notifications every 20 seconds
if (!window.connectionNotificationTimer) {
  window.connectionNotificationTimer = setInterval(() => {
    if (state.token) {
      loadConnectionRequestCount();
    }
  }, 20000);
}

// LINKUP Premium membership
const PREMIUM_FEATURES = [
  "See who viewed your profile", "See who liked your profile",
  "Advanced user search and filters", "Unlimited connection requests",
  "Gold Premium membership badge", "Priority visibility in discovery",
  "Ad-free browsing"
];
async function loadPremium() {
  const area = document.querySelector("#premiumContent");
  if (!area) return;
  try {
    const [plans, sub] = await Promise.all([
      api("/premium/plans"),
      state.token ? api("/premium/me") : Promise.resolve({ isPremium: false, subscription: null })
    ]);
    const active = !!sub.isPremium;
    const monthly = plans.plans.find(p => p.id === "monthly");
    const yearly = plans.plans.find(p => p.id === "yearly");
    area.innerHTML = `
      <section class="premium-hero">
        <span class="premium-kicker">♛ THE REALPEOPLEKONECT EXPERIENCE</span>
        <h1>REALPEOPLEKONECT <em>Premium</em></h1>
        <p>More visibility. Deeper insights. More meaningful connections.</p>
      </section>
      ${active ? `<div class="premium-status"><strong>♛ Your Premium membership is active</strong><span>Renews/ends: ${sub.subscription.expiryDate ? new Date(sub.subscription.expiryDate).toLocaleDateString() : "Managed by Flutterwave"}</span><button id="cancelPremium" class="btn btn-outline" ${sub.subscription.cancelAtPeriodEnd?"disabled":""}>${sub.subscription.cancelAtPeriodEnd?"Auto-renewal cancelled":"Cancel automatic renewal"}</button></div>` : ""}
      <div class="premium-pricing">
        <article class="premium-plan free-plan"><span class="plan-symbol">○</span><h2>Free Membership</h2><p>Enjoy the essentials and get started.</p><div class="plan-price">₦0 <small>/ forever</small></div><div class="current-plan">${state.token && !active ? "Your current plan" : "Available to everyone"}</div><ul>${["Create your account and profile","Browse community posts","Like and comment on posts","Connect with other users","Send and receive messages","Upload profile and gallery photos"].map(x=>`<li>✓ ${x}</li>`).join("")}</ul></article>
        <article class="premium-plan gold-plan"><span class="popular-label">BEST EXPERIENCE</span><span class="plan-symbol">♛</span><h2>Premium Membership</h2><p>Unlock the complete REALPEOPLEKONECT experience.</p><div class="billing-choice"><button class="billing-option selected" data-plan="monthly">Monthly</button><button class="billing-option" data-plan="yearly">Yearly <small>Save 20%</small></button></div><div class="plan-price" id="premiumPrice">₦${monthly.amount.toLocaleString("en-NG")} <small>/ month</small></div><p class="billing-note" id="premiumBillingNote">Billed monthly. Automatic renewal; cancel anytime.</p><button class="btn premium-cta" id="subscribePremium" ${active?"disabled":""}>${active?"You are a Premium member":"♛ Upgrade to Premium"}</button><ul>${PREMIUM_FEATURES.map(x=>`<li><b>✓</b> ${x}</li>`).join("")}</ul><small class="secure-note">Secure recurring card payments powered by Flutterwave.</small></article>
      </div>
      <section class="premium-tools"><h2>Your Premium benefits</h2><div class="premium-tool-grid"><button class="premium-tool" data-premium-tool="viewers">👁 <strong>Profile viewers</strong><span>See who visited your profile</span></button><button class="premium-tool" data-premium-tool="likes">♡ <strong>Profile likes</strong><span>See who liked your profile</span></button></div><div id="premiumResults"></div></section>
      <p class="premium-terms">Yearly plan: ₦17,856 per year (20% less than 12 monthly payments). Recurring subscriptions are charged to the card used at checkout through the Flutterwave payment plan. Access remains active for the paid period. You can cancel future renewal; refunds are subject to LINKUP's refund policy.</p>`;
    let selected = "monthly";
    area.querySelectorAll("[data-plan]").forEach(btn => btn.addEventListener("click", () => {
      selected = btn.dataset.plan;
      area.querySelectorAll("[data-plan]").forEach(b => b.classList.toggle("selected", b === btn));
      $("#premiumPrice").innerHTML = selected === "monthly" ? `₦${monthly.amount.toLocaleString("en-NG")} <small>/ month</small>` : `₦${yearly.amount.toLocaleString("en-NG")} <small>/ year</small>`;
      $("#premiumBillingNote").textContent = selected === "monthly" ? "Billed monthly. Automatic renewal; cancel anytime." : "Billed yearly. Save 20%; automatic renewal; cancel anytime.";
    }));
    $("#subscribePremium")?.addEventListener("click", async () => {
      if (!state.token) { openAuth("login"); return; }
      const button = $("#subscribePremium"); button.disabled = true; button.textContent = "Preparing secure checkout…";
      try { const result = await api("/premium/checkout", { method: "POST", body: JSON.stringify({ plan: selected }) }); window.location.href = result.checkoutUrl; }
      catch (e) { toast(e.message); button.disabled = false; button.textContent = "♛ Upgrade to Premium"; }
    });
    $("#cancelPremium")?.addEventListener("click", async () => {
      if (!confirm("Cancel automatic renewal? Your Premium access remains until the current paid period ends.")) return;
      try { const result = await api("/premium/cancel", { method: "POST", body: "{}" }); toast(result.message); loadPremium(); }
      catch (e) { toast(e.message); }
    });
    area.querySelectorAll("[data-premium-tool]").forEach(btn => btn.addEventListener("click", async () => {
      if (!state.token) { openAuth("login"); return; }
      const results = $("#premiumResults"); results.textContent = "Loading…";
      try {
        const endpoint = btn.dataset.premiumTool === "viewers" ? "/premium/profile-viewers" : "/premium/profile-likes";
        const data = await api(endpoint);
        const people = data.viewers ? data.viewers.map(v => ({ user: v.viewer, date: v.viewedAt })) : data.users.map(user => ({ user }));
        results.innerHTML = people.length ? people.map(item => `<div class="premium-result"><img src="${escapeHTML(item.user?.photo || "https://placehold.co/60x60")}" alt=""><strong>${escapeHTML(item.user?.name || "LINKUP member")}</strong><small>${item.date ? new Date(item.date).toLocaleString() : ""}</small></div>`).join("") : "<p>No activity to show yet.</p>";
      } catch (e) { results.textContent = e.message; }
    }));
    const params = new URLSearchParams(location.search);
    if (params.get("payment") === "return") {
      const txId = params.get("transaction_id"), reference = params.get("tx_ref"), status = params.get("status");
      if (status === "successful" && txId && reference && state.token) {
        try { await api("/premium/verify", { method: "POST", body: JSON.stringify({ transactionId: txId, reference }) }); toast("Welcome to LINKUP Premium!"); history.replaceState({}, "", "/premium.html"); loadPremium(); }
        catch (e) { toast(e.message); }
      } else if (status === "cancelled") toast("Checkout was cancelled. No Premium membership was activated.");
    }
  } catch (e) { area.innerHTML = `<p class="card">${escapeHTML(e.message)}</p>`; }
}

/* =====================================
   LINKUP GALLERY IMAGE LIGHTBOX
===================================== */

(function initGalleryLightbox() {

    // Prevent duplicate initialization
    if (window.galleryLightboxInitialized) return;
    window.galleryLightboxInitialized = true;

    let currentImageIndex = 0;

    // Create lightbox
    const lightbox = document.createElement("div");
    lightbox.className = "gallery-lightbox";

    lightbox.innerHTML = `
        <button class="gallery-lightbox-close"
                aria-label="Close image viewer">&times;</button>

        <button class="gallery-lightbox-prev"
                aria-label="Previous image">&#10094;</button>

        <img src="" alt="Gallery image preview">

        <button class="gallery-lightbox-next"
                aria-label="Next image">&#10095;</button>

        <div class="gallery-lightbox-counter"></div>
    `;

    document.body.appendChild(lightbox);

    const previewImage = lightbox.querySelector("img");
    const previousButton = lightbox.querySelector(
        ".gallery-lightbox-prev"
    );
    const nextButton = lightbox.querySelector(
        ".gallery-lightbox-next"
    );
    const closeButton = lightbox.querySelector(
        ".gallery-lightbox-close"
    );
    const counter = lightbox.querySelector(
        ".gallery-lightbox-counter"
    );

    // Get all currently displayed gallery images
    function getGalleryImages() {
        return Array.from(
            document.querySelectorAll(".gallery-image")
        ).filter(image => image.src && image.getClientRects().length);
    }

    // Display selected image
    function showImage(index) {
        const images = getGalleryImages();

        if (!images.length) return;

        // Wrap around at the beginning and end
        currentImageIndex =
            (index + images.length) % images.length;

        const selectedImage = images[currentImageIndex];

        previewImage.src = selectedImage.src;
        previewImage.alt =
            selectedImage.alt || "Gallery image preview";

        counter.textContent =
            `${currentImageIndex + 1} / ${images.length}`;

        // Hide navigation when only one image exists
        previousButton.style.display =
            images.length > 1 ? "block" : "none";

        nextButton.style.display =
            images.length > 1 ? "block" : "none";
    }

    // Open viewer when a gallery image is clicked
    document.addEventListener("click", function(event) {

        const clickedImage = event.target.closest(".gallery-image");

        if (!clickedImage) return;

        const images = getGalleryImages();

        currentImageIndex = images.indexOf(clickedImage);

        if (currentImageIndex === -1) return;

        showImage(currentImageIndex);

        lightbox.classList.add("active");
        document.body.style.overflow = "hidden";
    });

    // Previous image
    previousButton.addEventListener("click", function(event) {
        event.stopPropagation();
        showImage(currentImageIndex - 1);
    });

    // Next image
    nextButton.addEventListener("click", function(event) {
        event.stopPropagation();
        showImage(currentImageIndex + 1);
    });

    // Close viewer
    function closeViewer() {
        lightbox.classList.remove("active");
        previewImage.src = "";
        document.body.style.overflow = "";
    }

    closeButton.addEventListener("click", closeViewer);

    // Close when clicking outside the image
    lightbox.addEventListener("click", function(event) {
        if (event.target === lightbox) {
            closeViewer();
        }
    });

    // Keyboard navigation
    document.addEventListener("keydown", function(event) {

        if (!lightbox.classList.contains("active")) return;

        if (event.key === "ArrowRight") {
            showImage(currentImageIndex + 1);
        }

        if (event.key === "ArrowLeft") {
            showImage(currentImageIndex - 1);
        }

        if (event.key === "Escape") {
            closeViewer();
        }
    });

})();

document.addEventListener("keydown", function(event) {
    const image = event.target.closest?.(".gallery-image");

    if (!image) return;

    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        image.click();
    }
});

// ==========================================
// REALPEOPLEKONECT AUDIO / VIDEO CALLING
// ==========================================
let rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require"
};

function callOverlay(show) { $("#callOverlay")?.classList.toggle("hidden", !show); }
function callStatus(text) { if ($("#callStatus")) $("#callStatus").textContent = text; }
function callPeerConnection() {
  const call = state.call;
  if (!call) return null;
  if (call.pc) return call.pc;
  const pc = new RTCPeerConnection(rtcConfig);
  call.pc = pc;
  call.localStream?.getTracks().forEach(track => pc.addTrack(track, call.localStream));
  pc.onicecandidate = event => {
    if (event.candidate && state.socket) state.socket.emit("call:signal", { callId: call.id, signal: { type: "ice", candidate: event.candidate } });
  };
  pc.ontrack = event => {
    const remote = $("#remoteCallVideo");
    if (remote) { remote.srcObject = event.streams[0]; remote.classList.toggle("audio-call", call.type === "audio"); remote.classList.remove("hidden");remote.play().catch(()=>{}); }
  };

  pc.onconnectionstatechange = () => {
  console.log("Call connection state:", pc.connectionState);

  if (pc.connectionState === "connected") {
    callStatus("Connected");
  }

  if (pc.connectionState === "connecting") {
    callStatus("Establishing connection...");
  }

  if (pc.connectionState === "disconnected") {
    callStatus("Connection interrupted. Reconnecting...");
  }

  if (pc.connectionState === "failed") {
    callStatus("Connection failed. Check your network or TURN settings.");
    console.error("WebRTC connection failed.");
  }

  if (pc.connectionState === "closed") {
    callStatus("Call ended.");
  }
};

pc.oniceconnectionstatechange = () => {
  console.log("ICE connection state:", pc.iceConnectionState);
};

pc.onicegatheringstatechange = () => {
  console.log("ICE gathering state:", pc.iceGatheringState);
};

  return pc;
}
async function acquireCallMedia(type) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Audio/video calling requires HTTPS and a supported browser.");
  return navigator.mediaDevices.getUserMedia({ audio: true, video: type === "video" });
}




// ============================================
// START OUTGOING AUDIO / VIDEO CALL
// CHECK CONNECTION BEFORE CALLING
// ============================================

async function startOutgoingCall(userId, name, photo, type) {
  if (!state.socket?.connected) {
    return toast(
      "Please log in and reconnect before making a call."
    );
  }
  if (state.call) {
    return toast("You already have an active call.");
  }
  if (String(userId) === String(state.user?._id)) {
    return toast("You cannot call yourself.");
  }

  // STEP 1: CHECK CONNECTION STATUS.
  let connection;

  try {

    connection = await api(
      `/users/connection-status/${encodeURIComponent(userId)}`
    );

  } catch (error) {

    return toast(
      error.message || "Could not verify your connection."
    );

  }

  // STEP 2: IF NOT CONNECTED, DO NOT START CALL.
  if (!connection.connected) {

    if (connection.status === "outgoing_pending") {

      return toast(
        "Your connection request is awaiting acceptance. You can call after this member accepts."
      );

    }

    if (connection.status === "incoming_pending") {

      return toast(
        "This member has already sent you a connection request. Accept it from the Connections page before calling."
      );

    }

    if (connection.status === "declined") {

      return toast(
        "Your previous connection request was declined. You cannot call this member."
      );

    }

    // STEP 3: OFFER TO SEND CONNECTION REQUEST.
    const sendRequest = window.confirm(
      `You need to connect with ${name || "this member"} before making a ${type} call. Would you like to send a connection request now?`
    );

    if (!sendRequest) {
      return;
    }

    try {

      await api(
        `/users/${encodeURIComponent(userId)}/connect`,
        {
          method: "POST"
        }
      );

      toast(
        "Connection request sent successfully. You can call after the member accepts."
      );

    } catch (error) {

      toast(
        error.message || "Could not send connection request."
      );

    }

    return;
  }

  // STEP 4: USER IS CONNECTED.
  // NOW ALLOW AUDIO OR VIDEO CALL.

  try {

    const ice = await api("/calls/ice-config").catch(() => null);

    if (ice?.iceServers?.length) {
      rtcConfig = {
        iceServers: ice.iceServers
      };
    }

    // Request microphone/camera permission only after connection check.
    const stream = await acquireCallMedia(type);

    const callId = crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

    state.call = {
      id: callId,
      peerId: String(userId),
      peerName: name || "Member",
      photo,
      type,
      initiator: true,
      localStream: stream,
      pc: null,
      pendingIce: []
    };

    $("#callTitle").textContent =
      `Calling ${state.call.peerName}`;

    $("#callAvatar").textContent =
      (state.call.peerName[0] || "R").toUpperCase();

    $("#localCallVideo").srcObject = stream;

    $("#localCallVideo").classList.toggle(
      "hidden",
      type !== "video"
    );

    $("#remoteCallVideo").classList.add("hidden");

    $("#callAcceptBtn").classList.add("hidden");
    $("#callRejectBtn").classList.add("hidden");
    $("#callEndBtn").classList.remove("hidden");

    $("#callCameraBtn").classList.toggle(
      "hidden",
      type !== "video"
    );

    callStatus("Ringing...");
    callOverlay(true);

    // Server performs another independent connection check.
    state.socket.emit("call:initiate", {
      recipientId: String(userId),
      callId,
      mediaType: type
    });

  } catch (error) {

    cleanupCall(false);

    toast(
      error.message || "Could not access your microphone or camera."
    );

  }

}





async function acceptIncomingCall() {
  const call = state.call;if (!call || call.initiator) return;
  try {
    const ice = await api("/calls/ice-config").catch(() => null);
    if (ice?.iceServers?.length) rtcConfig = { iceServers: ice.iceServers };
    call.localStream = await acquireCallMedia(call.type);
    $("#localCallVideo").srcObject = call.localStream;
    $("#localCallVideo").classList.toggle("hidden", call.type !== "video");
    $("#callAcceptBtn").classList.add("hidden");$("#callRejectBtn").classList.add("hidden");
    $("#callCameraBtn").classList.toggle("hidden", call.type !== "video");
    callStatus("Connecting…");callOverlay(true);
    callPeerConnection();
    state.socket.emit("call:accept", { callId: call.id });
  } catch (error) { toast(error.message || "Could not access your microphone or camera."); state.socket?.emit("call:reject", { callId: call.id }); cleanupCall(false); }
}
async function handleCallSignal({ callId, signal }) {
  const call = state.call;if (!call || call.id !== callId || !signal) return;
  try {
    const pc = callPeerConnection();
    if (signal.type === "offer") {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.description));
      for (const candidate of call.pendingIce.splice(0)) await pc.addIceCandidate(new RTCIceCandidate(candidate));
      const answer = await pc.createAnswer();await pc.setLocalDescription(answer);
      state.socket.emit("call:signal", { callId, signal: { type: "answer", description: pc.localDescription } });
    } else if (signal.type === "answer") {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.description));
      for (const candidate of call.pendingIce.splice(0)) await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } else if (signal.type === "ice") {
      if (pc.remoteDescription) await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      else call.pendingIce.push(signal.candidate);
    }
  } catch (error) { console.error("WebRTC signalling error:", error);callStatus("Could not establish the call."); }
}
async function createCallOffer() {
  const call=state.call;if(!call?.initiator)return;
  try {
    const pc=callPeerConnection();const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    state.socket.emit("call:signal",{callId:call.id,signal:{type:"offer",description:pc.localDescription}});
    callStatus("Connecting…");
  } catch(error) { console.error(error);toast("Could not start the call."); }
}
function cleanupCall(notify = true) {
  const call=state.call;
  if (call && notify) state.socket?.emit("call:end",{callId:call.id});
  if (call?.pc) { call.pc.ontrack=null;call.pc.close(); }
  call?.localStream?.getTracks().forEach(track=>track.stop());
  const local=$("#localCallVideo"),remote=$("#remoteCallVideo");
  if(local)local.srcObject=null;if(remote)remote.srcObject=null;
  state.call=null;callOverlay(false);
}
function setupCallSocketEvents() {
  if(!state.socket)return;
  state.socket.on("call:incoming", data => {
    if(state.call){state.socket.emit("call:reject",{callId:data.callId});return;}
    state.call={id:data.callId,peerId:String(data.callerId),peerName:data.callerName||"REALPEOPLEKONECT member",type:data.mediaType,initiator:false,localStream:null,pc:null,pendingIce:[]};
    $("#callTitle").textContent=`Incoming ${data.mediaType} call`;
    $("#callAvatar").textContent=(state.call.peerName[0]||"R").toUpperCase();
    $("#localCallVideo").classList.add("hidden");$("#remoteCallVideo").classList.add("hidden");
    $("#callAcceptBtn").classList.remove("hidden");$("#callRejectBtn").classList.remove("hidden");$("#callEndBtn").classList.add("hidden");
    $("#callCameraBtn").classList.toggle("hidden",data.mediaType!=="video");
    callStatus(`${data.callerName} is calling you`);callOverlay(true);
    try { if (navigator.vibrate) navigator.vibrate([250,150,250]); } catch {}
  });
  state.socket.on("call:ringing",()=>callStatus("Ringing…"));
  state.socket.on("call:accepted",()=>createCallOffer());
  state.socket.on("call:signal",handleCallSignal);
  state.socket.on("call:rejected",()=>{callStatus("Call declined.");setTimeout(()=>cleanupCall(false),900);});
  state.socket.on("call:ended",()=>{callStatus("Call ended.");setTimeout(()=>cleanupCall(false),500);});
  state.socket.on("call:error",data=>{toast(data.message||"Call could not be started.");cleanupCall(false);});
}
document.addEventListener("click", async event => {
  const callButton=event.target.closest("[data-call-type]");
  if(callButton){
    const type=callButton.dataset.callType;
    const userId=callButton.dataset.callUser||state.activeConversation?.id;
    const name=callButton.dataset.callName||state.activeConversation?.name||"Member";
    const photo=callButton.dataset.callPhoto||state.activeConversation?.photo||"";
    if(userId) await startOutgoingCall(userId,name,photo,type);
    return;
  }
  if(event.target.closest("#callAcceptBtn")) return acceptIncomingCall();
  if(event.target.closest("#callRejectBtn")) { if(state.call)state.socket?.emit("call:reject",{callId:state.call.id});cleanupCall(false);return; }
  if(event.target.closest("#callEndBtn")) return cleanupCall(true);
  if(event.target.closest("#callMuteBtn") && state.call?.localStream) {
    const tracks=state.call.localStream.getAudioTracks();const enabled=tracks.some(t=>t.enabled);
    tracks.forEach(t=>t.enabled=!enabled);event.target.textContent=enabled?"Unmute":"Mute";
  }
  if(event.target.closest("#callCameraBtn") && state.call?.localStream) {
    const tracks=state.call.localStream.getVideoTracks();const enabled=tracks.some(t=>t.enabled);
    tracks.forEach(t=>t.enabled=!enabled);event.target.textContent=enabled?"Camera on":"Camera off";
  }
});

// Audio/video attachment sharing in private conversations.



async function uploadChatMedia(file) {
  if (!file || !state.activeConversation) return;

  if (state.chatMediaUploading) {
    toast("Please wait for the current media upload to finish.");
    return;
  }

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const isAudio = file.type.startsWith("audio/");

  if (!isImage && !isVideo && !isAudio) {
    toast("Choose an image, audio recording, or video.");
    return;
  }

  const allowedImageTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  const allowedVideoTypes = [
    "video/mp4",
    "video/webm",
    "video/quicktime"
  ];

  const allowedAudioTypes = [
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg"
  ];

  const allowedTypes = isImage
    ? allowedImageTypes
    : isVideo
      ? allowedVideoTypes
      : allowedAudioTypes;

  if (!allowedTypes.includes(file.type)) {
    toast("This file format is not supported.");
    return;
  }

  const maxSize = 100 * 1024 * 1024;

  if (file.size > maxSize) {
    toast("The file is too large. Maximum size is 100MB.");
    return;
  }

  state.chatMediaUploading = true;

  const container = $("#chatMessages");
  const mediaLabel = isImage ? "Image" : isVideo ? "Video" : "Audio";

  const progressRow = document.createElement("div");
  progressRow.className =
    "chat-message mine media-upload-progress";

  const title = document.createElement("strong");
  title.className = "upload-file-name";
  title.textContent = `Sending ${mediaLabel}: ${file.name}`;

  const status = document.createElement("small");
  status.className = "upload-status";
  status.textContent = "Preparing upload...";

  const progressTrack = document.createElement("div");
  progressTrack.className = "upload-progress-track";

  const progressBar = document.createElement("div");
  progressBar.className = "upload-progress-bar";
  progressTrack.append(progressBar);

  const percentage = document.createElement("span");
  percentage.className = "upload-percentage";
  percentage.textContent = "0%";

  progressRow.append(title, status, progressTrack, percentage);

  if (container) {
    container.append(progressRow);
    container.scrollTop = container.scrollHeight;
  }

  const form = new FormData();
  form.append("recipientId", state.activeConversation.id);
  form.append("media", file);

  try {
    const result = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.open("POST", `${API}/messages/media`);

      Object.entries(authHeaders()).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });

      xhr.upload.addEventListener("progress", event => {
        if (!event.lengthComputable) {
          status.textContent = `Sending ${mediaLabel}...`;
          return;
        }

        const percent = Math.round(
          (event.loaded / event.total) * 100
        );

        progressBar.style.width = `${percent}%`;
        percentage.textContent = `${percent}%`;

        status.textContent =
          percent >= 100
            ? "Upload complete. Processing media..."
            : `Sending ${mediaLabel}...`;
      });

      xhr.onload = () => {
        let data = {};

        try {
          data = JSON.parse(xhr.responseText || "{}");
        } catch {
          return reject(new Error("Invalid server response."));
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          reject(new Error(data.message || "Media upload failed."));
        }
      };

      xhr.onerror = () => {
        reject(new Error("Network error. Check your internet connection."));
      };

      xhr.onabort = () => {
        reject(new Error("Media upload was cancelled."));
      };

      xhr.send(form);
    });

    if (!result.message) {
      throw new Error("The server did not return the uploaded message.");
    }

    progressBar.style.width = "100%";
    percentage.textContent = "100%";
    status.textContent = "Sent successfully!";
    progressRow.classList.add("upload-complete");

    appendMessage(result.message);
    await loadConversations();

    setTimeout(() => progressRow.remove(), 1200);

  } catch (error) {
    status.textContent = error.message || "Upload failed.";
    progressRow.classList.add("upload-failed");
    toast(error.message || "Could not send media.");

  } finally {
    state.chatMediaUploading = false;
  }
}

(function initChatImageViewer() {
  if (window.chatImageViewerInitialized) return;
  window.chatImageViewerInitialized = true;

  const viewer = document.createElement("div");
  viewer.className = "chat-image-viewer";
  viewer.innerHTML = `
    <button type="button" class="chat-image-viewer-close"
      aria-label="Close image viewer">&times;</button>
    <img src="" alt="Shared image enlarged">
  `;

  document.body.append(viewer);

  const preview = viewer.querySelector("img");
  const closeButton = viewer.querySelector(
    ".chat-image-viewer-close"
  );

  function closeViewer() {
    viewer.classList.remove("active");
    preview.src = "";
    document.body.style.overflow = "";
  }

  document.addEventListener("click", event => {
    const button = event.target.closest(".chat-image-open");
    if (!button) return;

    const image = button.querySelector("img");
    if (!image?.src) return;

    preview.src = image.src;
    viewer.classList.add("active");
    document.body.style.overflow = "hidden";
  });

  closeButton.addEventListener("click", closeViewer);

  viewer.addEventListener("click", event => {
    if (event.target === viewer) closeViewer();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && viewer.classList.contains("active")) {
      closeViewer();
    }
  });
})();
// Open image, audio and video file picker
document.addEventListener("click", function(event) {
  const attachButton = event.target.closest("#chatAttachBtn");

  if (!attachButton) return;

  document.getElementById("chatMediaInput")?.click();
});
document.addEventListener("change",event=>{
  if(event.target.matches("#chatMediaInput")) {
    const file=event.target.files?.[0];if(file)uploadChatMedia(file);event.target.value="";
  }
});
document.addEventListener("click",async event=>{
  const recordButton=event.target.closest("#recordVoiceBtn");if(!recordButton)return;
  if(state.voiceRecorder?.state==="recording"){state.voiceRecorder.stop();recordButton.textContent="🎙";return;}
  if(!state.activeConversation)return toast("Open a conversation first.");
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return toast("Voice recording is not supported in this browser.");
  try{
    state.voiceStream=await navigator.mediaDevices.getUserMedia({audio:true});
    const chunks=[];state.voiceRecorder=new MediaRecorder(state.voiceStream);
    state.voiceRecorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    state.voiceRecorder.onstop=async()=>{
      const blob=new Blob(chunks,{type:state.voiceRecorder.mimeType||"audio/webm"});
      const file=new File([blob],`voice-message-${Date.now()}.webm`,{type:blob.type});
      state.voiceStream?.getTracks().forEach(t=>t.stop());state.voiceStream=null;
      await uploadChatMedia(file);
    };
    state.voiceRecorder.start();recordButton.textContent="■ Stop";
  }catch(error){toast(error.message||"Microphone permission was not granted.");}
});


const passwordResetToken =
    new URLSearchParams(window.location.search)
        .get("resetPassword");

if (passwordResetToken) {
    showResetPassword(passwordResetToken);
}


function setupPostVideoControls() {
  document.querySelectorAll(".post-video-wrap video").forEach(video => {
    if (video.dataset.playOverlayReady) return;

    video.dataset.playOverlayReady = "true";

    const wrapper = video.closest(".post-video-wrap");

    video.addEventListener("play", () => {
      wrapper.classList.add("is-playing");
    });

    video.addEventListener("pause", () => {
      wrapper.classList.remove("is-playing");
    });

    video.addEventListener("ended", () => {
      wrapper.classList.remove("is-playing");
    });
  });
}

// Handle clicks on the centre play button.
document.addEventListener("click", async event => {
  const button = event.target.closest(".post-video-play");

  if (!button) return;

  const wrapper = button.closest(".post-video-wrap");
  const video = wrapper?.querySelector("video");

  if (!video) return;

  try {
    await video.play();
  } catch (error) {
    toast("Unable to play this video. Please try again.");
  }
});

function setupFeedVideos() {
  const videos = document.querySelectorAll(
    "#feedPosts video[data-video-src]"
  );

  if (!("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;

      const video = entry.target;

      if (!video.src) {
        video.src = video.dataset.videoSrc;
        video.preload = "metadata";
        video.load();
      }

      observer.unobserve(video);
    });
  }, {
    rootMargin: "500px 0px"
  });

  videos.forEach(video => observer.observe(video));
}

// Play videos when the centre button is clicked.
document.addEventListener("click", async event => {
  const button = event.target.closest(".post-video-play");

  if (!button) return;

  const wrapper = button.closest(".post-video-wrap");
  const video = wrapper?.querySelector("video");

  if (!video) return;

  try {
    if (!video.src) {
      video.src = video.dataset.videoSrc;
      video.load();
    }

    video.controls = true;
    await video.play();

  } catch (error) {
    toast("Unable to play video. Please try again.");
  }
});

// Update the play button when video playback changes.
document.addEventListener("play", event => {
  if (event.target.matches(".community-post-video")) {
    event.target.closest(".post-video-wrap")
      ?.classList.add("is-playing");
  }
}, true);

document.addEventListener("pause", event => {
  if (event.target.matches(".community-post-video")) {
    event.target.closest(".post-video-wrap")
      ?.classList.remove("is-playing");
  }
}, true);
