import type { Task, TaskInput, TaskStatus, TasksResponse } from '@miclub/shared';
import { apiJson } from '../../api';
export const getTasks = (signal?: AbortSignal) => apiJson<TasksResponse>('/api/tasks', { cache: 'no-store', signal });
export const createTask = (input: TaskInput) => apiJson<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(input) });
export const updateTask = (task: Task, input: Partial<TaskInput>) => apiJson<Task>(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ ...input, updatedAt: task.updatedAt }) });
export const updateTaskStatus = (task: Task, status: TaskStatus) => apiJson<Task>(`/api/tasks/${task.id}/status`, { method: 'PATCH', body: JSON.stringify({ status, updatedAt: task.updatedAt }) });
export const archiveTask = (task: Task) => apiJson<Task>(`/api/tasks/${task.id}/archive`, { method: 'POST', body: JSON.stringify({ updatedAt: task.updatedAt }) });
