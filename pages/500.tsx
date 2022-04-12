import {GlobalHead} from "../components/GlobalHead";
import Layout from "../components/Layout";

export default function Custom500() {
  return (
      <>
        <GlobalHead/>
        <Layout>
          <main className="w-full h-full text-center flex flex-col justify-center">
            <h1 className="text-5xl font-bold">500</h1>
            <p className="text-lg">Server-side error occurred</p>
          </main>
        </Layout>
      </>
  )
}
