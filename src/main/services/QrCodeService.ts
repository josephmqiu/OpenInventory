import { Effect, Context, Layer } from "effect";
import QRCode from "qrcode";
import { DatabaseError, type AppError } from "../domain/errors";

export interface QrCodeServiceApi {
  readonly generateDataUrl: (
    text: string,
  ) => Effect.Effect<string, AppError>;
}

export class QrCodeService extends Context.Tag("QrCodeService")<
  QrCodeService,
  QrCodeServiceApi
>() {}

export const QrCodeServiceLive: Layer.Layer<QrCodeService> = Layer.succeed(
  QrCodeService,
  {
    generateDataUrl: (text: string) =>
      Effect.tryPromise({
        try: () =>
          QRCode.toDataURL(text, {
            errorCorrectionLevel: "M",
            margin: 4,
            scale: 8,
          }),
        catch: (e) => new DatabaseError({ message: `QR generation failed: ${e}` }),
      }),
  },
);
