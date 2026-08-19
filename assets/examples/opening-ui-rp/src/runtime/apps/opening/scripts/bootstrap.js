function bootstrap() {
  const mock = window.__RP_UI_MOCK__;
  if (mock && typeof mock === "object") Object.assign(AppState.form, mock);
  document.querySelector("#name").value = AppState.form.name;
  document.querySelector("#publicIdentity").value = AppState.form.publicIdentity;
  document.querySelector("#startingLocation").value = AppState.form.startingLocation;
  document.querySelector("#startingGoal").value = AppState.form.startingGoal;
  showView("guide");
}
bootstrap();
