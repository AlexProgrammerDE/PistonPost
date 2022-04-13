import {GlobalHead} from "../../components/GlobalHead";
import Layout from "../../components/Layout";
import {CustomNextPage} from "../../components/CustomNextPage";
import {useEffect, useState} from "react";
import axios from "../../lib/axios";
import LoadingView from "../../components/LoadingView";
import PostCard, {PostData} from "../../components/PostCard";

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
              <div className="w-full flex flex-wrap justify-center">
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
