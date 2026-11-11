/** Case study photos the agent adds: the second public corner of R2 (see app/case-img), like newsletter pictures. */
export const CASE_IMG_PREFIX = "case-study-images";

export const CASE_IMG_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** A name we issued: a uuid and one of our extensions, nothing else. */
export const CASE_IMG_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
