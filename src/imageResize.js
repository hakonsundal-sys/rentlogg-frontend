// Shrinks a camera photo before it is uploaded. A phone camera produces 3-8 MB per photo; the pages
// and the PDF reports never show more than ~1600 px, so on a weak signal most of that upload was
// wasted time (and, queued offline, wasted phone storage). Always safe to call: anything that goes
// wrong, or any file that would not get smaller, comes back untouched.
const MAX_SIDE = 1600;
const QUALITY = 0.82;
// Under this a photo is already small enough that re-encoding only costs quality.
const SKIP_BELOW_BYTES = 300 * 1024;

export async function prepareImage(file) {
  try {
    if (!file || !/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type || "")) return file;
    if (file.size < SKIP_BELOW_BYTES) return file;
    if (typeof createImageBitmap !== "function") return file;

    // "from-image" applies the EXIF rotation while decoding, so the result is upright without
    // the metadata (which the re-encode drops, GPS position included).
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      let blob;
      if (typeof window.OffscreenCanvas === "function") {
        const canvas = new window.OffscreenCanvas(width, height);
        canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
        blob = await canvas.convertToBlob({ type: "image/jpeg", quality: QUALITY });
      } else {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
        blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
      }

      if (!blob || blob.type !== "image/jpeg" || blob.size >= file.size) return file;
      const name = (file.name || "photo").replace(/\.[^.]*$/, "") + ".jpg";
      return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
    } finally {
      bitmap.close?.();
    }
  } catch {
    return file;
  }
}
