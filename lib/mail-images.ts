/** Newsletter pictures: the one public corner of R2 (see app/mail-img). */
export const MAIL_IMG_PREFIX = "newsletter-images";

export const MAIL_IMG_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** A name we issued: a uuid and one of our extensions, nothing else. */
export const MAIL_IMG_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|gif|webp)$/;
