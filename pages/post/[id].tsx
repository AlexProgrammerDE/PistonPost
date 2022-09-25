import {GetServerSideProps} from "next";
import {GlobalHead} from "../../components/GlobalHead";
import Layout from "../../components/Layout";
import {useRouter} from "next/router";
import {ReactNode, useContext, useState} from "react";
import {PostResponse, UserData} from "../../lib/responses";
import Image from "next/image";
import ReactTimeAgo from "react-time-ago";
import Link from "next/link";
import {UserDataContext} from "../../components/UserDataProvider";
import {breakpointColumnsObj, NewlineText} from "../../lib/shared";
import Masonry from "react-masonry-css";
import dynamic from "next/dynamic";
import PostCommentForm from "../../components/PostCommentForm";
import Head from "next/head";
import axios from "../../lib/axios";
import {VoteType} from "../../lib/types";
import CopyButton from "../../components/CopyButton";

const VideoPlayer = dynamic(() => import("../../components/VideoPlayer"));

const PostOptionColumn = ({children}: { children: ReactNode }) => {
  return (
      <div className="flex flex-col justify-center">
        {children}
      </div>
  )
}

const VoteRow = ({postData, user}: { postData: PostResponse, user: UserData | undefined }) => {
  const [likes, setLikes] = useState(postData.likes);
  const [dislikes, setDislikes] = useState(postData.dislikes);
  const [hearts, setHearts] = useState(postData.hearts);

  const vote = (type: VoteType, clientVoted: boolean) => {
    if (user) {
      axios.request({
        url: `/post/${postData.postId}/vote?type=${type}`,
        method: clientVoted ? "DELETE" : "PUT",
      }).then(() => {
        switch (type) {
          case "LIKE":
            setLikes({
              voted: !clientVoted,
              value: likes.value + (clientVoted ? -1 : 1),
            });
            break;
          case "DISLIKE":
            setDislikes({
              voted: !clientVoted,
              value: dislikes.value + (clientVoted ? -1 : 1),
            })
            break;
          case "HEART":
            setHearts({
              voted: !clientVoted,
              value: hearts.value + (clientVoted ? -1 : 1),
            })
            break
        }
      });
    }
  }

  return (
      <div className="flex flex-row">
        <button onClick={() => vote("LIKE", likes.voted)}
                className={"btn ml-1 mr-0.5" + (likes.voted ? " btn-primary" : "")}>👍️️ {String(likes.value)}</button>
        <button onClick={() => vote("DISLIKE", dislikes.voted)}
                className={"btn mx-0.5" + (dislikes.voted ? " btn-primary" : "")}>👎 {String(dislikes.value)}</button>
        <button onClick={() => vote("HEART", hearts.voted)}
                className={"btn mx-0.5" + (hearts.voted ? " btn-primary" : "")}>♥️ {String(hearts.value)}</button>
      </div>
  )
}

const Post = ({postData, postUrl}: { postData: PostResponse, postUrl: string }) => {
  const {user} = useContext(UserDataContext);
  const router = useRouter();
  const {image} = router.query;

  const imageIndex =
      postData.type === "IMAGES" && image
          ? Math.min(postData.images!.length - 1, parseInt(image as string))
          : 0;

  const imageData: {
    url: string;
    width: number;
    height: number;
  } | undefined = postData.type === "IMAGES" ? {
    url: `/backend/static/images/${postData.images![imageIndex].id}.${postData.images![imageIndex].extension}`,
    width: postData.images![imageIndex].width,
    height: postData.images![imageIndex].height,
  } : undefined;

  const videoUrl =
      postData.type === "VIDEO"
          ? `/backend/static/videos/${postData.video!.id}.${
              postData.video!.extension
          }`
          : undefined;
  const videoThumbnailUrl =
      postData.type === "VIDEO"
          ? `/backend/static/images/${postData.video!.thumbnail.id}.${
              postData.video!.thumbnail.extension
          }`
          : undefined;

  let title;
  switch (postData.type) {
    case "VIDEO":
      title = `${postData.title} - ${postData.authorData.name}`;
      break;
    default:
      title = postData.title;
  }

  let description;
  switch (postData.type) {
    case "IMAGES":
      description = `Post by ${postData.authorData.name} - ${
          postData.images!.length
      } image${postData.images!.length === 1 ? "" : "s"} - tags: ${postData.tags.join(', ')}`;
      break;
    default:
      description = `Post by ${postData.authorData.name} - tags: ${postData.tags.join(', ')}`;
  }

  return (
      <>
        <GlobalHead
            title={title}
            description={description}
            noType={postData.type === "VIDEO"}
            noImage={postData.type === "IMAGES" || postData.type === "VIDEO"}
        />
        <Layout>
          {postData.type === "IMAGES" && imageData && (
              <Head>
                <meta name="twitter:card" content="summary_large_image"/>

                <meta property="og:image" content={imageData.url}/>
                <meta name="twitter:image" content={imageData.url}/>
                <meta
                    property="og:image:width"
                    content={imageData.width.toString()}
                />
                <meta
                    property="og:image:height"
                    content={imageData.height.toString()}
                />
              </Head>
          )}
          {postData.type === "VIDEO" && (
              <Head>
                <meta property="og:type" content="video.other"/>

                <meta property="og:image" content={videoThumbnailUrl}/>
                <meta name="twitter:image" content={videoThumbnailUrl}/>
                <meta
                    property="og:image:width"
                    content={postData.video!.thumbnail.width.toString()}
                />
                <meta
                    property="og:image:height"
                    content={postData.video!.thumbnail.height.toString()}
                />

                <meta property="og:video" content={videoUrl}/>
                <meta
                    property="og:video:width"
                    content={postData.video!.width.toString()}
                />
                <meta
                    property="og:video:height"
                    content={postData.video!.height.toString()}
                />
                <meta property="og:video:type" content="application/mp4"/>
              </Head>
          )}

          <div className="break-text container flex-grow p-2">
            <div className="rounded-box flex w-full flex-wrap bg-base-200 p-4 p-4">
              <h2 className="my-2 text-2xl font-bold">{postData.title}</h2>
              <div className="flex flex-wrap gap-1 ml-1">
                {postData.tags.map((tag) => (
                    <PostOptionColumn key={tag}>
                      <Link href={"/tag/" + tag}>
                        <a className="badge badge-lg">#{tag}</a>
                      </Link>
                    </PostOptionColumn>
                ))}
                {postData.unlisted && (
                    <PostOptionColumn>
                      <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-6 w-6"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                      >
                        <title>Unlisted</title>
                        <path
                            fillRule="evenodd"
                            d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
                            clipRule="evenodd"
                        />
                        <path
                            d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/>
                      </svg>
                    </PostOptionColumn>
                )}
                {user && (
                    <>
                      {(user.roles.includes("ADMIN") ||
                          postData.authorData.id === user.id) && (
                          <PostOptionColumn>
                            <Link href={`/post/${postData.postId}/edit`}>
                              <a>
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
                          </PostOptionColumn>
                      )}
                    </>
                )}
                <PostOptionColumn>
                  <label
                      htmlFor="copy-modal"
                      className="modal-button"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                      <title>Copy Link</title>
                      <path fillRule="evenodd"
                            d="M19.902 4.098a3.75 3.75 0 00-5.304 0l-4.5 4.5a3.75 3.75 0 001.035 6.037.75.75 0 01-.646 1.353 5.25 5.25 0 01-1.449-8.45l4.5-4.5a5.25 5.25 0 117.424 7.424l-1.757 1.757a.75.75 0 11-1.06-1.06l1.757-1.757a3.75 3.75 0 000-5.304zm-7.389 4.267a.75.75 0 011-.353 5.25 5.25 0 011.449 8.45l-4.5 4.5a5.25 5.25 0 11-7.424-7.424l1.757-1.757a.75.75 0 111.06 1.06l-1.757 1.757a3.75 3.75 0 105.304 5.304l4.5-4.5a3.75 3.75 0 00-1.035-6.037.75.75 0 01-.354-1z"
                            clipRule="evenodd"/>
                    </svg>
                  </label>
                </PostOptionColumn>
              </div>
            </div>
            <div className="rounded-box mt-2 flex w-full flex-wrap bg-base-200 p-4 p-4">
              <Link href={`/user/${postData.authorData.name}`}>
                <a className="my-auto flex flex-wrap">
                  <div className="flex flex-col">
                    <div className="my-auto">
                      <Image
                          alt={`Avatar of ${postData.authorData.name}`}
                          className="rounded-box"
                          src={postData.authorData.avatar}
                          width={32}
                          height={32}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col justify-center">
                    <div className="my-auto ml-2 text-xl font-bold">
                      @{postData.authorData.name} -{" "}
                      <ReactTimeAgo date={postData.timestamp}/>
                    </div>
                  </div>
                </a>
              </Link>
              <VoteRow postData={postData} user={user}/>
            </div>
            <div className="rounded-box mt-2 w-full bg-base-200 p-4 text-lg">
              {postData.type === "TEXT" && (
                  <NewlineText text={postData.content!}/>
              )}
              {postData.type === "IMAGES" && (
                  <Masonry
                      breakpointCols={breakpointColumnsObj}
                      className="my-masonry-grid h-full w-full"
                      columnClassName="my-masonry-grid_column"
                  >
                    {postData.images!.map((image) => (
                        <div
                            key={image.id}
                            style={{maxHeight: "60rem"}}
                            className="m-1 max-w-sm overflow-hidden"
                        >
                          <Image
                              alt={`Image from ${postData.authorData.name}`}
                              className="rounded-box"
                              src={`/backend/static/images/${image.id}.${image.extension}`}
                              width={image.width}
                              height={image.height}
                              layout="responsive"
                          />
                        </div>
                    ))}
                  </Masonry>
              )}
              {postData.type === "VIDEO" && (
                  <VideoPlayer video={postData.video!} title={postData.title}/>
              )}
            </div>
            <PostCommentForm postData={postData}/>
            <input type="checkbox" id="copy-modal" className="modal-toggle"/>
            <label htmlFor="copy-modal" className="modal cursor-pointer">
              <label className="modal-box relative" htmlFor="">
                <h3 className="text-lg font-bold mb-2">Chose what to copy!</h3>
                <div className="flex flex-col gap-2">
                  <div>
                    <CopyButton text={postUrl}>
                      <button className="btn whitespace-nowrap"><a>Copy Post Link</a></button>
                    </CopyButton>
                  </div>
                  {postData.type === "IMAGES" && (
                      <div>
                        <CopyButton
                            text={postData.images!.slice(0, Math.min(5, postData.images!.length)).map((_, index) => `${postUrl}?image=${index}`).join("\n")}>
                          <button className="btn whitespace-nowrap"><a>Copy Image Links</a></button>
                        </CopyButton>
                      </div>
                  )}
                </div>
              </label>
            </label>
          </div>
        </Layout>
      </>
  );
};

// noinspection JSUnusedGlobalSymbols
export const getServerSideProps: GetServerSideProps = async (context) => {
  const {id} = context.query;
  console.log(context.req.rawHeaders)

  const reqHeaders = new Headers()

  let i = 0;
  context.req.rawHeaders.forEach((header) => {
    if (i % 2 === 0) {
      reqHeaders.append(context.req.rawHeaders[i], context.req.rawHeaders[i + 1])
    }
    i++;
  })

  const res = await fetch(`${process.env.API_ENDPOINT}/post/${id}`, {headers: reqHeaders});

  if (res.status === 404) {
    return {notFound: true};
  }

  if (res.status === 500) {
    throw new TypeError(res.statusText);
  }

  const postData = await res.json();

  return {
    props: {postData, postUrl: process.env.NEXTAUTH_URL}
  };
};

// noinspection JSUnusedGlobalSymbols
export default Post;
