// Type stub for expo-sqlite — replaced by the real package types once installed.
declare module 'expo-sqlite' {
  export interface SQLiteRunResult {
    lastInsertRowId: number | bigint;
    changes: number;
  }

  export interface SQLiteDatabase {
    execAsync(source: string): Promise<void>;
    runAsync(source: string, params?: unknown[]): Promise<SQLiteRunResult>;
    getAllAsync<T>(source: string, params?: unknown[]): Promise<T[]>;
    getFirstAsync<T>(source: string, params?: unknown[]): Promise<T | null>;
    withTransactionAsync(task: () => Promise<void>): Promise<void>;
  }

  export function openDatabaseAsync(name: string): Promise<SQLiteDatabase>;
}
