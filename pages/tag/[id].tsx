import {NextPage} from "next";
import {GlobalHead} from "../../components/GlobalHead";
import Layout from "../../components/Layout";
import {useRouter} from "next/router";
import {useEffect, useState} from "react";
import axios from "../../lib/axios";
import LoadingView from "../../components/LoadingView";
import PostCard, {PostData} from "../../components/PostCard";

const Post: NextPage = () => {
  const router = useRouter()
  const {id} = router.query
  const [posts, setPosts] = useState<PostData[]>()

  useEffect(() => {
    if (!posts && id) {
      axios.get(`/tag/${id}`)
          .then(res => {
            setPosts(res.data)
          })
    }
  }, [posts, id])

  if (posts) {
    return (
        <>
          <GlobalHead/>
          <Layout>
            <div className="p-6 container">
              <h1 className="text-2xl font-bold">Showing posts tagged with &quot;{id}&quot;</h1>
              <div className="w-full flex flex-wrap justify-center">
                {posts.map((post, index) => (
                    <PostCard post={post} key={index}/>
                ))}
              </div>
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
