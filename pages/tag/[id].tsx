import {NextPage} from "next";
import {useSession} from "next-auth/react";
import {GlobalHead} from "../../components/GlobalHead";
import Layout from "../../components/Layout";
import {useRouter} from "next/router";
import {useEffect, useState} from "react";
import axios from "../../lib/axios";
import Link from "next/link";
import LoadingView from "../../components/LoadingView";
import ReactTimeAgo from "react-time-ago";

export interface PostData {
  id: string;
  postId: string;
  title: string;
  content: string;
  author: string;
  tags: string[];
  timestamp: number;
  unlisted: boolean;
}

const Post: NextPage = () => {
  const router = useRouter()
  const {id} = router.query
  const [posts, setPosts] = useState<PostData[]>()

  useEffect(() => {
    if (!posts && id) {
      axios.get(`/tag/${id}`)
          .then(res => {
            setPosts(res.data)
          })
    }
  }, [posts, id])

  if (posts) {
    return (
        <>
          <GlobalHead/>
          <Layout>
            <div className="p-6 container">
              <h1 className="text-2xl font-bold">Showing posts tagged with "{id}"</h1>
              <div className="w-full flex flex-wrap justify-center">
                {posts.map((post, index) => (
                    <div className="card w-96 bg-base-200 shadow-xl m-2" key={index}>
                      <div className="card-body">
                        <Link href={'/post/' + post.postId}>
                          <a>
                            <h2 className="card-title">
                              {post.title}
                            </h2>
                          </a>
                        </Link>

                        <div className="card-actions justify-between">
                          <span><ReactTimeAgo date={post.timestamp}/></span>
                          <div className="card-actions">
                            {post.tags.map((tag, index) => (
                                <div key={index} className="my-auto badge badge-outline">{tag}</div>
                            ))}
                          </div>

                        </div>
                      </div>
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
export default Post
