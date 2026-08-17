function bootstrap() {
  const mock = window.__RP_UI_MOCK__;
  if (mock && typeof mock === "object") Object.assign(AppState.form, mock);
  document.querySelector("#name").value = AppState.form.name;
  document.querySelector("#room").value = AppState.form.room;
  document.querySelector("#reason").value = AppState.form.reason;
  document.querySelector("#rainMood").value = AppState.form.rainMood;
  document.querySelector("#pace").value = AppState.form.pace;
  showView("guide");
}
bootstrap();
