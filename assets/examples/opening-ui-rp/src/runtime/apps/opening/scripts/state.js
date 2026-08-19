const AppState = {
  currentView: "guide",
  form: { name: "", publicIdentity: "", startingLocation: "", startingGoal: "" },
};

function escapeXml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function collectForm() {
  AppState.form = {
    name: document.querySelector("#name").value.trim(),
    publicIdentity: document.querySelector("#publicIdentity").value.trim(),
    startingLocation: document.querySelector("#startingLocation").value,
    startingGoal: document.querySelector("#startingGoal").value.trim(),
  };
  return AppState.form;
}

function buildUserBlock() {
  const form = collectForm();
  const staticProfile = `<user>\nprofile:\n  name: ${escapeXml(form.name)}\n  identity:\n    public: ${escapeXml(form.publicIdentity)}\n</user>`;
  const runtimePatch = `<雨幕动态开局>\n主控:\n  当前位置: ${escapeXml(form.startingLocation)}\n  当前目标: ${escapeXml(form.startingGoal)}\n</雨幕动态开局>`;
  return `${staticProfile}\n\n${runtimePatch}`;
}
