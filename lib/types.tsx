export const postType = ["TEXT", "IMAGES", "VIDEO"] as const;
export type PostType = typeof postType[number];
