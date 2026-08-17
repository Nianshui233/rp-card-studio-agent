let toastTimer = null;
function toast(text) {
  const node = document.querySelector("#toast");
  node.textContent = text;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 1600);
}

document.addEventListener("click", event => {
  const nav = event.target.closest("[data-view]");
  if (nav) {
    AppState.currentView = nav.dataset.view;
    document.querySelectorAll(".nav-item,.view").forEach(node => node.classList.remove("active"));
    nav.classList.add("active");
    document.querySelector(`#view-${AppState.currentView}`)?.classList.add("active");
  }
  const action = event.target.closest("[data-action]");
  if (action) {
    Host.writeInput(`（行动）${action.dataset.action}`);
    toast("行动已写入输入框");
  }
});

document.querySelector("#characterSearch").addEventListener("input", () => renderCharacters(AppState.data?.["在场人物"] || {}));
document.querySelector("#actionCommit").addEventListener("click", () => {
  const input = document.querySelector("#actionInput");
  if (!input.value.trim()) return toast("先写下要做的事");
  Host.writeInput(`（行动）${input.value.trim()}`);
  toast("行动已写入输入框");
});
