import test from "node:test";
import assert from "node:assert/strict";
import {
  queueSequentialBackgroundTasks,
  runSequentialBackgroundTasks,
  type SequentialBackgroundTask,
} from "./recapBackground.ts";

test("background recap tasks run sequentially and continue after one failure", async () => {
  const events: string[] = [];
  const failures: string[] = [];
  const tasks: SequentialBackgroundTask[] = [
    {
      label: "first",
      run: async () => {
        events.push("first:start");
        await Promise.resolve();
        events.push("first:end");
      },
    },
    {
      label: "broken",
      run: async () => {
        events.push("broken:start");
        await Promise.resolve();
        throw new Error("transient recap failure");
      },
    },
    {
      label: "last",
      run: async () => {
        events.push("last:start");
        await Promise.resolve();
        events.push("last:end");
      },
    },
  ];

  await runSequentialBackgroundTasks(
    tasks,
    (task) => failures.push(task.label),
  );

  assert.deepEqual(events, [
    "first:start",
    "first:end",
    "broken:start",
    "last:start",
    "last:end",
  ]);
  assert.deepEqual(failures, ["broken"]);
});

test("queue registers one waitUntil promise and reports the queued task count", async () => {
  const events: string[] = [];
  let background: Promise<void> | null = null;
  const tasks: SequentialBackgroundTask[] = [
    {
      label: "one",
      run: async () => {
        events.push("one");
        await Promise.resolve();
      },
    },
    {
      label: "two",
      run: async () => {
        events.push("two");
        await Promise.resolve();
      },
    },
  ];

  const queued = queueSequentialBackgroundTasks(tasks, (promise) => {
    assert.equal(background, null);
    background = promise;
  });

  assert.equal(queued, 2);
  assert.ok(background);
  await background;
  assert.deepEqual(events, ["one", "two"]);
});

test("an empty recap queue does not register background work", () => {
  let registered = false;
  const queued = queueSequentialBackgroundTasks([], () => {
    registered = true;
  });
  assert.equal(queued, 0);
  assert.equal(registered, false);
});
