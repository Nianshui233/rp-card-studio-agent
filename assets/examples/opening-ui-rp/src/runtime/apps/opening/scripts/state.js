const AppState = {
  currentView: "guide",
  form: { name: "林砚", room: "二楼临街房", reason: "躲雨并寻找一名失踪的信使", rainMood: "被雨困住", pace: "自然交谈" },
};

function escapeXml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function collectForm() {
  AppState.form = {
    name: document.querySelector("#name").value.trim() || "无名旅客",
    room: document.querySelector("#room").value,
    reason: document.querySelector("#reason").value.trim() || "只为躲雨",
    rainMood: document.querySelector("#rainMood").value,
    pace: document.querySelector("#pace").value,
  };
  return AppState.form;
}

function buildUserBlock() {
  const form = collectForm();
  return `<雨幕创角>\nname: ${escapeXml(form.name)}\nroom: ${escapeXml(form.room)}\nreason: ${escapeXml(form.reason)}\nrain_mood: ${escapeXml(form.rainMood)}\nopening_pace: ${escapeXml(form.pace)}\n</雨幕创角>`;
}
