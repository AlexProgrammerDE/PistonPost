import {NextPage} from "next";
import {useSession} from "next-auth/react";
import {GlobalHead} from "../../components/GlobalHead";
import Layout from "../../components/Layout";
import Image from "next/image";
import Logo from "../../public/logo.webp";
import {useRouter} from "next/router";
import {useEffect, useState} from "react";
import axios from "../../lib/axios";

interface PostData {
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

  const {data: session} = useSession()
  const [post, setPost] = useState<PostData>()

  useEffect(() => {
    if (!post && id) {
      axios.get(`/post/${id}`)
          .then(res => {
            console.log(res.data.post)
            setPost(res.data.post)
          })
    }
  }, [post, id])

  return (
      <>
        <GlobalHead/>
        <Layout>
          <div className="p-6">
            {
              post &&
                <div>
                  {post.title}
                </div>
            }
          </div>
        </Layout>
      </>
  )
}

// noinspection JSUnusedGlobalSymbols
export default Post
