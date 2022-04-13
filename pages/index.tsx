import type {NextPage} from 'next'
import {GlobalHead} from "../components/GlobalHead";
import Layout from "../components/Layout";
import {useEffect, useState} from "react";
import LoadingView from "../components/LoadingView";
import axios from "../lib/axios";
import PostCard, {PostData} from "../components/PostCard";

const Home: NextPage = () => {
  const [frontData, setFrontData] = useState<PostData[]>();

  useEffect(() => {
    if (!frontData) {
      axios.get('/home').then(res => {
        setFrontData(res.data)
      })
    }
  }, [frontData])

  if (frontData) {
    return (
        <>
          <GlobalHead/>
          <Layout>
            <div className="p-6 container">
              <h1 className="text-2xl font-bold">Recent posts...</h1>
              <div className="w-full flex flex-wrap justify-center">
                {frontData.map((post, index) => (
                    <PostCard key={index} post={post}/>
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
export default Home
