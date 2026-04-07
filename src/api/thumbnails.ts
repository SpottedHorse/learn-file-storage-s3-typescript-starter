import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo, type Video } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";

type Thumbnail = {
  data: ArrayBuffer;
  mediaType: string;
};

const videoThumbnails: Map<string, Thumbnail> = new Map();

const MAX_UPLOAD_SIZE = 10 << 20

export async function handlerGetThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }

  const thumbnail = videoThumbnails.get(videoId);
  if (!thumbnail) {
    throw new NotFoundError("Thumbnail not found");
  }

  return new Response(thumbnail.data, {
    headers: {
      "Content-Type": thumbnail.mediaType,
      "Cache-Control": "no-store",
    },
  });
}

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const formData = req.formData();

  const data = (await formData).get('thumbnail');

  if (!(data instanceof File)) {
    throw new BadRequestError('Bad file upload');
  }

  if (data.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError('File too big.');
  }

  const mediaType = data.type
  const buffer = await data.arrayBuffer()

  if (getVideo(cfg.db, videoId)?.userID !== userID) {
    throw new UserForbiddenError('video cannot be accessed');
  }

  videoThumbnails.set(videoId, {data: buffer, mediaType: mediaType})

  const video = await getVideo(cfg.db, videoId);
  if (!video) {
    throw new Error("Something went wrong")
  }

  video.thumbnailURL = `http://localhost:${cfg.port}/api/thumbnails/${videoId}`
  
  updateVideo(cfg.db, video);

  return respondWithJSON(200, video);
}
