declare module "pg" {
  export class Pool {
    constructor(config?: Record<string, unknown>);
    query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
    end(): Promise<void>;
  }
}
