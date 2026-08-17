# 组件 Registry/Recipe 合同

```yaml
component:
  id: status_ui_fog_harbor
  kind: frontend
  source: src/runtime/apps/status
  outputs: [src/runtime/ui/雾港状态栏.html]
  capabilities: [frontend.compiled_application, host.message_lifecycle]
  depends_on: [state_contract_fog_harbor]
  delivery: embedded
  test_fixtures: [fixtures/status-ui.json]
recipe:
  id: fog_harbor_card
  components: [world_fog_harbor, status_ui_fog_harbor]
  output: character_card_json
```

Registry、Recipe、源码和制品必须能相互追溯。缺失依赖、循环、重复输出所有权和组件级测试失败时阻止组合。
