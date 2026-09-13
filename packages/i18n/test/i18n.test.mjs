import assert from "node:assert/strict";
import test from "node:test";

import { translate, translationKeys } from "../dist/src/index.js";

test("PT-BR and EN-US catalogs have exact key parity", () => {
  assert.deepEqual(translationKeys("pt-BR"), translationKeys("en-US"));
});

test("media messages are localized and interpolate parameters", () => {
  assert.equal(
    translate("en-US", "media.error.outputExists", { outputUri: "/tmp/out.mp4" }),
    "The output file already exists and was preserved: /tmp/out.mp4"
  );
  assert.equal(
    translate("pt-BR", "media.error.outputExists", { outputUri: "/tmp/out.mp4" }),
    "O arquivo de saída já existe e foi preservado: /tmp/out.mp4"
  );
  assert.notEqual(translate("en-US", "media.error.cancelled"), translate("pt-BR", "media.error.cancelled"));
});
