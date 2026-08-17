function showView(name) {
  AppState.currentView = name;
  document.querySelectorAll(".view,.step").forEach(node => node.classList.remove("active"));
  document.querySelector(`#view-${name}`)?.classList.add("active");
  document.querySelector(`.step[data-view="${name}"]`)?.classList.add("active");
  if (name === "preview") renderPreview();
}

function renderPreview() {
  const form = collectForm();
  document.querySelector("#monogram").textContent = form.name.charAt(0) || "客";
  document.querySelector("#previewName").textContent = form.name;
  document.querySelector("#previewSummary").textContent = `${form.room} · ${form.rainMood} · ${form.pace}。今夜来意：${form.reason}`;
  document.querySelector("#xmlPreview").textContent = buildUserBlock();
}

function applyPreset(name) {
  const presets = {
    traveler: { reason: "赶了一整日山路，只想找个地方躲雨歇脚", rainMood: "只是躲雨", pace: "安静观察" },
    messenger: { reason: "寻找一名失踪的信使和他最后送出的信", rainMood: "故意等雨", pace: "自然交谈" },
    runaway: { reason: "不愿说明来处，只想在天亮前避开追索", rainMood: "正在逃离什么", pace: "麻烦很快上门" },
  };
  const preset = presets[name];
  if (!preset) return;
  document.querySelector("#reason").value = preset.reason;
  document.querySelector("#rainMood").value = preset.rainMood;
  document.querySelector("#pace").value = preset.pace;
}
