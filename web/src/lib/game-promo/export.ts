import { fetchAuthenticatedImageBlob } from "@/lib/authenticated-image";
import { cropGeometry, type Crop } from "./core";
export async function loadPromoImage(source: string) {
  const blob = await fetchAuthenticatedImageBlob(source);
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally { URL.revokeObjectURL(url); }
}
export function drawPromoCrop(canvas: HTMLCanvasElement, image: HTMLImageElement, width: number, height: number, crop: Crop) {
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持 Canvas");
  const geometry = cropGeometry(image.naturalWidth, image.naturalHeight, width, height, crop);
  context.fillStyle = "#fff"; context.fillRect(0, 0, width, height);
  context.drawImage(image, geometry.x, geometry.y, geometry.width, geometry.height, 0, 0, width, height);
}
export async function exportPromoCrop(source: string, width: number, height: number, crop: Crop, format: "png" | "jpeg") {
  const image = await loadPromoImage(source);
  const canvas = document.createElement("canvas");
  drawPromoCrop(canvas, image, width, height, crop);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片导出失败")), `image/${format}`, 0.95));
}
export function downloadPromoBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function fileDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}
