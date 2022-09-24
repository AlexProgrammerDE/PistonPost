import type {NextPage} from "next";
import {GlobalHead} from "../components/GlobalHead";
import Layout from "../components/Layout";
import LoadingView from "../components/LoadingView";
import PostCard from "../components/PostCard";
import {PostResponse} from "../lib/responses";
import Masonry from "react-masonry-css";
import {breakpointColumnsObj} from "../lib/shared";
import useSWRInfinite, {SWRInfiniteKeyLoader} from 'swr/infinite'

const getKey: SWRInfiniteKeyLoader = (pageIndex, previousPageData) => {
  if (previousPageData && !previousPageData.length) return null
  return `/home?page=${pageIndex}`
}

const Home: NextPage = () => {
  const {data, size, setSize} = useSWRInfinite<PostResponse[]>(getKey)
  const isEmpty = data?.[0]?.length === 0;
  const isReachingEnd =
      isEmpty || (data && data[data.length - 1]?.length < 40);

  if (data) {
    return (
        <>
          <GlobalHead/>
          <Layout>
            <div className="container flex-grow p-1 md:p-6 flex flex-col">
              <h1 className="text-2xl font-bold mx-2">Recent posts...</h1>
              <Masonry
                  breakpointCols={breakpointColumnsObj}
                  className="my-masonry-grid"
                  columnClassName="my-masonry-grid_column"
              >
                {data.map((posts, postsIndex) => (
                    posts.map((post, postIndex) => (
                        <PostCard key={`${postsIndex}-${postIndex}`} post={post}/>
                    ))
                ))}
              </Masonry>
              {!isReachingEnd && <button className="btn btn-primary mx-auto my-2" onClick={() => setSize(size + 1)}>Load More</button>}
            </div>
          </Layout>
        </>
    );
  } else {
    return <LoadingView/>;
  }
};

// noinspection JSUnusedGlobalSymbols
export default Home;
