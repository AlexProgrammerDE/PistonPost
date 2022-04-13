import {NextPage} from "next";
import {useSession} from "next-auth/react";
import {GlobalHead} from "../../components/GlobalHead";
import Layout from "../../components/Layout";
import {useRouter} from "next/router";
import {useEffect, useState} from "react";
import axios from "../../lib/axios";
import {PostData} from "../../components/PostCard";

const Post: NextPage = () => {
  const router = useRouter()
  const {id} = router.query

  const {data: session} = useSession()
  const [post, setPost] = useState<PostData>()

  useEffect(() => {
    if (!post && id) {
      axios.get(`/post/${id}`)
          .then(res => {
            setPost(res.data.post)
          })
    }
  }, [post, id])

  return (
      <>
        <GlobalHead/>
        <Layout>
          <div className="container h-full p-6">
            {
                post &&
                <>
                    <div className="w-full p-4 bg-base-200 rounded-box p-4 flex flex-wrap">
                        <h2 className="font-bold text-2xl">{post.title}</h2>
                      {
                        post.tags.map(tag =>
                            <span key={tag} className="badge my-auto ml-1.5 text-xl font-bold p-2">#{tag}</span>
                        )
                      }
                      {
                          post.unlisted &&
                          <span className="badge my-auto ml-1.5 text-xl font-bold p-2">Unlisted</span>
                      }
                    </div>
                    <div className="text-lg w-full p-4 bg-base-200 rounded-box mt-2">
                      {post.content}
                    </div>
                </>
            }
          </div>
        </Layout>
      </>
  )
}

// noinspection JSUnusedGlobalSymbols
export default Post
