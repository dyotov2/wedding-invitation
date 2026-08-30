import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders a quiet private-invitation gate while a personalized link opens", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]+lang=["']en["']/i);
  assert.match(html, /<title>Ekaterina (?:&amp;|&#x26;) Dimitar \| 20 June 2027<\/title>/i);
  assert.match(html, /Ekaterina/);
  assert.match(html, /Dimitar/);
  assert.match(html, /20 · 06 · 2027/);
  assert.match(html, /Opening your private invitation/i);
  assert.match(html, /Midalidare Estate/i);
  assert.doesNotMatch(html, /invitation-code/i);
  assert.doesNotMatch(html, /Open invitation/i);
  assert.doesNotMatch(html, /<form\b/i);
});

test("rendered entry contains no starter or demonstration escape hatch", async () => {
  const response = await render();
  const html = await response.text();

  assert.equal(/codex-preview|Your site is taking shape|Codex is working/i.test(html), false);
  assert.equal(/react-loading-skeleton|_sites-preview/i.test(html), false);
  assert.equal(/ROSE27|Petrov Family|Preview with code/i.test(html), false);
});
