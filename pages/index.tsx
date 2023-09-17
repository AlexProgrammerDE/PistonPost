import type { NextPage } from "next";
import { GlobalHead } from "components/GlobalHead";
import Layout from "components/Layout";
import LoadingView from "components/LoadingView";
import PostCard from "components/PostCard";
import { PostResponse } from "lib/responses";
import Masonry from "react-masonry-css";
import { breakpointColumnsObj } from "lib/shared";
import useSWRInfinite, { SWRInfiniteKeyLoader } from "swr/infinite";
import cn from "classnames";

const getKey: SWRInfiniteKeyLoader = (pageIndex, previousPageData) => {
  if (previousPageData && !previousPageData.length) return null;
  return `/home?page=${pageIndex}`;
};

const Home: NextPage = () => {
  const { data, error, size, setSize } = useSWRInfinite<PostResponse[]>(getKey);
  const isEmpty = data?.[0]?.length === 0;
  const isReachingEnd = isEmpty || (data && data[data.length - 1]?.length < 40);
  const isLoadingInitialData = !data && !error;
  const isLoadingMore =
    isLoadingInitialData ||
    (size > 0 && data && typeof data[size - 1] === "undefined");

  if (data) {
    return (
      <>
        <GlobalHead />
        <Layout>
          <main className="container flex flex-grow flex-col p-1 md:p-6">
            <h1 className="mx-2 text-2xl font-bold">Recent posts...</h1>
            <Masonry
              breakpointCols={breakpointColumnsObj}
              className="my-masonry-grid"
              columnClassName="my-masonry-grid_column"
            >
              {data.map((posts, postsIndex) =>
                posts.map((post, postIndex) => (
                  <PostCard key={`${postsIndex}-${postIndex}`} post={post} />
                ))
              )}
            </Masonry>
            {!isReachingEnd && (
              <button
                className={cn("btn btn-primary mx-auto my-2", { "loading": isLoadingMore })}
                onClick={() => setSize(size + 1)}
              >
                Load More
              </button>
            )}
          </main>
        </Layout>
      </>
    );
  } else {
    return <LoadingView />;
  }
};

// noinspection JSUnusedGlobalSymbols
export default Home;
