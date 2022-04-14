export interface PostData {
  postId: string;
  title: string;
  content: string;
  authorData: UserData;
  tags: string[];
  timestamp: number;
  unlisted: boolean;
}

export interface AccountSettings {
  name: string;
  email: string;
  settings: {
    emailNotifications?: boolean;
    bio?: string;
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
  }
}
