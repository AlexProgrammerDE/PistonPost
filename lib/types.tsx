export const postType = ["text", "image", "video"] as const;
export type PostType = typeof postType[number];
