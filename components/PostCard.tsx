import Link from "next/link";
import ReactTimeAgo from "react-time-ago";
import {PostResponse} from "../lib/responses";
import Image from "next/image";

export default function PostCard({post}: { post: PostResponse }) {
  let icon;
  switch (post.type) {
    case "TEXT":
      icon = (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 my-auto">
            <path fillRule="evenodd"
                  d="M18.97 3.659a2.25 2.25 0 00-3.182 0l-10.94 10.94a3.75 3.75 0 105.304 5.303l7.693-7.693a.75.75 0 011.06 1.06l-7.693 7.693a5.25 5.25 0 11-7.424-7.424l10.939-10.94a3.75 3.75 0 115.303 5.304L9.097 18.835l-.008.008-.007.007-.002.002-.003.002A2.25 2.25 0 015.91 15.66l7.81-7.81a.75.75 0 011.061 1.06l-7.81 7.81a.75.75 0 001.054 1.068L18.97 6.84a2.25 2.25 0 000-3.182z"
                  clipRule="evenodd"/>
          </svg>
      );
      break;
    case "IMAGES":
      icon = (
          <div className="flex flex-row">
            {post.images?.length}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
                 className="w-6 h-6 ml-1 my-auto">
              <path fillRule="evenodd"
                    d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z"
                    clipRule="evenodd"/>
            </svg>
          </div>
      );
      break;
    case "VIDEO":
      icon = (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 my-auto">
            <path
                d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z"/>
          </svg>
      );
      break;
  }

  return (
      <div className="card md:card-normal card-compact m-2 md:w-96 bg-base-200 shadow-lg">
        <div className="card-body justify-between">
          <h2 className="break-text card-title place-items-start flex-col">
            <div className="flex flex-row justify-between w-full">
              <Link href={"/post/" + post.postId}>
                <a className="mr-1">{post.title}</a>
              </Link>
              {icon}
            </div>
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

          <div className="card-actions flex-row justify-between">
            <div>
              <ReactTimeAgo date={post.timestamp}/>
            </div>
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
                      <path
                          d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/>
                    </svg>
                  </div>
              )}
            </div>
          </div>
        </div>
      </div>
  );
}
