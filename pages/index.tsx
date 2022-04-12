import type {NextPage} from 'next'
import Image from 'next/image'
import Logo from '../public/logo.webp'
import {GlobalHead} from "../components/GlobalHead";
import {useSession} from "next-auth/react";
import Layout from "../components/Layout";

const Home: NextPage = () => {
  const {data: session} = useSession()

  if (session) {
    if (session.user) {
      session.user.name = "John Doe"

      return (
          <>
            <GlobalHead/>
            <Layout>
              <div className="p-6">
                <h1>Hello, {session.user?.email} {session.user.name}</h1>
              </div>
            </Layout>
          </>
      )
    }
  }

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
export default Home
