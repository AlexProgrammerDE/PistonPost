export const postType = ["text", "images", "video"] as const;
export type PostType = typeof postType[number];
