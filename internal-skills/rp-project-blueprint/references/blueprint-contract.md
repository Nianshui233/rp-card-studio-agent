# 蓝图与 First Playable 合同

## 四类范围

```text
Core Spine       项目没有它就不成立的本体
First Playable   当前版本必须真实可用/可玩的最小闭环
Growth Tracks    后续可以加入的扩展
Parking Lot      本轮不做但必须保留的想法
```

## 蓝图模式

```yaml
blueprint:
  mode: direct | single_blueprint | blueprint_set | program_blueprint_set
  total_design: design/total-design.yaml
  first_playable: design/first-playable.yaml
  growth_tracks: design/growth-tracks.yaml
  parking_lot: design/parking-lot.yaml
  next: NEXT.md
```

`direct` 不生成空壳蓝图。其他模式必须有入口、当前目标、范围、依赖、失败路径、验收证据和下一步。

## 设计确认

设计文件可以记录用户选择、AI 放权决定、待决定和否决项，但不把“用户还没确认”伪装成已锁定。完全放权时由主 Agent 决定、说明理由、写入账本并锁定。

## 执行边界

“按蓝图执行”只表示按已冻结的 First Playable 工作。运行中发现真实阻塞可以开一个临时 refinement；修复或确认阻塞后关闭，不把临时问题永久变成新的蓝图树。
