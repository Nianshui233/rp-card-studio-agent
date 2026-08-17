---
name: rp-project-blueprint
description: "Private optional module for large RP project planning: total design, Core Spine, First Playable, Growth Tracks, Parking Lot, blueprint scale, and resumable NEXT handoff."
---

# RP Project Blueprint

这是项目级支援模块，不替代世界观、角色、系统、UI 或运行时 Skill，也不改变固定阶段顺序。仅当项目规模、用户要求或 Agent 判断确实需要时启用。

完整读取 `references/blueprint-contract.md` 与 `shared/contracts/module-io.md`。

## 产物

- `total-design.yaml`：项目定位、承载面、核心体验、依赖、验收和开放决定；
- `first-playable.yaml`：第一版必须真实可玩的最小闭环；
- `growth-tracks.yaml`：后续扩展路线；
- `parking-lot.yaml`：本轮不做但不能丢失的想法；
- `NEXT.md`：下一次恢复项目时只需要读取的短交接。

## 规则

- 小型项目可以保持 `direct`，不强制生成蓝图文件；
- 大世界、超重型前端、复杂 MVU 或多模块项目再选择 `single-blueprint`、`blueprint-set` 或 `program-blueprint-set`；
- First Playable 是当前版本边界，不是永久删除 Growth Tracks；
- 活动步骤只能临时细分一个真实问题，解决后关闭支线回到父步骤；
- 蓝图不能替代用户授权、当前阶段问题、Forge 验证或真实宿主验收。

输出结构化方向和交接，不自行把当前阶段切走。
