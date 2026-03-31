import { Effect, Context, Layer } from "effect";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { IoError, type AppError } from "../domain/errors";

export interface BackupServiceApi {
  readonly backupDatabase: (
    sourcePath: string,
    targetDir: string,
  ) => Effect.Effect<string, AppError>;
}

export class BackupService extends Context.Tag("BackupService")<
  BackupService,
  BackupServiceApi
>() {}

export const BackupServiceLive: Layer.Layer<BackupService> = Layer.succeed(
  BackupService,
  {
    backupDatabase: (sourcePath: string, targetDir: string) =>
      Effect.tryPromise({
        try: async () => {
          fs.mkdirSync(targetDir, { recursive: true });

          const timestamp = new Date()
            .toISOString()
            .replace(/[:.]/g, "-")
            .replace("T", "_")
            .slice(0, 19);
          const backupFile = path.join(
            targetDir,
            `inventory-monitor-${timestamp}.db`,
          );

          const source = new Database(sourcePath, { readonly: true });
          await source.backup(backupFile);
          source.close();

          return backupFile;
        },
        catch: (e) => new IoError({ message: `Backup failed: ${e}` }),
      }),
  },
);
