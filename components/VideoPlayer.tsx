import Plyr from "plyr-react";
import "plyr-react/dist/plyr.css";
import { VideoResponse } from "../lib/responses";

export default function VideoPlayer({ video }: { video: VideoResponse }) {
  return (
    <Plyr
      source={{
        sources: [{ src: `/static/videos/${video.id}.${video.extension}` }],
        type: "video"
      }}
      options={{ ratio: "16:9" }}
    />
  );
}
