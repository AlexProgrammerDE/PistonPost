import {CustomNextPage} from "../../../components/CustomNextPage";
import {useRouter} from "next/router";
import {useEffect, useState} from "react";
import {GlobalHead} from "../../../components/GlobalHead";
import Layout from "../../../components/Layout";
import axios from "../../../lib/axios";
import {signOut} from "next-auth/react";
import {onTagInput} from "../../../lib/shared";
import LoadingView from "../../../components/LoadingView";
import {PostResponse} from "../../../lib/responses";

const PostEdit: CustomNextPage = () => {
  const router = useRouter();
  const [tags, setTags] = useState<string[]>([]);
  const [title, setTitle] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {id} = router.query
  const [post, setPost] = useState<PostResponse>()

  useEffect(() => {
    if (id && router) {
      axios.get(`/post/${id}`)
          .then(res => {
            const post: PostResponse = res.data;

            setTags(post.tags);
            setTitle(post.title);
            setContent(post.content);
            setPost(post);
          })
          .catch(err => {
            console.error(err)
            router.push('/').then()
          })
    }
  }, [id, router])

  if (id && post) {
    const deletePost = () => {
      axios.delete(`/post/${id}`).then(() => {
        router.push('/').then()
      });
    }

    return (
        <>
          <GlobalHead/>
          <Layout>
            <main className="container min-h-screen p-2">
              <h1 className="font-bold text-2xl">Edit Post</h1>
              {error &&
                  <div className="my-3 alert alert-error shadow-lg">
                      <div>
                          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current flex-shrink-0 h-6 w-6"
                               fill="none"
                               viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                    d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                          </svg>
                          <span>{error}</span>
                      </div>
                  </div>
              }
              <form onSubmit={async (e) => {
                e.preventDefault();

                if (isLoading) {
                  return;
                }

                const formData = new FormData(e.currentTarget);

                formData.set('title', title)
                formData.set('content', content)
                formData.set('tags', tags.join(','))

                setIsLoading(true);
                axios.put(`/post/${id}`, formData, {
                  headers: {
                    'Content-Type': 'multipart/form-data'
                  }
                }).then((res) => {
                  setIsLoading(false);
                  setError(null);
                  router.push('/post/[id]', `/post/${id}`)
                }).catch((res) => {
                  setIsLoading(false);
                  setError(`${res.response.data.message}`)
                })
              }}>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Title</span>
                  </label>
                  <input type="text"
                         onInput={(e) => setTitle(e.currentTarget.value)}
                         required
                         maxLength={100}
                         defaultValue={title}
                         placeholder="The worst puns on the internet"
                         className="input input-bordered"/>
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Content</span>
                  </label>
                  <textarea className="textarea textarea-bordered h-24"
                            onInput={(e) => setContent(e.currentTarget.value)}
                            required
                            maxLength={1000}
                            defaultValue={content}
                            placeholder="Today I drank a bottle of water... A bo'oh'o'wa'er"></textarea>
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Tags</span>
                  </label>
                  <label className={tags.length > 0 ? "md:input-group" : ""}>
                    {
                      tags.map(tag => <button onClick={() => setTags(tags.filter(tag2 => tag2 !== tag))} key={tag}
                                              className="normal-case btn hover:btn-error duration-500 mb-1 md:mb-0">#{tag}</button>)
                    }
                    <input type="text"
                           placeholder="Comedy"
                           maxLength={20}
                           onKeyDown={e => onTagInput(e, setTags, tags)}
                           className="input input-bordered"/>
                  </label>
                  <label className="label">
                    <span className="label-text-alt">Press enter do add a tag (5 max)</span>
                  </label>
                </div>

                {
                  isLoading ?
                      <button className="btn btn-primary mt-6 loading">Edit</button>
                      :
                      <input type="submit" className="btn btn-primary mt-6" value="Edit"/>
                }
              </form>
              <label htmlFor="delete-modal" className="btn btn-error modal-button mt-6">Delete Post</label>
              <input type="checkbox" id="delete-modal" className="modal-toggle"/>
              <div className="modal" id="delete-modal">
                <div className="modal-box">
                  <h3 className="font-bold text-lg">Do you really want to delete this post?</h3>
                  <p className="py-4">This action will delete the entire post and all comments.</p>
                  <div className="modal-action">
                    <label htmlFor="delete-modal" className="btn btn-primary">NO</label>
                    <label onClick={deletePost} htmlFor="delete-modal" className="btn btn-error">YES</label>
                  </div>
                </div>
              </div>
            </main>
          </Layout>
        </>
    )
  } else {
    return <LoadingView/>
  }
}

PostEdit.auth = true

// noinspection JSUnusedGlobalSymbols
export default PostEdit
