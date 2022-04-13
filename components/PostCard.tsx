import Link from "next/link";
import ReactTimeAgo from "react-time-ago";
import {PostData} from "../lib/responses";
import Image from "next/image";

export default function PostCard({post}: { post: PostData }) {
  return (
      <div className="card w-96 bg-base-200 shadow-lg m-2">
        <div className="card-body">
          <Link href={'/post/' + post.postId}>
            <a>
              <h2 className="card-title justify-between">
                {post.title}
                <div className="card-actions">
                  <Image alt={"Avatar of " + post.authorData.name} className="rounded-full" src={post.authorData.avatar}
                         width={22} height={22}/>
                  <span className="-ml-1 my-auto text-sm font-semibold">
                    @{post.authorData.name}
                  </span>
                </div>
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
