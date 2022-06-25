import { PostType } from "./types";

export interface PostResponse {
  postId: string;
  title: string;
  type: PostType;
  content?: string;
  images?: ImageResponse[];
  video?: VideoResponse;
  authorData: UserData;
  tags: string[];
  timestamp: number;
  unlisted: boolean;
}

export interface ImageResponse {
  id: string;
  extension: string;
  width: number;
  height: number;
}

export interface VideoResponse {
  id: string;
  extension: string;
  thumbnailId: string;
}

export interface AccountSettings {
  name: string;
  email: string;
  settings: {
    emailNotifications?: boolean;
    bio?: string;
    website?: string;
    location?: string;
    theme?: string;
  } | null;
}

export interface UserData {
  id: string;
  name: string;
  avatar: string;
  roles: string[];
}

export interface HealthResponse {
  [key: string]: {
    healthy: boolean;
    message: string;
    duration: number;
    timestamp: string;
  };
}

export interface UserPageResponse {
  id: string;
  name: string;
  avatar: string;
  roles?: string[];
  bio?: string;
  website?: string;
  location?: string;
  posts: PostResponse[];
}
