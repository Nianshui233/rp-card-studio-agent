import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import YAML from "yaml";

test("opening template exposes an explicit runtime variable bridge", async () => {
  const source = YAML.parse(await readFile("assets/templates/opening.yaml", "utf8"));
  assert.deepEqual(source.creation_bridge, {
    enabled: false,
    content_policy: "blank_user_defined",
    profile_contract: "src/user-character.yaml",
    profile_output: "user_entry_yaml_block",
    runtime_output: "initial_state_patch",
    input_fields: [],
    bindings: [],
    commit: {
      route: "none",
      marker: null,
      source_file: null,
      api_ref: null,
      worldbook_ref: null,
      entry_name: null,
      write_mode: "none",
      worldbook_readback: null,
      user_entry_write: "none",
      runtime_write: "none",
      order: ["render_outputs", "write_user_entry", "readback_user_entry", "write_runtime", "readback_runtime", "start_opening"],
      readback: "",
      failure_fallback: "",
    },
  });
});
