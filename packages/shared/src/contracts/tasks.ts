export const TASK_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type TaskStatus = typeof TASK_STATUSES[number];
export type TaskDisplayStatus = TaskStatus | "OVERDUE";
export const TASK_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type TaskPriority = typeof TASK_PRIORITIES[number];

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  displayStatus: TaskDisplayStatus;
  priority: TaskPriority;
  dueAt: string | null;
  completedAt: string | null;
  assignedToUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskInput {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  dueAt?: string | null;
  assignedToUserId?: string | null;
}

export interface TasksResponse { items: Task[]; }
