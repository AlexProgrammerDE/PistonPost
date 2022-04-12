import {GlobalHead} from "../components/GlobalHead";
import Layout from "../components/Layout";
import {CustomNextPage} from "../components/CustomNextPage";

const Post: CustomNextPage = () => {
  return (
      <>
        <GlobalHead/>
        <Layout>
        </Layout>
      </>
  )
}

Post.auth = true

// noinspection JSUnusedGlobalSymbols
export default Post
