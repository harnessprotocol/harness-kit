/** Maps taskId → LangGraph thread config for checkpoint resume */
const threads = new Map();
export function getThreadConfig(projectSlug, taskId) {
    const existing = threads.get(taskId);
    if (existing)
        return existing;
    const config = {
        configurable: { thread_id: `${projectSlug}:${taskId}` },
    };
    threads.set(taskId, config);
    return config;
}
export function clearThread(taskId) {
    threads.delete(taskId);
}
// Track running aborts so we can cancel
const abortControllers = new Map();
export function getAbort(taskId) {
    const ac = new AbortController();
    abortControllers.set(taskId, ac);
    return ac;
}
export function cancelTask(taskId) {
    abortControllers.get(taskId)?.abort();
    abortControllers.delete(taskId);
}
export function isRunning(taskId) {
    return abortControllers.has(taskId);
}
