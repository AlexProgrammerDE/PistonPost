import Link from "next/link";
import ReactTimeAgo from "react-time-ago";
import { PostResponse } from "../lib/responses";
import Image from "next/image";

export default function PostCard({ post }: { post: PostResponse }) {
  return (
    <div className="card md:card-normal card-compact m-2 md:w-96 bg-base-200 shadow-lg">
      <div className="card-body justify-between">
        <h2 className="break-text card-title place-items-start flex-col">
          <Link href={"/post/" + post.postId}>
            <a>{post.title}</a>
          </Link>
          <Link href={"/user/" + post.authorData.name}>
            <a>
              <div className="card-actions">
                <Image
                  alt={"Avatar of " + post.authorData.name}
                  className="rounded-full"
                  src={post.authorData.avatar}
                  width={22}
                  height={22}
                />
                <span className="my-auto text-sm font-semibold">
                  @{post.authorData.name}
                </span>
              </div>
            </a>
          </Link>
        </h2>

        <div className="card-actions flex-wrap justify-between">
          <span>
            <ReactTimeAgo date={post.timestamp} />
          </span>
          <div className="card-actions gap-0 flex-wrap">
            {post.tags.map((tag, index) => (
              <div key={index} className="flex flex-col justify-center">
                <Link href={"/tag/" + tag}>
                  <a className="badge badge-outline my-0.5 mx-1">#{tag}</a>
                </Link>
              </div>
            ))}
            {post.unlisted && (
              <div className="flex flex-col justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="my-auto h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <title>Unlisted</title>
                  <path
                    fillRule="evenodd"
                    d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
                    clipRule="evenodd"
                  />
                  <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
