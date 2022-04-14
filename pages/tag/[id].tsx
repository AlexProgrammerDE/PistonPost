import {NextPage} from "next";
import {GlobalHead} from "../../components/GlobalHead";
import Layout from "../../components/Layout";
import {useRouter} from "next/router";
import {useEffect, useState} from "react";
import axios from "../../lib/axios";
import LoadingView from "../../components/LoadingView";
import PostCard from "../../components/PostCard";
import {PostData} from "../../lib/responses";

const Post: NextPage = () => {
  const router = useRouter()
  const {id} = router.query
  const [posts, setPosts] = useState<PostData[]>()

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
            <div className="p-6 container h-full">
              <h1 className="text-2xl font-bold">Showing posts tagged with &quot;{id}&quot;</h1>
              <div className={"w-full h-full justify-center " + (posts.length > 0 ? "masonry sm:masonry-sm md:masonry-md lg:masonry-lg" : "flex")}>
                {posts.length > 0 ? posts.map((post, index) => (
                    <PostCard post={post} key={index}/>
                )) : (
                    <>
                      <h3 className="m-auto text-3xl font-bold">No posts with this tag found... :(</h3>
                    </>)}
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
