(() => {
  const form = document.getElementById("newsStaffForm");
  if (!form || !state.token || state.user?.role !== "admin") return;
  const status = document.getElementById("newsStaffStatus");
  const list = document.getElementById("newsStaffList");
  const submit = form.querySelector("button[type=submit]");
  async function load() {
    list.textContent = "Loading editors…";
    try {
      const {editors} = await api("/admin/news-editors");
      list.replaceChildren();
      if (!editors.length) { list.textContent = "No news editors yet."; return; }
      for (const editor of editors) {
        const row = document.createElement("article"); row.className = "news-staff-row";
        const info = document.createElement("div"); info.className = "news-admin-info";
        const name = document.createElement("strong"); name.textContent = editor.name;
        const email = document.createElement("small"); email.textContent = editor.email;
        const badge = document.createElement("span"); badge.className = "news-staff-badge " + (editor.status === "suspended" ? "suspended" : "");
        badge.textContent = editor.status === "suspended" ? "Suspended" : "Active";
        info.append(name,email,badge);
        const button = document.createElement("button"); button.type="button";
        button.className = "btn " + (editor.status === "suspended" ? "btn-outline" : "news-delete-btn");
        button.textContent = editor.status === "suspended" ? "Unsuspend" : "Suspend";
        button.onclick = async () => {
          const next = editor.status === "suspended" ? "active" : "suspended";
          if (!confirm(next === "suspended" ? "Suspend this news editor? They will lose editing access immediately." : "Reactivate this news editor?")) return;
          button.disabled = true;
          try {
            await api("/admin/news-editors/"+encodeURIComponent(editor._id)+"/status",{method:"PATCH",body:JSON.stringify({status:next})});
            status.textContent = next === "active" ? "Editor reactivated." : "Editor suspended."; await load();
          } catch(error) { status.textContent=error.message; button.disabled=false; }
        };
        row.append(info,button);list.append(row);
      }
    } catch(error) { list.textContent=error.message; }
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    submit.disabled=true;status.textContent="Creating account…";
    try {
      const data=Object.fromEntries(new FormData(form));
      await api("/admin/news-editors",{method:"POST",body:JSON.stringify(data)});
      form.reset();status.textContent="News editor created. Share their sign-in details privately and direct them to /news-editor.html.";
      await load();
    } catch(error) { status.textContent=error.message; }
    finally { submit.disabled=false; }
  });
  void load();
})();
