document.addEventListener("click", event => {
  const view = event.target.closest("[data-view]")?.dataset.view;
  const next = event.target.closest("[data-next]")?.dataset.next;
  const back = event.target.closest("[data-back]")?.dataset.back;
  const preset = event.target.closest("[data-preset]")?.dataset.preset;
  if (view) showView(view);
  if (next) showView(next);
  if (back) showView(back);
  if (preset) applyPreset(preset);
});

document.querySelector("#confirm").addEventListener("click", async () => {
  const feedback = document.querySelector("#feedback");
  const form = collectForm();
  if (!form.name || !form.startingLocation) {
    feedback.className = "feedback";
    feedback.textContent = "请先填写名称并选择入住房间。";
    showView("register");
    return;
  }
  const text = buildUserBlock();
  const result = await Host.writeInput(text);
  feedback.className = `feedback ${result.ok ? "success" : ""}`;
  feedback.textContent = result.ok ? "主控设定块已写入酒馆输入框，请检查后发送。" : result.route === "clipboard" ? "无法直接访问输入框，设定块已复制，请粘贴发送。" : `无法自动写入，请手动复制上方设定块。`;
});
