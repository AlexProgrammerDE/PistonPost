import {NextPage} from "next";
import {GlobalHead} from "../../components/GlobalHead";
import Layout from "../../components/Layout";
import {useRouter} from "next/router";
import {useEffect, useState} from "react";
import axios from "../../lib/axios";
import LoadingView from "../../components/LoadingView";
import PostCard from "../../components/PostCard";
import {PostResponse} from "../../lib/responses";

const Post: NextPage = () => {
  const router = useRouter()
  const {id} = router.query
  const [posts, setPosts] = useState<PostResponse[]>()

  useEffect(() => {
    if (id) {
      axios.get(`/tag/${id}`)
          .then(res => {
            setPosts(res.data)
          })
    }
  }, [id])

  if (posts) {
    return (
        <>
          <GlobalHead/>
          <Layout>
            <div className="p-6 container min-h-screen">
              <h1 className="text-2xl font-bold">Showing posts tagged with &quot;{id}&quot;</h1>
              {
                posts.length > 0 ?
                    <div className="w-full h-full flex flex-wrap justify-center">
                      {
                        posts.map((post, index) => (
                            <div key={index}>
                              <PostCard post={post} />
                            </div>
                        ))
                      }
                    </div>
                    :
                    <div className="w-full h-full flex justify-center">
                      <h3 className="m-auto text-3xl font-bold">No posts with this tag found... :(</h3>
                    </div>
              }
            </div>
          </Layout>
        </>
    )
  } else {
    return <LoadingView/>
  }
}

// noinspection JSUnusedGlobalSymbols
export default Post
