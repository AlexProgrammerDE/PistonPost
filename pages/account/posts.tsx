import {GlobalHead} from "../../components/GlobalHead";
import Layout from "../../components/Layout";
import {CustomNextPage} from "../../components/CustomNextPage";
import {useEffect, useState} from "react";
import axios from "../../lib/axios";
import LoadingView from "../../components/LoadingView";
import PostCard from "../../components/PostCard";
import {PostData} from "../../lib/responses";

const Posts: CustomNextPage = () => {
  const [posts, setPosts] = useState<PostData[]>()

  useEffect(() => {
    if (!posts) {
      axios.get(`/posts`)
          .then(res => {
            setPosts(res.data)
          })
    }
  }, [posts])

  if (posts) {
    return (
        <>
          <GlobalHead/>
          <Layout>
            <main className="container p-2">
              <h1 className="font-bold text-2xl">Your posts</h1>
              <div className="w-full masonry sm:masonry-sm md:masonry-md lg:masonry-lg justify-center">
                {
                  posts.map((post, index) => (
                      <PostCard key={index} post={post}/>
                  ))
                }
              </div>
            </main>
          </Layout>
        </>
    )
  } else {
    return <LoadingView/>
  }
}

Posts.auth = true

// noinspection JSUnusedGlobalSymbols
export default Posts
