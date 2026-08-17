let toastTimer = null;
function toast(message) {
  const node = document.querySelector("#toast");
  node.textContent = message; node.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove("show"), 1500);
}

document.addEventListener("click", event => {
  const view = event.target.closest("[data-view]")?.dataset.view;
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (view) showView(view);
  if (action) toast(Host.writeInput(action) ? "行动已写入输入框" : "无法直接写入，已尝试复制");
});
document.querySelector("#guestSearch").addEventListener("input", event => { AppState.filter = event.target.value; renderGuests(); });
document.querySelector("#writeAction").addEventListener("click", () => {
  const input = document.querySelector("#customAction");
  if (!input.value.trim()) return toast("先写下要做的事");
  toast(Host.writeInput(input.value.trim()) ? "行动已写入输入框" : "无法直接写入，已尝试复制");
});
