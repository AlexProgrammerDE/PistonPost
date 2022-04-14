import type {NextPage} from 'next'
import {GlobalHead} from "../components/GlobalHead";
import Layout from "../components/Layout";
import {useEffect, useState} from "react";
import LoadingView from "../components/LoadingView";
import axios from "../lib/axios";
import PostCard from "../components/PostCard";
import {PostResponse} from "../lib/responses";

const Home: NextPage = () => {
  const [frontData, setFrontData] = useState<PostResponse[]>();

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
            <div className="container min-h-screen p-1 md:p-6">
              <h1 className="text-2xl font-bold">Recent posts...</h1>
              <div className="w-full h-full flex flex-wrap">
                {frontData.map((post, index) => (
                    <div key={index}>
                      <PostCard post={post} />
                    </div>
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
