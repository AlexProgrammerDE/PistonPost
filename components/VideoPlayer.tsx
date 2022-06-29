import Plyr from "plyr-react";
import "plyr-react/dist/plyr.css";
import { VideoResponse } from "../lib/responses";

export default function VideoPlayer({
  video,
  title
}: {
  video: VideoResponse;
  title: string;
}) {
  return (
    <Plyr
      source={{
        sources: [
          {
            src: `/static/videos/${video.id}.${video.extension}`,
            type: "video/mp4",
            size: 720
          }
        ],
        title,
        type: "video",
        poster: `/static/images/${video.thumbnail.id}.${video.thumbnail.extension}`
      }}
      options={{ ratio: "16:9" }}
    />
  );
}
