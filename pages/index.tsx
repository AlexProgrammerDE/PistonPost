import type { NextPage } from 'next'
import Head from 'next/head'
import Image from 'next/image'
import Logo from '../public/logo.webp'
import {GlobalHead} from "../components/GlobalHead";

const Home: NextPage = () => {
  return (
    <>
      <GlobalHead/>
      <div>
        <Image
          src={Logo}
          alt="PistonPost Logo"
          width={60}
          height={60}
        />
        <h1>Hello Next.js</h1>
      </div>
    </>
  )
}

// noinspection JSUnusedGlobalSymbols
export default Home
