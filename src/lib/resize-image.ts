// Ridimensiona nel browser le foto della copertina prima dell'invio (le foto dell'iPhone pesano 3–5 MB).

const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.85;

export async function resizeImageFile(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  return blob ? new File([blob], "copertina.jpg", { type: "image/jpeg" }) : file;
}
