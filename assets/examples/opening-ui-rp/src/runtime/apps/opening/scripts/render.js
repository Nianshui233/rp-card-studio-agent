function showView(name) {
  AppState.currentView = name;
  document.querySelectorAll(".view,.step").forEach(node => node.classList.remove("active"));
  document.querySelector(`#view-${name}`)?.classList.add("active");
  document.querySelector(`.step[data-view="${name}"]`)?.classList.add("active");
  if (name === "preview") renderPreview();
}

function renderPreview() {
  const form = collectForm();
  document.querySelector("#monogram").textContent = form.name.charAt(0) || "—";
  document.querySelector("#previewName").textContent = form.name || "尚未填写名称";
  document.querySelector("#previewSummary").textContent = [form.startingLocation, form.publicIdentity, form.startingGoal].filter(Boolean).join(" · ") || "请完成必填项后确认。";
  document.querySelector("#xmlPreview").textContent = buildUserBlock();
}

function applyPreset(name) {
  const presets = {
    traveler: { publicIdentity: "赶路人", startingGoal: "赶了一整日山路，只想找个地方躲雨歇脚" },
    messenger: { publicIdentity: "寻信人", startingGoal: "寻找一名失踪的信使和他最后送出的信" },
    runaway: { publicIdentity: "避事者", startingGoal: "不愿说明来处，只想在天亮前避开追索" },
  };
  const preset = presets[name];
  if (!preset) return;
  document.querySelector("#publicIdentity").value = preset.publicIdentity;
  document.querySelector("#startingGoal").value = preset.startingGoal;
  document.querySelector("#feedback").textContent = "已载入可编辑示例，请按自己的角色修改后再确认。";
}
