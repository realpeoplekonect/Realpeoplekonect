// Standalone editor portal; does not load the social app or admin dashboard.
const state = {token:null,user:null};
const editorLogin = document.getElementById("editorLoginPanel");
const editorWorkspace = document.getElementById("editorWorkspace");
const editorLogout = document.getElementById("editorLogout");
const editorStatus = document.getElementById("editorLoginStatus");
const editorForm = document.getElementById("editorLoginForm");
let editorTimer = null;
function expireEditorSession(message) {
  clearInterval(editorTimer); editorTimer = null;
  if (state.token && localStorage.getItem("peokonectToken") === state.token) {
    localStorage.removeItem("peokonectToken"); localStorage.removeItem("peokonectUser");
  }
  state.token = null; state.user = null;
  editorWorkspace.classList.add("hidden");
  document.getElementById("newsAdminForm")?.reset();
  document.getElementById("newsAdminList")?.replaceChildren();
  document.getElementById("newsMediaPreview")?.replaceChildren();
  editorLogin.classList.remove("hidden"); editorLogout.classList.add("hidden");
  editorStatus.textContent = message;
}
async function api(path, options={}) {
  const headers = {...(options.headers || {})};
  if (state.token) headers.Authorization = "Bearer " + state.token;
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"]="application/json";
  const response = await fetch("/api" + path,{...options,headers,cache:"no-store"});
  const data = await response.json().catch(()=>({}));
  if (!response.ok) {
    if (response.status === 401 && state.token) expireEditorSession("Your session ended or your account has been suspended. Sign in again.");
    throw new Error(data.message || "Request failed.");
  }
  return data;
}
function showEditor(user,token) {
  state.token=token;state.user=user;
  localStorage.setItem("peokonectToken",token);
  localStorage.setItem("peokonectUser",JSON.stringify(user));
  editorLogin.classList.add("hidden");editorWorkspace.classList.remove("hidden");editorLogout.classList.remove("hidden");
  document.getElementById("editorWelcome").textContent="Signed in as " + user.name + " · News editor";
  window.dispatchEvent(new Event("news-editor-ready"));
  clearInterval(editorTimer);
  editorTimer=setInterval(async()=>{
    if (!state.token) return;
    try {
      const {user}=await api("/auth/me");
      if(user.role!=="news_editor") expireEditorSession("Your editorial access has changed.");
    } catch(error) { /* API handles revoked sessions; transient network failures can retry. */ }
  },30000);
}
editorForm.addEventListener("submit",async event=>{
  event.preventDefault();
  const button=editorForm.querySelector("button[type=submit]");button.disabled=true;
  editorStatus.textContent="Signing in…";
  try {
    const credentials=Object.fromEntries(new FormData(editorForm));
    const result=await api("/auth/login",{method:"POST",body:JSON.stringify(credentials)});
    if(result.user.role!=="news_editor") throw new Error("Use your assigned news editor account.");
    editorForm.reset();
    localStorage.setItem("peokonectToken",result.token);
    localStorage.setItem("peokonectUser",JSON.stringify(result.user));
    // Reinitialize the workspace without retaining any previous editor's data.
    window.location.reload();
  } catch(error) { editorStatus.textContent=error.message; }
  finally { button.disabled=false; }
});
editorLogout.addEventListener("click",async()=>{
  try { await api("/auth/logout",{method:"POST"}); } catch {}
  expireEditorSession("Signed out.");
  window.location.reload();
});
(async()=>{
  const token=localStorage.getItem("peokonectToken");
  if(!token) return;
  state.token=token;
  try {
    const {user}=await api("/auth/me");
    if(user.role!=="news_editor") {
      state.token=null;editorStatus.textContent="Please sign in using your news editor account.";return;
    }
    showEditor(user,token);
  } catch(error) { state.token=null;editorStatus.textContent=error.message; }
})();
