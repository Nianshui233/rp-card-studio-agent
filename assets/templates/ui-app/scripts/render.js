function renderApp() {
  const data = AppState.data || {};
  const meta = data["元信息"] || {};
  const actor = data["玩家"] || {};
  const metrics = [
    ["日期", leaf(meta["当前日期"])], ["所在", leaf(meta["所在府县"])],
    ["健康", leaf(actor["健康"])], ["目标", leaf(actor["当前目标"])],
  ];
  document.querySelector("#overviewMetrics").innerHTML = metrics.map(([key, value]) => `<div class="metric"><span>${key}</span><strong>${value}</strong></div>`).join("");
  document.querySelector("#currentSituation").textContent = leaf(meta["天下大事"], "世界正在照常运转。");
  renderCharacters(data["在场人物"] || {});
  renderEvents(data["进行中事件"] || {});
}

function renderCharacters(characters) {
  const keyword = document.querySelector("#characterSearch").value.trim();
  const entries = Object.entries(characters).filter(([name, value]) => `${name}${JSON.stringify(value)}`.includes(keyword));
  document.querySelector("#characterList").innerHTML = entries.length ? entries.map(([name, value]) => `<article class="data-card"><strong>${name}</strong><p>${leaf(value["身份"], "身份未明")} · ${leaf(value["关系"], "关系未明")}</p><button data-action="找${name}交谈">与其交谈</button></article>`).join("") : '<div class="empty">暂无匹配人物</div>';
}

function renderEvents(events) {
  const entries = Object.values(events).filter(Boolean);
  document.querySelector("#eventList").innerHTML = entries.length ? entries.map(value => `<article class="data-card"><strong>${leaf(value["名称"], "未名事件")}</strong><p>${leaf(value["阶段"], "潜伏")} · ${leaf(value["下次推进"], "等待世界推进")}</p></article>`).join("") : '<div class="empty">暂无进行中事件</div>';
}
