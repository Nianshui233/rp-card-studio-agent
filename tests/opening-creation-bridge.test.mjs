import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import YAML from "yaml";

test("opening template exposes an explicit runtime variable bridge", async () => {
  const source = YAML.parse(await readFile("assets/templates/opening.yaml", "utf8"));
  assert.deepEqual(source.creation_bridge, {
    enabled: false,
    input_fields: [],
    bindings: [],
    commit: {
      route: "none",
      marker: null,
      source_file: null,
      api_ref: null,
      readback: "",
      failure_fallback: "",
    },
  });
});
