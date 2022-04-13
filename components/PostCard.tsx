import Link from "next/link";
import ReactTimeAgo from "react-time-ago";

export interface PostData {
  id: string;
  postId: string;
  title: string;
  content: string;
  author: string;
  tags: string[];
  timestamp: number;
  unlisted: boolean;
}

export default function PostCard({post}: { post: PostData }) {
  return (
      <div className="card w-96 bg-base-200 shadow-lg m-2">
        <div className="card-body">
          <Link href={'/post/' + post.postId}>
            <a>
              <h2 className="card-title">
                {post.title}
              </h2>
            </a>
          </Link>

          <div className="card-actions justify-between">
            <span><span><ReactTimeAgo date={post.timestamp}/></span></span>
            <div className="card-actions">
              {post.tags.map((tag, index) => (
                  <Link href={'/tag/' + tag} key={index}>
                    <a className="my-auto badge badge-outline">
                      {tag}
                    </a>
                  </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
  )
}
