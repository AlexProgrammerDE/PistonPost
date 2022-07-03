import type { NextPage } from "next";
import { GlobalHead } from "../components/GlobalHead";
import Layout from "../components/Layout";

const TOS: NextPage = () => {
  return (
    <>
      <GlobalHead />
      <Layout>
        <div className="container flex-grow p-1 md:p-6 prose">
          <h1>Terms of Service</h1>
          <h2>Privacy</h2>
          <p>We value your privacy!</p>
        </div>
      </Layout>
    </>
  );
};

// noinspection JSUnusedGlobalSymbols
export default TOS;
