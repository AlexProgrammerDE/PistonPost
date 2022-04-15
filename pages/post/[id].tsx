import { GetServerSideProps } from "next";
import { GlobalHead } from "../../components/GlobalHead";
import Layout from "../../components/Layout";
import { useRouter } from "next/router";
import { useContext } from "react";
import { PostResponse } from "../../lib/responses";
import Image from "next/image";
import ReactTimeAgo from "react-time-ago";
import Link from "next/link";
import { UserDataContext } from "../../components/UserDataProvider";
import { NewlineText } from "../../lib/shared";

const Post = ({ postData }: { postData: PostResponse }) => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useContext(UserDataContext);

  return (
    <>
      <GlobalHead />
      <Layout>
        <div className="break-text container flex-grow p-2">
          <div className="rounded-box flex w-full flex-wrap bg-base-200 p-4 p-4">
            <h2 className="my-2 text-2xl font-bold">{postData.title}</h2>
            <div className="flex flex-wrap">
              {postData.tags.map((tag) => (
                <div key={tag} className="flex flex-col justify-center">
                  <Link href={"/tag/" + tag}>
                    <a className="badge badge-lg ml-1.5 p-2">#{tag}</a>
                  </Link>
                </div>
              ))}
              {postData.unlisted && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="my-auto ml-1.5 h-6 w-6"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <title>Unlisted</title>
                  <path
                    fillRule="evenodd"
                    d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              {user && (
                <>
                  {postData.authorData.id === user.id && (
                    <Link href={`/post/${id}/edit`}>
                      <a className="my-auto ml-1.5">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-6 w-6"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <title>Edit</title>
                          <path
                            fillRule="evenodd"
                            d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </a>
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="rounded-box mt-2 flex w-full flex-wrap bg-base-200 p-4 p-4">
            <Link href={`/user/${postData.authorData.name}`}>
              <a className="my-auto flex flex-wrap">
                <Image
                  alt={`Avatar of ${postData.authorData.name}`}
                  className="rounded-box"
                  src={postData.authorData.avatar}
                  width={32}
                  height={32}
                />
                <div className="flex flex-col justify-center">
                  <span className="my-auto ml-2 text-xl font-bold">
                    @{postData.authorData.name} -{" "}
                    <ReactTimeAgo date={postData.timestamp} />
                  </span>
                </div>
              </a>
            </Link>
          </div>
          <div className="rounded-box mt-2 w-full bg-base-200 p-4 text-lg">
            <NewlineText text={postData.content} />
          </div>
        </div>
      </Layout>
    </>
  );
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { id } = context.query;

  const res = await fetch(`${process.env.API_ENDPOINT}/application/post/${id}`);

  if (res.status === 404) {
    return { notFound: true };
  }

  if (res.status === 500) {
    throw new TypeError(res.statusText);
  }

  const postData = await res.json();

  return {
    props: { postData }
  };
};

// noinspection JSUnusedGlobalSymbols
export default Post;
