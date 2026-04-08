import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo, type Video } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import path from "path";
// import { getInMemoryURL } from "./assets";

type Thumbnail = {
  data: ArrayBuffer;
  mediaType: string;
};

const MAX_UPLOAD_SIZE = 10 << 20

// const videoThumbnails: Map<string, Thumbnail> = new Map();

// export async function handlerGetThumbnail(cfg: ApiConfig, req: BunRequest) {
//   const { videoId } = req.params as { videoId?: string };
//   if (!videoId) {
//     throw new BadRequestError("Invalid video ID");
//   }

//   const video = getVideo(cfg.db, videoId);
//   if (!video) {
//     throw new NotFoundError("Couldn't find video");
//   }

//   const thumbnail = videoThumbnails.get(videoId);
//   if (!thumbnail) {
//     throw new NotFoundError("Thumbnail not found");
//   }

//   return new Response(video.thumbnailURL, {
//     headers: {
//       "Content-Type": thumbnail.mediaType,
//       "Cache-Control": "no-store",
//     },
//   });
// }

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const video = await getVideo(cfg.db, videoId);
  if (!video) {
    throw new Error("Could not find video")
  }

  if (video.userID !== userID) {
    throw new UserForbiddenError("Not authorized to update this video");
  }

  const formData = await req.formData();

  const data = formData.get('thumbnail');

  if (!(data instanceof File)) {
    throw new BadRequestError('Thumbnail file missing');
  }

  if (data.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError(
      `Thumbnail file exceeds the maximum allowed size of 10MB`
    );
  }

  const mediaType = data.type;
  if (!mediaType) {
    throw new BadRequestError("Missing Content-Type for thumbnail");
  }

  const fileData = await data.arrayBuffer();
  if (!fileData) {
    throw new Error("Error reading file data");
  }

  // videoThumbnails.set(videoId, {
  //   data: fileData, 
  //   mediaType: mediaType
  // });

  // const buffer = Buffer.from(fileData);
  console.log(`mediaType: ${mediaType}`)
  const filePath = path.join(cfg.assetsRoot, `${videoId}.${mediaType.split('/')[1]}`)
  console.log(`filePath: ${filePath}`)
  await Bun.write(`${filePath}`, fileData)
  // const bufferString = buffer.toString("base64");
  // const dataUrl = `data:${mediaType};base64,${bufferString}`;

  const thumbnail_url = path.join(`http://localhost:${cfg.port}`, filePath)

  video.thumbnailURL = thumbnail_url;
  // video.thumbnailURL = getInMemoryURL(cfg, videoId);
  updateVideo(cfg.db, video);

  return respondWithJSON(200, video);
}
