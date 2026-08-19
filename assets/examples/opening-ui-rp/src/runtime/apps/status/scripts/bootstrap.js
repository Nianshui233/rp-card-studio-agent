async function bootstrap() {
  const sync = document.querySelector("#sync");
  try {
    AppState.data = await Host.readState();
    sync.textContent = AppState.data ? "状态已载入" : "暂无状态数据";
    sync.classList.toggle("ready", Boolean(AppState.data));
    renderAll(); showView("room");
  } catch (error) {
    sync.textContent = "读取失败";
    document.querySelector("#view-room").innerHTML = `<div class="error">${text(error.message || error)}</div>`;
  }
}
bootstrap();
