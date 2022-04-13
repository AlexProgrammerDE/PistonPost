import {NextPage} from "next";
import {useSession} from "next-auth/react";
import {GlobalHead} from "../../../components/GlobalHead";
import Layout from "../../../components/Layout";
import Image from "next/image";
import Logo from "../../../public/logo.webp";
import {useRouter} from "next/router";

const Comment: NextPage = () => {
  const {data: session} = useSession()
  const router = useRouter()
  const {id, comment} = router.query

  return (
      <>
        <GlobalHead/>
        <Layout>
          <div className="p-6">
            <Image
                src={Logo}
                alt="PistonPost Logo"
                width={60}
                height={60}
            />
            <h1 className="text-lg font-bold">Hello Next.js</h1>
          </div>
        </Layout>
      </>
  )
}

// noinspection JSUnusedGlobalSymbols
export default Comment
