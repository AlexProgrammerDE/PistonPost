import { GlobalHead } from "../../components/GlobalHead";
import Layout from "../../components/Layout";
import { CustomNextPage } from "../../components/CustomNextPage";
import { useState } from "react";
import axios from "../../lib/axios";
import { useRouter } from "next/router";
import { onTagInput } from "../../lib/shared";

const Post: CustomNextPage = () => {
  const router = useRouter();
  const [tags, setTags] = useState<string[]>([]);
  const [title, setTitle] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [unlisted, setUnlisted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <GlobalHead />
      <Layout>
        <main className="container min-h-screen p-2">
          <h1 className="text-2xl font-bold">Create Post</h1>
          {error && (
            <div className="alert alert-error my-3 shadow-lg">
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
            onSubmit={async (e) => {
              e.preventDefault();

              if (isLoading) {
                return;
              }

              const formData = new FormData(e.currentTarget);

              formData.set("title", title);
              formData.set("content", content);
              formData.set("tags", tags.join(","));
              formData.set("unlisted", unlisted ? "true" : "false");

              setIsLoading(true);
              axios
                .put("/post", formData, {
                  headers: {
                    "Content-Type": "multipart/form-data"
                  }
                })
                .then((res) => {
                  setIsLoading(false);
                  setError(null);
                  router.push("/post/[id]", `/post/${res.data.postId}`);
                })
                .catch((res) => {
                  setIsLoading(false);
                  setError(`${res.response.data.message}`);
                });
            }}
          >
            <div className="form-control">
              <label className="label">
                <span className="label-text">Title</span>
              </label>
              <input
                type="text"
                onInput={(e) => setTitle(e.currentTarget.value)}
                required
                maxLength={100}
                placeholder="The worst puns on the internet"
                className="input input-bordered"
              />
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">Content</span>
              </label>
              <textarea
                className="textarea textarea-bordered h-24"
                onInput={(e) => setContent(e.currentTarget.value)}
                required
                maxLength={1000}
                placeholder="Today I drank a bottle of water... A bo'oh'o'wa'er"
              ></textarea>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">Tags</span>
              </label>
              <label className={tags.length > 0 ? "md:input-group" : ""}>
                {tags.map((tag) => (
                  <button
                    onClick={() => setTags(tags.filter((tag2) => tag2 !== tag))}
                    key={tag}
                    className="btn mb-1 normal-case duration-500 hover:btn-error md:mb-0"
                  >
                    #{tag}
                  </button>
                ))}
                <input
                  type="text"
                  placeholder="Comedy"
                  maxLength={20}
                  onKeyDown={(e) => onTagInput(e, setTags, tags)}
                  className="input input-bordered"
                />
              </label>
              <label className="label">
                <span className="label-text-alt">
                  Press enter do add a tag (5 max)
                </span>
              </label>
            </div>

            <div className="form-control">
              <label className="label max-w-[12rem] cursor-pointer">
                <span className="label-text">Unlisted</span>
                <input
                  type="checkbox"
                  onChange={(e) => setUnlisted(e.currentTarget.checked)}
                  className="checkbox checkbox-primary"
                />
              </label>
            </div>

            {isLoading ? (
              <button className="btn loading btn-primary mt-6">Submit</button>
            ) : (
              <input
                type="submit"
                className="btn btn-primary mt-6"
                value="Submit"
              />
            )}
          </form>
        </main>
      </Layout>
    </>
  );
};

Post.auth = true;

// noinspection JSUnusedGlobalSymbols
export default Post;
