function initializeNewsAdmin() {
  const form = document.getElementById("newsAdminForm");
  if (!form || form.dataset.newsInitialized || !state.token || !["admin","news_editor"].includes(state.user?.role)) return;
  form.dataset.newsInitialized = "true";
  const list = document.getElementById("newsAdminList");
  const status = document.getElementById("newsAdminStatus");
  const preview = document.getElementById("newsMediaPreview");
  const publish = document.getElementById("newsPublishBtn");
  const cancel = document.getElementById("newsCancelEdit");
  const removeLabel = document.getElementById("newsRemoveMediaLabel");
  const heading = document.getElementById("newsFormHeading");
  let editing = null, busy = false, urls = [];
  const field = name => form.elements.namedItem(name);
  const mediaPreview = (container, mediaType, mediaUrl, thumbnailUrl) => {
    if (!mediaUrl) return;
    const element = document.createElement(mediaType === "video" ? "video" : "img");
    element.className = "news-thumbnail";
    element.src = mediaUrl;
    if (mediaType === "video") {
      element.controls = true; element.playsInline = true; element.preload = "metadata";
      if (thumbnailUrl) element.poster = thumbnailUrl;
    } else { element.alt = "News photo"; element.loading = "lazy"; }
    container.append(element);
  };
  function clearPreview() {
    preview.replaceChildren();
    urls.forEach(url => URL.revokeObjectURL(url)); urls = [];
  }
  function objectUrl(file) { const url = URL.createObjectURL(file); urls.push(url); return url; }
  function refreshPreview() {
    clearPreview();
    let type = editing?.mediaType, url = editing?.mediaUrl, poster = editing?.thumbnailUrl;
    if (field("removeMedia").checked) { type = "none"; url = ""; poster = ""; }
    const file = field("media").files[0];
    if (file) { type = file.type.startsWith("video/") ? "video" : "image"; url = objectUrl(file); poster = ""; }
    const thumbnail = field("thumbnail").files[0];
    if (thumbnail && type === "video") poster = objectUrl(thumbnail);
    mediaPreview(preview,type,url,poster);
  }
  function setBusy(value) {
    busy = value;
    Array.from(form.elements).forEach(el => { el.disabled = value; });
    list.querySelectorAll("button").forEach(el => { el.disabled = value; });
  }
  function reset() {
    editing = null; form.reset(); clearPreview();
    heading.textContent = "Create news story"; publish.textContent = "Publish news";
    cancel.classList.add("hidden"); removeLabel.classList.add("hidden");
  }
  function startEdit(article) {
    if (busy) return;
    reset(); editing = article;
    field("title").value = article.title; field("body").value = article.body; field("category").value = article.category;
    heading.textContent = "Edit news story"; publish.textContent = "Save changes";
    cancel.classList.remove("hidden"); removeLabel.classList.toggle("hidden", article.mediaType === "none");
    status.textContent = ""; refreshPreview(); field("title").focus();
    form.scrollIntoView({behavior:"smooth",block:"start"});
  }
  async function load() {
    list.textContent = "Loading stories…";
    try {
      const {articles} = await api("/news/admin");
      list.replaceChildren();
      if (!articles.length) { list.textContent = "No news stories published yet."; return; }
      for (const article of articles) {
        const row = document.createElement("article"); row.className = "news-admin-row";
        const thumb = document.createElement("div"); thumb.className = "news-admin-thumb";
        if (article.mediaType === "video" && article.thumbnailUrl) {
          mediaPreview(thumb,"image",article.thumbnailUrl);
          const badge = document.createElement("span"); badge.className = "news-video-badge"; badge.textContent = "▶ Video"; thumb.append(badge);
        } else if (article.mediaUrl) mediaPreview(thumb,article.mediaType,article.mediaUrl);
        else { thumb.textContent = "TEXT"; }
        const info = document.createElement("div"); info.className = "news-admin-info";
        const title = document.createElement("strong"); title.textContent = article.title;
        const meta = document.createElement("small"); meta.textContent = article.category + " · " + new Date(article.publishedAt).toLocaleString() + (article.author?.name ? " · " + article.author.name : "");
        info.append(title,meta);
        const actions = document.createElement("div"); actions.className = "news-admin-actions";
        const edit = document.createElement("button"); edit.type = "button"; edit.className = "btn btn-outline"; edit.textContent = "Edit"; edit.onclick = () => startEdit(article);
        const remove = document.createElement("button"); remove.type = "button"; remove.className = "btn news-delete-btn"; remove.textContent = "Delete";
        remove.onclick = async () => {
          if (busy || !confirm("Delete this news story permanently?")) return;
          setBusy(true);
          try {
            await api("/news/admin/" + encodeURIComponent(article._id), {method:"DELETE"});
            if (editing?._id === article._id) reset();
            status.textContent = "News story deleted."; await load();
          } catch(error) { status.textContent = error.message; }
          finally { setBusy(false); }
        };
        edit.disabled = remove.disabled = busy;
        actions.append(edit,remove); row.append(thumb,info,actions); list.append(row);
      }
    } catch(error) {
      list.textContent = error.message;
      const retry = document.createElement("button"); retry.type = "button"; retry.textContent = "Retry"; retry.className = "btn btn-outline"; retry.onclick = load; list.append(" ",retry);
    }
  }
  for (const name of ["media","thumbnail","removeMedia"]) field(name).addEventListener("change",refreshPreview);
  cancel.addEventListener("click", () => { reset(); status.textContent = ""; });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const media = field("media").files[0], thumbnail = field("thumbnail").files[0];
    const type = media ? (media.type.startsWith("video/") ? "video" : "image") : field("removeMedia").checked ? "none" : editing?.mediaType;
    if (media?.size > 100*1024*1024 || thumbnail?.size > 10*1024*1024) { status.textContent = "Photo/video limit: 100 MB. Thumbnail limit: 10 MB."; return; }
    if (thumbnail && type !== "video") { status.textContent = "Choose a video to use a custom thumbnail."; return; }
    const data = new FormData(form);
    setBusy(true); status.textContent = "Saving story… Please wait while media uploads.";
    try {
      const path = editing ? "/news/admin/" + encodeURIComponent(editing._id) : "/news/admin";
      await api(path,{method:editing ? "PATCH" : "POST",body:data});
      reset(); status.textContent = "News story saved successfully. It is now visible on the News page."; await load();
    } catch(error) { status.textContent = error.message; }
    finally { setBusy(false); }
  });
  // The authenticated API independently enforces the administrator role.
  void load();
}
window.addEventListener("news-editor-ready", initializeNewsAdmin);
initializeNewsAdmin();
