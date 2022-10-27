import { PostResponse } from "lib/responses";
import { useRouter } from "next/router";
import Image from "next/image";
import { NewlineText } from "lib/shared";
import axios from "lib/axios";
import { useContext, useRef, useState } from "react";
import ReactTimeAgo from "react-time-ago";
import Link from "next/link";
import ObjectID from "bson-objectid";
import { BadgeIcon } from "./roles";
import { UserDataContext } from "./UserDataProvider";

export default function PostCommentForm({
  postData
}: {
  postData: PostResponse;
}) {
  const router = useRouter();
  const [content, setContent] = useState<string | null>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useContext(UserDataContext);
  const inputEl = useRef<HTMLInputElement>(null);

  return <>
    <div className="rounded-box mt-2 flex w-full flex-wrap bg-base-200 p-4 p-4">
      {error && (
        <div className="alert alert-error mb-3 shadow-lg">
          <div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 flex-shrink-0 stroke-current"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      )}
      <form
        className="w-full"
        onSubmit={async (e) => {
          e.preventDefault();

          if (isLoading) {
            return;
          }
          if (!content) return;

          const formData = new FormData(e.currentTarget);

          formData.set("content", content);
          inputEl.current!.value = "";
          setContent("");

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
              placeholder={
                user ? "Write a comment..." : "Log in to write a comment!"
              }
              className="input input-bordered rounded-box w-full max-w-lg"
              maxLength={250}
              required
              disabled={!user}
              ref={inputEl}
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
            <Link href={`/user/${comment.author.name}`} className="avatar">

              <Image
                alt={`Avatar of ${comment.author.name}`}
                className="rounded-box"
                src={comment.author.avatar}
                width={32}
                height={32}
              />

            </Link>
          </div>
          <div className="ml-2 flex flex-col">
            <div className="flex flex-wrap">
              <Link href={`/user/${comment.author.name}`}>

                <span className="text-sm">
                  @{comment.author.name} -{" "}
                  <ReactTimeAgo
                    date={new ObjectID(comment.id).getTimestamp()}
                  />
                </span>

              </Link>
              {comment.author.id === postData.authorData.id && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="my-auto ml-0.5 h-4 w-4 text-lg font-bold text-secondary"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <title>Original Poster</title>
                  <path
                    fillRule="evenodd"
                    d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              {comment.author.roles &&
                comment.author.roles.map((role, index) => (
                  <BadgeIcon
                    key={index}
                    role={role}
                    classNameBig="h-5 w-5 ml-0.5"
                    classNameSmall="h-4 w-4 ml-0.5"
                  />
                ))}
              {user && comment.author.id === user.id && (
                <button
                  className="flex"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Are you sure you want to delete this comment?"
                      )
                    ) {
                      axios
                        .delete(
                          `/post/${postData.postId}/comment/${comment.id}`
                        )
                        .then(() => {
                          router.push(`/post/${postData.postId}`).then();
                        })
                        .catch((res) => {
                          setError(`${res.response.data.message}`);
                        });
                    }
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="my-auto ml-0.5 h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <title>Delete Comment</title>
                    <path
                      fillRule="evenodd"
                      d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              )}
            </div>
            <div className="mt-1 text-sm">
              <NewlineText text={comment.content} />
            </div>
          </div>
        </div>
      </div>
    ))}
  </>;
}
