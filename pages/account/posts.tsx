import { GlobalHead } from "../../components/GlobalHead";
import Layout from "../../components/Layout";
import { CustomNextPage } from "../../components/CustomNextPage";
import { useEffect, useState } from "react";
import axios from "../../lib/axios";
import LoadingView from "../../components/LoadingView";
import PostCard from "../../components/PostCard";
import { PostResponse } from "../../lib/responses";
import Masonry from "react-masonry-css";
import { breakpointColumnsObj } from "../../lib/shared";

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
          <main className="container flex-grow p-2">
            <h1 className="text-2xl font-bold mx-2">Your posts</h1>
            <Masonry
              breakpointCols={breakpointColumnsObj}
              className="my-masonry-grid h-full w-full"
              columnClassName="my-masonry-grid_column"
            >
              {posts.map((post, index) => (
                <PostCard key={index} post={post} />
              ))}
            </Masonry>
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
