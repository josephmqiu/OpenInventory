import { Effect, Context, Layer } from "effect";
import { Notification } from "electron";
import type { LowStockNotification } from "./DatabaseService";

export interface NotificationServiceApi {
  readonly sendLowStockAlert: (
    notification: LowStockNotification,
  ) => Effect.Effect<void>;
}

export class NotificationService extends Context.Tag("NotificationService")<
  NotificationService,
  NotificationServiceApi
>() {}

export const NotificationServiceLive: Layer.Layer<NotificationService> =
  Layer.succeed(NotificationService, {
    sendLowStockAlert: (notification) =>
      Effect.sync(() => {
        if (Notification.isSupported()) {
          new Notification({
            title: "Low inventory alert",
            body: `${notification.itemName} (${notification.sku}) is at ${notification.currentQuantity} and has reached the reorder level of ${notification.thresholdQuantity}.`,
          }).show();
        }
      }),
  });
