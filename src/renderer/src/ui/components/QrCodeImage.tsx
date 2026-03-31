import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface QrCodeImageProps {
  /** The URL or text to encode in the QR code. */
  text: string;
  alt: string;
  size?: number;
}

/**
 * Renders a QR code image from a URL string.
 * Generates the data URL client-side using the qrcode library.
 */
export function QrCodeImage({ text, alt, size = 200 }: QrCodeImageProps) {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    if (!text) {
      setDataUrl("");
      return;
    }

    let cancelled = false;
    QRCode.toDataURL(text, {
      errorCorrectionLevel: "M",
      margin: 4,
      width: size,
    }).then((url) => {
      if (!cancelled) setDataUrl(url);
    });

    return () => {
      cancelled = true;
    };
  }, [text, size]);

  if (!dataUrl) return null;

  return <img alt={alt} src={dataUrl} />;
}
