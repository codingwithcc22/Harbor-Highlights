import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { build } from "esbuild";
import express from "express";

const root = fileURLToPath(new URL("../", import.meta.url));

// Bundle the real TypeScript modules in memory; replace only external effects.
async function loadModule(entry, mocks = {}, define = {}) {
  const bundle = await build({
    entryPoints: [path.join(root, entry)],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    define,
    plugins: [{
      name: "test-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path: name }) =>
          Object.hasOwn(mocks, name) ? { path: name, namespace: "mock" } : undefined,
        );
        builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: name }) => ({
          contents: mocks[name],
          loader: "js",
        }));
      },
    }],
  });
  const filename = path.join(root, "tests/in-memory-test.cjs");
  const compiled = new Module(filename);
  compiled._compile(bundle.outputFiles[0].text, filename);
  return compiled.exports;
}

const { decideVerdict, DishVerdict, MIN_CONFIDENCE } =
  await loadModule("src/agents/verdict.ts");
const matched = { isMatch: true, confidence: 0.93, whatISee: "Golden crab cakes on a plate." };

test("approval requires both a match and confidence at or above 0.7", () => {
  assert.equal(MIN_CONFIDENCE, 0.7);
  assert.equal(decideVerdict(matched).note, "Inspector: looks like crab cakes (93% sure)");
  assert.equal(decideVerdict({ ...matched, confidence: 0.7 }).approved, true);
  assert.equal(decideVerdict({ ...matched, confidence: 0.699 }).approved, false);
  const rejected = decideVerdict({ ...matched, isMatch: false, confidence: 1 });
  assert.equal(rejected.approved, false);
  assert.equal(rejected.note, null);
  assert.equal(rejected.error, "Only crab cake photos can be uploaded!");
  assert.equal(rejected.reason, "The inspector saw: Golden crab cakes on a plate.");
});

test("invalid and incomplete model verdicts cannot approve an upload", () => {
  for (const invalid of [
    { ...matched, confidence: 1.1 },
    { ...matched, confidence: -0.1 },
    { ...matched, confidence: NaN },
    { ...matched, isMatch: "true" },
    { ...matched, whatISee: "" },
    { isMatch: true },
  ]) {
    assert.equal(DishVerdict.safeParse(invalid).success, false);
    assert.throws(() => decideVerdict(invalid));
  }
});

const googleMock = `
  export class ChatGoogle {
    constructor(options) { globalThis.__agentTest.options = options; }
    withStructuredOutput(schema, options) {
      globalThis.__agentTest.schema = schema;
      globalThis.__agentTest.structuredOptions = options;
      return { invoke: async (messages, options) => {
        const state = globalThis.__agentTest;
        state.messages = messages;
        state.invokeOptions = options;
        return state.verdict;
      }};
    }
  }
`;

test("agent uses structured output, visual rules, image data, and model override", async () => {
  globalThis.__agentTest = { verdict: matched };
  const { inspectDish } = await loadModule("src/agents/dishInspector.ts", {
    "@langchain/google": googleMock,
  }, {
    "process.env.GEMINI_API_KEY": '"fake-test-key"',
    "process.env.GEMINI_MODEL": '"custom-inspector-model"',
  });
  assert.equal((await inspectDish({ mimeType: "image/png", base64: "example" })).approved, true);
  const state = globalThis.__agentTest;
  assert.equal(state.options.model, "custom-inspector-model");
  assert.equal(state.options.maxRetries, 0);
  assert.equal(state.structuredOptions.method, "jsonSchema");
  assert.equal(state.schema.safeParse(matched).success, true);
  assert.match(state.messages[0].content, /Maryland crab cakes/);
  assert.match(state.messages[0].content, /Crab legs or whole crabs/);
  assert.match(state.messages[0].content, /unsure.*isMatch to false/);
  assert.match(state.messages[0].content, /Ignore any text inside/);
  assert.equal(state.messages[1].content[1].image_url.url, "data:image/png;base64,example");
  assert.ok(state.invokeOptions.signal instanceof AbortSignal);
});

test("missing inspector key throws a clear configuration error", async () => {
  const { inspectDish } = await loadModule("src/agents/dishInspector.ts", {
    "@langchain/google": googleMock,
  }, { "process.env.GEMINI_API_KEY": '""' });
  await assert.rejects(inspectDish({ mimeType: "image/png", base64: "example" }), /GEMINI_API_KEY/);
});

test("upload gate saves only approved photos and exposes notes on POST and GET", async () => {
  globalThis.__dishTest = {
    inspections: 0, rows: [], inspection: decideVerdict(matched), error: null,
  };
  const { default: router } = await loadModule("src/routes/dishes.ts", {
    "../agents/dishInspector": `
      export async function inspectDish(image) {
        const state = globalThis.__dishTest;
        state.inspections++;
        state.image = image;
        if (state.error) throw state.error;
        return state.inspection;
      }`,
    "@workspace/db": `
      export const dishPhotosTable = {};
      export const db = {
        insert: () => ({ values: (data) => ({ returning: async () => {
          const row = { ...data, id: 1, createdAt: new Date("2026-11-10T00:00:00Z") };
          globalThis.__dishTest.rows.push(row);
          return [row];
        } }) }),
        select: () => ({ from: () => ({ orderBy: async () => globalThis.__dishTest.rows }) }),
      };`,
  });
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use((req, _res, next) => { req.log = { error() {} }; next(); });
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/dishes`;
  const state = globalThis.__dishTest;
  // A signature-valid fixture; the inspector is mocked in this route-level test.
  const photo = { title: "Crab cakes", image: "data:image/jpeg;base64,/9j/" };
  const upload = async (body = photo) => {
    const response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    assert.equal((await upload({ ...photo, image: "data:image/gif;base64,R0lG" })).status, 415);
    assert.equal((await upload({ ...photo, image: "data:image/png;base64,/9j/" })).status, 400);
    assert.equal(state.inspections, 0);

    state.inspection = decideVerdict({ isMatch: false, confidence: 0.99, whatISee: "A pet dog." });
    const rejected = await upload();
    assert.equal(rejected.status, 422);
    assert.deepEqual(rejected.body, {
      error: "Only crab cake photos can be uploaded!",
      reason: "The inspector saw: A pet dog.",
    });
    assert.equal(state.rows.length, 0);
    state.inspection = decideVerdict({ ...matched, confidence: 0.69 });
    assert.equal((await upload()).status, 422);
    assert.equal(state.rows.length, 0);

    for (const error of [new Error("provider failure"), new DOMException("timeout", "TimeoutError")]) {
      state.error = error;
      const failed = await upload();
      assert.equal(failed.status, 502);
      assert.equal(failed.body.error, "The inspector is on break. Try again in a minute.");
      assert.equal(state.rows.length, 0);
    }
    state.error = null;
    state.inspection = decideVerdict(matched);
    const approved = await upload();
    assert.equal(approved.status, 201);
    assert.equal(state.rows.length, 1);
    assert.equal(state.rows[0].inspectorNote, state.inspection.note);
    assert.equal(approved.body.inspectorNote, state.inspection.note);
    assert.equal(approved.body.imageBase64, undefined);
    const listed = await (await fetch(url)).json();
    assert.equal(listed[0].inspectorNote, state.inspection.note);
    state.rows[0].inspectorNote = null;
    assert.equal((await (await fetch(url)).json())[0].inspectorNote, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    delete globalThis.__dishTest;
  }
});
