import type { NextPage } from "next";
import { GlobalHead } from "../components/GlobalHead";
import Layout from "../components/Layout";

const Privacy: NextPage = () => {
  return (
    <>
      <GlobalHead />
      <Layout>
        <div className="container flex-grow p-1 md:p-6 prose">
          <h1>Privacy Policy</h1>
          <h2>Privacy</h2>
          <p>We value your privacy!</p>
        </div>
      </Layout>
    </>
  );
};

// noinspection JSUnusedGlobalSymbols
export default Privacy;
