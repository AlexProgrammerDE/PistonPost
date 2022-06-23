import { GlobalHead } from "../../components/GlobalHead";
import Layout from "../../components/Layout";
import { CustomNextPage } from "../../components/CustomNextPage";
import { useState } from "react";
import axios from "../../lib/axios";
import { useRouter } from "next/router";
import { onTagInput } from "../../lib/shared";
import { postType, PostType } from "../../lib/types";

function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

const Post: CustomNextPage = () => {
  const router = useRouter();
  const [tags, setTags] = useState<string[]>([]);
  const [title, setTitle] = useState<string>("");
  const [postSetting, setPostSetting] = useState<PostType>("text");
  const [content, setContent] = useState<string>("");
  const [fileList, setFileList] = useState<FileList | null>();
  const [unlisted, setUnlisted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <GlobalHead />
      <Layout>
        <main className="container flex-grow p-2">
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
                <span className="label-text">Post type</span>
              </label>
              <select
                className="select select-bordered w-full max-w-xs"
                defaultValue={postSetting}
                onChange={(e) =>
                  setPostSetting(e.currentTarget.value as PostType)
                }
              >
                {postType.map((type, index) => (
                  <option key={index} value={type}>
                    {capitalizeFirstLetter(type)}
                  </option>
                ))}
              </select>
            </div>

            {postSetting === "text" && (
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
            )}
            {postSetting === "image" && (
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Images</span>
                  <span className="label-text-alt">(20 max)</span>
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onInput={(e) => setFileList(e.currentTarget.files)}
                  required
                  max={20}
                ></input>
              </div>
            )}
            <div className="flex items-center justify-center w-full">
              <label
                htmlFor="dropzone-file"
                className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:hover:bg-bray-800 dark:bg-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:bg-gray-600"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <svg
                    className="w-10 h-10 mb-3 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    ></path>
                  </svg>
                  <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                    <span className="font-semibold">Click to upload</span> or
                    drag and drop
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    SVG, PNG, JPG or GIF (MAX. 800x400px)
                  </p>
                </div>
                <input id="dropzone-file" type="file" className="hidden" />
              </label>
            </div>
            {postSetting === "video" && (
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Video</span>
                </label>
                <input
                  type="file"
                  accept="video/*"
                  onInput={(e) => setFileList(e.currentTarget.files)}
                  required
                ></input>
              </div>
            )}

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
