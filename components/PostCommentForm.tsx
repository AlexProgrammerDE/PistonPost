import { PostResponse } from "../lib/responses";
import { useRouter } from "next/router";
import Image from "next/image";
import { NewlineText } from "../lib/shared";
import axios from "../lib/axios";
import { useState } from "react";
import ReactTimeAgo from "react-time-ago";
import Link from "next/link";
import ObjectID from "bson-objectid";

export default function PostCommentForm({
  postData
}: {
  postData: PostResponse;
}) {
  const router = useRouter();
  const [content, setContent] = useState<string | null>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <div className="rounded-box mt-2 flex w-full flex-wrap bg-base-200 p-4 p-4">
        <form
          onSubmit={async (e) => {
            e.preventDefault();

            if (isLoading) {
              return;
            }
            if (!content) return;

            const formData = new FormData(e.currentTarget);

            formData.set("content", content);

            axios
              .put(`/post/${postData.postId}/comment`, formData, {
                headers: {
                  "Content-Type": "multipart/form-data"
                }
              })
              .then(() => {
                setIsLoading(false);
                setError(null);
                router.push(`/post/${postData.postId}`).then();
              })
              .catch((res) => {
                setIsLoading(false);
                setError(`${res.response.data.message}`);
              });
          }}
        >
          <div className="form-control">
            <div className="input-group">
              <input
                type="text"
                placeholder="Write a comment..."
                className="input input-bordered"
                onInput={(e) => setContent(e.currentTarget.value)}
              />
              <button type="submit" className="btn">
                Submit
              </button>
            </div>
          </div>
        </form>
      </div>
      {postData.comments.map((comment) => (
        <div
          key={comment.id}
          className="rounded-box mt-2 flex w-full flex-wrap bg-base-200 p-4 p-4"
        >
          <div className="flex flex-wrap">
            <div>
              <Link href={`/user/${comment.author.name}`}>
                <a className="avatar">
                  <Image
                    alt={`Avatar of ${comment.author.name}`}
                    className="rounded-box"
                    src={comment.author.avatar}
                    width={32}
                    height={32}
                  />
                </a>
              </Link>
            </div>
            <div className="flex flex-col ml-2">
              <Link href={`/user/${comment.author.name}`}>
                <a className="flex flex-wrap">
                  <span className="text-sm">
                    @{comment.author.name} -{" "}
                    <ReactTimeAgo
                      date={new ObjectID(comment.id).getTimestamp()}
                    />
                  </span>
                </a>
              </Link>
              <div className="mt-1 text-sm">
                <NewlineText text={comment.content} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
