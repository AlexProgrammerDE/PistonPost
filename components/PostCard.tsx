import Link from "next/link";
import ReactTimeAgo from "react-time-ago";
import {PostData} from "../lib/responses";
import Image from "next/image";

export default function PostCard({post}: { post: PostData }) {
  return (
      <div className="card w-96 bg-base-200 shadow-lg m-2">
        <div className="card-body justify-between">
          <Link href={'/post/' + post.postId}>
            <a>
              <h2 className="card-title justify-between break-text">
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
            <span><ReactTimeAgo date={post.timestamp}/></span>
            <div className="card-actions">
              {post.tags.map((tag, index) => (
                  <div key={index} className="flex flex-col justify-center">
                    <Link href={'/tag/' + tag}>
                      <a className="my-auto badge badge-outline">
                        #{tag}
                      </a>
                    </Link>
                  </div>
              ))}
              {
                  post.unlisted &&
                  <div className="flex flex-col justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 my-auto" viewBox="0 0 20 20"
                           fill="currentColor">
                          <title>Unlisted</title>
                          <path fillRule="evenodd"
                                d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
                                clipRule="evenodd"/>
                      </svg>
                  </div>
              }
            </div>
          </div>
        </div>
      </div>
  )
}
