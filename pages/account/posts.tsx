import { GlobalHead } from "../../components/GlobalHead";
import Layout from "../../components/Layout";
import { CustomNextPage } from "../../components/CustomNextPage";
import { useEffect, useState } from "react";
import axios from "../../lib/axios";
import LoadingView from "../../components/LoadingView";
import PostCard from "../../components/PostCard";
import { PostResponse } from "../../lib/responses";

const Posts: CustomNextPage = () => {
  const [posts, setPosts] = useState<PostResponse[]>();

  useEffect(() => {
    if (!posts) {
      axios.get(`/posts`).then((res) => {
        setPosts(res.data);
      });
    }
  }, [posts]);

  if (posts) {
    return (
      <>
        <GlobalHead />
        <Layout>
          <main className="container min-h-screen p-2">
            <h1 className="text-2xl font-bold">Your posts</h1>
            <div className="flex h-full w-full flex-wrap justify-center">
              {posts.map((post, index) => (
                <div key={index}>
                  <PostCard post={post} />
                </div>
              ))}
            </div>
          </main>
        </Layout>
      </>
    );
  } else {
    return <LoadingView />;
  }
};

Posts.auth = true;

// noinspection JSUnusedGlobalSymbols
export default Posts;
