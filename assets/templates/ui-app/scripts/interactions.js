let toastTimer = null;
function toast(text) {
  const node = document.querySelector("#toast");
  node.textContent = text;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 1600);
}

async function sendAction(text) {
  const result = await Host.writeInput(text);
  if (result.ok) toast("行动已写入输入框");
  else if (result.route === "clipboard") toast("无法直接写入，行动已复制");
  else toast("无法自动写入，请手动复制");
  return result;
}

document.addEventListener("click", async event => {
  const nav = event.target.closest("[data-view]");
  if (nav) {
    AppState.currentView = nav.dataset.view;
    document.querySelectorAll(".nav-item,.view").forEach(node => node.classList.remove("active"));
    nav.classList.add("active");
    document.querySelector(`#view-${AppState.currentView}`)?.classList.add("active");
  }
  const action = event.target.closest("[data-action]");
  if (action) await sendAction(`（行动）${action.dataset.action}`);
});

document.querySelector("#characterSearch").addEventListener("input", () => renderCharacters(AppState.data?.["在场人物"] || {}));
document.querySelector("#actionCommit").addEventListener("click", async () => {
  const input = document.querySelector("#actionInput");
  if (!input.value.trim()) return toast("先写下要做的事");
  await sendAction(`（行动）${input.value.trim()}`);
});