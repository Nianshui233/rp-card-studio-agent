# 项目账本合同

`project.yaml` 是人类可读的 Agent 语义账本；`.rp-card-state.json` 是 Forge 的技术镜像。所有私有 Skill 都接收二者的受限视图，不自行保存另一套项目状态。

## 语义账本

`project.yaml` 记录：

- 项目身份、操作类型、工作区和生命周期；
- 首轮预检和可调整阶段计划；
- Agent 架构、当前路由和写入边界；
- 材料、运行依赖与交付物；
- 已锁定语义决定及历史；
- 跨阶段交接；
- 维护源码清单。

## 技术镜像

`.rp-card-state.json` 记录：

- 修订号与当前阶段；
- 阶段状态、轮次和总汇；
- 语义决定锁的哈希；
- 生效中的完全放权范围；
- 脏源码、构建、验证和事务。

凡 Forge 已提供命令的阶段、计划、决定和交接操作，优先通过 Forge 完成。直接编辑后必须先验证，不能带着可能分叉的账本继续创作。

## Skill 调度视图

每次调度计算：

```yaml
scope:
  active_stage: worldbuilding
  active_skill: rp-project-foundation
  writable_stage: worldbuilding
  readable_stages:
    - preflight
    - positioning
    - materials
    - worldbuilding
```

可读阶段包括当前阶段，以及状态为 `complete` 或 `skipped` 的上游阶段。Skill 可以为诊断查看下游草稿，但不能把下游草稿当作锁定事实。

## 防止双脑

不得只依据聊天记忆恢复项目。聊天里存在、账本里缺失的决定，必须先报告并记录。语义账本与技术镜像不一致时，暂停受影响写入，检查最近成功事务并通过 Forge 修复。
