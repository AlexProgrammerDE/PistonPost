import { GetServerSideProps } from "next";
import { GlobalHead } from "../../components/GlobalHead";
import Layout from "../../components/Layout";
import { useContext } from "react";
import { UserPageResponse } from "../../lib/responses";
import Image from "next/image";
import { UserDataContext } from "../../components/UserDataProvider";
import ObjectId from "bson-objectid";
import { NewlineText } from "../../lib/shared";
import { BadgeIcon } from "../../components/roles";

const UserName = ({ userData }: { userData: UserPageResponse }) => {
  const { user } = useContext(UserDataContext);

  return (
    <>
      <GlobalHead
        overrideTitle={`User ${userData.name}`}
        overrideDescription={`${userData.posts.length} post${
          userData.posts.length === 1 ? "" : "s"
        }`}
      />
      <Layout>
        <div className="break-text container flex-grow p-6">
          <div className="rounded-box flex w-full flex-wrap bg-base-200 p-4">
            <div className="flex flex-col justify-center">
              <Image
                alt={"Avatar of " + userData.name}
                className="rounded-box"
                src={userData.avatar}
                width={45}
                height={45}
              />
            </div>
            <h2 className="my-auto ml-2 text-2xl font-bold">
              @{userData.name}
            </h2>
            {userData.roles &&
              userData.roles.map((role, index) => (
                <BadgeIcon
                  key={index}
                  role={role}
                  classNameBig="h-8 w-8 ml-4"
                  classNameSmall="h-7 w-7 ml-4"
                />
              ))}
          </div>
          <ul className="rounded-box mt-2 w-full bg-base-200 p-4">
            <li className="mb-1 flex flex-row">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 my-auto"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M6 3a1 1 0 011-1h.01a1 1 0 010 2H7a1 1 0 01-1-1zm2 3a1 1 0 00-2 0v1a2 2 0 00-2 2v1a2 2 0 00-2 2v.683a3.7 3.7 0 011.055.485 1.704 1.704 0 001.89 0 3.704 3.704 0 014.11 0 1.704 1.704 0 001.89 0 3.704 3.704 0 014.11 0 1.704 1.704 0 001.89 0A3.7 3.7 0 0118 12.683V12a2 2 0 00-2-2V9a2 2 0 00-2-2V6a1 1 0 10-2 0v1h-1V6a1 1 0 10-2 0v1H8V6zm10 8.868a3.704 3.704 0 01-4.055-.036 1.704 1.704 0 00-1.89 0 3.704 3.704 0 01-4.11 0 1.704 1.704 0 00-1.89 0A3.704 3.704 0 012 14.868V17a1 1 0 001 1h14a1 1 0 001-1v-2.132zM9 3a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm3 0a1 1 0 011-1h.01a1 1 0 110 2H13a1 1 0 01-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="ml-1 font-bold">
                Joined:{" "}
                {new Intl.DateTimeFormat("en-US", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit"
                }).format(ObjectId(userData.id).getTimestamp())}
              </span>
            </li>
            {userData.website && (
              <li className="mb-1 flex flex-row">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 my-auto"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z"
                    clipRule="evenodd"
                  />
                </svg>
                <a className="link ml-1" href={userData.website}>
                  {userData.website}
                </a>
              </li>
            )}
            {userData.location && (
              <li className="flex flex-row">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 my-auto"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="ml-1 font-bold">{userData.location}</span>
              </li>
            )}
          </ul>
          {userData.bio && (
            <div className="rounded-box mt-2 w-full bg-base-200 p-4 text-lg">
              <h3 className="text-2xl font-bold">Bio</h3>
              <NewlineText text={userData.bio} />
            </div>
          )}
        </div>
      </Layout>
    </>
  );
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { name } = context.query;

  const res = await fetch(`${process.env.API_ENDPOINT}/userdata/${name}`);

  if (res.status === 404) {
    return { notFound: true };
  }

  if (res.status === 500) {
    throw new TypeError(res.statusText);
  }

  const userData = await res.json();

  return {
    props: { userData }
  };
};

// noinspection JSUnusedGlobalSymbols
export default UserName;
