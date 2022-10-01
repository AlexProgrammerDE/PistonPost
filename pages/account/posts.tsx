import { GlobalHead } from "components/GlobalHead";
import Layout from "components/Layout";
import { CustomNextPage } from "components/CustomNextPage";
import LoadingView from "components/LoadingView";
import PostCard from "components/PostCard";
import { PostResponse } from "lib/responses";
import Masonry from "react-masonry-css";
import { breakpointColumnsObj } from "lib/shared";
import useSWR from "swr";

const Posts: CustomNextPage = () => {
  const { data: posts, error } = useSWR<PostResponse[]>("/posts", {
    refreshInterval: 3000
  });

  if (posts) {
    return (
      <>
        <GlobalHead />
        <Layout>
          <main className="container flex-grow p-2">
            <h1 className="mx-2 text-2xl font-bold">Your posts</h1>
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
