let toastTimer = null;
function toast(message) {
  const node = document.querySelector("#toast");
  node.textContent = message; node.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove("show"), 1500);
}
async function sendAction(text) {
  const result = await Host.writeInput(text);
  toast(result.ok ? "行动已写入输入框" : result.route === "clipboard" ? "无法直接写入，已尝试复制" : "无法自动写入，请手动复制");
}
document.addEventListener("click", async event => {
  const view = event.target.closest("[data-view]")?.dataset.view;
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (view) showView(view);
  if (action) await sendAction(`（行动）${action}`);
});
document.querySelector("#guestSearch").addEventListener("input", event => { AppState.filter = event.target.value; renderGuests(); });
document.querySelector("#writeAction").addEventListener("click", async () => {
  const input = document.querySelector("#customAction");
  if (!input.value.trim()) return toast("先写下要做的事");
  await sendAction(`（行动）${input.value.trim()}`);
});