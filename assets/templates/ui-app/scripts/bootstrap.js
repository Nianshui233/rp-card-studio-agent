async function bootstrap() {
  const connection = document.querySelector("#connectionState");
  try {
    AppState.data = await Host.readState();
    AppState.mode = AppState.data ? "ready" : "empty";
    connection.textContent = AppState.data ? "当前楼层已同步" : "暂无状态数据";
    connection.classList.toggle("ready", Boolean(AppState.data));
    renderApp();
  } catch (error) {
    AppState.mode = "error";
    connection.textContent = "读取失败";
    document.querySelector("#currentSituation").innerHTML = `<div class="error">${String(error.message || error)}</div>`;
  }
}

bootstrap();
