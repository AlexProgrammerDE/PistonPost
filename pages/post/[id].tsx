import {NextPage} from "next";
import {useSession} from "next-auth/react";
import {GlobalHead} from "../../components/GlobalHead";
import Layout from "../../components/Layout";
import {useRouter} from "next/router";
import {useEffect, useState} from "react";
import axios from "../../lib/axios";
import {PostData} from "../../lib/responses";
import Image from "next/image";
import LoadingView from "../../components/LoadingView";
import ReactTimeAgo from "react-time-ago";
import Link from "next/link";

const Post: NextPage = () => {
  const router = useRouter()
  const {id} = router.query

  const {data: session} = useSession()
  const [post, setPost] = useState<PostData>()

  useEffect(() => {
    if (id) {
      axios.get(`/post/${id}`)
          .then(res => {
            setPost(res.data)
          })
    }
  }, [id])

  if (post) {
    return (
        <>
          <GlobalHead/>
          <Layout>
            <div className="container h-full p-6 break-text">
              <div className="w-full p-4 bg-base-200 rounded-box p-4 flex flex-wrap">
                <h2 className="font-bold text-2xl my-2">{post.title}</h2>
                <div className="flex flex-wrap">
                  {
                    post.tags.map(tag =>
                        <div key={tag} className="flex flex-col justify-center">
                          <Link href={'/tag/' + tag}>
                            <a className="badge badge-lg ml-1.5 p-2">
                              #{tag}
                            </a>
                          </Link>
                        </div>
                    )
                  }
                  {
                      post.unlisted &&
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 ml-1.5 my-auto" viewBox="0 0 20 20"
                           fill="currentColor">
                          <title>Unlisted</title>
                          <path fillRule="evenodd"
                                d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
                                clipRule="evenodd"/>
                      </svg>
                  }
                </div>
              </div>
              <div className="w-full p-4 bg-base-200 rounded-box p-4 flex flex-wrap mt-2">
                <Image alt={"Avatar of " + post.authorData.name} className="rounded-box"
                       src={post.authorData.avatar}
                       width={32} height={32}/>
                <span className="ml-2 my-auto text-xl font-bold">@{post.authorData.name} - <ReactTimeAgo
                    date={post.timestamp}/></span>
              </div>
              <div className="text-lg w-full p-4 bg-base-200 rounded-box mt-2">
                {post.content}
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
