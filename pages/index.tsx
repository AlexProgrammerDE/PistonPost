import type { NextPage } from "next";
import { GlobalHead } from "../components/GlobalHead";
import Layout from "../components/Layout";
import LoadingView from "../components/LoadingView";
import PostCard from "../components/PostCard";
import { PostResponse } from "../lib/responses";
import Masonry from "react-masonry-css";
import { breakpointColumnsObj } from "../lib/shared";
import useSWR from 'swr'

const Home: NextPage = () => {
  const { data, error } = useSWR<PostResponse[]>('/home', { refreshInterval: 60000 })

  if (data) {
    return (
      <>
        <GlobalHead />
        <Layout>
          <div className="container flex-grow p-1 md:p-6">
            <h1 className="text-2xl font-bold mx-2">Recent posts...</h1>
            <Masonry
              breakpointCols={breakpointColumnsObj}
              className="my-masonry-grid"
              columnClassName="my-masonry-grid_column"
            >
              {data.map((post, index) => (
                <PostCard key={index} post={post} />
              ))}
            </Masonry>
          </div>
        </Layout>
      </>
    );
  } else {
    return <LoadingView />;
  }
};

// noinspection JSUnusedGlobalSymbols
export default Home;
