// Pure sequencing primitive for Edge background work. Keeping the scheduler
// free of runtime globals makes ordering and failure isolation directly
// testable without invoking the networked grade-results handler.

export type SequentialBackgroundTask = {
  label: string;
  run: () => Promise<void>;
};

export type BackgroundTaskErrorHandler = (
  task: SequentialBackgroundTask,
  error: unknown,
) => void;

export async function runSequentialBackgroundTasks(
  tasks: readonly SequentialBackgroundTask[],
  onTaskError: BackgroundTaskErrorHandler = () => {},
): Promise<void> {
  for (const task of tasks) {
    try {
      await task.run();
    } catch (error) {
      try {
        onTaskError(task, error);
      } catch {
        // Reporting must never strand the remaining recap repairs.
      }
    }
  }
}

export function queueSequentialBackgroundTasks(
  tasks: readonly SequentialBackgroundTask[],
  waitUntil: (promise: Promise<void>) => void,
  onTaskError?: BackgroundTaskErrorHandler,
): number {
  if (tasks.length === 0) return 0;
  waitUntil(runSequentialBackgroundTasks(tasks, onTaskError));
  return tasks.length;
}
